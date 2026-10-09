export default async function scheduleRoutes(app) {
  app.get('/api/schedule', { preHandler: app.requireAuth }, async () => app.scheduler.status());
}
