import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { audit } from '../db.js';
import { listMods, modsDir, scanMod } from '../services/modScanner.js';

const MAX_UPLOAD_MB = 200;

// The :file param is always treated as a bare filename inside mods/ -
// basename + containment check blocks path traversal.
function resolveModFile(serverPath, file) {
  const base = path.basename(file ?? '');
  if (!base.endsWith('.jar') && !base.endsWith('.jar.disabled')) {
    const err = new Error('mod file must end with .jar or .jar.disabled');
    err.code = 'BAD_FILE';
    throw err;
  }
  const full = path.join(modsDir(serverPath), base);
  if (!full.startsWith(modsDir(serverPath) + path.sep)) {
    const err = new Error('invalid mod file');
    err.code = 'BAD_FILE';
    throw err;
  }
  if (!fs.existsSync(full)) {
    const err = new Error(`mod not found: ${base}`);
    err.code = 'NOT_FOUND';
    throw err;
  }
  return { base, full };
}

function errToStatus(err) {
  if (err.code === 'BAD_FILE') return 400;
  if (err.code === 'NOT_FOUND') return 404;
  if (err.code === 'CONFLICT') return 409;
  return 500;
}

export default async function modsRoutes(app) {
  await app.register(import('@fastify/multipart'), {
    limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  });

  app.get('/api/mods', { preHandler: app.requireAuth }, async () => listMods(app.config.serverPath));

  app.post('/api/mods/upload', { preHandler: app.requireAuth }, async (req, reply) => {
    const dir = modsDir(app.config.serverPath);
    fs.mkdirSync(dir, { recursive: true });
    const part = await req.file();
    if (!part) return reply.code(400).send({ error: 'missing mod file (field "mod")' });
    const base = path.basename(part.filename ?? '');
    if (!base.endsWith('.jar')) return reply.code(400).send({ error: 'only .jar files can be uploaded' });
    const full = path.join(dir, base);
    if (!full.startsWith(dir + path.sep)) return reply.code(400).send({ error: 'invalid filename' });
    await pump(part.file, fs.createWriteStream(full));
    try {
      void new AdmZip(full).getEntries();
    } catch {
      fs.rmSync(full, { force: true });
      return reply.code(400).send({ error: 'file is not a readable jar' });
    }
    const info = scanMod(full);
    audit(app.db, req.user.id, 'mod.upload', `${base} (${info.sizeKb} KB)`);
    return info;
  });

  app.post('/api/mods/:file/enable', { preHandler: app.requireAuth }, async (req, reply) => {
    try {
      const { base, full } = resolveModFile(app.config.serverPath, req.params.file);
      if (!base.endsWith('.jar.disabled')) {
        return reply.code(409).send({ error: 'mod is already enabled' });
      }
      const target = full.slice(0, -'.disabled'.length);
      if (fs.existsSync(target)) {
        const err = new Error(`${path.basename(target)} already exists`);
        err.code = 'CONFLICT';
        throw err;
      }
      fs.renameSync(full, target);
      audit(app.db, req.user.id, 'mod.enable', base);
      return scanMod(target);
    } catch (err) {
      return reply.code(errToStatus(err)).send({ error: err.message });
    }
  });

  app.post('/api/mods/:file/disable', { preHandler: app.requireAuth }, async (req, reply) => {
    try {
      const { base, full } = resolveModFile(app.config.serverPath, req.params.file);
      if (base.endsWith('.jar.disabled')) {
        return reply.code(409).send({ error: 'mod is already disabled' });
      }
      const target = `${full}.disabled`;
      fs.renameSync(full, target);
      audit(app.db, req.user.id, 'mod.disable', base);
      return scanMod(target);
    } catch (err) {
      return reply.code(errToStatus(err)).send({ error: err.message });
    }
  });

  app.delete('/api/mods/:file', { preHandler: app.requireAuth }, async (req, reply) => {
    try {
      const { base, full } = resolveModFile(app.config.serverPath, req.params.file);
      fs.rmSync(full);
      audit(app.db, req.user.id, 'mod.delete', base);
      return { ok: true, file: base };
    } catch (err) {
      return reply.code(errToStatus(err)).send({ error: err.message });
    }
  });
}

async function pump(from, to) {
  await new Promise((resolve, reject) => {
    from.on('error', reject);
    to.on('error', reject);
    to.on('finish', resolve);
    from.pipe(to);
  });
}
