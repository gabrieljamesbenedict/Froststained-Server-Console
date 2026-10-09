import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import healthRoutes from './routes/health.js';
import authRoutes, { COOKIE_NAME, getUserFromToken } from './routes/auth.js';
import serverRoutes from './routes/server.js';
import metricsRoutes from './routes/metrics.js';
import playersRoutes from './routes/players.js';
import modsRoutes from './routes/mods.js';
import backupsRoutes from './routes/backups.js';
import { attachConsoleWs } from './ws/console.js';
import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { ProcessManager } from './services/processManager.js';
import { RconService } from './services/rcon.js';
import { SystemMetrics } from './services/systemMetrics.js';
import { PlayerTracker } from './services/playerTracker.js';
import { processTree } from './services/processTree.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = path.join(ROOT, 'web', 'dist');

let config;
try {
  config = loadConfig(process.argv);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const app = Fastify({ logger: true });
app.decorate('config', config);
app.decorate('db', openDb(config.dataFile));
const mc = new ProcessManager({
  serverPath: config.serverPath,
  java: config.launch.java,
  args: config.launch.args,
  stopTimeoutMs: config.stopTimeoutMs,
});
app.decorate('mc', mc);
const metrics = new SystemMetrics();
metrics.start(config.serverPath);
app.decorate('metrics', metrics);
app.decorate('players', new PlayerTracker(mc, config.serverPath));
app.decorate('processTree', processTree);
app.decorate('rcon', new RconService(config.rcon));

await app.register(fastifyCookie);
// Root-level so every route plugin (auth, server, …) shares one guard.
app.decorate('requireAuth', async (req, reply) => {
  const user = getUserFromToken(app.db, req.cookies?.[COOKIE_NAME]);
  if (!user) {
    reply.code(401).send({ error: 'not authenticated' });
    return reply; // halt: without this the route handler still runs
  }
  req.user = user;
});
app.register(healthRoutes);
app.register(authRoutes);
app.register(serverRoutes);
app.register(metricsRoutes);
app.register(playersRoutes);
app.register(modsRoutes);
app.register(backupsRoutes);
attachConsoleWs(app);

// TODO (later phases): mods, backups.

if (fs.existsSync(DIST)) {
  await app.register(fastifyStatic, { root: DIST });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'not found' });
    return reply.sendFile('index.html');
  });
} else {
  app.log.warn(`web/dist not found, serving API only (run "npm run build -w web"). Tried: ${DIST}`);
}

fs.mkdirSync(config.backupDir, { recursive: true });
if (!fs.existsSync(config.serverPath)) {
  app.log.warn(`server_path does not exist yet: ${config.serverPath} (server start will fail until it does)`);
}

const start = async () => {
  try {
    await app.listen({ host: config.host, port: config.port });
    app.log.info(`using config: ${config.configPath}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
