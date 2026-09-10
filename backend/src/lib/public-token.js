const crypto = require('crypto');

function newPublicToken() {
  return crypto.randomBytes(24).toString('base64url');
}

module.exports = { newPublicToken };
