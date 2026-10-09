export default async function metricsRoutes(app) {
  app.get('/api/metrics', { preHandler: app.requireAuth }, async () => {
    const status = app.mc.status();
    return {
      t: Date.now(),
      server: {
        state: status.state,
        pid: status.pid,
        uptimeMs: status.uptimeMs,
        players: app.players.snapshot(),
      },
      system: app.metrics.snapshot(),
      process: await app.processTree(status.pid),
    };
  });
}
