import { spawn, execFile } from 'node:child_process';
import EventEmitter from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const RING_MAX = 1000;

// The Java launcher can fork the real server into a child process (Windows
// argfile command lines), so kills must take the whole tree, not just the
// direct child. Otherwise the server keeps the world lock + ports.
function killTree(pid) {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      execFile('taskkill', ['/PID', String(pid), '/T', '/F'], () => resolve());
    } else {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        // already gone
      }
      resolve();
    }
  });
}

function readServerPort(serverPath) {
  try {
    const props = fs.readFileSync(path.join(serverPath, 'server.properties'), 'utf8');
    for (const line of props.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#') || t.startsWith(';')) continue;
      const i = t.indexOf('=');
      if (i === -1) continue;
      if (t.slice(0, i).trim() === 'server-port') {
        const p = Number(t.slice(i + 1).trim());
        if (Number.isInteger(p) && p >= 1 && p <= 65535) return p;
      }
    }
  } catch {
    // missing/unreadable properties: fall through to default
  }
  return 25565;
}

function portBusy(port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1');
    s.once('connect', () => {
      s.end();
      resolve(true);
    });
    s.once('error', () => resolve(false));
    setTimeout(() => {
      s.destroy();
      resolve(false);
    }, timeoutMs);
  });
}

// Is this server's game port already bound? Used to refuse starts and flag
// stopped-but-busy states (e.g. an orphaned fork still holding the world).
export async function serverPortBusy(serverPath) {
  return portBusy(readServerPort(serverPath));
}

// Owns the single Minecraft Java child process: spawn, graceful stop, kill,
// stdin commands, and a ring buffer of output lines with live events.
export class ProcessManager extends EventEmitter {
  constructor({ serverPath, java, args, stopTimeoutMs }) {
    super();
    this.serverPath = serverPath;
    this.java = java;
    this.args = args;
    this.stopTimeoutMs = stopTimeoutMs;
    this.state = 'stopped';
    this.child = null;
    this.startedAt = null;
    this.lastExit = null;
    this.ring = [];
    this._buf = '';
  }

  status() {
    return {
      state: this.state,
      pid: this.child?.pid ?? null,
      uptimeMs: this.startedAt ? Date.now() - this.startedAt : 0,
      startedAt: this.startedAt,
      lastExit: this.lastExit,
    };
  }

  _push(stream, chunk) {
    this._buf += chunk;
    const parts = this._buf.split(/\r?\n/);
    this._buf = parts.pop();
    for (const line of parts) {
      if (!line) continue;
      const entry = { t: Date.now(), stream, line };
      this.ring.push(entry);
      if (this.ring.length > RING_MAX) this.ring.shift();
      this.emit('line', entry);
    }
  }

  _setState(state) {
    this.state = state;
    this.emit('status', this.status());
  }

  async start() {
    if (this.state === 'running' || this.state === 'starting') {
      const err = new Error(`server is already ${this.state}`);
      err.code = 'ALREADY_RUNNING';
      throw err;
    }
    const port = readServerPort(this.serverPath);
    if (await serverPortBusy(this.serverPath)) {
      const err = new Error(`server-port ${port} is already in use - another server may be running`);
      err.code = 'PORT_BUSY';
      throw err;
    }
    this.lastExit = null;
    const child = spawn(this.java, this.args, {
      cwd: this.serverPath,
      detached: process.platform !== 'win32',
      windowsHide: true,
    });
    this.child = child;
    this.startedAt = Date.now();
    this._setState('starting');
    child.stdout.on('data', (d) => this._push('stdout', d.toString()));
    child.stderr.on('data', (d) => this._push('stderr', d.toString()));
    child.on('error', (err) => {
      this.lastExit = { code: null, signal: null, error: err.message, at: Date.now() };
      this.child = null;
      this.startedAt = null;
      this._setState('stopped');
    });
    child.on('exit', (code, signal) => {
      if (this._buf) this._push('stdout', '\n');
      this.lastExit = { code, signal, at: Date.now() };
      this.child = null;
      this.startedAt = null;
      this._setState('stopped');
    });
    // Treat spawn as running once the OS hands us a pid.
    this._setState('running');
    return this.status();
  }

  send(command) {
    if (typeof command !== 'string' || !command.trim()) {
      const err = new Error('command must be a non-empty string');
      err.code = 'BAD_COMMAND';
      throw err;
    }
    if (this.state !== 'running' || !this.child) {
      const err = new Error('server is not running');
      err.code = 'NOT_RUNNING';
      throw err;
    }
    this.child.stdin.write(`${command.trim()}\n`);
  }

  async _waitForExit(timeoutMs) {
    if (!this.child) return true;
    let exited = false;
    await new Promise((resolve) => {
      const child = this.child;
      const timer = setTimeout(resolve, timeoutMs);
      child.once('exit', () => {
        exited = true;
        clearTimeout(timer);
        resolve();
      });
    });
    return exited;
  }

  async stop() {
    if (this.state === 'stopped') return { ...this.status(), stopResult: 'already-stopped' };
    // Send while still 'running': send() refuses unless state is running.
    try {
      this.send('stop');
    } catch {
      // stdin may already be gone; fall through to wait + kill below.
    }
    this._setState('stopping');
    const graceful = await this._waitForExit(this.stopTimeoutMs);
    if (!graceful) {
      if (this.child) await killTree(this.child.pid);
      // The tree kill takes the direct child too, but confirm it reaped.
      await this._waitForExit(10000);
    }
    return { ...this.status(), stopResult: graceful ? 'graceful' : 'killed' };
  }

  async kill() {
    if (this.state === 'stopped') return { ...this.status(), stopResult: 'already-stopped' };
    this._setState('stopping');
    if (this.child) await killTree(this.child.pid);
    await this._waitForExit(10000);
    return { ...this.status(), stopResult: 'killed' };
  }

  async restart() {
    const stopped = await this.stop();
    const started = await this.start();
    return { ...started, stopResult: stopped.stopResult };
  }
}
