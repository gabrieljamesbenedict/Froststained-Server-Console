import fs from 'node:fs';
import path from 'node:path';
import { audit } from '../db.js';
import { deleteEntry, listDir, readTextFile, renameEntry, resolveServerPath, writeTextFile } from '../services/fileBrowser.js';

const MAX_UPLOAD_MB = 50;

function errToStatus(err) {
  if (err.code === 'BAD_PATH') return 400;
  if (err.code === 'NOT_FOUND') return 404;
  if (err.code === 'CONFLICT') return 409;
  return 500;
}

export default async function filesRoutes(app) {
  await app.register(import('@fastify/multipart'), {
    limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  });

  const root = () => app.config.serverPath;

  const requireAdmin = async (req, reply) => {
    await app.requireAuth(req, reply);
    if (req.user?.role !== 'admin') {
      return reply.code(403).send({ error: 'admin role required' });
    }
  };

  app.get('/api/files', { preHandler: app.requireAuth }, async (req, reply) => {
    try {
      return listDir(root(), req.query.path ?? '');
    } catch (err) {
      return reply.code(errToStatus(err)).send({ error: err.message });
    }
  });

  app.get('/api/files/content', { preHandler: app.requireAuth }, async (req, reply) => {
    try {
      return readTextFile(root(), req.query.path ?? '');
    } catch (err) {
      return reply.code(errToStatus(err)).send({ error: err.message });
    }
  });

  app.put('/api/files/content', { preHandler: requireAdmin }, async (req, reply) => {
    try {
      const info = writeTextFile(root(), req.body?.path, req.body?.content);
      audit(app.db, req.user.id, 'file.write', `${info.path} (backup: ${info.backup})`);
      return info;
    } catch (err) {
      return reply.code(errToStatus(err)).send({ error: err.message });
    }
  });

  app.post('/api/files/rename', { preHandler: requireAdmin }, async (req, reply) => {
    try {
      const info = renameEntry(root(), req.body?.from, req.body?.to);
      audit(app.db, req.user.id, 'file.rename', `${info.from} -> ${info.to}`);
      return info;
    } catch (err) {
      return reply.code(errToStatus(err)).send({ error: err.message });
    }
  });

  app.delete('/api/files/entry', { preHandler: requireAdmin }, async (req, reply) => {
    try {
      const info = deleteEntry(root(), req.query.path ?? '');
      audit(app.db, req.user.id, 'file.delete', info.deleted);
      return info;
    } catch (err) {
      return reply.code(errToStatus(err)).send({ error: err.message });
    }
  });

  app.get('/api/files/download', { preHandler: app.requireAuth }, async (req, reply) => {
    try {
      const { rel, full } = resolveServerPath(root(), req.query.path ?? '');
      if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
        return reply.code(404).send({ error: `not found: ${rel}` });
      }
      reply.header('Content-Disposition', `attachment; filename="${path.basename(full)}"`);
      reply.header('Content-Type', 'application/octet-stream');
      return reply.send(fs.createReadStream(full));
    } catch (err) {
      return reply.code(errToStatus(err)).send({ error: err.message });
    }
  });

  app.post('/api/files/upload', { preHandler: requireAdmin }, async (req, reply) => {
    try {
      const { full: dir } = resolveServerPath(root(), req.query.path ?? '');
      if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
        return reply.code(400).send({ error: 'upload target must be a folder inside the server' });
      }
      const part = await req.file();
      if (!part) return reply.code(400).send({ error: 'missing file (field "file")' });
      const base = path.basename(part.filename ?? '');
      if (!base) return reply.code(400).send({ error: 'missing filename' });
      const full = path.join(dir, base);
      if (!full.startsWith(dir + path.sep)) return reply.code(400).send({ error: 'invalid filename' });
      if (fs.existsSync(full)) return reply.code(409).send({ error: `already exists: ${base}` });
      await new Promise((resolve, reject) => {
        part.file.on('error', reject);
        const out = fs.createWriteStream(full);
        out.on('error', reject);
        out.on('finish', resolve);
        part.file.pipe(out);
      });
      audit(app.db, req.user.id, 'file.upload', `${req.query.path ? `${req.query.path}/` : ''}${base}`);
      return { ok: true, path: `${req.query.path ? `${req.query.path}/` : ''}${base}` };
    } catch (err) {
      return reply.code(errToStatus(err)).send({ error: err.message });
    }
  });
}
