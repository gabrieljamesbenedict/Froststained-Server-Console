import { Rcon } from 'rcon-client';

// Thin wrapper over per-command RCON connections. A fresh TCP connection per
// command avoids stale-socket bugs; admin actions are low-frequency.
// The password 'change-me' is the documented example default and counts as
// unconfigured so a stock config fails with a clear message, not an auth error.
export class RconService {
  constructor({ host, port, password }) {
    this.host = host;
    this.port = port;
    this.password = password;
    this._reachable = { at: 0, value: false };
  }

  get configured() {
    return Boolean(this.password) && this.password !== 'change-me';
  }

  async send(command, timeoutMs = 8000) {
    if (!this.configured) {
      const err = new Error('rcon is not configured: set rcon.password and enable-rcon on the MC server');
      err.code = 'RCON_NOT_CONFIGURED';
      throw err;
    }
    let rcon;
    try {
      rcon = await Rcon.connect({ host: this.host, port: this.port, password: this.password, timeout: timeoutMs });
    } catch (e) {
      const err = new Error(`rcon connect failed (${this.host}:${this.port}): ${e.message}`);
      err.code = 'RCON_CONNECT_FAILED';
      throw err;
    }
    try {
      return await rcon.send(command);
    } finally {
      rcon.end();
    }
  }

  // Reachability is cached briefly: MC logs every RCON connect loudly, so
  // status polling must not open a connection per call.
  async reachable() {
    if (Date.now() - this._reachable.at < 30000) return this._reachable.value;
    let value = false;
    try {
      await this.send('list', 5000);
      value = true;
    } catch {
      // stays false; recached so failures don't spam either
    }
    this._reachable = { at: Date.now(), value };
    return value;
  }
}
