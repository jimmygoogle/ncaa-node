const db = require('../db');
const async = require('async');
const poolController = require('./poolController');
const mailerController = require('./mailerController');

const bracket = {
  setUserBracketName: function(userName) {
    // if the username doesnt end in an 's' append one for the bracket name
    // ex: Jim -> Jim's
    // ex: Balls stays Balls'

    //get rid of spaces at the end of the user name and append '
    userName = userName.replace(/\s+$/, '');
    userName = userName + "'";

    if(!userName.match(/s'$/)){
      userName = userName + 's';
    }
    return userName;   
  },
  // generate a unique token that will be used to verify a user trying to edit their bracket
  setEditToken(args) {
    const cookiedPoolName = args.cookiedPoolName;
    const req = args.req.body;
    const token = [Date.now(), cookiedPoolName, req.emailAddress, req.username, req.bracketTypeName, 'edit'];

    return bracket.setToken(token.join('.'));
  },
  // generate a unique token that will be used to verify a user's bracket for display
  setDisplayToken(args) {
    const cookiedPoolName = args.cookiedPoolName;
    const req = args.req.body;
    const token = [Date.now(), cookiedPoolName, req.emailAddress, req.username, req.bracketTypeName, 'display'];

    return bracket.setToken(token.join('.'));
  },
  setToken: function(string) {
    return require('crypto').createHash('md5').update(string).digest("hex"); 
  }
}

const writePicks = (args) => {
  const res = args.res;
  const req = args.req;
  const actionType = args.actionType;
  const isAdmin = (args.editType == 'admin') ? 1 : 0;
  const userSubmittedData = req.body;
  let userID, cookiedPoolName, userEditToken;
  let poolInfo = {};

  // get the pool name from the cookie
  // this will determine what happens next
  poolController.getPoolName(req)
  .then(poolName => {
    cookiedPoolName = poolName;

    // check the pool status
    // this will determine what type of bracket the user sees
    return poolController.checkPoolStatus();
  })
  .then(rows => {
    poolInfo = rows[0][0];

    // the bracket is still closed exit here
    if(!isAdmin && (!poolInfo.poolOpen && !poolInfo.sweetSixteenPoolOpen)) {
      const err = new Error('The pool is currently closed.');
      promise = Promise.reject(err);
    }
    // update the user data
    else if(actionType == 'update') {
      let userEditToken = req.params.userToken;
      promise = db.executeQuery({
        query: 'call UpdateUser(?, ?, ?, ?, ?)',
        queryParams: [
          userEditToken,
          userSubmittedData.username,
          userSubmittedData.emailAddress,
          userSubmittedData.tieBreakerPoints,
          userSubmittedData.firstName
        ]
      });
    } 
    // insert the user
    else {
      userEditToken = bracket.setEditToken({req: req, cookiedPoolName: cookiedPoolName});
      const userDisplayToken = bracket.setDisplayToken({req: req, cookiedPoolName: cookiedPoolName});

      promise = db.executeQuery({
        query: 'call InsertUser(?, ?, ?, ?, ?, ?, ?, ?)',
        queryParams: [
          cookiedPoolName,
          userSubmittedData.username,
          userSubmittedData.emailAddress,
          userSubmittedData.tieBreakerPoints,
          userSubmittedData.firstName,
          userEditToken, userDisplayToken,
          userSubmittedData.bracketTypeName
        ]
      });
    }
    return promise;
  })
  .then(rows => {
    userID = rows[0][0].userID;
    //console.log('user ID is %s', userID);
    
    let promise;

    if(!isAdmin) {
      // reset user picks and score
      promise = db.executeQuery({
        query: 'call ResetBracket(?)',
        queryParams: [userID]
      });
    }
    else {
      promise = Promise.resolve([]);
    }
    
    return promise;
  })
  .then(status => {
    let promises = [];
    const userPicks = JSON.parse(userSubmittedData.userPicks);    
    //console.log(JSON.stringify(userPicks, null, 2));

    // insert all picks and all to promises array
    Object.keys(userPicks).forEach(function(gameID) {
      const teamID = userPicks[gameID];
      const bracketData = isAdmin ? 'InsertMasterBracketData' : 'InsertBracketData';
      promises.push(db.executeQuery({
        query: 'call ' + bracketData + '(?, ?, ?)',
        queryParams: [userID, teamID, gameID]
      }));
    });
    
    // insert the master bracket picks for the 1st and 2nd rounds
    if(!isAdmin && poolInfo.sweetSixteenPoolOpen) {
      promises.push(db.executeQuery({
        query: 'call InsertAdditionalSweetSixteenData(?)',
        queryParams: [userID]
      }));
    }

    return Promise.all(promises);
  })
  .then(status => {
    let promise = Promise.resolve([]);

    // score all brackets when the admin updates the master bracket
    if(isAdmin) {
      promise = db.executeQuery({
        query: 'call ScoreAllBrackets()'
      });
    }

    return promise
  })
  .then(status => {
    // send success response if we are here
    // TODO: handle conditions when the pool is closed (tell the user, etc)
    res.send({status: 1});
    
    // send confirmation email if we are not just updating picks
    if(actionType !== 'update') {
      // upper case the 1st letter of the pool name
      cookiedPoolName = cookiedPoolName.charAt(0).toUpperCase() + cookiedPoolName.slice(1);

      // set the closing date time
      const closingDateTime = (poolInfo.poolOpen === 1) ? poolInfo.poolCloseDateTime : poolInfo.sweetSixteenCloseDateTime;

      // set the edit bracket url
      const editUrl = 'http://' + req.headers.host + '/bracket/' + userEditToken + '/e';

      // TODO: handle invalid emails
      promise = mailerController.sendConfirmationEmail({
        emailAddress: userSubmittedData.emailAddress,
        username: userSubmittedData.username, 
        poolName: cookiedPoolName, 
        year: poolInfo.currentYear, 
        editUrl, 
        closingDateTime
      });
    }
  })
  .catch(err => {
    if(err.message == 'No pool defined') {
      // we dont know what pool the user belongs to so send them to the pool page
      res.redirect('/pool');
          
    }
    // TODO: make this more robust
    // for now just email me the error
    else {
      mailerController.sendErrorEmail({err});
    }
  }); 
}

const insertTeamData = (args) => {
  const res = args.res;
  const req = args.req;

  // get the pool name from the cookie
  // this will determine what happens next
  db.executeQuery({
    query: 'call DeleteTeams'
  })
  .then(status => {
    let promises = [];
    const teamData = JSON.parse(req.body.teamData);

    // insert all teams and all to promises array
    Object.keys(teamData).forEach(function(teamName) {
      const seedID = teamData[teamName].seedID;
      const gameID = teamData[teamName].gameID;

      promises.push(db.executeQuery({
        query: 'call InsertTeamsData(?, ?, ?)',
        queryParams: [teamName, seedID, gameID]
      }));
    });

    return Promise.all(promises);
  })
  .then(status => {    
    res.send({status: 1});
  }); 
}

exports.updateUserPicks = (req, res) => {
  writePicks({actionType: 'update', req, res});
}

exports.updateAdminPicks = (req, res) => {
  req.params.userToken = process.env.ADMIN_TOKEN;
  writePicks({actionType: 'update', editType: 'admin', req, res});
}

exports.insertUserPicks = (req, res) => {
  writePicks({actionType: 'insert', req, res});
}

exports.initializeNewBracket = (req, res) => {
  insertTeamData({req, res});
}