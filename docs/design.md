# Froststained UI design decisions

Locked in with Gabriel; apply to the mockup first, then the real frontend.

## Fonts (Monaspace everywhere, via Google Fonts, monospace fallback)

- UI text: **Monaspace Xenon** (most humanist, readable)
- Technical text (log pane, numerals, PIDs, code): **Monaspace Neon**
- Headers and subheaders: **Monaspace Krypton**
- Numbers everywhere: `font-variant-numeric: tabular-nums` (no jitter on update)
- Type scale: 11-12px micro-labels, 13px body/tables, 20px view titles, 22px stat numerals

## Colors

Frost dark default, frost light alternate (see mockup CSS variables).
Red accents carry the "stained" half of the identity:

- Primary accent stays frost blue (`#58a6ff` dark / `#0969da` light): links, actions, RCON lines, focus.
- Stain red (`#f2555a` dark / `#cf222e` light): brand mark ("STAINED" wordmark),
  destructive actions (Force stop, Delete), stopped/error states, error text.
- Success green / warning amber unchanged. Log pane stays dark in both themes.
- One accent per meaning: blue acts, green confirms health, amber cautions, red destroys or errors.

## Layout and nav

- Sidebar order: Dashboard, Server files, Metrics, Players, Mods, Backups, Settings.
- No bullets/triangles on nav labels; active item gets an accent left bar.
- Content flex-fills the width (1600px ceiling); no narrow centered column.
- Dashboard is the hub: Server control card on top (status + power buttons),
  host CPU/memory/disk card, full server console, player list. No separate
  Console page, no mods card on the dashboard.
- Server files tab: breadcrumb browser plus an editor card for text files
  (allowlist, size cap, backup on save, restart notice).
- Metrics adds RAM and disk graphs next to CPU.
- Players and mods use tables with right-aligned numerics and status dots.
- Topbar: view title, status pill, user, theme toggle. Tables get sticky
  headers, row hover, right-aligned numerics, status dots.

## Copy

- Verb buttons ("Start server"), Kill renamed to "Force stop".
- Auto units (4.2 GB not 4100 MB), humanized times, real empty states.
- Errors say what to do; toasts carry title + detail.
