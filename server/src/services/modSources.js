import crypto from 'node:crypto';
import fs from 'node:fs';
import { Readable } from 'node:stream';

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

// Modrinth project search for the Download Mods dialog.
export async function modrinthSearch(query, { limit = 10 } = {}) {
  const q = String(query ?? '').trim();
  if (!q) return { hits: [] };
  const params = new URLSearchParams({
    query: q,
    limit: String(Math.min(Math.max(Number(limit) || 10, 1), 25)),
    index: 'relevance',
    facets: JSON.stringify([['project_type:mod']]),
  });
  const res = await getJson(`${MODRINTH_API}/search?${params}`);
  return {
    hits: (res.hits ?? []).map((h) => ({
      source: 'modrinth',
      id: h.project_id ?? h.slug,
      slug: h.slug ?? null,
      title: h.title ?? h.slug,
      description: h.description ?? '',
      iconUrl: h.icon_url ?? null,
      downloads: h.downloads ?? 0,
    })),
  };
}

// Newest-first versions for one project, filtered to game + loader.
export async function modrinthVersions(projectId, { gameVersion, loader, limit = 10 } = {}) {
  const params = new URLSearchParams({
    game_versions: JSON.stringify([gameVersion]),
    loaders: JSON.stringify([loader]),
    limit: String(Math.min(Math.max(Number(limit) || 10, 1), 25)),
  });
  const versions = await getJson(`${MODRINTH_API}/project/${encodeURIComponent(projectId)}/version?${params}`);
  return {
    versions: versions.map((v) => ({
      id: v.id,
      versionNumber: v.version_number ?? v.name,
      gameVersions: v.game_versions ?? [],
      loaders: v.loaders ?? [],
      date: v.date_published ?? null,
      files: (v.files ?? [])
        .filter((f) => f.filename?.endsWith('.jar'))
        .map((f) => ({ filename: f.filename, url: f.url, primary: !!f.primary, size: f.size ?? null })),
    })),
  };
}

// CurseForge mod search. Needs the console API key.
export async function curseforgeSearch(apiKey, query, { limit = 10 } = {}) {
  const q = String(query ?? '').trim();
  if (!q) return { hits: [] };
  const params = new URLSearchParams({
    gameId: '432',
    searchFilter: q,
    pageSize: String(Math.min(Math.max(Number(limit) || 10, 1), 25)),
    sortField: '2', // popularity
    sortOrder: 'desc',
  });
  const res = await getJson(`${CURSEFORGE_API}/mods/search?${params}`, { 'x-api-key': apiKey });
  return {
    hits: (res.data ?? []).map((m) => ({
      source: 'curseforge',
      id: m.id,
      slug: m.slug ?? null,
      title: m.name ?? m.slug,
      description: m.summary ?? '',
      iconUrl: m.logo?.thumbnailUrl ?? null,
      downloads: m.downloadCount ?? 0,
      pageUrl: m.links?.websiteUrl ?? null,
    })),
  };
}

// Newest-first CurseForge files for one mod id.
export async function curseforgeFiles(apiKey, modId, { gameVersion, loader, limit = 10 } = {}) {
  const params = new URLSearchParams({
    gameVersion,
    modLoaderType: capLoader(loader),
    pageSize: String(Math.min(Math.max(Number(limit) || 10, 1), 25)),
  });
  const res = await getJson(
    `${CURSEFORGE_API}/mods/${encodeURIComponent(String(modId))}/files?${params}`,
    { 'x-api-key': apiKey },
  );
  return {
    versions: (res.data ?? []).map((f) => ({
      id: f.id,
      versionNumber: f.displayName ?? String(f.id),
      gameVersions: f.gameVersions ?? [],
      date: f.fileDate ?? null,
      files: (f.downloadUrl ? [{ filename: f.fileName, url: f.downloadUrl, primary: true, size: f.fileLength ?? null }] : []),
    })),
  };
}

const MAX_DOWNLOAD_MB = 200;

// Stream a remote jar straight to disk with a size cap.
export async function downloadJar(url, dest, headers = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: AbortSignal.timeout(60000) });
  if (!res.ok || !res.body) {
    const err = new Error(`download failed (${res.status})`);
    err.code = 'UPSTREAM';
    throw err;
  }
  const len = Number(res.headers.get('content-length')) || 0;
  if (len > MAX_DOWNLOAD_MB * 1024 * 1024) {
    const err = new Error('remote file is over 200 MB');
    err.code = 'UPSTREAM';
    throw err;
  }
  await new Promise((resolve, reject) => {
    let bytes = 0;
    // Undici gives a web stream; convert for .pipe counting.
    const stream = Readable.fromWeb(res.body);
    const out = fs.createWriteStream(dest);
    const abort = (err) => {
      try { stream.destroy(); } catch { /* already torn down */ }
      try { out.destroy(); } catch { /* already torn down */ }
      reject(err);
    };
    stream.on('error', abort);
    out.on('error', abort);
    out.on('finish', resolve);
    stream.on('data', (d) => {
      bytes += d.length;
      if (bytes > MAX_DOWNLOAD_MB * 1024 * 1024) abort(new Error('remote file is over 200 MB'));
    });
    stream.pipe(out);
  });
}
