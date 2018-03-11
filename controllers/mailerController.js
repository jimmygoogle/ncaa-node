const pug = require('pug');
const promisify = require('es6-promisify');
const send = require('gmail-send')({
  user: process.env.MAIL_USER,
  pass: process.env.MAIL_PASS,
  from: process.env.MAIL_FROM
});

const generateHTML = (filename, options = {}) => {
  const html = pug.renderFile(`${__dirname}/../views/email/${filename}.pug`, options);
  return html;
}

exports.sendConfirmationEmail = (args) => {
  const sendMail = promisify(send);
  return sendMail({
      html: generateHTML('confirmation', args),
      subject: '\u{1F3C0}' + 'Welcome to the ' +  args.year + ' ' + args.poolName + ' March Madness Pool',
      to: args.emailAddress
    });
}

exports.sendErrorEmail = (args) => {
  const err = args.err;
  //console.log(err);
  const sendMail = promisify(send);
  return sendMail({
      subject: 'March Madness error',
      text: JSON.stringify(err, null, 2),
      to: process.env.ERROR_EMAIL
    });
}