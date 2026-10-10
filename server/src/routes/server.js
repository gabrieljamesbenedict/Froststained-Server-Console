import { audit } from '../db.js';
import { readLogTail } from '../services/logTail.js';
import { serverInfo } from '../services/serverInfo.js';
import { worldInfo } from '../services/worldInfo.js';

function errToStatus(err) {
  if (err.code === 'ALREADY_RUNNING' || err.code === 'PORT_BUSY') return 409;
  if (err.code === 'NOT_RUNNING' || err.code === 'BAD_COMMAND') return 400;
  return 500;
}

export default async function serverRoutes(app) {
  const mc = app.mc;

  app.get('/api/server/status', { preHandler: app.requireAuth }, async () => mc.status());

  app.get('/api/server/log', { preHandler: app.requireAuth }, async (req) => {
    const lines = Math.min(Math.max(Number(req.query.lines) || 200, 1), 1000);
    return { lines: readLogTail(app.config.serverPath, lines) };
  });

  app.get('/api/server/world', { preHandler: app.requireAuth }, async (req, reply) => {
    try {
      return worldInfo(app.config.serverPath);
    } catch (err) {
      return reply.code(errToStatus(err)).send({ error: err.message });
    }
  });

  app.get('/api/server/info', { preHandler: app.requireAuth }, async () => {
    const info = serverInfo({ config: app.config, rcon: app.rcon });
    info.rcon.reachable = info.rcon.configured ? await app.rcon.reachable() : false;
    return info;
  });

  app.post('/api/server/start', { preHandler: app.requireAuth }, async (req, reply) => {
    try {
      const status = await mc.start();
      audit(app.db, req.user.id, 'server.start', `pid ${status.pid}`);
      return status;
    } catch (err) {
      return reply.code(errToStatus(err)).send({ error: err.message });
    }
  });

  app.post('/api/server/stop', { preHandler: app.requireAuth }, async (req) => {
    const status = await mc.stop();
    audit(app.db, req.user.id, 'server.stop', '');
    return status;
  });

  app.post('/api/server/restart', { preHandler: app.requireAuth }, async (req) => {
    const status = await mc.restart();
    audit(app.db, req.user.id, 'server.restart', `pid ${status.pid}`);
    return status;
  });

  app.post('/api/server/kill', { preHandler: app.requireAuth }, async (req) => {
    const status = await mc.kill();
    audit(app.db, req.user.id, 'server.kill', '');
    return status;
  });

  app.post('/api/server/command', { preHandler: app.requireAuth }, async (req, reply) => {
    try {
      mc.send(req.body?.command);
      audit(app.db, req.user.id, 'server.command', String(req.body.command).slice(0, 200));
      return { ok: true };
    } catch (err) {
      return reply.code(errToStatus(err)).send({ error: err.message });
    }
  });
}
