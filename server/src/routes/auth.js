import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { audit } from '../db.js';

export const COOKIE_NAME = 'froststained_session';
const SESSION_DAYS = 30;
const BCRYPT_COST = 12;

// Simple in-memory login rate limiter: 10 attempts per 10 min per IP.
const attempts = new Map();
function limited(ip) {
  const now = Date.now();
  const cur = attempts.get(ip) ?? { count: 0, resetAt: now + 10 * 60 * 1000 };
  if (now > cur.resetAt) {
    cur.count = 0;
    cur.resetAt = now + 10 * 60 * 1000;
  }
  cur.count += 1;
  attempts.set(ip, cur);
  return cur.count > 10 ? Math.ceil((cur.resetAt - now) / 1000) : 0;
}

const USER_RE = /^[a-zA-Z0-9_-]{3,32}$/;

function newSession(db, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    tokenHash,
    userId,
    Date.now(),
    Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
  );
  return token;
}

export function parseSessionToken(cookieHeader) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE_NAME) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function getUserFromToken(db, token) {
  if (!token) return null;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  return (
    db
      .prepare(
        'SELECT u.id, u.username, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?',
      )
      .get(tokenHash) ?? null
  );
}
function setSessionCookie(reply, token) {
  // secure:false because LAN installs run over plain HTTP; enable when HTTPS is added.
  reply.setCookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    secure: false,
  });
}

export default async function authRoutes(app) {
  const db = app.db;

  app.get('/api/auth/status', async () => {
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM users').get();
    return { needsSetup: count === 0 };
  });

  // First-run admin creation. Only works while no users exist.
  app.post('/api/auth/setup', async (req, reply) => {
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM users').get();
    if (count > 0) return reply.code(403).send({ error: 'setup already completed' });
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || !USER_RE.test(username)) {
      return reply.code(400).send({ error: 'username must be 3-32 chars: letters, numbers, _ or -' });
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
      return reply.code(400).send({ error: 'password must be 8-128 characters' });
    }
    const hash = await bcrypt.hash(password, BCRYPT_COST);
    const { lastInsertRowid } = db
      .prepare("INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, 'admin', ?)")
      .run(username, hash, Date.now());
    const userId = Number(lastInsertRowid);
    audit(db, userId, 'auth.setup', `admin "${username}" created`);
    setSessionCookie(reply, newSession(db, userId));
    return { id: userId, username, role: 'admin' };
  });

  app.post('/api/auth/login', async (req, reply) => {
    const retryAfter = limited(req.ip);
    if (retryAfter) return reply.code(429).send({ error: 'too many attempts, try again later', retryAfter });
    const { username, password } = req.body ?? {};
    const user = typeof username === 'string'
      ? db.prepare('SELECT * FROM users WHERE username = ?').get(username)
      : undefined;
    const ok = user && typeof password === 'string' && (await bcrypt.compare(password, user.password_hash));
    if (!ok) {
      audit(db, user?.id ?? null, 'auth.login.failed', `username "${username}"`);
      return reply.code(401).send({ error: 'invalid username or password' });
    }
    audit(db, user.id, 'auth.login', `username "${user.username}"`);
    setSessionCookie(reply, newSession(db, user.id));
    return { id: user.id, username: user.username, role: user.role };
  });

  app.post('/api/auth/logout', { preHandler: app.requireAuth }, async (req, reply) => {
    const token = req.cookies[COOKIE_NAME];
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(
      crypto.createHash('sha256').update(token).digest('hex'),
    );
    audit(db, req.user.id, 'auth.logout', '');
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', { preHandler: app.requireAuth }, async (req) => req.user);

  app.post('/api/auth/password', { preHandler: app.requireAuth }, async (req, reply) => {
    const { currentPassword, newPassword } = req.body ?? {};
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user || typeof currentPassword !== 'string' || !(await bcrypt.compare(currentPassword, user.password_hash))) {
      return reply.code(401).send({ error: 'current password is incorrect' });
    }
    if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) {
      return reply.code(400).send({ error: 'new password must be 8-128 characters' });
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await bcrypt.hash(newPassword, BCRYPT_COST), user.id);
    // Log out other sessions; keep this one.
    const current = crypto.createHash('sha256').update(req.cookies[COOKIE_NAME]).digest('hex');
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(user.id, current);
    audit(db, user.id, 'auth.password', 'password changed');
    return { ok: true };
  });
}
