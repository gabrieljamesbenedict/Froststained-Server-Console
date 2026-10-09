import crypto from 'node:crypto';
import fs from 'node:fs';

const MODRINTH_API = 'https://api.modrinth.com/v2';
const CURSEFORGE_API = 'https://api.curseforge.com/v1';
const UA = 'Froststained-Server-Console/0.1.0 (admin console)';

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    const err = new Error(`upstream ${res.status} for ${new URL(url).hostname}`);
    err.code = 'UPSTREAM';
    throw err;
  }
  return res.json();
}

function sha512(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha512');
    const s = fs.createReadStream(file);
    s.on('error', reject);
    s.on('data', (d) => h.update(d));
    s.on('end', () => resolve(h.digest('hex')));
  });
}

const LOADER_MAP = { neoforge: 'neoforge', forge: 'forge', fabric: 'fabric', quilt: 'quilt' };

// Identify the exact Modrinth version by file hash, then find the newest
// version for the same project + game version + loader.
export async function modrinthCheck(file, { gameVersion, loader }) {
  const hash = await sha512(file);
  const hit = await getJson(`${MODRINTH_API}/version_file/${hash}?algorithm=sha512&multiple=false`);
  const projectId = hit.project_id;
  const versions = await getJson(
    `${MODRINTH_API}/project/${projectId}/version?game_versions=${encodeURIComponent(JSON.stringify([gameVersion]))}&loaders=${encodeURIComponent(JSON.stringify([loader]))}`,
  );
  const latest = versions[0] ?? null;
  return {
    projectId,
    installedVersionId: hit.id ?? null,
    installedVersion: hit.version_number ?? null,
    latestVersion: latest?.version_number ?? null,
    upToDate: latest ? latest.id === hit.id : null,
    url: latest ? `https://modrinth.com/project/${projectId}/version/${latest.id}` : null,
  };
}

// CurseForge: exact slug match on the loader mod id, then newest file for
// the game version + loader. Requires a user API key (console config).
export async function curseforgeCheck(apiKey, modId, { gameVersion, loader }) {
  const search = await getJson(
    `${CURSEFORGE_API}/mods/search?gameId=432&slug=${encodeURIComponent(modId)}&gameVersion=${encodeURIComponent(gameVersion)}&modLoaderType=${encodeURIComponent(capLoader(loader))}&pageSize=5`,
    { 'x-api-key': apiKey },
  );
  const mod = (search.data ?? []).find((m) => m.slug === modId) ?? null;
  if (!mod) return { found: false };
  const files = await getJson(
    `${CURSEFORGE_API}/mods/${mod.id}/files?gameVersion=${encodeURIComponent(gameVersion)}&modLoaderType=${encodeURIComponent(capLoader(loader))}&pageSize=1`,
  );
  const latest = files.data?.[0] ?? null;
  return {
    found: true,
    modId: mod.id,
    name: mod.name,
    latestFile: latest?.displayName ?? null,
    url: latest ? `https://www.curseforge.com/minecraft/mc-mods/${mod.slug}/files/${latest.id}` : null,
  };
}

function capLoader(loader) {
  const l = (LOADER_MAP[loader] ?? loader ?? '').toLowerCase();
  return l.charAt(0).toUpperCase() + l.slice(1);
}
