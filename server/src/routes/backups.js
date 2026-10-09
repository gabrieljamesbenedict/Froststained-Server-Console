import fs from 'node:fs';
import { audit } from '../db.js';
import { createBackup, listBackups, resolveBackupFile } from '../services/backups.js';

function errToStatus(err) {
  if (err.code === 'BAD_FILE') return 400;
  if (err.code === 'NOT_FOUND' || err.code === 'NO_WORLD') return 404;
  if (err.code === 'LIVE_NO_RCON') return 409;
  return 500;
}

export default async function backupsRoutes(app) {
  const dir = () => app.config.backupDir;

  app.get('/api/backups', { preHandler: app.requireAuth }, async () => listBackups(dir()));

  app.post('/api/backups', { preHandler: app.requireAuth }, async (req, reply) => {
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

  app.delete('/api/backups/:file', { preHandler: app.requireAuth }, async (req, reply) => {
    try {
      const { base, full } = resolveBackupFile(dir(), req.params.file);
      fs.rmSync(full);
      audit(app.db, req.user.id, 'backup.delete', base);
      return { ok: true, file: base };
    } catch (err) {
      return reply.code(errToStatus(err)).send({ error: err.message });
    }
  });
}
