import fs from 'node:fs';
import path from 'node:path';
import { worldDir } from './backups.js';

// World folder size for the dashboard Server card. Directory walks are
// cached briefly: worlds are hundreds of MB and this is only a display
// number, so a stale-by-a-minute answer beats a du on every poll.
let cache = { key: '', at: 0, info: null };
const CACHE_MS = 60000;

function dirSizeKb(dir) {
  let kb = 0;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue; // live files can lock mid-walk; skip and keep counting
    }
    for (const e of entries) {
      const f = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(f);
      else if (e.isFile()) {
        try {
          kb += fs.statSync(f).size / 1024;
        } catch {
          // locked live file: skip, same as the backup quiesce path
        }
      }
    }
  }
  return Math.round(kb);
}

export function worldInfo(serverPath) {
  const now = Date.now();
  if (cache.info && cache.key === serverPath && now - cache.at < CACHE_MS) {
    return cache.info;
  }
  const dir = worldDir(serverPath);
  if (!fs.existsSync(dir)) {
    const err = new Error(`world folder not found: ${dir}`);
    err.code = 'NO_WORLD';
    throw err;
  }
  const info = { world: path.basename(dir), sizeKb: dirSizeKb(dir) };
  cache = { key: serverPath, at: now, info };
  return info;
}
