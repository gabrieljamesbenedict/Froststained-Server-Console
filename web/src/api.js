export async function api(path, options = {}) {
  const { body, ...rest } = options;
  const init = { ...rest };
  if (body !== undefined) {
    // Only claim JSON when a body exists: Fastify 400s empty bodies sent
    // with Content-Type: application/json (broke all bodyless POSTs).
    init.headers = { 'Content-Type': 'application/json', ...rest.headers };
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) window.dispatchEvent(new Event('unauthorized'));
  if (!res.ok) throw new Error(data.error || `request failed (${res.status})`);
  return data;
}

export function wsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws/console`;
}

// Shared tuning: poll cadences, buffer caps and storage keys live here so
// views can't drift apart. Backend-coupled copy (password length, text cap)
// stays at the usage site with a comment instead.
export const POLL = {
  fast: 5000, // metrics, log tail, server status
  status: 10000, // sidebar power, online players
  activity: 15000, // audit feed
  world: 60000, // world size
};

export const LIMITS = {
  consoleLines: 500,
  commandHistory: 50,
  netSamples: 60,
  auditFeed: 15,
  logTail: 30,
  feedTruncate: 80,
};

export const STORE_KEYS = {
  theme: 'frost-theme',
};

export const TOAST_MS = 4000;

export function toast(title, body, kind) {
  window.dispatchEvent(new CustomEvent('toast', { detail: { title, body, kind } }));
}

export function formatBytes(mb) {
  if (mb == null) return '?';
  return mb >= 1024 ? `${Math.round((mb / 1024) * 10) / 10} GB` : `${mb} MB`;
}

export function formatAgo(ms) {
  if (!ms) return 'never';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// Log line coloring, shared by the dashboard tail and the full console:
// joins green, RCON echoes blue, warnings/errors amber.
export function logClass(line) {
  if (/joined the game|left the game|logged in/i.test(line)) return 'join';
  if (/^\[rcon|rcon:/i.test(line)) return 'rcon';
  if (/\b(warn|error|fatal)\b|exception|caused by|failed to|unable to/i.test(line)) return 'warn';
  return '';
}

// Audit entries are terse action keys; the activity feed speaks plainly.
const PLAYER_VERBS = {
  kick: 'kicked',
  ban: 'banned',
  pardon: 'pardoned',
  op: 'opped',
  deop: 'de-opped',
};

export function humanizeActivity(a) {
  const who = a.username ?? 'system';
  const d = a.detail || '';
  switch (a.action) {
    case 'server.start':
      return `${who} started the server${d ? ` · ${d}` : ''}`;
    case 'server.stop':
      return `${who} stopped the server`;
    case 'server.restart':
      return `${who} restarted the server${d ? ` · ${d}` : ''}`;
    case 'server.kill':
      return `${who} force-stopped the server`;
    case 'server.command':
      return `${who} ran "${d.slice(0, LIMITS.feedTruncate)}"`;
    case 'backup.create': {
      const m = d.match(/\((\d+) KB/);
      const size = m ? ` · ${formatBytes(Math.round(Number(m[1]) / 1024))}` : '';
      return `${who} created backup${size}`;
    }
    case 'backup.restore':
      return `${who} restored ${d.split(' ')[0]}`;
    case 'backup.delete':
      return `${who} deleted backup ${d}`;
    case 'mod.upload':
      return `${who} uploaded ${d.split(' ')[0]}`;
    case 'mod.install':
      return `${who} installed ${d.split(' ')[0]}`;    case 'mod.enable':
      return `${who} enabled ${d}`;
    case 'mod.disable':
      return `${who} disabled ${d}`;
    case 'mod.delete':
      return `${who} deleted ${d}`;
    case 'auth.setup':
      return `${who} created the admin account`;
    case 'auth.login':
      return `${who} signed in`;
    case 'auth.password':
      return `${who} changed the password`;
    case 'auth.logout':
      return `${who} signed out`;
    default: {
      // player.* details are the raw RCON line, e.g. "kick Name reason".
      const m = a.action.match(/^player\.(.+)$/);
      if (m) {
        const parts = d.split(' ').filter(Boolean);
        if (m[1] === 'whitelist-add') return `${who} whitelisted ${parts[parts.length - 1]}`;
        if (m[1] === 'whitelist-remove') return `${who} removed ${parts[parts.length - 1]} from the whitelist`;
        const verb = PLAYER_VERBS[m[1]];
        if (verb) return `${who} ${verb} ${parts.slice(1).join(' ').slice(0, LIMITS.feedTruncate)}`;
      }
      return `${who} ${a.action}${d ? ` — ${d.slice(0, LIMITS.feedTruncate)}` : ''}`;
    }
  }
}
