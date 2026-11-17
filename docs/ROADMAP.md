# Roadmap

Build in this order. Each phase is usable on its own, so the church gets value early.

## Phase 0 — done (this repository)
- [x] Song engine: parse sections, strip chords, transpose, slides, arrangement, chords-above-lyrics import, Romanian diacritics (10 tests)
- [x] Local Hub: operator control, main screen, stage screen with chords, phone live view, PIN roles (operator / leader), backgrounds (image + video), import from link, sync over Wi-Fi (4 tests)
- [x] Database schema for the whole network with row-level security (13 permission tests)

## Phase 1 — Sunday ready (use it in Peștera)
1. Try the Local Hub for one Sunday next to FreeShow. Note every problem.
2. Site rule for resursecrestine.ro in `apps/local-hub/src/extract.js` (check the real HTML).
3. Import FreeShow / OpenLP / ProPresenter song libraries (one-off migration script).
4. Import PowerPoint (.pptx): read slide text with a zip + XML parser.
5. Stream overlay page `/overlay.html` for OBS (transparent background).
6. Run as a service on the Mac Mini (launchd) so it starts automatically.

## Phase 2 — Planning in the cloud
1. Desktop app scaffold: Tauri 2 + React + TypeScript + Supabase client.
2. Login (email magic link) and church switcher.
3. Planning screen: services, items, drag to reorder, key, duration, start times.
4. Song library screen with search, editor, history.
5. **Sync:** the Local Hub pulls the published service + songs from Supabase and caches them, so Sunday works offline.
6. Musician notes shown live on stage screen and phones.

## Phase 3 — Teams
1. Departments, positions, volunteers.
2. Monthly schedule grid; confirm / decline / sign-up from phone; blockout dates.
3. Email reminders (Supabase Edge Function + free email tier, e.g. Resend).

## Phase 4 — Network hub
1. Thursday meeting: agenda, shared to-do list.
2. Monthly objectives per leader.
3. Documents area (upload, Google Drive links).

## Phase 5 — Local AI (Ollama on one church computer)
1. AI endpoint in the Local Hub that talks to Ollama.
2. Lyrics clean-up: split into sections, fix line breaks.
3. Photo of handwritten notes → agenda items (vision model) → leader confirms.
4. Month-end objective review.
5. Web song search: several sites → choose a version → create song.

## Phase 6 — People & outreach
1. Public connect-card page + QR code (calls `submit_connect_card`).
2. Follow-up tasks for new people.
3. Email campaigns with flyer; later SMS / WhatsApp Business (paid).

## Phase 7 — Open source for the network
1. Church onboarding (create church, invite leader).
2. Documentation in Romanian for volunteers.
3. Installers for Mac and Windows; phone apps (Tauri mobile) if needed.
