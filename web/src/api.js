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
