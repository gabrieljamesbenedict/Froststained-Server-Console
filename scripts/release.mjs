// Single-executable build for Froststained Server Console.
//
// Produces release/ containing:
//   fssc.exe          - node binary with backend + frontend embedded
//   config.example.yml - user copies to config.yaml
//   README.txt        - first-run instructions
//
// Usage: npm run release
// Dev is untouched: node src/index.js still serves web/dist from disk.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'release');
const SERVER_DIR = path.join(ROOT, 'server');
const SERVER_BUILD = path.join(SERVER_DIR, 'build-sea');
const BLOB = 'sea-prep.blob';
const EXE = process.platform === 'win32' ? 'fssc.exe' : 'fssc';
// Sentinel the blob is injected under. Stable across recent Node lines; if the
// build fails with a postject sentinel error, check the Node release notes.
const FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

const run = (cmd, args, cwd = ROOT) => {
  console.log(`> ${cmd} ${args.join(' ')}`);
  // shell:true because npm/postject are .cmd shims on Windows and spawning
  // them directly fails with EINVAL.
  execFileSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
};

// sea-config's assets map is static JSON, so it is regenerated per build:
// Vite emits content-hashed filenames that change on every frontend build.
// The config lives in server/ and main points at the CJS bundle: SEA's
// runtime loader only runs CJS entry points and decides by extension, so an
// .mjs main gets fed to embedderRunCjs and dies on the first import.
function writeSeaConfig() {
  const dist = path.join(ROOT, 'web', 'dist');
  if (!fs.existsSync(dist)) throw new Error('web/dist missing - run the web build first');
  const assets = {};
  const walk = (dir, prefix = '') => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), rel);
      else assets[rel] = `../web/dist/${rel}`;
    }
  };
  walk(dist);
  const configPath = path.join(SERVER_DIR, 'sea-config.json');
  fs.writeFileSync(configPath, `${JSON.stringify({
    main: 'build-sea/entry.cjs',
    output: BLOB,
    disableExperimentalSEAWarning: true,
    assets,
  }, null, 2)}\n`);
  console.log(`embedded ${Object.keys(assets).length} frontend assets`);
}

console.log('1/7 building web');
run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build', '-w', 'web']);

console.log('2/7 bundling backend to CJS');
// SEA only runs CJS entry points, so the ESM app is bundled first. The
// empty-import-meta warning is silenced: the __dirname branch always wins in
// the bundle and import.meta only exists in dev.
run(path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'esbuild.cmd' : 'esbuild'),
  [path.join('server', 'src', 'index.mjs'),
    '--bundle', '--platform=node', '--format=cjs', '--target=node22',
    '--log-override:empty-import-meta=silent',
    `--outfile=${path.join('server', 'build-sea', 'entry.cjs')}`]);

console.log('3/7 writing server/sea-config.json');
writeSeaConfig();

console.log('4/7 generating SEA blob');
// Run from server/: the blob config resolves main and asset paths relative to
// its own location.
run(process.execPath, ['--experimental-sea-config', 'sea-config.json'], SERVER_DIR);

console.log(`5/7 copying node binary to ${EXE}`);
fs.mkdirSync(OUT, { recursive: true });
fs.copyFileSync(process.execPath, path.join(OUT, EXE));

console.log('6/7 injecting blob');
// <exe> NODE_SEA_BLOB <blob> is the SEA convention; NODE_SEA_BLOB is the
// resource name node:sea looks up.
run(path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'postject.cmd' : 'postject'),
  [path.join(OUT, EXE), 'NODE_SEA_BLOB', path.join(SERVER_DIR, BLOB), '--sentinel-fuse', FUSE]);

console.log('7/7 packaging');
fs.copyFileSync(path.join(ROOT, 'config.example.yml'), path.join(OUT, 'config.example.yml'));
fs.copyFileSync(path.join(ROOT, 'README.txt'), path.join(OUT, 'README.txt'));
fs.rmSync(SERVER_BUILD, { recursive: true, force: true });
fs.rmSync(path.join(SERVER_DIR, BLOB), { force: true });
fs.rmSync(path.join(SERVER_DIR, 'sea-config.json'), { force: true });

console.log(`\ndone. ship the contents of release/`);
console.log(`  ${OUT}`);
