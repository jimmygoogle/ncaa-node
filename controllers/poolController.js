var db = require('../db')

const getAndSetPoolInfo = (args) => {
  let status = 0;
  const res = args.res;
  const poolName = args.poolName;
  const redirect = args.redirect ? args.redirect : 0;
  //console.log('getting pool name %s', poolName);

  db.executeQuery({query: 'call PoolInfo(?)', queryParams: [poolName]})
  .then(rows => {
    // we found the pool info in the DB so set the cookie
    if(rows[0][0]) {
      // set cookie for 1 month
      setCookie(res, poolName);
      status = 1;
    }
    // there was some sort of issue with the pool so make them input it manually
    else {
      res.redirect('/pool');
    }
    // if we get the pool name redirect to the main page
    if(redirect && status) {
      res.redirect('/');
    }
    // send response
    else {
      res.send({status: status});
    }
  });
}

const setCookie = (res, poolName) => {
  res.cookie('MarchMadness', poolName, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true }); 
}

exports.checkPoolStatus = (args) => {
  // we will want to do this multiple times in case someone is doing something funny
  // around the time the bracket submission closes
  return db.executeQuery({query: 'call PoolStatus'});
};

exports.getPoolName = (req, res) => {
  return new Promise(function(resolve, reject) {
    const poolName = req.cookies.MarchMadness;
    //console.log('pool name is %s', poolName);
    if(poolName) {
      resolve(poolName);
    }
    else if(req.params.userToken && req.path.match(/\/bracket\/(.*?)\/e$/)) {
      console.log('path is %s', req.path);
      // we are here here with an edit token
      // ie: maybe someone submitted on their PC and opened the email on their phone
      // for now we will allow them to access the pool (safe?)
      
      //get the poolName via the token
      db.executeQuery({
        query: 'call GetUserByEditToken(?)',
        queryParams: [req.params.userToken]
      })
      .then(row => {
        const poolName = row[0][0].poolName;
        setCookie(res, poolName);
        resolve(poolName);
      })
      .catch(err => {
        const poolErr = new Error('No pool defined');
        reject(poolErr);
      });
    }
    else {
      const err = new Error('No pool defined');
      reject(err);
    }
  });
};

exports.getPostedPoolInfo = (req, res) => {
  getAndSetPoolInfo({res, poolName: req.body.poolName, redirect: 0});
}

exports.getPoolInfo = (req, res) => {
  getAndSetPoolInfo({res, poolName: req.params.poolName, redirect: 1});
}

exports.showPoolForm = (req, res) => {
  res.render('pool_form');
}

exports.setDemoMode = (req, res) => {
  res.redirect('/pool/butler');
}