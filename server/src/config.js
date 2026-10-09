import fs from 'node:fs';
import path from 'node:path';
import { load as yamlLoad } from 'js-yaml';

const DEFAULTS = {
  host: '0.0.0.0',
  port: 3100,
  server_path: './mc-server',
  minecraft_version: null, // e.g. "1.21.1" - used for mod update checks
  launch: { java: 'java', args: null }, // null args => ['-jar', 'server.jar', 'nogui']
  stop_timeout_ms: 60000,
  rcon: { host: '127.0.0.1', port: 25575, password: 'change-me' },
  curseforge_api_key: '',
  data_file: './data.db',
  backup_dir: './backups',
};

function flag(argv, name) {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : undefined;
}

function fail(msg) {
  throw new Error(`invalid config: ${msg}`);
}

export function loadConfig(argv = process.argv) {
  const configPath = flag(argv, '--config') ?? process.env.FROSTSTAINED_CONFIG ?? './config.yml';

  let file = {};
  if (fs.existsSync(configPath)) {
    file = yamlLoad(fs.readFileSync(configPath, 'utf8')) ?? {};
    if (typeof file !== 'object' || Array.isArray(file)) fail(`${configPath} must contain a YAML mapping`);
  } else if (flag(argv, '--config')) {
    fail(`config file not found: ${configPath}`);
  }

  const merged = {
    ...DEFAULTS,
    ...file,
    launch: { ...DEFAULTS.launch, ...((file && file.launch) ?? {}) },
    rcon: { ...DEFAULTS.rcon, ...((file && file.rcon) ?? {}) },
  };

  const port = Number(flag(argv, '--port') ?? process.env.PORT ?? merged.port);
  const host = flag(argv, '--host') ?? merged.host;
  const dataFile = flag(argv, '--data-file') ?? merged.data_file;
  const backupDir = flag(argv, '--backup-dir') ?? merged.backup_dir;

  if (!host || typeof host !== 'string') fail('host must be a non-empty string');
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail(`port must be 1-65535 (got ${port})`);
  if (!merged.server_path || typeof merged.server_path !== 'string') fail('server_path must be set');
  const mcVersion = merged.minecraft_version ?? null;
  if (mcVersion !== null && !/^\d+\.\d+(\.\d+)?$/.test(mcVersion)) {
    fail(`minecraft_version must look like "1.21.1" (got ${mcVersion})`);
  }
  if (!merged.launch.java || typeof merged.launch.java !== 'string') fail('launch.java must be set');
  const launchArgs = merged.launch.args ?? ['-jar', 'server.jar', 'nogui'];
  if (!Array.isArray(launchArgs) || launchArgs.some((a) => typeof a !== 'string')) {
    fail('launch.args must be a list of strings');
  }
  const stopTimeoutMs = Number(merged.stop_timeout_ms);
  if (!Number.isInteger(stopTimeoutMs) || stopTimeoutMs < 5000) {
    fail(`stop_timeout_ms must be an integer >= 5000 (got ${merged.stop_timeout_ms})`);
  }
  if (!Number.isInteger(merged.rcon.port) || merged.rcon.port < 1 || merged.rcon.port > 65535) {
    fail(`rcon.port must be 1-65535 (got ${merged.rcon.port})`);
  }

  return {
    host,
    port,
    serverPath: path.resolve(merged.server_path),
    minecraftVersion: mcVersion,
    launch: { java: merged.launch.java, args: launchArgs },
    stopTimeoutMs,
    rcon: { host: merged.rcon.host, port: merged.rcon.port, password: merged.rcon.password },
    curseforgeApiKey: merged.curseforge_api_key ?? '',
    dataFile: path.resolve(dataFile),
    backupDir: path.resolve(backupDir),
    configPath: path.resolve(configPath),
  };
}
