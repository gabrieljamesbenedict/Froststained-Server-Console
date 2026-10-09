import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import { loadConfig } from './config.js';
import { openDb } from './db.js';

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

await app.register(fastifyCookie);
app.register(healthRoutes);
app.register(authRoutes);

// TODO (Phase 2): MCProcessManager (single server) + console WS + metrics + mods.

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
