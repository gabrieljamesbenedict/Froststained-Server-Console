import { readLogTail } from './logTail.js';

const JOIN_RE = /^<([^>]+)> joined the game$/;
const VANILLA_JOIN_RE = /^(\S{3,16}) joined the game$/;
const LEAVE_RES = [/^(\S{3,16}) left the game$/, /^(\S{3,16}) lost connection:/];

// Who is online, derived from server log lines. Seed from history on boot,
// then follow live process output. Cleared when the server (re)starts since
// a fresh boot drops all connections.
export class PlayerTracker {
  constructor(manager, serverPath) {
    this.online = new Map();
    this.lastState = manager.status().state;
    for (const e of readLogTail(serverPath, 2000)) this.feed(e.line);
    manager.on('line', (entry) => this.feed(entry.line));
    manager.on('status', (s) => {
      if (this.lastState === 'stopped' && s.state !== 'stopped') this.online.clear();
      this.lastState = s.state;
    });
  }

  feed(line) {
    // Strip the "[time] [thread/INFO] [source]:" prefix MC log lines carry.
    const msg = line.replace(/^\[.*?\] \[.*?\] \[.*?\]: /, '');
    let m = msg.match(JOIN_RE) ?? msg.match(VANILLA_JOIN_RE);
    if (m) {
      this.online.set(m[1], { name: m[1], since: Date.now() });
      return;
    }
    for (const re of LEAVE_RES) {
      m = msg.match(re);
      if (m) {
        this.online.delete(m[1]);
        return;
      }
    }
  }

  snapshot() {
    const players = [...this.online.values()];
    return { count: players.length, players };
  }
}
