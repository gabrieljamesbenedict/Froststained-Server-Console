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

Second instance: `node server/src/index.mjs --port 3101` with separate config.

## Shipping a single-exe release

```powershell
npm install          # once, for postject + esbuild
npm run release
```

Produces `release/` with `fssc.exe` (backend + frontend embedded in the node
binary), `config.example.yml`, and `README.txt` — that folder is the whole
distribution. The exe reads `config.yaml` from beside it; `data/` and
`backups/` are created on first run.

Release steps, for reference: build web → bundle the backend to CJS with
esbuild → generate the SEA blob → inject into a copy of `node` with postject →
package. The blob is rebuilt every time because Vite emits content-hashed
filenames.

Dev is unaffected: `npm run dev:server` still runs the ESM entry directly and
serves `web/dist/` from disk.

## Structure

```
server/src/  backend (config, routes, services: process, metrics, mods, auth)
web/src/     React SPA (built to web/dist/, embedded in exe)
data/        runtime SQLite (gitignored)
docs/        specs and decisions
```

## License

GNU GPLv3 - see `LICENSE`.
