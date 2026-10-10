export default async function auditRoutes(app) {
  app.get('/api/audit', { preHandler: app.requireAuth }, async (req) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
    const rows = app.db
      .prepare(
        `SELECT a.id, a.action, a.detail, a.created_at, u.username
         FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
         ORDER BY a.id DESC LIMIT ?`,
      )
      .all(limit);
    return { entries: rows };
  });
}
