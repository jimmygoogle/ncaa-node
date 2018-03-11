 var db = require('../db');
const poolController = require('./poolController');

const getStandings = (args) => {
  const req = args.req;
  const res = args.res;

  const bracketTypeName = args.bracketTypeName || 'normalBracket';
  let standings, poolStatus, standingsData, cookiedPoolName;       
  let maxGameID = 0;
  let bestPossibleScore = 0;
  let adjustedScore = 0;
  const isSweetSixteenBracket = (bracketTypeName == 'sweetSixteenBracket') ? 1 : 0;

  // get the pool name from the cookie
  // this will determine what happens next
  poolController.getPoolName(req, res)
  .then(poolName => {
    cookiedPoolName = poolName;
    // check the pool status
  return poolController.checkPoolStatus();
  })
  .then(rows => {
    //console.log(rows);
    poolStatus = rows[0][0].poolOpen;

    // set the round id to calculate the best possible score from
    const roundId = isSweetSixteenBracket ? 3 : 1;

    // figure out best possible score so we can tell the user how many they 'could' potentially score
    return db.executeQuery({
      query: 'call BestPossibleScore(?)',
      queryParams: [roundId]
    });
  }) 
  .then(rows => {
    bestPossibleScore = rows[0][0].bestPossibleScore;
    adjustedScore = rows[0][0].adjustedScore;

    return db.executeQuery({
      query: 'call Standings(?, ?, ?)',
      queryParams: [poolStatus, cookiedPoolName, bracketTypeName]
    });
  })    
  .then(standings => {
    standingsData = standings[0];
    //console.log(standingsData[0]);

    return db.executeQuery({
      query: 'call RemainingTeams(?, ?)',
      queryParams: [cookiedPoolName, bracketTypeName]
    });
  })
  .then(remainingTeamsData => {
    // add in best possible remaining score data

    // build standings lookup table
    let arrayIndex = 0;
    let standingsLookup = {};
    let incorrectPicks = {};

    for(let data of standingsData) {
      standingsLookup[data.userDisplayToken] = arrayIndex;
      incorrectPicks[data.userDisplayToken] = {};
      data['bestPossibleScore'] = adjustedScore;

      arrayIndex += 1;
    }

    // figure out the best possible score remaining for each user
    for(let data of remainingTeamsData[0]) {
      const index = parseInt(standingsLookup[data.userDisplayToken]);

      // user pick is wrong so set the wrong team so we can follow it to the final four
      if(data.userPick == 'incorrectPick') {
        incorrectPicks[data.userDisplayToken][data.teamName] = 1;     
        standingsData[index]['bestPossibleScore'] -= data.gameRoundScore;
      }

      // this is an incorrect final four pick so decrement the total of correct teams left
      if(data.userPick == '' && (incorrectPicks[data.userDisplayToken] && incorrectPicks[data.userDisplayToken][data.teamName])) {
        standingsData[index]['bestPossibleScore'] -= data.gameRoundScore;
      }
    }
  
    // render the standings       
    res.render('standings', {
      standings: standingsData,
      poolName: cookiedPoolName
    }); 
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
};

exports.showFullStandings = (req, res) => {
  getStandings({req: req, res: res, bracketTypeName: 'normalBracket'});
};

exports.showSweet16Standings = (req, res) => {
  getStandings({req: req, res: res, bracketTypeName: 'sweetSixteenBracket'});
};
