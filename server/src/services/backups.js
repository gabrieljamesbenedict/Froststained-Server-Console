import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';

// World backups as timestamped zips. If the server is running, the world is
// quiesced first via RCON (save-off, save-all flush) and re-enabled after,
// so the zip is crash-consistent. Stopped servers zip directly. RCON-less
// running servers are refused rather than backed up dirty.
function readLevelName(serverPath) {
  try {
    const props = fs.readFileSync(path.join(serverPath, 'server.properties'), 'utf8');
    for (const line of props.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#') || t.startsWith(';')) continue;
      const i = t.indexOf('=');
      if (i !== -1 && t.slice(0, i).trim() === 'level-name') {
        const v = t.slice(i + 1).trim();
        if (v) return v;
      }
    }
  } catch {
    // fall through to default
  }
  return 'world';
}

export function worldDir(serverPath) {
  return path.join(serverPath, readLevelName(serverPath));
}

export function backupFileName(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `backup-${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}.zip`;
}

export async function createBackup({ serverPath, backupDir, mc, rcon }) {
  const world = worldDir(serverPath);
  if (!fs.existsSync(world)) {
    const err = new Error(`world folder not found: ${world}`);
    err.code = 'NO_WORLD';
    throw err;
  }
  fs.mkdirSync(backupDir, { recursive: true });
  const running = mc.status().state === 'running';
  let quiesced = false;
  if (running) {
    if (!rcon.configured) {
      const err = new Error('refusing live backup: server is running but rcon is not configured (stop the server first)');
      err.code = 'LIVE_NO_RCON';
      throw err;
    }
    await rcon.send('save-off');
    await rcon.send('save-all flush');
    quiesced = true;
  }
  try {
    const name = backupFileName();
    const full = path.join(backupDir, name);
    const zip = new AdmZip();
    // World contents at zip root so restore extracts straight into the world dir.
    zip.addLocalFolder(world);
    zip.writeZip(full);
    const { size } = fs.statSync(full);
    return { file: name, sizeKb: Math.round(size / 1024), world: readLevelName(serverPath), live: running };
  } finally {
    if (quiesced) {
      try {
        await rcon.send('save-on');
      } catch {
        // world is safe; save-on failing just leaves autosave off until restart
      }
    }
  }
}

export function listBackups(backupDir) {  if (!fs.existsSync(backupDir)) return { dir: backupDir, count: 0, backups: [] };
  const backups = fs
    .readdirSync(backupDir)
    .filter((f) => f.endsWith('.zip'))
    .map((f) => {
      const { size, mtimeMs } = fs.statSync(path.join(backupDir, f));
      return { file: f, sizeKb: Math.round(size / 1024), createdAt: Math.round(mtimeMs) };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
  return { dir: backupDir, count: backups.length, backups };
}

export function resolveBackupFile(backupDir, file) {  const base = path.basename(file ?? '');
  if (!base.endsWith('.zip')) {
    const err = new Error('backup file must end with .zip');
    err.code = 'BAD_FILE';
    throw err;
  }
  const full = path.join(backupDir, base);
  if (!full.startsWith(backupDir + path.sep) || !fs.existsSync(full)) {
    const err = new Error(`backup not found: ${base}`);
    err.code = 'NOT_FOUND';
    throw err;
  }
  return { base, full };
}

// Restore overwrites the world, so it requires a stopped server and takes a
// safety snapshot of the current world first (skipped if no world exists).
export async function restoreBackup({ serverPath, backupDir, mc, file }) {
  if (mc.status().state !== 'stopped') {
    const err = new Error('stop the server before restoring a backup');
    err.code = 'STILL_RUNNING';
    throw err;
  }
  const { base, full } = resolveBackupFile(backupDir, file);
  const world = worldDir(serverPath);
  let safetyBackup = null;
  if (fs.existsSync(world)) {
    safetyBackup = `pre-restore-${backupFileName().slice('backup-'.length)}`;
    const zip = new AdmZip();
    zip.addLocalFolder(world);
    zip.writeZip(path.join(backupDir, safetyBackup));
  }
  fs.rmSync(world, { recursive: true, force: true });
  fs.mkdirSync(world, { recursive: true });
  new AdmZip(full).extractAllTo(world, true);
  return { restored: base, safetyBackup, world: readLevelName(serverPath) };
}
