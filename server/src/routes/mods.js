import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { audit } from '../db.js';
import { listMods, modsDir, scanMod } from '../services/modScanner.js';
import {
  curseforgeCheck,
  curseforgeFiles,
  curseforgeSearch,
  downloadJar,
  modrinthCheck,
  modrinthSearch,
  modrinthVersions,
} from '../services/modSources.js';

const MAX_UPLOAD_MB = 200;

// The :file param is always treated as a bare filename inside mods/ -
// basename + containment check blocks path traversal.
function resolveModFile(serverPath, file) {
  const base = path.basename(file ?? '');
  if (!base.endsWith('.jar') && !base.endsWith('.jar.disabled')) {
    const err = new Error('mod file must end with .jar or .jar.disabled');
    err.code = 'BAD_FILE';
    throw err;
  }
  const full = path.join(modsDir(serverPath), base);
  if (!full.startsWith(modsDir(serverPath) + path.sep)) {
    const err = new Error('invalid mod file');
    err.code = 'BAD_FILE';
    throw err;
  }
  if (!fs.existsSync(full)) {
    const err = new Error(`mod not found: ${base}`);
    err.code = 'NOT_FOUND';
    throw err;
  }
  return { base, full };
}

function errToStatus(err) {
  if (err.code === 'BAD_FILE') return 400;
  if (err.code === 'NOT_FOUND') return 404;
  if (err.code === 'CONFLICT') return 409;
  if (err.code === 'UPSTREAM') return 502;
  return 500;
}

// Most common loader among installed mods, so search/install default to
// the server's loader without extra config.
function detectLoader(serverPath) {
  const counts = new Map();
  for (const m of listMods(serverPath).mods) {
    const loader = (m.loader === 'forge-legacy' ? 'forge' : m.loader ?? '').toLowerCase();
    if (loader) counts.set(loader, (counts.get(loader) ?? 0) + 1);
  }
  let top = null;
  for (const [loader, n] of counts) {
    if (!top || n > top[1]) top = [loader, n];
  }
  return top?.[0] ?? null;
}

export default async function modsRoutes(app) {
  await app.register(import('@fastify/multipart'), {
    limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  });

  app.get('/api/mods', { preHandler: app.requireAuth }, async () => listMods(app.config.serverPath));

  app.post('/api/mods/upload', { preHandler: app.requireAuth }, async (req, reply) => {
    const dir = modsDir(app.config.serverPath);
    fs.mkdirSync(dir, { recursive: true });
    const part = await req.file();
    if (!part) return reply.code(400).send({ error: 'missing mod file (field "mod")' });
    const base = path.basename(part.filename ?? '');
    if (!base.endsWith('.jar')) return reply.code(400).send({ error: 'only .jar files can be uploaded' });
    const full = path.join(dir, base);
    if (!full.startsWith(dir + path.sep)) return reply.code(400).send({ error: 'invalid filename' });
    await pump(part.file, fs.createWriteStream(full));
    try {
      void new AdmZip(full).getEntries();
    } catch {
      fs.rmSync(full, { force: true });
      return reply.code(400).send({ error: 'file is not a readable jar' });
    }
    const info = scanMod(full);
    audit(app.db, req.user.id, 'mod.upload', `${base} (${info.sizeKb} KB)`);
    return info;
  });

  app.post('/api/mods/:file/enable', { preHandler: app.requireAuth }, async (req, reply) => {
    try {
      const { base, full } = resolveModFile(app.config.serverPath, req.params.file);
      if (!base.endsWith('.jar.disabled')) {
        return reply.code(409).send({ error: 'mod is already enabled' });
      }
      const target = full.slice(0, -'.disabled'.length);
      if (fs.existsSync(target)) {
        const err = new Error(`${path.basename(target)} already exists`);
        err.code = 'CONFLICT';
        throw err;
      }
      fs.renameSync(full, target);
      audit(app.db, req.user.id, 'mod.enable', base);
      return scanMod(target);
    } catch (err) {
      return reply.code(errToStatus(err)).send({ error: err.message });
    }
  });

  app.post('/api/mods/:file/disable', { preHandler: app.requireAuth }, async (req, reply) => {
    try {
      const { base, full } = resolveModFile(app.config.serverPath, req.params.file);
      if (base.endsWith('.jar.disabled')) {
        return reply.code(409).send({ error: 'mod is already disabled' });
      }
      const target = `${full}.disabled`;
      fs.renameSync(full, target);
      audit(app.db, req.user.id, 'mod.disable', base);
      return scanMod(target);
    } catch (err) {
      return reply.code(errToStatus(err)).send({ error: err.message });
    }
  });

  app.delete('/api/mods/:file', { preHandler: app.requireAuth }, async (req, reply) => {
    try {
      const { base, full } = resolveModFile(app.config.serverPath, req.params.file);
      fs.rmSync(full);
      audit(app.db, req.user.id, 'mod.delete', base);
      return { ok: true, file: base };
    } catch (err) {
      return reply.code(errToStatus(err)).send({ error: err.message });
    }
  });

  // Download Mods dialog: project search on either source.
  app.get('/api/mods/search', { preHandler: app.requireAuth }, async (req, reply) => {
    try {
      const source = (req.query.source ?? 'modrinth').toLowerCase();
      const q = req.query.q ?? '';
      if (source === 'modrinth') return await modrinthSearch(q, { limit: req.query.limit });
      if (source === 'curseforge') {
        const apiKey = app.config.curseforgeApiKey;
        if (!apiKey) return reply.code(400).send({ error: 'set curseforge_api_key in console config for CurseForge search' });
        return await curseforgeSearch(apiKey, q, { limit: req.query.limit });
      }
      return reply.code(400).send({ error: `unknown source "${source}" (modrinth or curseforge)` });
    } catch (err) {
      return reply.code(errToStatus(err)).send({ error: err.message });
    }
  });

  // Newest-first versions for one search hit, filtered to game + loader.
  app.get('/api/mods/versions', { preHandler: app.requireAuth }, async (req, reply) => {
    try {
      const source = (req.query.source ?? 'modrinth').toLowerCase();
      const id = req.query.id;
      if (!id) return reply.code(400).send({ error: 'missing ?id=' });
      const gameVersion = req.query.game_version ?? app.config.minecraftVersion;
      if (!gameVersion) {
        return reply.code(400).send({ error: 'set minecraft_version in config or pass ?game_version=' });
      }
      const loader = (req.query.loader ?? detectLoader(app.config.serverPath) ?? '').toLowerCase();
      if (!loader) {
        return reply.code(400).send({ error: 'no loader detected (pass ?loader=)' });
      }
      if (source === 'modrinth') return await modrinthVersions(id, { gameVersion, loader });
      if (source === 'curseforge') {
        const apiKey = app.config.curseforgeApiKey;
        if (!apiKey) return reply.code(400).send({ error: 'set curseforge_api_key in console config for CurseForge' });
        return await curseforgeFiles(apiKey, id, { gameVersion, loader });
      }
      return reply.code(400).send({ error: `unknown source "${source}" (modrinth or curseforge)` });
    } catch (err) {
      return reply.code(errToStatus(err)).send({ error: err.message });
    }
  });

  // Install one version file straight into mods/. Overwrites the same
  // filename (normal for updates); validates the jar before keeping it.
  app.post('/api/mods/install', { preHandler: app.requireAuth }, async (req, reply) => {
    const fail = (err) => reply.code(errToStatus(err)).send({ error: err.message });
    try {
      const source = (req.body?.source ?? '').toLowerCase();
      const dir = modsDir(app.config.serverPath);
      fs.mkdirSync(dir, { recursive: true });
      let filename;
      let url;
      if (source === 'modrinth') {
        const { id, versionId } = req.body ?? {};
        if (!id || !versionId) return reply.code(400).send({ error: 'need {source, id, versionId}' });
        const res = await fetch(`https://api.modrinth.com/v2/version/${encodeURIComponent(versionId)}`, {
          headers: { 'User-Agent': 'Froststained-Server-Console/0.1.0 (admin console)' },
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
          const err = new Error(`upstream ${res.status} for api.modrinth.com`);
          err.code = 'UPSTREAM';
          throw err;
        }
        const v = await res.json();
        if (v.project_id !== id) {
          const err = new Error('version does not belong to the requested project');
          err.code = 'BAD_FILE';
          throw err;
        }
        const file = (v.files ?? []).find((f) => f.primary && f.filename?.endsWith('.jar'))
          ?? (v.files ?? []).find((f) => f.filename?.endsWith('.jar'));
        if (!file) {
          const err = new Error('no jar in that version');
          err.code = 'BAD_FILE';
          throw err;
        }
        filename = path.basename(file.filename);
        url = file.url;
      } else if (source === 'curseforge') {
        const apiKey = app.config.curseforgeApiKey;
        if (!apiKey) return reply.code(400).send({ error: 'set curseforge_api_key in console config for CurseForge' });
        const { id, versionId } = req.body ?? {};
        if (!id || !versionId) return reply.code(400).send({ error: 'need {source, id, versionId}' });
        const res = await fetch(
          `https://api.curseforge.com/v1/mods/${encodeURIComponent(String(id))}/files/${encodeURIComponent(String(versionId))}`,
          { headers: { 'User-Agent': 'Froststained-Server-Console/0.1.0 (admin console)', 'x-api-key': apiKey }, signal: AbortSignal.timeout(15000) },
        );
        if (!res.ok) {
          const err = new Error(`upstream ${res.status} for api.curseforge.com`);
          err.code = 'UPSTREAM';
          throw err;
        }
        const f = (await res.json()).data;
        if (!f?.downloadUrl || !f.fileName?.endsWith('.jar')) {
          const err = new Error('no downloadable jar on that file');
          err.code = 'BAD_FILE';
          throw err;
        }
        filename = path.basename(f.fileName);
        url = f.downloadUrl;
      } else {
        return reply.code(400).send({ error: `unknown source "${req.body?.source}" (modrinth or curseforge)` });
      }
      const full = path.join(dir, filename);
      if (!full.startsWith(dir + path.sep)) {
        const err = new Error('invalid filename');
        err.code = 'BAD_FILE';
        throw err;
      }
      await downloadJar(url, full);
      try {
        void new AdmZip(full).getEntries();
      } catch {
        fs.rmSync(full, { force: true });
        const err = new Error('downloaded file is not a readable jar');
        err.code = 'BAD_FILE';
        throw err;
      }
      const info = scanMod(full);
      audit(app.db, req.user.id, 'mod.install', `${filename} (${source})`);
      return info;
    } catch (err) {
      return fail(err);
    }
  });

  // Export List: plain-text mod roster for copy or download.
  app.get('/api/mods/export', { preHandler: app.requireAuth }, async () => {
    const { mods } = listMods(app.config.serverPath);
    const text = mods
      .map((m) => `${m.name} — ${m.version ?? '?'} (${m.file})${m.enabled ? '' : ' [disabled]'}`)
      .join('\n');
    return { count: mods.length, text };
  });

  // Per-mod update check. Needs the MC version (config or ?game_version=)
  // and the loader (detected, or ?loader= override). Sources are queried
  // independently; one failing never fails the other.
  app.get('/api/mods/:file/updates', { preHandler: app.requireAuth }, async (req, reply) => {
    try {
      const { full } = resolveModFile(app.config.serverPath, req.params.file);
      const mod = scanMod(full);
      const gameVersion = req.query.game_version ?? app.config.minecraftVersion;
      if (!gameVersion) {
        return reply.code(400).send({ error: 'set minecraft_version in config or pass ?game_version=' });
      }
      const loader = (req.query.loader ?? (mod.loader === 'forge-legacy' ? 'forge' : mod.loader) ?? '').toLowerCase();
      if (!['forge', 'neoforge', 'fabric', 'quilt'].includes(loader)) {
        return reply.code(400).send({ error: `cannot check updates: unknown loader (pass ?loader=), got "${mod.loader}"` });
      }
      const out = { mod: { file: mod.file, modId: mod.modId, version: mod.version }, gameVersion, loader, modrinth: null, curseforge: null };
      try {
        out.modrinth = await modrinthCheck(full, { gameVersion, loader });
      } catch (err) {
        out.modrinth = { error: err.message };
      }
      const apiKey = app.config.curseforgeApiKey;
      if (!apiKey) {
        out.curseforge = { skipped: 'no curseforge_api_key configured' };
      } else if (!mod.modId) {
        out.curseforge = { skipped: 'no mod id detected' };
      } else {
        try {
          out.curseforge = await curseforgeCheck(apiKey, mod.modId, { gameVersion, loader });
        } catch (err) {
          out.curseforge = { error: err.message };
        }
      }
      return out;
    } catch (err) {
      return reply.code(errToStatus(err)).send({ error: err.message });
    }
  });
}

async function pump(from, to) {
  await new Promise((resolve, reject) => {
    from.on('error', reject);
    to.on('error', reject);
    to.on('finish', resolve);
    from.pipe(to);
  });
}
