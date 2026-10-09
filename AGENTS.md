# AGENTS.md - Froststained Server Console

## Project
Minecraft Java server management console for LAN. Single server per console
instance (2 servers = 2 console copies on different ports via `--port/--config`).

## Stack
- Backend: Node 22 + Fastify + `ws` + `node:sqlite` (pure-JS deps only, Node SEA packaging)
- Frontend: React + Vite SPA, served by backend on a single port in production
- Install model: portable single exe, `config.yml` + `data.db` co-located, sibling folder to MC server

## Commands
- `npm install` - install workspaces (root)
- `npm run dev:server` - backend dev (Fastify on `0.0.0.0:3100`)
- `npm run dev:web` - frontend dev (Vite on `:5173`, proxies `/api` to backend)
- `npm run build -w web` - production frontend build to `web/dist/`
- Health check: `curl.exe http://127.0.0.1:3100/api/health`
- Web dev binds all interfaces (`server.host: true`); always verify both
  `localhost:5173` and `127.0.0.1:5173` after touching `web/vite.config.js`

## Git / commits
- Branch: `main`, remote `origin`
  (`https://github.com/gabrieljamesbenedict/Froststained-Server-Console`)
- Use Conventional Commits for all messages: `<type>(<scope>): <subject>`
  - Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`
  - Scopes: `web`, `server`, `mods`, `metrics`, `auth`, `config`, `repo`
  - Subject: imperative, lowercase, no trailing period, max ~72 chars
  - Always include a body explaining what and why; use bullet points for
    longer bodies (one `- ` line per change)
  - Example:
    `fix(web): bind dev server to all interfaces for IPv4 and LAN access`
- Stage with `git add <paths>` (avoid blind `git add -A` once runtime files exist;
  `config.yml` and `data.db*` are gitignored and must never be committed)
- After committing, push to `main` unless told otherwise
- For multi-step requests: stage first, propose the commit message, wait for
  approval before committing

## Notes
- PowerShell environment: use `curl.exe`, not `Invoke-WebRequest`
  (fails in NonInteractive mode). No `tail`; use `Select-Object -Last N`.
- Never commit secrets (`config.yml`, `data.db`, `curseforge_api_key`).
