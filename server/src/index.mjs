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
import filesRoutes from './routes/files.js';
import scheduleRoutes from './routes/schedule.js';
import auditRoutes from './routes/audit.js';
import adminUsersRoutes from './routes/adminUsers.js';
import { attachConsoleWs } from './ws/console.js';
import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { ProcessManager } from './services/processManager.js';
import { RconService } from './services/rcon.js';
import { SystemMetrics } from './services/systemMetrics.js';
import { PlayerTracker } from './services/playerTracker.js';
import { processTree } from './services/processTree.js';
import { Scheduler } from './services/scheduler.js';
import { createBackup } from './services/backups.js';
import * as sea from 'node:sea';

// __dirname exists when the entry is bundled to CJS for the single exe;
// in dev the ESM import.meta.url form is used. No import.meta in CJS output.
const SRC_DIR = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SRC_DIR, '..', '..');
const DIST = path.join(ROOT, 'web', 'dist');

let config;
try {
  config = loadConfig(process.argv);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

// First-run guard: a shipped exe next to no config used to start silently on
// defaults and then fail on server_path. Say exactly what to do instead.
if (!fs.existsSync(config.configPath)) {
  console.error('');
  console.error('  No console config found.');
  console.error(`  Looked for: ${config.configPath}`);
  console.error('  Copy config.example.yml next to this exe, rename it to');
  console.error('  config.yaml, then set server_path and rcon.password.');
  console.error('');
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
metrics.start(config.serverPath, { getMcPid: () => mc.status().pid });
app.decorate('metrics', metrics);
app.decorate('players', new PlayerTracker(mc, config.serverPath));
app.decorate('processTree', processTree);
app.decorate('rcon', new RconService(config.rcon));
const scheduler = new Scheduler({
  backupEveryHours: config.schedule.backupEveryHours,
  restartDailyAt: config.schedule.restartDailyAt,
});
scheduler.start({ config, mc, rcon: app.rcon, db: app.db, createBackup });
app.decorate('scheduler', scheduler);

// Never orphan the MC server when the console itself is stopped: attempt a
// graceful stop first, capped so Ctrl+C / service stops don't hang.
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info(`received ${signal}, stopping managed server if running`);
  try {
    await Promise.race([
      (async () => {
        if (app.mc.status().state !== 'stopped') await app.mc.stop();
      })(),
      new Promise((r) => setTimeout(r, 30000)),
    ]);
  } catch {
    // best-effort only
  }
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

// Everything from plugin registration onward is async, so it lives here
// instead of at module top level: the single-exe bundle is CJS and esbuild
// refuses top-level await there.
async function boot() {
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
  app.register(filesRoutes);
  app.register(scheduleRoutes);
  app.register(auditRoutes);
  app.register(adminUsersRoutes);
  attachConsoleWs(app);

  // Frontend: single-exe serves the assets embedded in the SEA blob; dev keeps
  // serving web/dist from disk. Both paths end in an SPA fallback so deep links
  // (e.g. /mods) load index.html.
  let runningAsSea = false;
  try {
    runningAsSea = sea.isSea();
  } catch {
    runningAsSea = false;
  }

  if (runningAsSea) {
    const MIME = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.ico': 'image/x-icon',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.map': 'application/json; charset=utf-8',
    };
    const extOf = (p) => p.slice(p.lastIndexOf('.')).toLowerCase();

    // Node 26 returns an ArrayBuffer from getAsset; Fastify needs bytes.
    const asset = (key) => {
      try {
        const raw = sea.getAsset(key);
        return raw ? Buffer.from(raw) : null;
      } catch {
        return null; // key not embedded
      }
    };
    const serve = (reply, key) => {
      const ext = extOf(key);
      // reply.type() needs an extension without the dot; send(Buffer) would
      // otherwise stamp application/octet-stream.
      reply.header('content-type', MIME[ext] ?? 'application/octet-stream');
      reply.header('Cache-Control', ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable');
      return reply.send(asset(key));
    };

    app.get('/', (req, reply) => serve(reply, 'index.html'));

    // Registered last so /api/* and /ws/* still win in Fastify's router.
    app.get('/*', (req, reply) => {
      const key = req.url.split('?')[0].replace(/^\/+/, '');
      const hit = asset(key);
      if (hit) return serve(reply, key);
      // Deep link like /mods: serve the SPA shell. A missing asset under
      // /assets is a real 404 so the browser does not parse HTML as JS.
      if (key.startsWith('assets/') || key === 'favicon.ico') {
        return reply.code(404).send({ error: `asset not found: ${key}` });
      }
      return serve(reply, 'index.html');
    });

    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'not found' });
      return serve(reply, 'index.html');
    });
    app.log.info('serving frontend from embedded SEA assets');
  } else if (fs.existsSync(DIST)) {
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

  try {
    await app.listen({ host: config.host, port: config.port });
    app.log.info(`using config: ${config.configPath}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void boot();
