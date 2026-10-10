import fs from 'node:fs';
import path from 'node:path';
import { worldDir } from './backups.js';

// Known-player directory for the Players "All" tab. Vanilla keeps no
// central roster, so this merges usercache + whitelist + ops with world
// stats/advancements. Read-only; missing files just yield nulls. There is
// no first/last-seen record server-side, so those stay null.
function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

const norm = (uuid) => String(uuid ?? '').toLowerCase();
const undash = (uuid) => norm(uuid).replace(/-/g, '');

export function allPlayers(serverPath) {
  const ops = new Map();
  for (const e of readJson(path.join(serverPath, 'ops.json')) ?? []) {
    if (e?.uuid) ops.set(norm(e.uuid), { name: e.name ?? null, level: e.level ?? 0 });
  }
  const whitelisted = new Set();
  for (const e of readJson(path.join(serverPath, 'whitelist.json')) ?? []) {
    if (e?.uuid) whitelisted.add(norm(e.uuid));
  }
  const known = new Map();
  for (const e of readJson(path.join(serverPath, 'usercache.json')) ?? []) {
    if (e?.uuid) known.set(norm(e.uuid), e.name ?? null);
  }
  for (const [uuid, op] of ops) if (!known.has(uuid)) known.set(uuid, op.name);
  if (known.size === 0) return { count: 0, players: [] };

  const world = worldDir(serverPath);
  const players = [...known.entries()].map(([uuid, name]) => {
    // Stats/advancement files use the dashed UUID form on this server.
    const stats = readJson(path.join(world, 'stats', `${uuid}.json`))?.stats?.['minecraft:custom']
      ?? readJson(path.join(world, 'stats', `${undash(uuid)}.json`))?.stats?.['minecraft:custom']
      ?? {};
    const adv = readJson(path.join(world, 'advancements', `${uuid}.json`))
      ?? readJson(path.join(world, 'advancements', `${undash(uuid)}.json`));
    let advancements = null;
    if (adv && typeof adv === 'object') {
      // Recipe unlocks share the file; count real advancements only.
      advancements = Object.entries(adv).filter(
        ([k, a]) => k.startsWith('minecraft:') && !k.startsWith('minecraft:recipes/') && a && typeof a === 'object' && a.done,
      ).length;
    }
    const ticks = Number(stats['minecraft:play_time']) || 0;
    return {
      uuid,
      name: name ?? ops.get(uuid)?.name ?? uuid.slice(0, 8),
      whitelisted: whitelisted.has(uuid),
      opLevel: ops.get(uuid)?.level ?? 0,
      playtimeH: Math.round((ticks / 72000) * 10) / 10,
      deaths: Number(stats['minecraft:deaths']) || 0,
      advancements,
      hasStats: ticks > 0 || (Number(stats['minecraft:deaths']) || 0) > 0,
    };
  });
  players.sort((a, b) => b.playtimeH - a.playtimeH);
  return { count: players.length, players };
}
