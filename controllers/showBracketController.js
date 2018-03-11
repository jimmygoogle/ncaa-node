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
  setEmptyBrackData: function() {
    let userPickedTeamData = [];
    for (var index = 0; index <= 63; index++) {
      userPickedTeamData.push({ pickCSS: '' });
    }
    return userPickedTeamData;
  }
}

const getBracket = (args) => {
  const req = args.req;
  const res = args.res;
  let editType = args.editType;
  const isAdmin = (editType == 'admin') ? 1 : 0;
  const isEdit = (editType == 'edit') ? 1 : 0;

  let userPickedTeamData, teamData, cookiedPoolName;
  let poolInfo = {};
  const userToken = req.params.userToken ? req.params.userToken : 0;

  // get the pool name from the cookie
  // this will determine what happens next
  poolController.getPoolName(req, res)
  .then(poolName => {
    cookiedPoolName = poolName;

    // check the pool status
    // this will determine what type of bracket the user sees
    return poolController.checkPoolStatus();
  })
  .then(rows => {
    poolInfo = rows[0][0];
    
    //if the pool is open, 'editType' is not defined
    // and we are not viewing a user's bracket in display mode
    //then set the 'editType' as 'add'
    if((poolInfo.poolOpen || poolInfo.sweetSixteenPoolOpen) && !editType && !userToken) {
      editType = 'add';
    }

    let promise;

    // get a non admin user's bracket for display
    if(userToken && !isAdmin) {
      promise = db.executeQuery({
        query: 'call UserDisplayBracket(?)',
        queryParams: [userToken]
      });
    }
    // the bracket is still open so return no user data
    else if(poolInfo.poolOpen) {
      promise = Promise.resolve([]);
    }
    // get the master bracket picks (also for sweet 16 bracket)
    else {
      promise = db.executeQuery({
        query: 'call MasterBracket()',
      });
    } 
    return promise;
  })
  .then(rows => {
    // the pool is open so we are showing an empty bracket and we are not trying to show a user's bracket
    if((poolInfo.poolOpen) && !userToken) {
      userPickedTeamData = bracket.setEmptyBrackData();
    }
    // user or master bracket data (also for sweet 16 bracket)
    else {
      userPickedTeamData = rows[0];
      // if we are viewing the master bracket remove all the styling
      if(!poolInfo.poolOpen && (isAdmin || !userToken)) {
        let adminTeamData = [];
        if(userPickedTeamData.length){
          // set any empty bracket then fill in the spots with games played
          adminTeamData = bracket.setEmptyBrackData();
          for(let data of userPickedTeamData) {
            adminTeamData[data.gameIDCalc] = {
                gameID: data.gameID,
                teamID: data.teamID,
                seedID: data.seedID,
                teamName: data.teamName
            };
          }
        }
        // master bracket is empty
        else {
          adminTeamData = bracket.setEmptyBrackData();
        }

        userPickedTeamData = adminTeamData;
      }
      // showing a user's bracket so set all the future incorrect picks based on the current incorrect ones
      else {
        let incorrectPicks = {};
        for(const index of userPickedTeamData.keys()) {
          const data = userPickedTeamData[index];
          if(data.pickCSS == 'incorrectPick') {
            incorrectPicks[data.teamID] = 1;
          }

          if(!data.pickCSS && incorrectPicks[data.teamID]) {
            data.pickCSS = 'incorrectPick';
          } 
        }
      }
    }

    // get the 64 base teams
    return db.executeQuery({
      query: 'call GetBaseTeams()',
    });
  })
  .then(baseTeams => {
    teamData = baseTeams[0];
    
    let promise;
    if(userToken) {
      const procedure = (isEdit || isAdmin) ? 'GetUserByEditToken' : 'GetUserByDisplayToken';
      promise = db.executeQuery({
        query: 'call ' + procedure + '(?)',
        queryParams: [userToken]
      });
    }
    else {
      promise = Promise.resolve([]);
    }
    return promise
  })
  .then(userData => {
    let args = {
      teamData: teamData,
      userPickedTeamData: userPickedTeamData,
      poolName: cookiedPoolName,
      bracketType: isAdmin ? 'admin' : poolInfo.poolOpen ? 'normalBracket' : 'sweetSixteenBracket'
    };
 
    // TODO: handle user trying to edit someone else's bracket instead of showing stack trace
    // show the user name
    if(userToken && userData[0].length) {
      args.userNameBracket = bracket.setUserBracketName(userData[0][0].userName);
    }

    // dont load the JS that allows changes
    if((!poolInfo.poolOpen || !poolInfo.sweetSixteenPoolOpen) && !isAdmin && !editType) {
      args.guiJsOnly = 1;
    }

    // show user details form
    // if we are an admin or the pools are open and/or we are editing
    if(isAdmin || ((poolInfo.poolOpen || poolInfo.sweetSixteenPoolOpen) && editType)) {
      args.userBracketInfoForm = 1;
    }

    // set the edit type
    if(editType) {
      args.editType = editType;
    }

    // set the user data if we have it
    args.userData = userData.length ? userData[0][0] : [];

    // render the bracket
    res.render('bracket', args);
  })
  .catch(err => {
    if(err.message == 'No pool defined') {
      // we dont know what pool the user belongs to so send them to the pool page
      res.redirect('/pool');     
    }
    // TODO: make this more robust
    // for now just email me the error
    else {
      //console.log(err);
      mailerController.sendErrorEmail({err});
    }
  }); 
}

exports.showBracket = (req, res) => {
  getBracket({req, res});
}

exports.updateBracket = (req, res) => {
  getBracket({editType: 'edit', req, res});
}

exports.updateAdminBracket = (req, res) => {
  req.params.userToken = process.env.ADMIN_TOKEN;
  getBracket({editType: 'admin', req, res});
}

exports.showNewBracketForm = (req, res) => {
  res.render('admin/blank_bracket');
}