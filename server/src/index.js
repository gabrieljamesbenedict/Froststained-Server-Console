import Fastify from 'fastify';
import healthRoutes from './routes/health.js';
import { loadConfig } from './config.js';

const config = loadConfig(process.argv);
const app = Fastify({ logger: true });

app.register(healthRoutes);

// TODO: serve web/dist/ + /api (auth, console WS, metrics, mods) + MCProcessManager (single server)

const start = async () => {
  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
