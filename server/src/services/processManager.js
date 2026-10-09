import { spawn } from 'node:child_process';
import EventEmitter from 'node:events';

const RING_MAX = 1000;

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

  start() {
    if (this.state === 'running' || this.state === 'starting') {
      const err = new Error(`server is already ${this.state}`);
      err.code = 'ALREADY_RUNNING';
      throw err;
    }
    this.lastExit = null;
    const child = spawn(this.java, this.args, { cwd: this.serverPath });
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
    this._setState('stopping');
    try {
      this.send('stop');
    } catch {
      // stdin may already be gone; fall through to kill below.
    }
    const graceful = await this._waitForExit(this.stopTimeoutMs);
    if (!graceful && this.child) this.child.kill('SIGKILL');
    await this._waitForExit(5000);
    return { ...this.status(), stopResult: graceful ? 'graceful' : 'killed' };
  }

  async kill() {
    if (this.state === 'stopped') return { ...this.status(), stopResult: 'already-stopped' };
    this._setState('stopping');
    this.child?.kill('SIGKILL');
    await this._waitForExit(5000);
    return { ...this.status(), stopResult: 'killed' };
  }

  async restart() {
    const stopped = await this.stop();
    const started = this.start();
    return { ...started, stopResult: stopped.stopResult };
  }
}
