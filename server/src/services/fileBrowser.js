import fs from 'node:fs';
import path from 'node:path';

// Server file browser. Every path stays jailed inside serverPath:
// normalized, joined, then containment-checked. Text editing caps at 1 MB
// with a .bak kept beside the original.
const MAX_TEXT_BYTES = 1024 * 1024;

function bad(msg) {
  const err = new Error(msg);
  err.code = 'BAD_PATH';
  return err;
}

export function resolveServerPath(serverPath, rel) {
  const clean = String(rel ?? '').replace(/\\/g, '/').replace(/^\/+/, '');
  const full = path.normalize(path.join(serverPath, clean));
  if (full !== serverPath && !full.startsWith(serverPath + path.sep)) {
    throw bad(`path escapes the server folder: ${rel}`);
  }
  return { rel: path.relative(serverPath, full).split(path.sep).join('/'), full };
}

export function listDir(serverPath, rel) {
  const { rel: clean, full } = resolveServerPath(serverPath, rel);
  let stat;
  try {
    stat = fs.statSync(full);
  } catch {
    const err = new Error(`not found: ${clean || 'server'}`);
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (!stat.isDirectory()) {
    const err = new Error(`not a folder: ${clean}`);
    err.code = 'BAD_PATH';
    throw err;
  }
  const entries = fs.readdirSync(full, { withFileTypes: true }).map((e) => {
    const f = path.join(full, e.name);
    let sizeB = null;
    let mtimeMs = 0;
    try {
      const st = fs.statSync(f);
      mtimeMs = Math.round(st.mtimeMs);
      if (st.isFile()) sizeB = st.size;
    } catch {
      // entry vanished mid-list; keep the name with unknown size
    }
    return {
      name: e.name,
      path: clean ? `${clean}/${e.name}` : e.name,
      dir: e.isDirectory(),
      sizeB,
      mtimeMs,
    };
  });
  entries.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
  return { entries };
}

export function readTextFile(serverPath, rel) {
  const { rel: clean, full } = resolveServerPath(serverPath, rel);
  let stat;
  try {
    stat = fs.statSync(full);
  } catch {
    const err = new Error(`not found: ${clean}`);
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (!stat.isFile()) {
    const err = new Error(`not a file: ${clean}`);
    err.code = 'BAD_PATH';
    throw err;
  }
  if (stat.size > MAX_TEXT_BYTES) {
    throw bad(`file is over 1 MB (${Math.round(stat.size / 1024)} KB); download it instead`);
  }
  return { path: clean, maxBytes: MAX_TEXT_BYTES, content: fs.readFileSync(full, 'utf8') };
}

export function writeTextFile(serverPath, rel, content) {
  const { rel: clean, full } = resolveServerPath(serverPath, rel);
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
    const err = new Error(`not found: ${clean}`);
    err.code = 'NOT_FOUND';
    throw err;
  }
  const text = String(content ?? '');
  if (Buffer.byteLength(text, 'utf8') > MAX_TEXT_BYTES) {
    throw bad('content is over 1 MB');
  }
  fs.copyFileSync(full, `${full}.bak`);
  fs.writeFileSync(full, text);
  return { path: clean, backup: `${clean}.bak` };
}

export function renameEntry(serverPath, from, to) {
  const src = resolveServerPath(serverPath, from);
  const dst = resolveServerPath(serverPath, to);
  if (!fs.existsSync(src.full)) {
    const err = new Error(`not found: ${src.rel}`);
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (!dst.rel || fs.existsSync(dst.full)) {
    const err = new Error(dst.rel ? `already exists: ${dst.rel}` : 'missing target name');
    err.code = dst.rel ? 'CONFLICT' : 'BAD_PATH';
    throw err;
  }
  fs.mkdirSync(path.dirname(dst.full), { recursive: true });
  fs.renameSync(src.full, dst.full);
  return { from: src.rel, to: dst.rel };
}

export function deleteEntry(serverPath, rel) {
  const { rel: clean, full } = resolveServerPath(serverPath, rel);
  if (!clean) throw bad('cannot delete the server root');
  let stat;
  try {
    stat = fs.statSync(full);
  } catch {
    const err = new Error(`not found: ${clean}`);
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (stat.isDirectory()) fs.rmSync(full, { recursive: true, force: true });
  else fs.rmSync(full);
  return { deleted: clean, dir: stat.isDirectory() };
}
