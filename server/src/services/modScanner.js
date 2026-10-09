import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { parse as parseToml } from 'smol-toml';

// Loader-agnostic mod listing. Reads loader manifests straight from each jar
// (no extraction): fabric.mod.json, mods.toml / neoforge.mods.toml, mcmod.info.
// Anything unparseable still lists with loader 'unknown' - never fail the row.
function readMeta(zip, name) {
  const entry = zip.getEntry(name);
  if (!entry) return null;
  try {
    return zip.readAsText(entry);
  } catch {
    return null;
  }
}

function fromFabric(text) {
  try {
    const j = JSON.parse(text);
    return { loader: 'fabric', modId: j.id ?? null, version: j.version ?? null, name: j.name ?? null };
  } catch {
    return null;
  }
}

function fromToml(text, loader) {
  try {
    const t = parseToml(text);
    const mods = t.mods ?? t['mods'];
    const first = Array.isArray(mods) ? mods[0] : undefined;
    if (!first) return null;
    return {
      loader,
      modId: first.modId ?? null,
      version: first.version ?? null,
      name: first.displayName ?? first.modId ?? null,
    };
  } catch {
    return null;
  }
}

function fromMcmodInfo(text) {
  try {
    const j = JSON.parse(text);
    const first = Array.isArray(j) ? j[0] : j?.modList?.[0];
    if (!first) return null;
    return { loader: 'forge-legacy', modId: first.modid ?? null, version: first.version ?? null, name: first.name ?? null };
  } catch {
    return null;
  }
}

export function scanMod(file) {
  const stat = fs.statSync(file);
  const base = path.basename(file);
  const enabled = base.endsWith('.jar') && !base.endsWith('.jar.disabled');
  const info = {
    file: base,
    sizeKb: Math.round(stat.size / 1024),
    enabled,
    loader: 'unknown',
    modId: null,
    version: null,
    name: base.replace(/\.jar(\.disabled)?$/, ''),
  };
  try {
    const zip = new AdmZip(file);
    const fabric = readMeta(zip, 'fabric.mod.json');
    if (fabric) return { ...info, ...(fromFabric(fabric) ?? {}) };
    const neoforge = readMeta(zip, 'META-INF/neoforge.mods.toml');
    if (neoforge) return { ...info, ...(fromToml(neoforge, 'neoforge') ?? {}) };
    const forge = readMeta(zip, 'META-INF/mods.toml');
    if (forge) return { ...info, ...(fromToml(forge, 'forge') ?? {}) };
    const legacy = readMeta(zip, 'mcmod.info');
    if (legacy) return { ...info, ...(fromMcmodInfo(legacy) ?? {}) };
  } catch {
    // corrupt/oversized jar: keep the row with loader 'unknown'
  }
  return info;
}

export function modsDir(serverPath) {
  return path.join(serverPath, 'mods');
}

export function listMods(serverPath) {
  const dir = modsDir(serverPath);
  if (!fs.existsSync(dir)) return { dir, count: 0, mods: [] };
  const mods = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.jar') || f.endsWith('.jar.disabled'))
    .map((f) => scanMod(path.join(dir, f)))
    .sort((a, b) => (a.name ?? a.file).localeCompare(b.name ?? b.file));
  return { dir, count: mods.length, mods };
}
