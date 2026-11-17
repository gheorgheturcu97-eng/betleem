# Bethlehem Network Churches — Product Spec

One free, open-source app for the Bethlehem Church network (Bethlehem Church and its church plants, ~12 churches),
so that small churches with few volunteers get the same tools as the main church.

**Principle:** simple for volunteers, cheap to run, one app instead of many. Less tech stress on Sunday,
more focus on people.

---

## 1. Users and roles

| Role | Who | Can |
|---|---|---|
| Network admin | senior pastor / coordinator | manage churches, network meeting, everything |
| Leader | pastor / church leader | everything inside their church: plan, people, teams, contacts |
| Operator | media volunteer | edit lyrics and slide arrangements, run the screens; **cannot** change the service order |
| Musician | worship team & other volunteers | see plan, chords, schedule; add notes; sign up for slots |
| Viewer (phone, no login) | congregation on church Wi-Fi | follow lyrics live |

Enforced in the database (row-level security), not only in the UI.

## 2. Modules

### 2.1 Network hub — Thursday meeting
- Weekly meeting with an agenda; every leader adds agenda points for their church.
- **Photo → agenda:** the pastor photographs handwritten notes, the local AI reads them and proposes agenda items to confirm.
- Shared to-do list (network and per church), with owner and due date.
- **Monthly objectives:** each leader writes objectives, vision and "how we know it's done".
  At month end the local AI reviews each one with the leader: done / partly / distracted, and suggests next steps.
- Documents area: vision documents, PDFs, Word files, Google Drive links. Text is extracted so the AI can search them.

### 2.2 Sunday planning (like Planning Center Services)
- Service order: songs, sermon, prayer, announcements, readings, video; duration, who leads, notes.
- Start times calculated automatically from durations.
- Key per service (transposes automatically from the song's default key).
- Status: draft → published → live → done.

### 2.3 Teams and scheduling
- Departments: Worship, Media, Hospitality, Assimilation, Follow-up, Program (preaching, moderator)…
- Positions inside each department with how many people are needed.
- Monthly grid: services × positions → volunteer.
- Volunteers confirm/decline from the phone, take open slots (sign-up), set blockout dates.

### 2.4 Song library (shared by the whole network)
- One song stored once, ChordPro format: `[G]Mare e [D]Domnul`.
- Everything derives from it: projector (lyrics only), stage screen (chords), music stand (transposed), phones.
- Import from: web link (Resurse Creștine etc.), pasted text (chords-above-lyrics converted automatically),
  PowerPoint (.pptx), ProPresenter bundles (.probundle / .pro), OpenLP / FreeShow exports.
- **Web search:** type a title → the app shows versions from several sites → pick one → song created.
- Version history: every lyric edit can be undone.
- Romanian diacritics normalised (ş→ș, ţ→ț).

### 2.5 Presenter (replaces ProPresenter / FreeShow)
- Runs on the church Mac Mini, very light on resources, works offline.
- Outputs: **main screen** (lyrics only, background), **stage screen** (lyrics + chords + next slide + clock),
  phone live view, later **stream overlay** (transparent lyrics for OBS) and NDI output.
- Backgrounds: images and videos, per service, per song or per slide. Logo screen, black screen, on-screen message.
- Arrangement per service: "Strofa 1, Refren, Strofa 2, Refren, Refren", lines per slide.
- Keyboard: Space/→ next, ← previous, B black, L logo.
- **What the leader planned on Thursday is already in the presenter on Sunday.** The operator only adjusts.

### 2.6 Live mode (phones on church Wi-Fi)
- Everyone: service order with times, what's now/next, lyrics following the screen.
- Musicians: chords in the service key, notes from the team.
- Operators (PIN / login): move slides from their phone, black screen.
- Sync over the local network (WebSocket); works without internet.

### 2.7 People and outreach
- **Connect card by QR code:** guests and members fill in their details on their phone.
- GDPR: explicit consent tick box, exact consent text stored, unsubscribe, delete on request.
- Follow-up team gets tasks (email, call, visit, gift) for new people.
- Campaigns (e.g. Christmas invitation) with a digital flyer: email first (free);
  SMS and WhatsApp Business later (paid per message).

### 2.8 Live stream
- Phase 1: stream overlay page for OBS (browser source), lyrics with transparent background.
- Phase 2: control OBS from the app (obs-websocket): start/stop stream, switch scenes.
- Phase 3: NDI output from the presenter.

### 2.9 Local AI assistant
- Runs on one church computer with Ollama (e.g. a small Llama / Qwen / Gemma model). Documents never leave the church.
- Jobs: split imported lyrics into sections, read photos of notes (vision model), summarise meetings,
  month-end objective review, search documents.
- Every AI result is a **suggestion** a person confirms; the AI never changes data on its own.

## 3. Architecture

```
            Supabase (cloud, free tier)            ← shared song library, plans, teams, meetings
                   ▲   sync when online
                   │
 ┌─────────────────┴──────────────────┐
 │  Mac Mini at church                │
 │  • Desktop app (Tauri + React)     │  ← leaders plan, operators run screens
 │  • Local Hub (Node, WebSocket)     │  ← screens + phones on church Wi-Fi, offline-safe
 │  • Ollama (local AI)               │
 └──────┬──────────┬──────────┬───────┘
     projector   stage TV   phones (browser, no install)
```

- `packages/core` — song engine (parse, transpose, slides, import). One TypeScript file shared by everything.
- `apps/local-hub` — **working today**: presenter control, main screen, stage screen, phone live view.
- `apps/desktop` — Tauri app (to build): planning, teams, network hub, library; embeds the hub.
- `supabase/` — database schema with security rules, tested.

## 4. Non-goals (for now)
- Online giving / payments.
- Building our own video streaming server (use YouTube/Facebook via OBS).
- Full ProPresenter feature parity — only what small churches need.

## 5. Legal notes
- GDPR applies to the contacts database (Romania / EU). Get advice from someone qualified before collecting data.
- Song lyrics are copyrighted: projecting in church usually needs a licence (e.g. CCLI). Importing from websites is for the
  church's own use; respect each site's terms. The shared library should store `source_url` and `ccli` where known.
