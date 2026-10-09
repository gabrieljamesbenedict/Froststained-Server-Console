// Minimal config loader for skeleton. Full version: YAML parse + validation + --port/--config flags.
export function loadConfig(argv) {
  const portFlag = argv.indexOf('--port');
  const port = portFlag !== -1 ? Number(argv[portFlag + 1]) : 3100;
  return { host: '0.0.0.0', port, serverPath: './mc-server' };
}
