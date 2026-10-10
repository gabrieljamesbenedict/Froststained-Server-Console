# Froststained UI design decisions

Locked in with Gabriel; the real frontend is the source of truth.

## Fonts (Monaspace everywhere, via Google Fonts, monospace fallback)

- UI text: **Monaspace Xenon** (most humanist, readable)
- Technical text (log pane, numerals, PIDs, code): **Monaspace Neon**
- Headers and subheaders: **Monaspace Krypton**
- Numbers everywhere: `font-variant-numeric: tabular-nums` (no jitter on update)
- Type scale: 11-12px micro-labels, 13px body/tables, 20px view titles, 22px stat numerals

## Colors

Frost dark default, frost light alternate (see CSS variables in `web/src/index.css`).
Red accents carry the "stained" half of the identity:

- Primary accent stays frost blue (`#58a6ff` dark / `#0969da` light): links, actions, RCON lines, focus.
- Stain red (`#f2555a` dark / `#cf222e` light): brand mark ("STAINED" wordmark),
  destructive actions (Force stop, Delete), stopped/error states, error text.
- Success green / warning amber unchanged. Log pane stays dark in both themes.
- One accent per meaning: blue acts, green confirms health, amber cautions, red destroys or errors.

## Layout and nav

- Sidebar order: Dashboard, Console, Metrics, Players, Mods, Files,
  Backups, Settings — with Account pinned at the very bottom.
- No persistent status frame; state lives on the Dashboard.
- No bullets/triangles on nav labels; active item gets an accent left bar.
- Content flex-fills the width (1600px ceiling); no narrow centered column.
- Dashboard is CSS grid: control + server cards left, activity feed spanning
  both rows right, console tail full-width below.
- Console is full-page: toolbar (follow, level filter, download, clear),
  full-height terminal, command bar with history.
- Mods take PrismLauncher cues: dense rows, inline enable checkbox, version
  badges, right action column, inline update badges.
- Files is strictly explorer plus viewer/editor.
- Players and Backups share one table pattern.
- Account tab holds sign-out, password change, and session info.

## Copy

- Verb buttons ("Start server"), Kill renamed to "Force stop".
- Auto units (4.2 GB not 4100 MB), humanized times, real empty states.
- Errors say what to do; toasts carry title + detail.
