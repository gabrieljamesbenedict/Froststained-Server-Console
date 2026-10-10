import { audit } from '../db.js';
import { allPlayers } from '../services/playerStats.js';

const NAME_RE = /^\w{3,16}$/;
// RCON takes one command line; strip CR/LF so reason/message can't smuggle a second command.
const oneLine = (s) => String(s).replace(/[\r\n]+/g, ' ').trim();

function errToStatus(err) {
  if (err.code === 'RCON_NOT_CONFIGURED') return 503;
  if (err.code === 'BAD_NAME' || err.code === 'BAD_MESSAGE') return 400;
  return 502;
}

export default async function playersRoutes(app) {
  const checkName = (name) => {
    if (typeof name !== 'string' || !NAME_RE.test(name)) {
      const err = new Error('name must be a 3-16 char Minecraft username (letters, numbers, _)');
      err.code = 'BAD_NAME';
      throw err;
    }
    return name;
  };

  const run = async (req, reply, label, command) => {
    try {
      const response = await app.rcon.send(command);
      audit(app.db, req.user.id, `player.${label}`, oneLine(command).slice(0, 200));
      return { ok: true, response };
    } catch (err) {
      return reply.code(errToStatus(err)).send({ error: err.message });
    }
  };

  app.get('/api/rcon/status', { preHandler: app.requireAuth }, async () => ({
    configured: app.rcon.configured,
    host: app.rcon.host,
    port: app.rcon.port,
    reachable: app.rcon.configured ? await app.rcon.reachable() : false,
  }));

  app.get('/api/players', { preHandler: app.requireAuth }, async () => ({
    ...app.players.snapshot(),
    rconConfigured: app.rcon.configured,
  }));

  app.get('/api/players/all', { preHandler: app.requireAuth }, async () => allPlayers(app.config.serverPath));

  app.post('/api/players/kick', { preHandler: app.requireAuth }, async (req, reply) => {
    try {
      const name = checkName(req.body?.name);
      const reason = oneLine(req.body?.reason ?? '');
      return run(req, reply, 'kick', reason ? `kick ${name} ${reason}` : `kick ${name}`);
    } catch (err) {
      return reply.code(errToStatus(err)).send({ error: err.message });
    }
  });

  app.post('/api/players/ban', { preHandler: app.requireAuth }, async (req, reply) => {
    try {
      const name = checkName(req.body?.name);
      const reason = oneLine(req.body?.reason ?? '');
      return run(req, reply, 'ban', reason ? `ban ${name} ${reason}` : `ban ${name}`);
    } catch (err) {
      return reply.code(errToStatus(err)).send({ error: err.message });
    }
  });

  for (const [route, cmd] of [['pardon', 'pardon'], ['op', 'op'], ['deop', 'deop']]) {
    app.post(`/api/players/${route}`, { preHandler: app.requireAuth }, async (req, reply) => {
      try {
        const name = checkName(req.body?.name);
        return run(req, reply, route, `${cmd} ${name}`);
      } catch (err) {
        return reply.code(errToStatus(err)).send({ error: err.message });
      }
    });
  }

  app.post('/api/players/whitelist-add', { preHandler: app.requireAuth }, async (req, reply) => {
    try {
      const name = checkName(req.body?.name);
      return run(req, reply, 'whitelist-add', `whitelist add ${name}`);
    } catch (err) {
      return reply.code(errToStatus(err)).send({ error: err.message });
    }
  });

  app.post('/api/players/whitelist-remove', { preHandler: app.requireAuth }, async (req, reply) => {
    try {
      const name = checkName(req.body?.name);
      return run(req, reply, 'whitelist-remove', `whitelist remove ${name}`);
    } catch (err) {
      return reply.code(errToStatus(err)).send({ error: err.message });
    }
  });

  app.post('/api/players/say', { preHandler: app.requireAuth }, async (req, reply) => {
    try {
      const message = oneLine(req.body?.message ?? '');
      if (!message || message.length > 256) {
        const err = new Error('message must be 1-256 characters');
        err.code = 'BAD_MESSAGE';
        throw err;
    }
      return run(req, reply, 'say', `say ${message}`);
    } catch (err) {
      return reply.code(errToStatus(err)).send({ error: err.message });
    }
  });
}
