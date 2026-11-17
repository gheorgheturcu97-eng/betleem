# CLAUDE.md — instructions for Claude Code

You are helping build **Bethlehem Network Churches**: a free, open-source church app (planning, teams,
song library, presenter, live mode, network meetings, local AI) for a network of ~12 Romanian churches.
The owner is a church media leader with some coding experience. He speaks Romanian; explain things simply,
in Romanian unless he writes in English. Volunteers are not technical, so every screen must be obvious.

Read first: `docs/SPEC.md` (what to build), `docs/ROADMAP.md` (order to build it).

## Repository
```
packages/core/        song engine (TypeScript, no dependencies) — single source of truth for songs
  src/song.ts         parseSong, stripChords, transpose, toSlides, arrange, chordsOverToChordPro, normalizeImported
  test/               node:test tests
apps/local-hub/       Node server for Sunday: control, main screen, stage screen, phone live view (works offline)
  src/server.js       HTTP + WebSocket, PIN roles, JSON storage in data/
  src/extract.js      lyrics extraction from web pages (add site rules here)
  public/             browser pages; import the engine from /core/song.js (served from song.ts)
supabase/             Postgres schema with row-level security + seed + permission tests
docs/                 SPEC and ROADMAP
```

## Commands
```bash
cd packages/core && npm test                 # song engine tests
cd apps/local-hub && npm install && npm test # hub tests
cd apps/local-hub && PIN=1234 LEADER_PIN=9999 npm start   # run on http://localhost:4545/control.html
```
Node >= 22.18 is required (the hub runs `song.ts` directly via Node's built-in type stripping).

## Rules
1. **Song engine is shared.** Any song logic goes in `packages/core/src/song.ts`, with a test. Keep it dependency-free
   and use only erasable TypeScript (no enums, no namespaces, no parameter properties) so Node and the browser can run it.
2. **Security lives in the database.** Every new table gets RLS policies in a new migration
   (`supabase/migrations/000N_name.sql`, never edit an applied one) and a case in `supabase/tests/10_rls_test.sql`.
   Roles: leader > operator > musician; operators may only change `slide_layout` on service items.
3. **Sunday must never break.** The Local Hub must keep working with no internet. Cloud data is cached locally.
   No feature may block the live screens. Test the presenter after every change to it.
4. **AI only suggests.** Local AI (Ollama) output is always shown for a person to confirm. Never send church documents
   or personal data to a cloud AI.
5. **Personal data (GDPR).** Contacts only via consent; leaders only; support delete. No personal data in logs or tests.
6. **Simple UI, Romanian labels.** Big buttons, few options, sensible defaults. Text in the UI is Romanian.
7. **Low resources.** The Mac Mini also runs sound/stream. Avoid heavy frameworks on the screen pages; no polling loops.
8. Run the tests before saying something is done. Keep commits small with clear messages.

## Next tasks (Phase 1 in docs/ROADMAP.md)
- Site rule for resursecrestine.ro in `extract.js`: fetch a real song page, inspect the HTML, add a precise selector, add a test with a saved sample.
- `/overlay.html` for OBS: lyrics only, transparent background, lower-third style.
- Importers: FreeShow export, OpenLP, ProPresenter `.pro` (protobuf) and `.probundle` (zip), PowerPoint `.pptx`.
- launchd plist so the hub starts on boot on macOS.
Then Phase 2: Tauri 2 desktop app (`apps/desktop`, React + TypeScript + Supabase) and hub ↔ Supabase sync.
