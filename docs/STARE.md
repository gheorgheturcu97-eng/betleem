# Starea aplicației: ce e făcut (21 noiembrie 2026, versiunea 2026.11.21.11)

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
- Cântări: de câte ori s-a cântat fiecare în ultima perioadă, categorii cu etichete și etichetare în bloc.
- Asistent: scris sau vorbit, plus fișiere și poze. Face programul și pune **cântările reale din bibliotecă**
  (add_songs și pick_songs, cu căutare iertătoare, ex. „adorare” găsește „Închinare”). Are și modul „💡 Părere”,
  care strânge propuneri de dezvoltare în Documents/Betleem/propuneri.md.
- Clic dreapta și scurtături (copiază, taie, lipește, șterge, duplică). Lipești sau tragi orice fișier în program.
- **📄 PDF** la fiecare serviciu (`public/print.html`): programul cu ore, moment, cine, ton și minute, opțional cu
  echipa (doar nume) și cu acordurile cântărilor. Se salvează ca PDF din fereastra de tipărire.
- **▦ QR pentru birou** (`print.html?qr=1`): un afiș cu cod QR care deschide mereu programul următor
  (`live.html?v=next`, ruta publică `/api/next`, fără PIN și fără date personale). Merge doar pe Wi-Fi-ul bisericii
  până la Pasul 3.

## Proiectez (`public/control.html`, `main.html`, `stage.html`)
- Versuri, Biblie, PowerPoint și PDF (pe Mac prin Keynote, pe Windows prin PowerPoint, altfel prin randarea proprie),
  ProPresenter și FreeShow (import), Canva (neverificat cu cont real).
- Fundaluri: 15 imagini și 4 video incluse, ale tale și ștergere în coș cu anulare.
- Bara de sus: **⏻ Ecran gol** (merge și cu Esc), **🖥** (arată sau ascunde previzualizarea ecranelor), **⏱**
  (numărătoare cu fundal) și **mesaj** pe sală, pe scenă sau peste tot.
  Slide-urile se schimbă cu Spațiu / → / ← și cu clic.
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

## Securitate (cum e acum)
- Funcționează doar pe Wi-Fi-ul bisericii, cu PIN-uri pe roluri (vizualizare, operator, lider). Nimic deschis spre internet.
- Cheile (PCO, Canva, Claude, semnătura) stau doar pe calculator. Numerele de telefon nu se transmit niciodată.

## Încă deschise din urmă
- Iconița aplicației din logo (trebuie un PNG de minim 512 px).
- Installer refăcut cu biblioteca după importul din PCO.
- Pe Mac, aplicația trebuie reinstalată din Betleem-mac-nou.zip (pentru permisiunea Keynote).
- PowerPoint-ul VITAL nu a fost primit pentru test.
- Clic dreapta în Echipe și în Grila lunară. Meniurile native ale sistemului (acum meniurile sunt în aplicație).
