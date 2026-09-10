const { sha256Base64Url } = require('../lib/auth');

async function loadSession(db, sessionToken) {
  const sessionHash = sha256Base64Url(sessionToken);
  const { rows } = await db.query(
    `SELECT s.user_id, s.expires_at, s.revoked_at,
            u.username, u.display_name, u.role, u.disabled_at, u.must_change_password
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.session_hash = $1
      LIMIT 1`,
    [sessionHash]
  );
  return rows[0] || null;
}

function authMiddleware() {
  return async (req, res, next) => {
    try {
      const token = req.cookies?.sp_sess;
      if (!token) return next();
      const db = req.app.locals.db;
      const sess = await loadSession(db, token);
      if (!sess) return next();
      if (sess.revoked_at) return next();
      if (sess.disabled_at) return next();
      if (sess.expires_at && new Date(sess.expires_at).getTime() < Date.now()) return next();

      req.user = {
        id: sess.user_id,
        username: sess.username,
        display_name: sess.display_name,
        role: sess.role,
        must_change_password: !!sess.must_change_password,
      };

      // best-effort touch
      db.query(
        `UPDATE user_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE session_hash = $1`,
        [sha256Base64Url(token)]
      ).catch(() => {});

      next();
    } catch (e) {
      next(e);
    }
  };
}

function requireAuth() {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    next();
  };
}

function requireRole(roles) {
  const allowed = new Set(Array.isArray(roles) ? roles : [roles]);
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (!allowed.has(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

module.exports = { authMiddleware, requireAuth, requireRole };

