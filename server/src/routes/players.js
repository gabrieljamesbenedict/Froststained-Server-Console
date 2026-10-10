import { audit } from '../db.js';
import { allPlayers } from '../services/playerStats.js';

const NAME_RE = /^\w{3,16}$/;
// RCON takes one command line; strip CR/LF so reason can't smuggle a second command.
const oneLine = (s) => String(s).replace(/[\r\n]+/g, ' ').trim();

function errToStatus(err) {
  if (err.code === 'RCON_NOT_CONFIGURED') return 503;
  if (err.code === 'BAD_NAME') return 400;
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

  app.get('/api/players', { preHandler: app.requireAuth }, async () => app.players.snapshot());

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
}
