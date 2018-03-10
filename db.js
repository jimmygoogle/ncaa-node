const mysql = require('mysql');

const mysqlPool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  connectionLimit : process.env.MYSQL_CONNECTION_LIMIT
});

exports.executeQuery = function(args) {
  const query = args.query;
  const queryParams = args.queryParams || []; 

  return new Promise(function(resolve, reject) {
    mysqlPool.query(query, queryParams, function (err, rows, fields) {
      // reject on error states and resolve with results
      if (err) {
        return reject(err);
      }      
      resolve(rows);
    });
  });
};