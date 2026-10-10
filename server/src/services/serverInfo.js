import fs from 'node:fs';
import path from 'node:path';

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

export function serverInfo({ config, rcon }) {
  return {
    serverPath: config.serverPath,
    minecraftVersion: config.minecraftVersion,
    ...detectLoader(config.serverPath),
    rcon: {
      configured: rcon.configured,
      host: rcon.host,
      port: rcon.port,
      reachable: null, // filled by the route (async, cached)
    },
  };
}
