import fs from 'node:fs';
import { audit } from '../db.js';
import { createBackup, listBackups, resolveBackupFile, restoreBackup } from '../services/backups.js';

function errToStatus(err) {
  if (err.code === 'BAD_FILE') return 400;
  if (err.code === 'NOT_FOUND' || err.code === 'NO_WORLD') return 404;
  if (err.code === 'LIVE_NO_RCON' || err.code === 'STILL_RUNNING' || err.code === 'PORT_BUSY') return 409;
  return 500;
}

export default async function backupsRoutes(app) {
  const dir = () => app.config.backupDir;

  const requireAdmin = async (req, reply) => {
    await app.requireAuth(req, reply);
    if (req.user?.role !== 'admin') {
      return reply.code(403).send({ error: 'admin role required' });
    }
  };

  app.get('/api/backups', { preHandler: app.requireAuth }, async () => listBackups(dir()));

  app.post('/api/backups', { preHandler: requireAdmin }, async (req, reply) => {
    try {
      const info = await createBackup({
        serverPath: app.config.serverPath,
        backupDir: dir(),
        mc: app.mc,
        rcon: app.rcon,
      });
      audit(app.db, req.user.id, 'backup.create', `${info.file} (${info.sizeKb} KB, live=${info.live})`);
      return info;
    } catch (err) {
      return reply.code(errToStatus(err)).send({ error: err.message });
    }
  });

  app.get('/api/backups/:file/download', { preHandler: app.requireAuth }, async (req, reply) => {
    try {
      const { base, full } = resolveBackupFile(dir(), req.params.file);
      reply.header('Content-Disposition', `attachment; filename="${base}"`);
      reply.header('Content-Type', 'application/zip');
      return reply.send(fs.createReadStream(full));
    } catch (err) {
      return reply.code(errToStatus(err)).send({ error: err.message });
    }
  });

  app.delete('/api/backups/:file', { preHandler: requireAdmin }, async (req, reply) => {
    try {
      const { base, full } = resolveBackupFile(dir(), req.params.file);
      fs.rmSync(full);
      audit(app.db, req.user.id, 'backup.delete', base);
      return { ok: true, file: base };
    } catch (err) {
      return reply.code(errToStatus(err)).send({ error: err.message });
    }
  });

  app.post('/api/backups/:file/restore', { preHandler: requireAdmin }, async (req, reply) => {
    try {
      const info = await restoreBackup({
        serverPath: app.config.serverPath,
        backupDir: dir(),
        mc: app.mc,
        file: req.params.file,
      });
      audit(app.db, req.user.id, 'backup.restore', `${info.restored} (safety: ${info.safetyBackup ?? 'none'})`);
      return info;
    } catch (err) {
      return reply.code(errToStatus(err)).send({ error: err.message });
    }
  });
}
