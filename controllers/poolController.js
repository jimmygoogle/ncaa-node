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
      res.cookie('MarchMadness', poolName, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true });
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
exports.checkPoolStatus = (args) => {
  // we will want to do this multiple times in case someone is doing something funny
  // around the time the bracket submission closes
   return db.executeQuery({query: 'call PoolStatus'});
};
exports.getPoolName = (req) => {
  return new Promise(function(resolve, reject) {
    const poolName = req.cookies.MarchMadness;
    //console.log('pool name is %s', poolName);
    if(poolName) {
      resolve(poolName);
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