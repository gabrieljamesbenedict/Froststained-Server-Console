export default async function healthRoutes(app) {
  app.get('/api/health', async () => ({ status: 'ok', service: 'froststained-server' }));
}
