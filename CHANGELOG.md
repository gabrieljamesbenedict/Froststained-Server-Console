# Changelog

## 1.0.0-a - 2026-10-12

### Added

- YAML configuration (`config.yaml`) and a local SQLite database for users, sessions and audit data.
- Server lifecycle control for the managed Minecraft Java server: start, graceful stop (shutting down the full process tree), restart and force stop.
- Live console stream over WebSocket with follow, log-level filter, download and command history.
- Send commands to the running server over RCON.
- Dashboard with server state, world size, activity feed and console tail.
- Metrics view with CPU, memory, disk and network charts, a per-process table that follows the forked server process, and recorded Minecraft CPU/memory history.
- Players view with online players and the full known-player roster (usercache, whitelist, ops, world stats and advancements).
- Player actions over RCON: kick, ban, pardon, op, deop and whitelist add/remove.
- Mod manager for Fabric, legacy Forge and NeoForge: list with loader metadata and file times, upload, enable/disable, delete and export.
- Mod search, version listing and install from Modrinth (no key) and CurseForge (user API key), plus per-mod update checks by file hash.
- Path-jailed file explorer with text view/edit (1 MB cap, `.bak` kept on save), rename, delete, download and upload.
- World backups: create (live-safe via RCON `save-off` / `save-all flush`, working even with locked world files), list, download, delete and restore with a safety snapshot.
- Scheduled periodic backups and one daily restart.
- Username and password authentication: first-run admin setup, login, logout, 30-day sessions and password change with other-session logout.
- Admin and viewer roles, with server, mod, file, backup and player changes restricted to admins.
- Admin user management (create, update, delete) and an audit log of administrative actions.
- Portable single-file Windows executable with the frontend embedded (Node SEA).
- Dark and light themes, reachable from other devices on the LAN.
- Passwords hashed with bcrypt (cost 12) and login attempts rate-limited (10 per 10 minutes per IP).
- Session tokens are 32-byte random values stored only as SHA-256 hashes, expiring after 30 days.
- Session cookies set `HttpOnly` and `SameSite=Lax`.
- File and mod operations are constrained to the server directory, and RCON arguments are stripped of CR/LF with player names validated.
