# Starea aplicației: ce e făcut (21 noiembrie 2026, versiunea 2026.11.22.7)

Totul de mai jos e în cod și publicat. Unde scrie **„neverificat”**, merge în teste, dar n-a fost încercat pe
aparatura reală. Asta e primul lucru de verificat (vezi PLAN.md, Pasul 0).

## Structura: trei uși
La pornire alegi: **Planificare** (planning.html), **Proiectez** (control.html?mode=proiectez) sau
**MD&TRACK** (control.html?mode=cant). Mai există „Toate funcțiile” (mode=complet).
Asistentul ✦ e mereu în bara de sus, în toate zonele.

## Planificare (`public/planning.html`, `src/plan.js`, `src/pco.js`)
- Servicii cu momente: cântare, predică, anunțuri, rugăciune etc. Totul e editabil: titlu, tip, minute, ordine
  și mărime (zoom). Fiecare moment are sticlă colorată după tip.
- La predică poți atașa o prezentare: PowerPoint, PDF, imagini sau Canva.
- Echipe și roluri (grilă lunară), „Duminica e gata?” (ce lipsește), mai multe biserici, cu un program pentru fiecare.
- Import din **Planning Center**, câte un cont pe biserică (2 conturi). Versiunea din PCO poate înlocui cântarea din bibliotecă.
  Potrivirea (2026-11-28, `sameSongs`): id PCO, titlu, titlu cu număr/paranteze + aceleași versuri, sau aceleași prime versuri;
  cu „PCO e corect” dublurile se unesc (programele sunt mutate pe cântarea păstrată).
- Cântări: de câte ori s-a cântat fiecare în ultima perioadă, categorii cu etichete și etichetare în bloc.
- Asistent: scris sau vorbit, plus fișiere și poze. Face programul și pune **cântările reale din bibliotecă**
  (add_songs și pick_songs, cu căutare iertătoare, ex. „adorare” găsește „Închinare”). Are și modul „💡 Părere”,
  care strânge propuneri de dezvoltare în Documents/Betleem/propuneri.md.
- Clic dreapta și scurtături (copiază, taie, lipește, șterge, duplică). Lipești sau tragi orice fișier în program.
- **📄 PDF** la fiecare serviciu (`public/print.html`): programul cu ore, moment, cine, ton și minute, opțional cu
  echipa (doar nume) și cu acordurile cântărilor. Se salvează ca PDF din fereastra de tipărire.
- **Voluntari** (`src/plan.js` cannotServe, `public/eu.html`, ruta `/api/eu`):
  - Fiecare om are un **link personal**, fără parolă. Îl văd doar liderii, iar „↻ Link nou” îl anulează pe cel vechi.
  - Pe link își vede programările, confirmă (✓ Vin / ✕ Nu pot), își blochează duminicile și își pune limita
    „maxim N pe lună”, plus sarcinile lui și agenda liderilor (dacă e bifat „lider”).
  - Pe server, nu poate fi pus în ziua blocată sau peste limită; în listă apare gri, cu motivul.
  - 💬 WhatsApp pe fiecare loc din echipă și „💬 Anunță echipa”: mesaj gata scris, liderul apasă Trimite (gratuit).
  - Merge pe Wi-Fi-ul bisericii până la Pasul 11.
- **🗓 Lideri** (tab nou în Planificare):
  - întâlniri, cu agenda văzută din timp pe linkul personal, bife pe puncte, notițe și „→ sarcină”;
  - sarcini: ce, cine, până când, gata; insignă roșie cu cele care expiră în 2 zile sau au trecut;
  - 📅 fișier de calendar (.ics) cu reminder.
  - Asistentul: `add_agenda`, `add_task` (după nume), `leaders_tasks`.
- **▦ QR pentru birou** (`print.html?qr=1`): un afiș cu cod QR care deschide mereu programul următor
  (`live.html?v=next`, ruta publică `/api/next`, fără PIN și fără date personale). Merge doar pe Wi-Fi-ul bisericii
  până la Pasul 3.

## Proiectez (`public/control.html`, `main.html`, `stage.html`)
- Slide-urile în listă arată ca în ProPresenter (2026-11-28): ecrane mici 16:9 cu fundalul și fontul de pe proiector,
  bandă colorată dedesubt cu numărul și secțiunea, „PE ECRAN” pe cel live (stilul `#pp-slides`).
- Programul și Cântările se ascund cu mânerul ‹ / › (bară subțire, clic = înapoi); retragerea automată pe ecran e opțională ( `.main.auto`, stilul `#pp-rails`,
  oprire din Vizualizare). Dublu-clic pe previzualizare pornește/oprește proiectorul sau scena (`screenHere`/`closeScreen`,
  `S.screensOpen`, `outputEvents` în client.js); punct verde = ecran pornit. Neverificat pe Mac mini.
- Versuri, Biblie, PowerPoint și PDF (pe Mac prin Keynote, pe Windows prin PowerPoint, altfel prin randarea proprie),
  ProPresenter și FreeShow (import), Canva (neverificat cu cont real).
- Fundaluri: 15 imagini și 4 video incluse, ale tale și ștergere în coș cu anulare.
- Bara de sus: **⏻ Ecran gol** (merge și cu Esc), **🖥** (arată sau ascunde previzualizarea ecranelor), **⏱**
  (numărătoare cu fundal) și **mesaj** pe sală, pe scenă sau peste tot.
  Slide-urile se schimbă cu Spațiu / → / ← și cu clic.
- Ecran de scenă ca în ProPresenter (2026-11-28): slide-ul următor pe toată lățimea sub versuri, „În program” pe un rând lung jos.
- ⌘C / ⌘V pe slide-uri (mai multe cu ⇧/⌘-clic), și între cântări (`pasteSlides`). Editorul ✎: scrii direct pe slide, se salvează la închidere.
- Aranjamente ca în ProPresenter: rândul „Secțiuni” + aranjamente cu nume pe cântare (`song.arrangements`, `it.arrangementName`).
  Nume standard Verse/Chorus/Bridge (🏷, `db.labelStd = 'en'`). ✂ Rupe slide-ul în editor (`breakSlide`). Neverificat pe Mac mini.
- Ecran de scenă cu **timerul slujbei**: suma minutelor din plan, pornește la prima cântare, galben la 5 min,
  portocaliu la 3 min, roșu care pulsează când trece de timp.
- Selector de program cu **+** pentru import rapid din PCO. Lista de servicii se strânge când începe slujba.
- 📱 **Telefoane**: cod QR care deschide pe telefon programul și cântările cu acorduri, live.
- 🎤 **Modul Predicator** (`live.html?v=pred`, al treilea QR din 📱, cu PIN propriu și „↻ PIN nou”): slide-ul de
  acum și următorul, notițele din Planificare, timpul rămas, butoane mari ◀ ▶. Merge și cu un clicker sau cu
  tastatura. Poate mișca doar slide-urile predicii și nu trece în alt moment. În regie apare
  „🎤 Predicatorul · Preia” în bara de sus. Rolul `preacher` e pe server (`sermonIndex`, `case 'preacher'`).
  Neverificat pe telefoane reale.
- 📥 **Primite**: fișiere trimise de pe telefon (QR) sau prin AirDrop.
- Mod zi și noapte (☀), mod rapid pentru calculatoare slabe, Setări în carduri.

- **Tranziții text** (23 nov): `tr` (cut/fade/crossfade/dissolve) și `trDur` în setările ecranului (`cleanDisplay`), pe cântare
  și pe slide (editorul de slide). `swapText` în main.html (stratul vechi `.txt.ghost`). Imaginile fără tranziție proprie
  folosesc stingere. Verificat în browser.
- **Acorduri pe toate secțiunile** (23 nov): `fillChords` / `chordsOnSameSyllables` / `syllableStarts` în song.ts (test),
  apelat din `normalizeImported` (toate importurile), din ♪ (editor, local) și din jobul ♪ al bibliotecii (`src/chords.js`,
  care acum încearcă și alte site-uri prin `searchLyrics`). Unealta asistentului `fill_chords`.
- **Fereastra de proiecție pe Mac**: dacă macOS o ține sub bara de meniu (aplicație instalată înainte de 22.10), hub-ul
  deschide propria fereastră cu `enableLargerThanScreen` și o parchează pe cea veche (`coverFor` în server.js). Neverificat pe Mac.

- **🧱 Straturi și 🏷 Props** (23 nov): `public/layers.js` (renderLayers + LayerEditor, aceleași pe proiector și în editoare);
  `cleanLayers`, `slideLayers`, `saveProp/deleteProp/toggleProp/propsOff` în server.js (cu ↶); `it.layers` (toată cântarea),
  `it.slideLayers[n]` (un slide), `db.props`. main.html: #lyUnder, #lyOver, #props. Verificat în browser.
- **Acorduri cu literă mică și secțiuni pe același rând** (23 nov): `chordName`, `splitInlineLabels`, `needsChordCleanup`
  în song.ts (test); curățare o dată la pornire (`db.migrated.chordLines`).

- **⇪ Import ProPresenter** (23 nov): `src/propresenter.js` (cititor protobuf mic + RTF, câmpurile din
  greyshirtguy/ProPresenter7-Proto, MIT; .pro6 XML), `/api/import/propresenter`, `/api/songs/same` (avertisment la cântare
  nouă), butonul ⇪ în Bibliotecă. Test cu fișiere generate; neverificat pe fișiere .pro reale.

- **MD&TRACK grilă + Ableton** (24 nov): `grid()`, `snapT`, `timeHtml` în control.html; `src/ableton.js` (markere, tempo
  cu rampe, măsura; fapte din dawtool, BSD-3, cod propriu), `/api/import/ableton`, butonul ⇪ Ableton. Test cu seturi generate.
- **✍ Corectare text** (24 nov): `/api/songs/fix` (AI local/Claude; păstrează acordurile, respinge rândurile schimbate prea
  mult), automat la cântare nouă, butonul ✍ în Editor. Verificat cu un AI de probă.

- **📱 Aplicația de telefon** (24 nov): `public/m.html` (Planificare în iframe, Proiectez slide-uri/acorduri, MD&TRACK prin
  mesajele `md` / `mdState` / `mdAsk`, doar transmise de hub, fără salvare). Aplicația iPhone: `apps/ios` (Capacitor 7, SPM,
  `www/index.html` = ușa care ține minte adresa și deschide `/m.html`; ATS permite rețeaua locală). Neverificată pe iPhone.

- **Un singur QR pentru telefoane** (2026.11.24.11): Live → 📱 arată un cod spre /m.html; m.html are ecranul „Ce faci azi?”
  (#who: app / musician → live.html?v=chords / lyrics → live.html / preacher → live.html?v=pred cu PIN), ținut minte în
  localStorage `m.who`; ⇄ în m.html și live.html (m.html?alege=1) schimbă rolul. Verificat în Playwright (iPhone 13).
- **Toată piesa pe ecran** (2026.11.24.22): `public/fit.js` (fitWhole/unfit: coloane + cea mai mare literă care încape);
  live.html (#lyrics) și m.html (#sChart) îl folosesc când „Urmează ecranul” e debifat. Verificat în Playwright (iPhone 13).

- **🎭 Looks** (2026.11.24.14): db.looks [{id,name,main,stage?,background?,props?}] + db.lookOn; mesaje saveLook (take:{stage,background,props}),
  applyLook, deleteLook, itemLook (it.look → aplicat la `go`); 3 Looks de start; undo. UI: #qLookSel în bara rapidă, #looksBox în ⚙ Ecrane.
  Asistent: apply_look. Test: hub.test.js „🎭 Looks”. Verificat cu Playwright.

- **📦 Pachet pentru alte biserici** (2026.11.24.16): server.js `buildPackage` (ditto din aplicația care rulează + hub-ul curent
  + hub/starter/library.json doar cu cântări) în Documents/Betleem/descarca; linkuri `db.shares` (token, expiră), `/api/shares`
  (lider, nu prin ușă), `/api/descarca[?t]` + `/descarca.html#t=` (și prin ușă; ghicirea = blocare). UI: ⚙ → 📦.
  Construirea pachetului e **neverificată pe Mac** (în teste: doar linkurile).

- **Reverb online, pasul 1** (2026-11-24): baza de date Supabase cu biserici, rețele, roluri (coordonator/lider/membru),
  cântări (biblioteca rețelei citită de bisericile ei), programul ca document, telefoane separat, linkuri (doar amprenta).
  Reguli RLS testate (`supabase/tests/cine-vede-ce.sql`). Încă nelegată de aplicație. Detalii: docs/PLANIFICARE-ONLINE.md.

- **Engleza lângă cântare (2026.11.28.16, verificat în browser):** 🇬🇧 în Bibliotecă (caută pe web / lipești) → `song.en`
  (`setEnglish` în server.js); folder virtual „Bilingv” (`/api/tags`, `tagMatch`); 🌐 Bilingv lângă aranjament
  (`itemBilingual`, `withEnglish()` în server.js pune `slide.second` pe secțiunea cu același nume; main.html `.v2.en`).
  Căutare web RO+EN (`websearch.js`), acorduri din chord charts (`extract.js`, netestat pe pagina reală: proxy-ul blochează).

## MD&TRACK (`public/control.html`, `public/music.js`, `public/pitch-worklet.js`, `public/voice.js`)
- Bara de sus: ton, titlu, play/pauză, secțiunea anterioară și următoare, măsura, BPM, click.
- Mixer digital: fadere cu numele dedesubt, mute, solo, pan, **rutare pe ieșirile plăcii de sunet**, track nou,
  click și pad pe ieșiri separate (neverificat pe placă reală).
- Tempo schimbă viteza tuturor track-urilor, iar tonul schimbă tonul tuturor (pitch-shift; calitate neverificată).
  Click-ul e sincronizat cu track-ul.
- Secțiuni: marcaje vizibile pe track. Clic pe o secțiune sare acolo la măsura următoare. Structura cântării se
  poate copia sau rearanja din etichete.
- „Învață cue-urile” e **manual**: apeși pe slide-uri în timp ce asculți.
  „Secțiunile din track-ul de cue” e **AI**: ascultă ghidul vorbit și pune marcaje. **Nu merge încă la proprietar**:
  descărcarea Whisper rămânea la 0%, iar track-ul trebuie să aibă „Cue” sau „Guide” în nume.
- Comenzi vocale (sări la refren, oprește tobele) și microfonul MD de pe o intrare a plăcii, pentru talkback
  (neverificat).

## Adăugate pe 22 noiembrie (pașii 3–20)
- **Secțiuni automat** (MD&TRACK, butonul „✦ auto” din rândul Secțiuni sau din ⋯):
  - găsește singur track-ul cu ghidul vorbit (după nume sau ascultând care track e aproape mereu liniștit);
  - îl ascultă cu Whisper: descărcarea arată progresul real și se oprește cu un mesaj clar dacă internetul cade;
  - dacă vocea nu se poate folosi, ia pauzele din ghid ca locuri și numele din ordinea cântării;
  - marginea stângă a unei secțiuni se poate trage; harta rămâne pe cântare.
  - `public/voice.js` (speechBursts), `aiCues` în control.html.
- **Track virtual** pentru cântările fără track-uri (`public/guide.js`):
  - click + pad în ton + ghid vorbit, cu o măsură înainte de fiecare secțiune, plus numărătoare la început;
  - harta e în măsuri (`song.guide`) și se construiește live cu tastele 1–9 sau cu clic dreapta → „Pune aici”;
  - vocile vin din Documents/Betleem/ghid (sau din ghid-voci.zip, dezarhivat singur); fără ele vorbește vocea calculatorului;
  - ghidul are rutare proprie („Ghid vorbit”).
- **💡 Lumini** (tabul de lângă Fundaluri, `public/lights.js`):
  - scene MIDI (CC cu trecere lină, notă, program), cu „🎓 Învață” din pupitru;
  - pornesc de mână sau singure la un moment din program ori la o secțiune a cântării;
  - trimite doar calculatorul bifat „Lumini de pe acest calculator”.
  - Neverificat cu dimmer-ul Eurolite.
- **Pe telefon ca aplicație**: manifest și iconiță (Planificare, Live, linkul personal). Liderii intră de acasă prin
  Tailscale (instrucțiunile sunt în ⚙ → 🔒).
- **Predicatorul își trimite prezentarea** de pe linkul lui. Fișierul ajunge în 📥 Primite, iar momentul Predică
  arată „📎 de la …”.
- **✦ Completează echipa** (și asistentul: `fill_team`): pune oamenii corect, după poziție, zile blocate, limita
  lunară și cine a slujit mai puțin.
- **📣 Mesaje de la păstor** (Lideri): către toată echipa, cei dintr-un serviciu sau un departament. Apar pe pagina
  fiecăruia și se trimit pe WhatsApp, om cu om.
- **🎹 Pad-uri înregistrate** (Documents/Betleem/pad, câte un fișier pe ton) și **🔗 folderul comun de track-uri**
  (Documents/Betleem/trackuri/<cântare>/).
- **Îmbinări**: asistentul (`add_part_of_song`) pune o parte din altă cântare după o poziție, în același ton.
- **🎯 Obiective, 📊 „oameni sau programe”** (pe luni, după focusul fiecărei sarcini) și **📓 jurnal personal** pe
  linkul liderului. Rezumatul săptămânii îl face doar AI-ul local; jurnalul nu pleacă în cloud.
- **📷 Fotografi**: încarcă originalele de pe linkul lor, într-un folder pe eveniment (pe NAS, dacă e setat).
  Reiau încărcarea de unde au rămas. Căutarea cu AI se face prin Immich (de instalat).
- **ProPresenter**: comparația și ordinea în docs/PROPRESENTER.md.
- **🎨 Aspect și funcții** (River): culoarea bisericii și modulele ascunse, în Documents/Betleem/personalizare.json.
  Actualizările nu le ating.
- **Ecranul de proiecție pe Mac** nu mai folosește ecranul complet al macOS, deci nu mai ia celelalte monitoare.
  E în aplicația desktop (main.cjs), deci cere reinstalarea aplicației.

## Asistentul (`src/ai.js`)
- Claude (cu cheia bisericii, pusă în Setări) sau Ollama local (qwen2.5; pentru poze, qwen2.5vl).
- Instrumente: caută și pune cântări, alege cântări, structura și aranjamentul cântării, track-uri, fundaluri,
  statistici, editează momentele, citește poze.
- Modelul local de 7B e slab la cereri complicate. Instrumentele simple (add_songs, pick_songs) îl ajută.

## Instalare și actualizări (`apps/desktop/main.cjs`, `src/updater.js`, `scripts/`)
- Aplicație Electron pentru Mac și Windows, cu fundaluri și biblioteca de pornire incluse (installer 2026.11.20.5).
- Actualizări **semnate** (Ed25519), puse pe ramura `actualizari` din GitHub. Fiecare Betleem verifică la 30 de
  secunde după pornire și apoi la 30 de minute. Actualizarea se aplică la repornire.
  Betleem ▾ → Caută actualizări o forțează.
- Publicare: `node scripts/publish-update.mjs <cheia privată>`.

## Securitate (vezi docs/SECURITATE.md)
- Pe rețeaua bisericii, cu PIN-uri pe roluri (vizualizare, operator, lider, predicator). Ce intră pe calculatorul
  însuși e de încredere; cererile din internet nu sunt niciodată tratate așa (`localReq`, `req.viaDoor`).
- **Ușa pentru voluntari** (⚙ Setări → 🔒): același server mic de pe 127.0.0.1 care primește fișiere de pe telefon
  (`sendServer`, port PORT+1 = 4546) răspunde, când liderul o deschide, DOAR la /eu.html, /api/eu, /api/next,
  /live.html?v=next și fișierele lor. Restul: 404. Tunel: Tailscale Funnel (adresă https fixă). Linkurile
  voluntarilor și QR-ul de la birou folosesc adresa publică atunci când e setată.
- Încercările de PIN sunt limitate (5 greșeli → blocare 1 min, apoi tot mai mult). La fel linkurile ghicite din
  internet (429). Antete de siguranță pe toate răspunsurile (no-referrer, nosniff, sameorigin).
- Copie zilnică în Documents/Betleem/backup (30 de zile) și pe NAS, dacă e setat.
- Jurnal de intrări din internet în `acces-internet.log` (doar o amprentă a adresei).
- Cheile (PCO, Canva, Claude, semnătura) stau doar pe calculator. Numerele de telefon nu se transmit.
- **Neverificat:** Tailscale Funnel și NAS-ul real.

## Încă deschise din urmă
- Iconița aplicației din logo (trebuie un PNG de minim 512 px).
- Installer refăcut cu biblioteca după importul din PCO.
- Pe Mac, aplicația trebuie reinstalată din Betleem-mac-nou.zip (pentru permisiunea Keynote).
- PowerPoint-ul VITAL nu a fost primit pentru test.
- Clic dreapta în Echipe și în Grila lunară. Meniurile native ale sistemului (acum meniurile sunt în aplicație).

## 2026-11-25 (2026.11.25.1 + Reverb online)
- **Numele bisericii în față, Reverb discret:** `public/reverb-mark.css` (`.rv-mark` fundal lucios, `.rv` „powered by”) în
  control.html, planning.html, m.html; ușile: „Bine ai venit în biserica X”; titlul = numele bisericii. Verificat (Playwright).
- **QR fără Predicator** (m.html); `m.html?tab=tLive|tMd|tPlan` intră direct (folosit din linkul personal).
- **Reverb online `apps/web/index.html`:** tab-uri 🗓 Program / 🎵 Cântări / 👥 Oameni; „Ce faci azi?” (Planific; Proiectez și
  MD & Track spre `churches.hub_url`, doar pe Wi-Fi-ul bisericii); logoul bisericii (`churches.logo_url`); Program cu
  `core/plan.js` (copie din `src/plan.js`). Detalii: docs/PLANIFICARE-ONLINE.md. Verificat cu biserici de probă (șterse).
- **🔗 Reverb online ⇄ Planificarea** (2026.11.25.2): `src/reverb-sync.js` (merge3, adoptPeople, alignDepartments, runner),
  `/api/reverb`, ⚙ → 🔗 Reverb online în control.html; online: `supabase/functions/reverb-hub`, `hub_devices`. Teste:
  `test/reverb-sync.test.js` (70 trec). Pagina linkului: zonele 🗓 Planific / ▶ Proiectez / 🎛 MD & Track / 👥 Oameni,
  pe laptop în două coloane. 2026-11-28: copia convenită e o copie separată (structuredClone), iar un serviciu schimbat
  în ambele locuri se îmbină pe momente și locuri (`mergeService`); reparat bug-ul cu programe și cântări care dispăreau
  (neverificat încă pe Mac mini).
- **🔔 + ✎ (2026.11.25.3):** Web Push (`apps/web/sw.js`, `reverb-notify`, `push_subs`, `push_sent`, cheile în `app_secrets`);
  editor de cântări în link (`#vEdit`, RLS `private.can_edit_songs`, `song_versions` cu trigger); sincronizarea cântărilor
  în `src/reverb-sync.js` (`songsPull` / `songsPush` în `reverb-hub`). Teste: 71 trec.

## Aspect (2026-11-25, 2026.11.25.4)
- `apps/local-hub/public/calm.css`: stratul de aspect calm (grafit, accent albastru #4d7cff, fără aurora, iconițe SVG `svg.ic`), încărcat după `glass.css` în control.html și planning.html. Verificat cu capturi (ușile, Proiectez, Setări, Planificare, zi, telefon).
- `apps/web/index.html`: același limbaj (tokens în `:root`), verificat telefon / tabletă / desktop.
- **Pregătește de acasă** (`apps/web/index.html`, `drawToday`/`openItem`): editorul unui moment din program, același pentru
  Proiectez și MD & Track; miniaturi în `apps/web/bg/`, cărțile Bibliei în `apps/web/core/bibleref.js` (copie din hub).
  Liderii salvează cu `setItems`; Închinarea cu `reverb_plan_item` (migrarea 20261125140000, doar ton + ordine la cântări).
  Verificat cu Playwright (lider + muzician, telefon și desktop). **Neverificat:** pe Mac mini, cu programul sincronizat.
- **Reverb.dmg** (`buildPackage` în `src/server.js`, `public/descarca.html`): ditto → plutil (nume Reverb) → codesign ad hoc --deep → hdiutil UDZO, cu scurtătură „Aplicații”. Se face doar pe Mac. **Neverificat pe Mac** (scris aici, pe Linux).
- **Sincronizarea stem-urilor** (`public/music.js` `alignAt`, `keepInStep`): pornire aliniată, corecție prin viteză (±2 %), salt doar peste 150 ms. Test: `test/music-sync.test.js`; măsurat în Chromium fără placă. **Neverificat pe Mac mini.**
- **Motor nou (probă)** (`public/stem-worklet.js` StemCore/StemProcessor, `public/music.js` StemEngine; comutator ⚙ Rutare → Motor audio, preferința `betleem.music.engine = "nou"`): un ceas, WSOLA comun, salturi pe ceas (`mt.jumpAt`). Teste: `test/stem-engine.test.js`. **Neverificat pe Mac/placă.**
