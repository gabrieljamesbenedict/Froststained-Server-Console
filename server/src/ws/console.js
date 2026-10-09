import { WebSocketServer } from 'ws';
import { getUserFromToken, parseSessionToken } from '../routes/auth.js';
import { readLogTail } from '../services/logTail.js';

// Live console stream. Same-origin in production; via Vite proxy in dev.
// Auth: HttpOnly session cookie presented on the upgrade request.
export function attachConsoleWs(app) {
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Set();

  const broadcast = (msg) => {
    const data = JSON.stringify(msg);
    for (const ws of clients) {
      if (ws.readyState === 1) ws.send(data);
    }
  };

  app.mc.on('line', (entry) => broadcast({ type: 'line', ...entry }));
  app.mc.on('status', (status) => broadcast({ type: 'status', status }));

  setInterval(() => {
    for (const ws of clients) {
      if (ws.readyState === 1) ws.ping();
    }
  }, 30000).unref();

  app.server.on('upgrade', (req, socket, head) => {
    if (!req.url.startsWith('/ws/console')) {
      socket.destroy();
      return;
    }
    const user = getUserFromToken(app.db, parseSessionToken(req.headers.cookie));
    if (!user) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      clients.add(ws);
      ws.send(JSON.stringify({ type: 'status', status: app.mc.status() }));
      ws.send(
        JSON.stringify({ type: 'history', lines: readLogTail(app.config.serverPath) }),
      );
      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'command' && typeof msg.command === 'string') {
            app.mc.send(msg.command);
          }
        } catch {
          // ignore malformed frames
        }
      });
      ws.on('close', () => clients.delete(ws));
    });
  });
}
