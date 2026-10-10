import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { audit } from '../db.js';

const BCRYPT_COST = 12;
const USER_RE = /^[a-zA-Z0-9_-]{3,32}$/;
const VALID_ROLES = ['admin', 'viewer'];

export default async function adminUsersRoutes(app) {
  const db = app.db;

  // Admin guard: require authentication + admin role
  const requireAdmin = async (req, reply) => {
    await app.requireAuth(req, reply);
    if (req.user?.role !== 'admin') {
      return reply.code(403).send({ error: 'admin role required' });
    }
  };

  // GET /api/admin/users — list all users
  app.get('/api/admin/users', { preHandler: requireAdmin }, async (req) => {
    const users = db
      .prepare('SELECT id, username, role, created_at FROM users ORDER BY created_at')
      .all();
    return { users };
  });

  // POST /api/admin/users — create user
  app.post('/api/admin/users', { preHandler: requireAdmin }, async (req, reply) => {
    const { username, password, role } = req.body ?? {};

    if (typeof username !== 'string' || !USER_RE.test(username)) {
      return reply.code(400).send({ error: 'username must be 3-32 chars: letters, numbers, _ or -' });
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
      return reply.code(400).send({ error: 'password must be 8-128 characters' });
    }
    if (typeof role !== 'string' || !VALID_ROLES.includes(role)) {
      return reply.code(400).send({ error: 'role must be "admin" or "viewer"' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return reply.code(409).send({ error: 'username already exists' });
    }

    const hash = await bcrypt.hash(password, BCRYPT_COST);
    const { lastInsertRowid } = db
      .prepare('INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)')
      .run(username, hash, role, Date.now());
    const userId = Number(lastInsertRowid);

    audit(db, req.user.id, 'admin.user.create', `created user "${username}" with role "${role}"`);

    return { id: userId, username, role, created_at: Date.now() };
  });

  // PATCH /api/admin/users/:id — update user
  app.patch('/api/admin/users/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const targetId = Number(req.params.id);
    const { password, role } = req.body ?? {};

    if (isNaN(targetId)) {
      return reply.code(400).send({ error: 'invalid user id' });
    }

    const target = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(targetId);
    if (!target) {
      return reply.code(404).send({ error: 'user not found' });
    }

    // Cannot change own role
    if (role !== undefined && targetId === req.user.id) {
      return reply.code(403).send({ error: 'cannot change your own role' });
    }

    if (password !== undefined) {
      if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
        return reply.code(400).send({ error: 'password must be 8-128 characters' });
      }
      const hash = await bcrypt.hash(password, BCRYPT_COST);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, targetId);

      // Invalidate other sessions (keep current session if it's the target user)
      const currentToken = req.cookies?.froststained_session;
      const currentHash = currentToken
        ? crypto.createHash('sha256').update(currentToken).digest('hex')
        : null;
      if (currentHash) {
        db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(targetId, currentHash);
      } else {
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(targetId);
      }
    }

    if (role !== undefined) {
      if (!VALID_ROLES.includes(role)) {
        return reply.code(400).send({ error: 'role must be "admin" or "viewer"' });
      }
      if (target.role !== role) {
        db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, targetId);
      }
    }

    const updated = db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(targetId);

    const details = [];
    if (password !== undefined) details.push('password changed');
    if (role !== undefined && target.role !== role) details.push(`role changed from "${target.role}" to "${role}"`);
    audit(db, req.user.id, 'admin.user.update', `updated user "${target.username}": ${details.join(', ') || 'no changes'}`);

    return updated;
  });

  // DELETE /api/admin/users/:id — delete user
  app.delete('/api/admin/users/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const targetId = Number(req.params.id);

    if (isNaN(targetId)) {
      return reply.code(400).send({ error: 'invalid user id' });
    }

    const target = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(targetId);
    if (!target) {
      return reply.code(404).send({ error: 'user not found' });
    }

    // Cannot delete self
    if (targetId === req.user.id) {
      return reply.code(403).send({ error: 'cannot delete yourself' });
    }

    // Cannot delete last admin
    if (target.role === 'admin') {
      const { count } = db.prepare('SELECT COUNT(*) AS count FROM users WHERE role = ?').get('admin');
      if (count <= 1) {
        return reply.code(403).send({ error: 'cannot delete the last admin user' });
      }
    }

    // Delete user (sessions cascade via FK)
    db.prepare('DELETE FROM users WHERE id = ?').run(targetId);

    audit(db, req.user.id, 'admin.user.delete', `deleted user "${target.username}" (was ${target.role})`);

    return { ok: true };
  });
}