# Architecture

## Overview

Minecraft Java server management console for LAN. A single Fastify process
owns one `java -jar` child process. Multi-server = multiple console
processes with distinct ports/configs.

```
Browser → Fastify [:3100] → serves web/dist + /api + /ws
```

## Top-Level Structure

```
Froststained-Server-Console/
├── server/          # Backend workspace (Fastify + ws + node:sqlite)
│   └── src/
│       ├── index.js         # Backend entry point
│       ├── config.js        # YAML config loader + CLI flags + validation
│       ├── db.js            # SQLite open + schema + audit helper
│       ├── ws/console.js    # WebSocket /ws/console live stream
│       ├── routes/          # 10 Fastify route plugins
│       └── services/        # 12 business-logic modules
├── web/             # Frontend workspace (React 18 + Vite 6)
│   └── src/
│       ├── main.jsx         # React entry
│       ├── App.jsx          # Root component (auth, routing, shell)
│       ├── api.js           # fetch wrapper, wsUrl, poll constants, toast
│       ├── index.css        # Design tokens (CSS variables, themes)
│       └── views/           # Dashboard, Console, Metrics, Players, Mods,
│                            # Files, AdminUsers, shared
├── docs/            # This file + design.md
├── config.example.yml
└── package.json     # Root workspace manifest
```

## Backend (`server/`)

**Entry**: `server/src/index.mjs` — ESM, Node 22, Fastify 5.

### Core Modules

| File | Responsibility |
|---|---|
| `index.js` | App bootstrap: load config, decorate Fastify, register routes, serve `web/dist`, graceful shutdown. |
| `config.js` | YAML config + CLI flags (`--config`, `--port`, `--host`, `--data-file`, `--backup-dir`) + validation. Resolution: `--config` → `FROSTSTAINED_CONFIG` env → `./config.yaml` → `./config.yml`. |
| `db.js` | `node:sqlite` open + schema (`users`, `sessions`, `audit_log`) + `audit()` helper. |
| `ws/console.js` | `/ws/console` — streams MC output to browser. Auth via session cookie on upgrade. |

### Routes (`server/src/routes/`)

| File | Prefix | Responsibility |
|---|---|---|
| `health.js` | `/api/health` | Liveness probe. |
| `auth.js` | `/api/auth/*` | Setup, login, logout, me, sessions, password change. Rate-limited (10/10min/IP). bcrypt cost 12. 30-day sessions. |
| `server.js` | `/api/server/*` | Status, log tail, world info, server info, start/stop/restart/kill/command. |
| `metrics.js` | `/api/metrics` | Combined snapshot: server state + system metrics + process tree. |
| `players.js` | `/api/players/*` | Online snapshot, roster, kick/ban/pardon/op/deop/whitelist (admin). |
| `mods.js` | `/api/mods/*` | List, upload, enable/disable, delete, search (Modrinth/CurseForge), versions, install, export, update check. |
| `backups.js` | `/api/backups/*` | List, create, download, delete, restore. |
| `files.js` | `/api/files/*` | Directory browse, text read/write, rename, delete, download, upload. |
| `schedule.js` | `/api/schedule` | Scheduler status (backup/restart config + last run). |
| `audit.js` | `/api/audit` | Audit log entries (joined with usernames). |
| `adminUsers.js` | `/api/admin/users/*` | User CRUD (admin only). Roles: admin/viewer. |

### Services (`server/src/services/`)

| File | Responsibility |
|---|---|
| `processManager.js` | **Core**: spawn/kill `java` child process, graceful stop, ring buffer (1000 lines), EventEmitter. `killTree` via `taskkill /T /F` (Win) or `process.kill(-pid)` (Unix). |
| `rcon.js` | Thin `rcon-client` wrapper. Fresh TCP per command. Cached reachability (30s). |
| `systemMetrics.js` | Polls `systeminformation` every 5s: CPU, mem, disks, net, OS + MC process tree. 120-sample history. |
| `playerTracker.js` | Derives online players from log lines (join/leave regex). Seeded from `logTail` history. |
| `processTree.js` | Walks MC process tree via `systeminformation.processes()`. Per-PID CPU/mem/RSS + threads. |
| `scheduler.js` | 60s tick: periodic backups + one daily restart. In-memory state. Audits to DB. |
| `modScanner.js` | Reads mod jar manifests (fabric.mod.json, mods.toml, neoforge.mods.toml, mcmod.info) via `adm-zip` + `smol-toml`. |
| `modSources.js` | Modrinth API + CurseForge API (search, versions, update check via SHA-512). `downloadJar` with 200MB cap. |
| `logTail.js` | Reads last N lines / last 64KB of `logs/latest.log`. |
| `fileBrowser.js` | Path-jailed file operations inside `serverPath`. Text edit cap 1MB + `.bak`. |
| `backups.js` | Timestamped zip backups. Live: RCON `save-off`/`save-all flush` → zip → `save-on`. Restore: safety snapshot → wipe → extract. |
| `serverInfo.js` | Console version, server path, game port, loader detection, RCON status. |
| `worldInfo.js` | World folder size (cached 60s). |
| `playerStats.js` | Merges `usercache.json`, `whitelist.json`, `ops.json` + world `stats/` + `advancements/`. |

## Frontend (`web/`)

**Entry**: `web/src/main.jsx` → `createRoot` → `<App />`

### Core Modules

| File | Responsibility |
|---|---|
| `App.jsx` | Root: theme (dark/light, localStorage), view routing, auth flow, sidebar shell, MasterPower button, toasts. |
| `api.js` | `api()` fetch wrapper, `wsUrl()`, `POLL` cadences, `LIMITS` buffer caps, `toast()` dispatcher, format helpers. |
| `index.css` | Design tokens (CSS variables, themes). |

### Views (`web/src/views/`)

| File | Responsibility |
|---|---|
| `Dashboard.jsx` | Server card, activity feed, console tail, world size. |
| `Console.jsx` | Full-page terminal: follow, level filter, download, clear, command history. |
| `Metrics.jsx` | CPU/mem/disk/net charts + process table. |
| `Players.jsx` | Online table + All Players table + kick/ban/op controls. |
| `Mods.jsx` | Mod list, upload, enable/disable, search/install dialog, update check. |
| `Files.jsx` | Explorer + viewer/editor. |
| `AdminUsers.jsx` | User list, create, role change, delete. |
| `shared.jsx` | `AuthForm` (setup/login), `Backups` (list/create/restore/delete), `PasswordForm`. |

## Communication

### REST (`/api/*`)

- Auth: HttpOnly cookie `froststained_session` (30-day expiry, SHA-256 hashed token in DB).
- Guard: `preHandler: app.requireAuth` on all routes except health/auth setup/login.
- Admin routes add `requireAdmin` guard.
- Errors: structured `{error: message}` with appropriate HTTP status codes.

### WebSocket (`/ws/console`)

- Same-origin in production (Fastify serves both).
- Vite proxy in dev (`ws: true`).
- Server pushes `line`/`status`/`history`; client sends `{type:'command'}`.

### Static Serving

- Production: Fastify serves `web/dist/` + SPA fallback.
- Dev: Vite on 5173, proxies `/api` and `/ws` to backend.

## Build & Packaging

1. `npm run build -w web` → Vite builds to `web/dist/`.
2. Backend serves `web/dist/` if it exists (otherwise API-only mode with warning).
3. **Portable exe**: Node SEA packaging — pure-JS deps only. `config.yml` + `data.db` co-located with exe, sibling folder to MC server.

## Config & Data Flow

- **Config**: `config.yml` → `loadConfig()` → validated object → decorated on Fastify app.
- **Runtime data**: SQLite (`data.db`) → users, sessions, audit_log.
- **MC server data**: `server_path` → `server.properties`, `logs/latest.log`, `mods/`, `world/`, `backups/`.
- **Backups**: `backup_dir` → timestamped zip files.

## Security

- Path traversal protection: normalize + containment check on all file operations.
- Rate limiting: in-memory login limiter (10 attempts / 10 min / IP).
- bcrypt password hashing (cost 12).
- Session tokens: 32-byte random hex, SHA-256 hashed in DB, 30-day expiry.
- HttpOnly + SameSite=Lax cookies.
- RCON command sanitization: strips CR/LF to prevent command smuggling.

## Graceful Shutdown

SIGINT/SIGTERM → stop MC server (30s cap) → exit. Prevents orphaning the Java process.
