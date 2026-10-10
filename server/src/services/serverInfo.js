import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Console info for the Settings view: where the server lives, which game
// and loader it runs, and whether RCON answers. Loader versions come from
// the versioned library folders the installers lay down.
const LIBS = [
  ['NeoForge', path.join('libraries', 'net', 'neoforged', 'neoforge')],
  ['Forge', path.join('libraries', 'net', 'minecraftforge', 'forge')],
  ['Fabric', path.join('libraries', 'net', 'fabricmc', 'fabric-loader')],
  ['Quilt', path.join('libraries', 'org', 'quiltmc', 'quilt-loader')],
];

function detectLoader(serverPath) {
  for (const [loader, lib] of LIBS) {
    let versions = [];
    try {
      versions = fs.readdirSync(path.join(serverPath, lib), { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
    } catch {
      continue;
    }
    if (versions.length) return { loader, version: versions[versions.length - 1] };
  }
  return { loader: null, version: null };
}

function prop(serverPath, key) {
  try {
    const props = fs.readFileSync(path.join(serverPath, 'server.properties'), 'utf8');
    for (const line of props.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#') || t.startsWith(';')) continue;
      const i = t.indexOf('=');
      if (i !== -1 && t.slice(0, i).trim() === key) {
        const v = t.slice(i + 1).trim();
        if (v) return v;
      }
    }
  } catch {
    // missing/unreadable properties: caller falls back
  }
  return null;
}

function consoleVersion() {
  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
    return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version ?? null;
  } catch {
    return null;
  }
}

export function serverInfo({ config, rcon }) {
  const gamePort = Number(prop(config.serverPath, 'server-port'));
  return {
    console: { version: consoleVersion(), port: config.port },
    serverPath: config.serverPath,
    minecraftVersion: config.minecraftVersion,
    gamePort: Number.isInteger(gamePort) ? gamePort : null,
    ...detectLoader(config.serverPath),
    rcon: {
      configured: rcon.configured,
      reachable: null, // filled by the route (async, cached)
    },
  };
}
