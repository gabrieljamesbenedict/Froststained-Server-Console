# Froststained Server Console

Minecraft Java server management console for LAN. Single server per console instance.

## Stack

- Backend: Node 22 + Fastify + `ws` + `node:sqlite`
- Frontend: React + Vite (served by backend, single port)
- Packaging: portable single exe via Node SEA (pure-JS deps only)

## Scope (v1)

- Single server only (2 servers = 2 console instances on different ports)
- Windows primary, Linux compatible
- Java only, all modloaders (loader-agnostic `mods/` management)
- Modrinth (keyless) + CurseForge (user API key)
- Adopt-existing server first, create-new second

## Quickstart

1. Copy `config.example.yml` to `config.yml` and set `server_path`.
2. `npm install`
3. `npm run dev:server` + `npm run dev:web`
4. Open `http://<lan-ip>:3100`

Second instance: `node server/src/index.js --port 3101` with separate config.

## Structure

```
server/src/  backend (config, routes, services: process, metrics, mods, auth)
web/src/     React SPA (built to web/dist/, embedded in exe)
data/        runtime SQLite (gitignored)
backups/     world backups (gitignored)
docs/        specs and decisions
scripts/     packaging/service install helpers
```

## License

GNU GPLv3 - see `LICENSE`.
