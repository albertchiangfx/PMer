const crypto = require('crypto');
const bcrypt = require('bcryptjs');

function sha256Base64Url(input) {
  const h = crypto.createHash('sha256').update(String(input)).digest('base64');
  return h.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function newToken() {
  return crypto.randomBytes(32).toString('base64url');
}

async function hashPassword(plain) {
  const pwd = String(plain || '');
  if (pwd.length < 10) {
    const err = new Error('Password too short (min 10 chars)');
    err.status = 400;
    throw err;
  }
  const salt = await bcrypt.genSalt(12);
  return await bcrypt.hash(pwd, salt);
}

async function verifyPassword(plain, hash) {
  if (!hash) return false;
  return await bcrypt.compare(String(plain || ''), String(hash));
}

module.exports = {
  sha256Base64Url,
  newToken,
  hashPassword,
  verifyPassword,
};

