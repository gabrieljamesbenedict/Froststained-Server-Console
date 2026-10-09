import { listMods } from '../services/modScanner.js';

export default async function modsRoutes(app) {
  app.get('/api/mods', { preHandler: app.requireAuth }, async () => listMods(app.config.serverPath));
}
