const express = require('express');
const router = express.Router();
const { newToken, sha256Base64Url, hashPassword, verifyPassword } = require('../lib/auth');
const { requireAuth } = require('../middleware/auth');

const SESSION_TTL_HOURS = parseInt(process.env.AUTH_SESSION_TTL_HOURS || '168', 10); // 7 days
const ACTIVATE_TTL_HOURS = parseInt(process.env.AUTH_ACTIVATE_TTL_HOURS || '24', 10);
const DEV_BYPASS_PASSWORDS = process.env.AUTH_DEV_BYPASS_PASSWORDS === '1';

function hoursFromNow(h) {
  return new Date(Date.now() + h * 60 * 60 * 1000);
}

function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production';
  res.cookie('sp_sess', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: SESSION_TTL_HOURS * 60 * 60 * 1000,
  });
}

function clearSessionCookie(res) {
  res.clearCookie('sp_sess', { path: '/' });
}

// naive in-memory rate limiter: ip+username
const loginBuckets = new Map();
function rateLimitLogin(req, username) {
  const key = `${req.ip}::${String(username || '').toLowerCase()}`;
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const max = 20;
  const b = loginBuckets.get(key) || { ts: now, n: 0 };
  if (now - b.ts > windowMs) {
    b.ts = now;
    b.n = 0;
  }
  b.n += 1;
  loginBuckets.set(key, b);
  if (b.n > max) {
    const err = new Error('Too many attempts, try later');
    err.status = 429;
    throw err;
  }
}

router.get('/me', (req, res) => {
  if (!req.user) return res.json(null);
  const db = req.app.locals.db;
  db.query(`SELECT id FROM team_members WHERE user_id = $1 LIMIT 1`, [req.user.id])
    .then(({ rows }) => {
      res.json({
        id: req.user.id,
        username: req.user.username,
        display_name: req.user.display_name,
        role: req.user.role,
        must_change_password: req.user.must_change_password,
        team_member_id: rows[0]?.id || null,
      });
    })
    .catch(() => {
      // If the DB is mid-migration, still allow /me without team_member_id.
      res.json({
        id: req.user.id,
        username: req.user.username,
        display_name: req.user.display_name,
        role: req.user.role,
        must_change_password: req.user.must_change_password,
        team_member_id: null,
      });
    });
});

router.post('/logout', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const token = req.cookies?.sp_sess;
    clearSessionCookie(res);
    if (token) {
      await db.query(`UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE session_hash = $1`, [
        sha256Base64Url(token),
      ]);
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { username, password } = req.body || {};
    rateLimitLogin(req, username);
    const u = String(username || '').trim();
    const p = String(password || '');
    if (!u || !p) return res.status(400).json({ error: 'username and password required' });

    const { rows } = await db.query(
      `SELECT id, username, display_name, role, password_hash, must_change_password, disabled_at
         FROM users
        WHERE lower(username) = lower($1)
        LIMIT 1`,
      [u]
    );
    const user = rows[0];
    if (!user || user.disabled_at) return res.status(401).json({ error: 'Invalid credentials' });
    if (DEV_BYPASS_PASSWORDS) {
      res.setHeader('x-auth-dev-bypass', '1');
    }
    if (!DEV_BYPASS_PASSWORDS) {
      const ok = await verifyPassword(p, user.password_hash);
      if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    }

    const sessionToken = newToken();
    await db.query(
      `INSERT INTO user_sessions (user_id, session_hash, expires_at, last_seen_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
      [user.id, sha256Base64Url(sessionToken), hoursFromNow(SESSION_TTL_HOURS)]
    );
    setSessionCookie(res, sessionToken);
    res.json({
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role: user.role,
      must_change_password: !!user.must_change_password,
    });
  } catch (e) {
    next(e);
  }
});

async function ensureCanCreateUser(req, db) {
  // Normal case: logged-in admin
  if (req.user?.role === 'admin') return true;

  // Bootstrap: allow creating the very first admin user using a one-time secret.
  const secret = process.env.AUTH_BOOTSTRAP_SECRET || '';
  if (!secret) return false;
  const provided = req.get('x-bootstrap-secret') || '';
  if (!provided || provided !== secret) return false;

  const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM users`);
  return (rows[0]?.n || 0) === 0;
}

// Admin creates user + activation token (returns the plain token ONCE).
router.post('/admin/create-user', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const ok = await ensureCanCreateUser(req, db);
    if (!ok) return res.status(403).json({ error: 'Forbidden' });

    const { username, display_name = null, role = 'pm' } = req.body || {};
    const u = String(username || '').trim();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$/.test(u)) {
      return res.status(400).json({
        error: 'Invalid username. Use 3-64 chars: letters, numbers, dot, underscore, hyphen.',
      });
    }
    if (!['admin', 'pm', 'artist', 'finance'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const { rows } = await db.query(
      `INSERT INTO users (username, display_name, role, must_change_password)
       VALUES ($1, $2, $3, TRUE)
       ON CONFLICT (username) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         role = EXCLUDED.role
       RETURNING id, username, display_name, role`,
      [u, display_name, role]
    );
    const user = rows[0];

    // Ensure a linked team_member exists for UI (dashboard/tasks).
    // Legacy rows without user_id remain untouched.
    const tmName = String(display_name || '').trim() || u;
    const tmRole =
      role === 'admin'
        ? 'Admin'
        : role === 'pm'
          ? 'PM'
          : role === 'artist'
            ? 'Artist'
            : role === 'finance'
              ? 'Finance'
              : 'Member';
    await db.query(
      `INSERT INTO team_members (user_id, name, role, status)
       VALUES ($1, $2, $3, 'active')
       ON CONFLICT (user_id) DO UPDATE SET
         name = EXCLUDED.name,
         role = EXCLUDED.role,
         status = 'active'`,
      [user.id, tmName, tmRole]
    );

    const token = newToken();
    await db.query(
      `INSERT INTO user_activation_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, sha256Base64Url(token), hoursFromNow(ACTIVATE_TTL_HOURS)]
    );

    res.json({
      user,
      activation_token: token,
      expires_at: hoursFromNow(ACTIVATE_TTL_HOURS),
    });
  } catch (e) {
    next(e);
  }
});

// User sets password using activation token (first-time)
router.post('/activate', async (req, res, next) => {
  const client = await req.app.locals.db.connect();
  try {
    const { token, new_password } = req.body || {};
    const t = String(token || '').trim();
    if (!t) return res.status(400).json({ error: 'token required' });
    const pwdHash = await hashPassword(new_password);
    const tokenHash = sha256Base64Url(t);

    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, user_id, expires_at, used_at
         FROM user_activation_tokens
        WHERE token_hash = $1
        LIMIT 1
        FOR UPDATE`,
      [tokenHash]
    );
    const row = rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid token' });
    }
    if (row.used_at) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Token already used' });
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Token expired' });
    }

    await client.query(
      `UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2`,
      [pwdHash, row.user_id]
    );
    await client.query(`UPDATE user_activation_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1`, [
      row.id,
    ]);

    // auto login
    const sessionToken = newToken();
    await client.query(
      `INSERT INTO user_sessions (user_id, session_hash, expires_at, last_seen_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
      [row.user_id, sha256Base64Url(sessionToken), hoursFromNow(SESSION_TTL_HOURS)]
    );

    const { rows: meRows } = await client.query(
      `SELECT id, username, display_name, role, must_change_password FROM users WHERE id = $1`,
      [row.user_id]
    );
    await client.query('COMMIT');
    setSessionCookie(res, sessionToken);
    res.json(meRows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    next(e);
  } finally {
    client.release();
  }
});

// Logged-in user can change password
router.post('/change-password', requireAuth(), async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { current_password, new_password } = req.body || {};
    const { rows } = await db.query(`SELECT password_hash FROM users WHERE id = $1`, [req.user.id]);
    const ok = await verifyPassword(current_password, rows[0]?.password_hash);
    if (!ok) return res.status(400).json({ error: 'Current password incorrect' });
    const pwdHash = await hashPassword(new_password);
    await db.query(`UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2`, [
      pwdHash,
      req.user.id,
    ]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Admin: list users
router.get('/admin/users', requireAuth(), async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    const db = req.app.locals.db;
    const { rows } = await db.query(
      `SELECT id, username, display_name, role, must_change_password, disabled_at, created_at, updated_at
         FROM users
        ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// Admin: update role / display name / disabled
router.post('/admin/users/:id', requireAuth(), async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    const db = req.app.locals.db;
    const { role, display_name, disabled } = req.body || {};
    if (role && !['admin', 'pm', 'artist', 'finance'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    const { rows } = await db.query(
      `UPDATE users SET
         role = COALESCE($1, role),
         display_name = COALESCE($2, display_name),
         disabled_at = CASE
           WHEN $3::boolean IS NULL THEN disabled_at
           WHEN $3::boolean = TRUE THEN COALESCE(disabled_at, CURRENT_TIMESTAMP)
           ELSE NULL
         END
       WHERE id = $4
       RETURNING id, username, display_name, role, must_change_password, disabled_at, created_at, updated_at`,
      [role ?? null, display_name ?? null, disabled === undefined ? null : !!disabled, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

// Admin: revoke all sessions for a user
router.post('/admin/users/:id/revoke-sessions', requireAuth(), async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    const db = req.app.locals.db;
    await db.query(
      `UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP
        WHERE user_id = $1 AND revoked_at IS NULL`,
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Admin: create a fresh activation token for a user (force password reset)
router.post('/admin/users/:id/new-activation', requireAuth(), async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    const db = req.app.locals.db;
    const token = newToken();
    const { rows } = await db.query(
      `INSERT INTO user_activation_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)
       RETURNING expires_at`,
      [req.params.id, sha256Base64Url(token), hoursFromNow(ACTIVATE_TTL_HOURS)]
    );
    await db.query(`UPDATE users SET must_change_password = TRUE WHERE id = $1`, [req.params.id]);
    res.json({ activation_token: token, expires_at: rows[0]?.expires_at || hoursFromNow(ACTIVATE_TTL_HOURS) });
  } catch (e) {
    next(e);
  }
});

// Admin: view current auth config (ttl)
router.get('/admin/config', requireAuth(), async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  res.json({
    session_ttl_hours: SESSION_TTL_HOURS,
    activation_ttl_hours: ACTIVATE_TTL_HOURS,
  });
});

module.exports = router;

