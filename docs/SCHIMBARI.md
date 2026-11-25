# Schimbări: ce funcționa înainte și cum funcționează acum
Cele mai noi sunt sus. Claude Code adaugă aici o linie la fiecare schimbare de comportament (regula de aur din CLAUDE.md).

## 2026-11-25 · 2026.11.25.3 · 🔔 notificări, ✎ cântări scrise și corectate din link
- **„Ești programat”** stă acum sus, colorat și pulsând, pe toate zonele (pe telefon înaintea tab-urilor, pe laptop în
  stânga), cu „nou” la locurile neconfirmate. Înainte: un card obișnuit în Planific.
- **🔔 Notificare când ești programat.** Înainte: nimic. Acum: „Anunță-mă când sunt programat” → Pornește. Când un lider
  te pune pe un loc (din link sau din Planificarea de la biserică) primești pe telefon „Ai fost programat · Vocal ·
  duminică 29 noiembrie, 10:00”; apăsând, se deschide programul. Pe iPhone merge după „Adaugă pe ecranul principal”.
  (Web Push: `sw.js`, funcția `reverb-notify`, tabelele `push_subs` / `push_sent`.)
- **✎ Cântări din link.** Înainte: doar citire. Acum: liderii, coordonatorii și echipa de Închinare a bisericii scriu
  cântări noi (text și acorduri, cu previzualizare) și corectează acordurile direct din cântare (✎). Fiecare schimbare
  păstrează varianta de dinainte („Pune înapoi”). Ce se scrie sau se corectează online intră singur în biblioteca de pe
  calculatorul bisericii, iar cântările de pe calculator urcă online (cea mai nouă variantă câștigă; o copie a
  bibliotecii se face înainte, cel mult o dată pe oră).

## 2026-11-25 · 2026.11.25.2 · 🔗 Planificarea de la biserică ⇄ linkurile oamenilor; linkul cu cele 3 zone
- **Un singur program.** Înainte: ce se planifica pe link nu apărea în Planificarea de pe calculatorul bisericii (și invers).
  Acum: după ce legi calculatorul o dată (⚙ → 🔗 Reverb online, cu cheia din link → Planific → „🔗 Leagă calculatorul
  bisericii”), e un singur program: ce schimbi pe calculator apare pe telefoane în câteva secunde, ce se planifică pe
  telefon apare pe calculator în cel mult un minut. Dacă amândoi schimbă același serviciu: câștigă telefonul, în afară
  de programul de pe ecrane (acolo câștigă calculatorul). Oamenii cu link devin voluntarii bisericii (cu același nume
  își păstrează locurile). **Telefoanele, e-mailurile și linkurile voluntarilor nu pleacă de pe calculator.** Fără
  internet nu se schimbă nimic. Calculatorul își trimite singur adresa (pentru Proiectez / MD & Track din link).
  Cod: `src/reverb-sync.js` (+ teste), `/api/reverb`; online: funcția `reverb-hub`, tabelul `hub_devices`.
- **Linkul: cele 3 zone.** Înainte: tab-uri Program / Cântări / Oameni + „Ce faci azi?”. Acum: 🗓 Planific (programul și
  echipa), ▶ Proiectez (deschide Proiectez pe Wi-Fi-ul bisericii + programul de azi în ordine), 🎛 MD & Track (deschide
  MD&TRACK + toate cântările, ca să repeți acasă), 👥 Oameni (coordonatori). Pe telefon: tab-uri sus; pe laptop: coloană
  în stânga cu biserica și zonele, conținutul în dreapta.

## 2026-11-25 · Reverb online · Planific curat și profesionist
- Înainte: fiecare serviciu avea toate butoanele și listele de oameni deschise, cu iconițe peste tot.
  Acum: lista e calmă: data, numele, ora, câte cântări, câți oameni pe câte locuri (cu bară de confirmări). Deschis:
  Programul numerotat (titlu, ton, tipul momentului, minute) și Echipa pe departamente (punct colorat, „Confirmat /
  În așteptare / Nu poate”). Liderii apasă „✎ Editează” ca să mute/scoată momente, să pună oameni și să redenumească;
  „Gata” închide editarea. Pe calculator, Programul și Echipa stau una lângă alta.

## 2026-11-25 · 2026.11.25.1 · numele bisericii în față, Reverb discret; QR fără Predicator
- **Numele.** Înainte: aplicația se prezenta „Reverb”, cu numele bisericii mic. Acum: fiecare biserică e întâmpinată cu
  numele ei („Bine ai venit în biserica Betleem”, cu logoul ei dacă îl are); Reverb rămâne discret: „powered by Reverb”
  sub numele bisericii și logoul Reverb lucios, abia vizibil, în fundal (Proiectez, Planificare, aplicația de telefon, ușile).
  Titlul ferestrei = numele bisericii. (`public/reverb-mark.css`.)
- **QR „Ce faci azi?”** Înainte: Echipă / Muzician / Versuri / 🎤 Predicator. Acum: fără Predicator: predicatorul schimbă
  slide-urile din Proiectez (cine îl alesese ajunge direct acolo). Muzician și Versuri rămân până primesc toți linkul.
- **Din linkul personal în aplicația de la biserică.** `m.html?tab=tLive|tMd|tPlan` deschide direct acea parte.

## 2026-11-25 · Reverb online (pagina linkului, fără actualizare de aplicație)
- **🗓 Program.** Înainte: linkul arăta doar biserica și cântările. Acum: tab-ul Program: serviciile care vin, ce se cântă,
  cine slujește; „Unde slujesc eu” cu ✓ Pot / ✕ Nu pot; „Zile în care nu pot”. Liderii și coordonatorii planifică de
  acolo: ＋ 8 duminici / ＋ serviciu, momente și cântări (din bibliotecă), oameni pe poziții, redenumește / șterge.
  Același `plan.js` ca Planificarea din aplicație. **Încă nu se leagă cu Planificarea de pe calculatorul bisericii** (pasul următor).
- **Ce faci azi?** Planific (de oriunde) · Proiectez · MD & Track (deschid aplicația de la biserică, doar pe Wi-Fi-ul ei;
  coordonatorul scrie o dată adresa calculatorului).
- **Întâmpinarea:** numele și logoul bisericii (coordonatorul pune logoul), Reverb mic sus și „powered by Reverb” jos,
  logoul Reverb lucios în fundal.

## 2026-11-24 · Reverb online · cântările pe telefon (fără actualizare de aplicație)
- **🎵 Cântări în Reverb online.** Înainte: pe telefon vedeai doar cântările de pe programul de azi, și doar pe Wi-Fi-ul
  bisericii. Acum: oricine are link Reverb din Rețeaua Betleem deschide **orice cântare** din biblioteca Betleem (628),
  de oriunde, ca să repete: caută, schimbă tonul, acorduri da/nu, ⤢ toată pe ecran (sau derulat). Nu o pune pe program.
  Versurile stau în cloud doar pentru bisericile rețelei (regula e în baza de date); bisericile din afară nu le văd.
- **Departamente:** Betleem are și Tineret; Râul Vieții are Închinare și Tineret.

## 2026-11-24 · 2026.11.24.22 · toată piesa pe ecranul telefonului
- **Acorduri / versuri pe telefon, fără „Urmează ecranul”.** Înainte: debifat, vedeai piesa întreagă dar trebuia să
  derulezi. Acum: piesa întreagă încape pe ecran (literele cât de mari se poate, în 2 coloane pe telefon, secțiunile
  nu se rup între coloane), în live.html și în aplicația de telefon (m.html → Acorduri). Bifat: ca înainte, urmărește
  slide-ul de pe ecran. Pe telefon ținut culcat, dacă nu încape nici la litere mici, se derulează (nu taie nimic).

## 2026-11-24 · 2026.11.24.21 · logoul Reverb adevărat
- **Logoul.** Înainte: iconița cu unda + cuvântul „Reverb” scris cu un font obișnuit. Acum: semnul Reverb original
  (REVERB cu „V”-ul ca undă, de pe reverbw.com) pe ecranul de start, în Planificare și în Reverb online; iconița
  pătrată rămâne doar ca iconiță de aplicație.

## 2026-11-24 · 2026.11.24.20 · numele Reverb
- **Numele și iconița.** Înainte: „Echipa Betleem”, cu steaua aurie. Acum: **Reverb**, cu logoul Reverb (unda albă pe
  negru, de pe reverbw.com) în pagini, pe telefon (Adaugă pe ecranul principal), în fila browserului și în aplicație.
  Betleem rămâne numele bisericii (sus: „Reverb · Betleem”); un logo propriu al bisericii, dacă e pus, are întâietate.
  Folderul de date rămâne Documente/Betleem. Numele din Dock/meniul Mac se schimbă la următorul pachet de instalare.

## 2026-11-24 · 2026.11.24.19 · fundalurile de pe calculatorul principal, pe toate calculatoarele
- **Fundaluri → ⇩ De la alt calculator (nou).** Înainte: fiecare calculator își avea fundalurile lui; altele se puneau de
  mână. Acum: alegi un Betleem pornit în rețeaua bisericii (de ex. Mac mini-ul principal) și se copiază aici doar
  fundalurile care lipsesc (imagini și video), cu progres; cele șterse de tine nu revin.
- **Mac mini:** am adus în Betleem cele 87 de fundaluri video din ProPresenter (ProContent: Cathedral, Valley,
  Northern Lights…, fără countdown-uri).

## 2026-11-24 · 2026.11.24.18 · structura cântării în locul titlului, secțiunea schimbată din slide
- **Bara de deasupra slide-urilor.** Înainte: titlul cântării apărea a doua oară (era deja în program) și exista o listă
  🎭 Look. Acum: la o cântare, în locul titlului stă structura ei, mică (Strofa 1 · Refren · Strofa 2…): tragi ca s-o
  reordonezi, ✕ scoate, ＋ adaugă, ↺ revine (și în modul Proiectez). Lista 🎭 Look a plecat de acolo; Look-urile sunt în ⚙ Ecrane.
- **Secțiunea unui slide.** Înainte: doar din ✎ Editează. Acum: clic pe eticheta slide-ului (STROFA 1, REFREN…) și alegi
  alta (Strofa 1–4, Pre-refren, Refren, Bridge, Intro, Final, Tag sau alt nume). ⌘Z anulează.

## 2026-11-24 · 2026.11.24.17 · cântările pe Mac mini (ProPresenter + alt Betleem)
- **⇪ ProPresenter.** Înainte: citea tot din folderul ProPresenter, inclusiv anunțuri, teme, playlist-uri și
  countdown-uri, care ajungeau în bibliotecă drept „cântări”. Acum: citește doar bibliotecile de cântări (sare peste
  Anunțuri, Countdown, Predici, Themes, Playlists, Presets) și pune numele bibliotecii ca etichetă (Colinde,
  Înmormântare, FUSION…; „Songs” rămâne fără etichetă).
- **📥 lângă ⇪ în Bibliotecă (nou).** Adaugă cântările altui Betleem (library.json, o copie de siguranță sau fișierul
  de cântări din pachetul liderilor): doar cântările, fără oameni sau programe; cele care există deja nu se dublează.

## 2026-11-24 · 2026.11.24.16 · 📦 aplicația cu bibliotecă pentru bisericile din zonă
- **⚙ Setări → 📦 Dă aplicația altor biserici.** Înainte: aplicația se dădea ca fișier, fără cântări, și trebuia urcată
  de mână undeva. Acum: Mac-ul tău face singur pachetul (aplicația de Mac cu cea mai nouă versiune + toate cântările,
  fără track-uri, programe, oameni sau PIN-uri) și îl dă prin linkuri personale, câte unul pentru fiecare lider
  (expiră în 3/14/30 de zile, se anulează dintr-un clic, vezi câte descărcări). Liderul deschide linkul, apasă
  „Descarcă” și urmează pașii de pe pagină; la prima pornire are deja toate cântările.
  Linkurile merg pe Wi-Fi-ul bisericii și prin Tailscale; de oriunde doar cu 🔒 ușa deschisă. Nimic în GitHub.

## 2026-11-24 · 2026.11.24.15 · predicatorul intră din telefon
- **🎤 Predicator pe telefon.** Înainte: butonul „Intră” de lângă PIN ieșea din ecran pe unele telefoane, iar fără o predică
  în program pagina spunea doar „Nu există o predică”. Acum: PIN-ul și „Intră” încap pe orice telefon, cu „Fără PIN”
  pornit intră direct, iar pagina spune „Ai intrat ✔” și ce mai trebuie (o predică adăugată în program de regie).

## 2026-11-24 · 2026.11.24.14 · 🎭 Looks (idee din ProPresenter)
- **🎭 Looks.** Înainte: aspectul ecranului din sală se schimba setare cu setare (mărime, poziție, aliniere, tranziție…).
  Acum: un Look schimbă tot dintr-un clic. Sunt 3 gata făcute: ⛪ Serviciu (aspectul de până acum), 🙌 Închinare
  (mare, la mijloc, trecere lină) și 📖 Predică (jos, la stânga, mai mic). Le alegi din bara de deasupra slide-urilor
  (🎭) sau din ⚙ Ecrane. „＋ Salvează aspectul de acum” ține minte ce ai aranjat (la alegere și scena, fundalul, Props).
  Dublu-clic = redenumește, ✕ = șterge, ⌘Z anulează.
- **Un moment din program poate avea Look-ul lui** (⚙ Ecrane → „Momentul ales trece la”): când predica intră pe
  ecran, trece singur la 📖 Predică. Nimic nu se schimbă singur dacă nu alegi asta.
- **Asistentul** știe „pune Look-ul Predică” și „predica să treacă singură la Look-ul Predică”.

## 2026-11-24 · 2026.11.24.13 · 🔓 Fără PIN (comutator)
- **⚙ Setări → 🔓 Fără PIN.** Înainte: telefoanele cereau PIN-ul echipei (Proiectez, MD&TRACK) și PIN-ul de lider
  (Planificare). Acum: cu „Fără PIN” pornit, oricine e pe Wi-Fi-ul bisericii (sau Tailscale) intră direct ca lider, iar
  telefoanele deja conectate intră pe loc. De pe internet (🌐 ușa) tot nu se poate. Se oprește tot de acolo.
- **📱 Pe telefon.** PIN-ul de lider apare lângă cel al echipei; textul din Planificare arată unde îl găsești.

## 2026-11-24 · 2026.11.24.12 · PIN-ul echipei la vedere pe calculator
- **📱 Pe telefon.** Înainte: PIN-ul echipei nu apărea nicăieri în aplicație. Acum: apare lângă „Echipa media”, ca și al
  predicatorului (doar pe calculatorul bisericii, nu în rețea).

## 2026-11-24 · 2026.11.24.11 · un singur QR pentru telefon
- **📱 Pe telefon (Live).** Înainte: 4 coduri QR (Muzicieni, Aplicația, Echipă, Predicator). Acum: un singur cod, spre
  aplicația Betleem (/m.html). Prima dată telefonul întreabă „Ce faci azi?”: 🎛 Echipa media (Planificare, Proiectez,
  MD&TRACK), 🎸 Muzician (acorduri), 📖 Versuri, 🎤 Predicator (cere PIN-ul lui, afișat pe calculator lângă cod).
  Telefonul ține minte alegerea; ⇄ din colțul de sus schimbă rolul. Linkurile vechi (live.html…) merg mai departe.

## 2026-11-24 · 2026.11.24.10 · MD&TRACK citibil cu multe track-uri, asistentul local mai rapid
- **Rândurile track-urilor (MD&TRACK).** Înainte: cu 20+ track-uri, rândurile se striveau și numele se tăiau pe jumătate.
  Acum: peste 8 track-uri, fiecare are un rând curat (nume + M S); volumul e în mixerul de jos; restul se derulează.
- **Lista „Cântările” din MD&TRACK.** Înainte: titlurile lungi apăreau câte un cuvânt pe rând. Acum: titlul ocupă
  lățimea (max 3 rânduri), iar tonul/BPM coboară sub el.
- **Asistentul cu Ollama.** Înainte: qwen3 „gândea” minute întregi înainte de fiecare pas, iar orice întârziere apărea ca
  „Asistentul nu are încă un AI”. Acum: răspunde direct (fără gândirea lungă), modelul rămâne încărcat 30 min, iar mesajul
  spune clar ce e: „Ollama nu e pornit” sau „răspunde prea greu, mai încearcă”.

## 2026-11-24 · 2026.11.24.9 · mai ușor pentru placa grafică
- **Fundalul colorat din spatele sticlei (Live și Planificare).** Înainte: se mișca încet tot timpul, iar sticla îl
  re-încețoșa la fiecare cadru (~60% placă grafică pe M1 Pro). Acum: stă pe loc; arată la fel, iar placa grafică stă liberă.

## 2026-11-24 · 2026.11.24.8 · medley pe track-uri, pachete .zip
- **🎚 pe o înregistrare cu o altă cântare înăuntru** (ex. „Liber” cu bridge-ul din „Tu ești vrednic Domnul meu”). Acum:
  versurile care nu sunt din cântare sunt căutate în bibliotecă; partea găsită e pusă în program după cântare (în același
  ton) și, pe track-uri, versurile trec singure la ea și apoi înapoi („↪ Tu ești vrednic…” pe bandă).
- **＋ Track-uri.** Înainte: doar fișiere audio. Acum: și arhiva .zip a pachetului de multitrack (sau trasă pe MD&TRACK);
  fișierele audio dinăuntru devin track-uri, fără dezarhivare.

## 2026-11-24 · 2026.11.24.7 · Click + Guide în jurul unei înregistrări
- **MD&TRACK → ⋯ → 🎚 Click + Guide pe o înregistrare.** Acum: pui înregistrarea cântării ca track (YouTube, repetiție),
  iar aplicația îi află tempo-ul exact și măsura 1 (din bătăi), ascultă versurile ca să găsească unde începe fiecare
  secțiune și face lângă ea track-urile Click și Guide, cu secțiunile puse. Înregistrarea rămâne neatinsă. Și asistentul:
  „construiește ghidul pe înregistrare”.

## 2026-11-24 · 2026.11.24.6 · ghid vorbit cu vocile FS2S, track-uri Click + Guide dintr-un clic
- **Vocile ghidului.** Înainte: vocea calculatorului. Acum: înregistrările din Documente/Betleem/ghid (pe MacBook: cele
  45 de voci FS2S, „Verse”, „Chorus”, „1”–„12”…); „Verse 2” se spune „Verse” + „2” când nu există o înregistrare separată.
- **Cântare fără track-uri (MD&TRACK).** Acum: butonul **🎚 Fă track-uri Click + Guide** face două track-uri adevărate
  (click cu prima bătaie accentuată; ghid cu numărătoarea și fiecare secțiune anunțată cu o măsură înainte), din harta
  pusă de tine sau, fără hartă, din ordinea cântării (cam 2 măsuri pe rând). Cântarea primește apoi secțiunile pe
  track-uri, tempo-ul exact și măsura 1, deci merg săriturile, telefonul și versurile singure.

## 2026-11-24 · 2026.11.24.5 · pagina muzicienilor
- **Pagina de telefon a muzicienilor (codul „Muzicieni”).** Înainte: tabul „Versuri”, iar sub acorduri unele bucăți de
  rând coborau mai jos. Acum: în locul lui e „Planificare” (versurile sunt deja în Acorduri), iar rândurile stau drept,
  cu sau fără acord deasupra (la fel în aplicația 📱).

## 2026-11-24 · 2026.11.24.3 · aplicația de telefon (web), MD&TRACK din telefon
- **📱 Aplicația Betleem pe telefon** (`/m.html`, al patrulea cod în 📱 Telefoane): trei părți. 🗓 Planificare (aceeași
  pagină ca pe laptop). ▶ Proiectez: ▦ slide-urile (atingi = pe ecran) sau ♫ toată cântarea cu acorduri, care urmează
  ecranul (rândurile de pe ecran sunt luminate), ton propriu / numere / cifre romane, ciupit = mărime. 🎛 MD&TRACK:
  secțiunile cântării ca butoane mari; atingi „Refren” și track-urile de pe calculator merg acolo la măsura următoare
  (sau imediat), plus ▶ ❚❚ ⏹ ⏮ ⏭ și click. Proiectez și MD&TRACK cer PIN-ul echipei.
- **Asistentul.** Acum: „analizează ghidul / pune secțiunile” pornește ✦ Secțiuni automat în MD&TRACK.

## 2026-11-24 · 2026.11.24.2 · un singur buton pentru tempo și click
- **Bara de sus din MD&TRACK.** Înainte: BPM − / + , Tap, 4/4 cu punctele și „♩ Click” separat. Acum: un singur buton
  ♩ cu punctele de timp: o apăsare = click pornit/oprit; apăsat în ritm de 3–4 ori = tempo (click-ul rămâne pornit).
  Lângă el numărul BPM (scrii, rotița sau ↑ ↓) și 4/4. Track-urile urmează imediat tempo-ul click-ului (numărul
  devine verde când track-urile merg mai repede/încet decât înregistrarea) și click-ul rămâne pe timpii lor.

## 2026-11-24 · 2026.11.24.1 · track-urile nu se mai schimbă singure, click-ul ține pasul
- **Ton și tempo la track-uri.** Înainte: track-urile se transpuneau/întindeau după tonul și BPM-ul din bibliotecă (de
  ex. ton F# din Planning Center față de G în bibliotecă → track-urile coborau singure). Acum: fiecare cântare ține
  minte tonul și tempo-ul în care sunt înregistrate track-urile; ele se schimbă doar când pui tu alt ton/tempo.
  Clic dreapta pe riglă → „🎵 Tonul în care sunt înregistrate track-urile…”.
- **Click-ul (metronomul) cu track-urile.** Înainte: lua BPM-ul rotunjit și citea ceasul track-urilor cu sărituri, deci
  se depărta. Acum: la cântările cu track de click, aplicația află singură tempo-ul exact (ex. 74.63) și unde e măsura 1;
  click-ul și grila merg pe ele, cu un ceas netezit. Clic dreapta pe riglă → „🎯 Tempo exact…” (merge și pe tobe).

## 2026-11-24 · 2026.11.23.10 · MD&TRACK: zoom cu trackpad-ul, grila de la început
- **Grila.** Înainte: începea abia de la „măsura 1” (unde era pus primul timp), înainte era gol. Acum: merge de la
  începutul track-urilor; clic dreapta pe riglă → „Măsura 1 începe aici” (sau „la începutul track-urilor”).
- **Zoom.** Înainte: se vedea mereu toată cântarea. Acum: ciupești cu două degete pe trackpad (sau Ctrl + rotița) ca
  să mărești în jurul cursorului, două degete stânga-dreapta te mută; „⤢ toată” revine. Mărit, rigla arată și timpii
  (5.2, 5.3…), iar în timp ce cântă vederea merge după cursor. Desenul se face o dată pe cadru (ușor pentru calculator).

## 2026-11-24 · 2026.11.23.9 · MD&TRACK: ▶ pentru tot, clic = cursor, „ascultă ghidul”
- **▶ / ❚❚ din MD&TRACK.** Înainte: doar track-urile. Acum: track-urile și pad-ul pornesc și se opresc împreună (⏹ oprește
  tot). Pad-ul singur are încă ▶ în mixer; fără track-uri, ▶ pornește doar pad-ul.
- **Clic pe track-uri / secțiuni.** Înainte: clic pe o secțiune în timp ce cânta sărea abia la măsura următoare. Acum:
  cursorul sare imediat unde apeși (pe o secțiune, la începutul ei; lipit de timpi). Shift+clic = la măsura următoare.
- **✦ Secțiuni automat (AI ascultă ghidul).** Înainte: modelul ghicea limba și scria uneori „chess” în loc de „Chorus”.
  Acum: ascultă întâi în engleză, apoi în română dacă n-a găsit, și înțelege și cuvintele auzite greșit. Comanda vocală
  „ascultă ghidul” pornește asta.

## 2026-11-24 · 2026.11.23.8 · MD&TRACK ca în Ableton, cântări noi corecte
- **Cântare nouă.** Înainte: se salva cum era scrisă. Acum: la Salvează, AI-ul corectează textul (diacritice,
  greșeli, cratime; acordurile și rândurile rămân), iar secțiunile și acordurile pe toate strofele se pun singure.
  În Editor e și butonul **✍** pentru o cântare existentă (cu Anulează în mesaj).
- **MD&TRACK.** Înainte: rigla în minute, secțiunile puse exact unde dai clic. Acum: cu BPM, rigla numără măsurile
  (1, 5, 9…), o grilă discretă arată fiecare măsură, ora arată și „măsura.timpul”, secțiunile se lipesc de timpi
  (Alt = fără lipire), iar punctele de timp merg după track-uri chiar cu click-ul oprit.
- **⇪ Ableton** lângă ＋ Track-uri: dintr-un proiect .als ia markerele (Verse, Chorus…), tempo-ul și măsura și pune
  secțiunile pe track-uri.

## 2026-11-23 · 2026.11.23.7 · 🧹 Curăță biblioteca
- **🧹 și curățarea de la pornire.** Înainte: nu vedeau rândurile de acorduri pe jumătate convertite („A    [F]e”),
  ritmul cu bare („|G - - -|C - G -|”), „G-A”, „e5”, „b” și „B: …”, deci spunea „0 din 600”. Acum: le recunoaște;
  acordurile trec pe silabe, barele rămân pentru Scenă („[|G] [-] …”), „B:” devine Bridge, „b” = Si minor. Pe Sală
  rămân doar versurile. Pe biblioteca de pe MacBook: ~180 de cântări se curăță singure la pornire (cu copie înainte).

## 2026-11-23 · 2026.11.23.6 · import din ProPresenter, cântări care există deja
- **Bibliotecă.** Acum: butonul **⇪** importă toate cântările ProPresenter de pe calculator (.pro din ProPresenter 7 și
  .pro6), cu secțiunile lor (Verse → Strofa, Chorus → Refren) și ordinea aleasă. Ce există deja nu se dublează
  (același nume sau aceleași prime versuri). Dacă nu găsește singur folderul, te lasă să-l alegi.
- **Cântare nouă.** Înainte: se salva chiar dacă exista deja. Acum: dacă există una cu același nume sau aceleași prime
  versuri, te întreabă: o deschizi pe cea existentă sau o salvezi totuși.

## 2026-11-23 · 2026.11.23.5 · straturi, Props, acordurile care apăreau pe Sală
- **Acorduri scrise cu literă mică („f”, „Eb f Db Ab”) și „Intro: Ab Db”, „Pre: …”, „R: …”.** Înainte: apăreau ca
  versuri pe ecranul din sală. Acum: sunt recunoscute ca acorduri („f” = Fm) și puse pe silabe, iar „Pre:”/„R:” devin
  secțiuni (Pre-refren, Refren). Cântările deja salvate așa se curăță singure o dată, la pornire (copie de siguranță
  înainte: library.backup-….json). La ele, ordinea personalizată a secțiunilor revine la cea automată.
- **Editorul de slide (dublu-clic / Cmd+E).** Înainte: un singur text. Acum: are „🧱 Straturi”: texte, imagini, video,
  forme, fiecare mutat și mărit pe previzualizare, cu ochi (ascunde), lacăt, ordine, sub/peste versuri, apariție
  animată, clic dreapta = comenzi rapide, ↶ ↷ (Ctrl+Z / Ctrl+Shift+Z), Ctrl+D, săgeți. Și 📋 Copiază / 📥 Lipește
  aspectul între slide-uri. Un slide cu straturi are 🧱 în listă.
- **Fundaluri / 💡 Lumini.** Acum: și tabul **🏷 Props** (logo, bandă, text fix peste orice slide; clic = pornește/oprește).

## 2026-11-23 · 2026.11.23.4 · ecrane fără fir
- **Lista de monitoare (Sală / Scenă).** Înainte: doar monitoarele legate cu cablu. Acum: la final are „📡 Ecran fără fir
  (AirPlay / Miracast)…” (deschide setările de monitoare ale calculatorului, cu pașii) și „🌐 Televizor cu browser…”
  (adresa de deschis pe televizor). Când se conectează un ecran, lista se reîmprospătează singură, iar ecranul ales
  ține minte și numele, deci Sala/Scena revine singură pe televizor când acesta se reconectează.

## 2026-11-23 · tranziții, acorduri pe toate strofele, bara macOS pe proiector
- **Schimbarea versurilor pe ecran.** Înainte: imediat (tăiere). Acum: tot așa implicit, dar poți alege în bara de
  aspect (lângă slide-uri) **Tranziție**: Tăiere / Stingere / Trecere lină / Dizolvare, cu durata. Pe un slide sau pe
  o cântare anume: dublu-clic pe slide → Tranziție.
- **Acordurile doar pe strofa 1 / primul refren.** Înainte: celelalte strofe rămâneau fără acorduri. Acum: la orice
  import (PDF Planning Center, net, lipire) acordurile se pun pe aceleași silabe la toate strofele și refrenele.
  ♪ din editor face asta pe cântarea deschisă; ♪ din Bibliotecă face asta pe toată biblioteca și caută pe net
  acordurile cântărilor care n-au deloc (Resurse Creștine, apoi alte site-uri). Asistentul: „pune acorduri pe toate”.
- **Căutarea pe net.** Înainte: doar prin motorul de căutare, și uneori nu apărea varianta cu acorduri. Acum: întâi
  căutarea proprie a Resurse Creștine, iar varianta cu acorduri apare mereu în listă (eticheta „acorduri”).
- **Bara de meniu macOS pe proiector.** Înainte: fereastra de proiecție stătea sub bara de meniu. Acum: o acoperă.

## 2026-11-22 · 2026.11.22.3 – .7
- **„Învață cue-urile” și „Secțiunile din track-ul de cue”.** Înainte: două butoane separate, iar varianta AI cerea
  un track numit „Cue”. Acum: grupate sub „Secțiunile cântării”. „✦ Secțiuni automat” găsește singur ghidul, iar
  dacă vocea AI nu merge folosește pauzele.
- **Cântările fără track-uri în MD&TRACK.** Înainte: doar mesajul „Adaugă track-uri”. Acum: track virtual cu click,
  pad și ghid.
- **Fundaluri.** Acum: au alături tabul 💡 Lumini.
- **Echipa unui serviciu.** Acum: are „✦ Completează echipa”.
- **Lideri.** Acum: are 📣 Mesaj, 🎯 Obiective și 📊. Fiecare sarcină poate avea focus 👥/📋.
- **Fișa voluntarului.** Acum: are „📷 Fotograf”.
- **Ecranul de proiecție pe Mac.** Înainte: ecran complet macOS (lua toate monitoarele dacă „Spații separate” era
  oprit). Acum: fereastră fără margini peste monitorul ales. Cere reinstalarea aplicației.
- **⚙ Setări.** Acum: „🎨 Aspect și funcții” (culoare, module ascunse) și, la 🔒, folderul pentru poze plus accesul
  liderilor de acasă.
- **Siguranță.** Înainte: setările 🔒 se puteau schimba de pe calculatorul bisericii chiar și fără „încredere în
  acest calculator”. Acum: doar liderul.

## 2026-11-22 · 2026.11.22.2
- **Serverul care primește fișiere din internet.** Înainte: putea doar primi fișiere. Acum: dacă liderul deschide
  „ușa” (⚙ Setări → 🔒), răspunde și la paginile voluntarilor (linkul personal și programul următor), nimic altceva.
- **PIN greșit de mai multe ori.** Înainte: se putea încerca la nesfârșit. Acum: după 5 greșeli, aștepți 1 minut
  (apoi tot mai mult).
- **Copii de siguranță.** Înainte: nu existau automat. Acum: o copie pe zi în Documente/Betleem/backup și pe NAS.
- **Linkurile voluntarilor și QR-ul de la birou.** Acum: folosesc adresa publică (https://….ts.net) când e setată,
  deci merg și de acasă.

## 2026-11-22 · 2026.11.22.1
- **Programarea oamenilor.** Înainte: puteai pune pe cineva și într-o zi în care spusese că lipsește (apărea doar un
  avertisment). Acum: ziua blocată și limita lunară nu-l mai lasă (apare gri, cu motivul). Dacă își blochează ziua
  după ce a fost pus, rămâne avertismentul.
- **Confirmările.** Înainte: le puneai tu de mână (⏳ ✓ ✕). Acum: le pune omul singur, din linkul lui; tu le poți
  schimba ca înainte.
- **Planificare.** Acum: tabul **Lideri**, 💬 lângă fiecare om din echipă, „💬 Anunță echipa”, și în fișa
  voluntarului: limita pe lună, „face parte din echipa de lideri” și linkul personal.
- **Telefon.** Acum: tab-urile Planificării se derulează pe lățime, nu mai lățesc pagina.

## 2026-11-21 · 2026.11.21.11
- **Notițele din Planificare.** Înainte: se pierdeau când programul era pus pe Live. Acum: rămân în plan și le vede
  predicatorul.
- **Planificare.** Acum: butoanele **📄 PDF** și **▦ QR** lângă „Pune pe Live”. Nu s-a mutat nimic din ce era.
- **📱 Telefoane.** Înainte: două coduri (muzicieni, echipă). Acum: are și al treilea, **🎤 Predicator**, cu PIN
  propriu.

## 2026-11-21 · 2026.11.21.10
- **Bara de sus (Proiectez).** Înainte: ◀ Înainte ▶, Aa, Negru, 🖼, Curăță. Acum: **⏻ Ecran gol** (și Esc), **🖥**
  pentru previzualizarea ecranelor, ⏱ și mesaj cu ținta. Slide-urile se schimbă cu Spațiu, → și ←, iar Logo și
  „ascunde textul” sunt în ⋯ Mai mult.
- **Esc.** Înainte: Esc apăsat de două ori curăța tot. Acum: Esc golește ecranele, iar a doua apăsare le aduce înapoi.

## 2026-11-21 · 2026.11.21.9
- **Previzualizarea ecranelor.** Înainte: „Ascunde” le făcea să dispară fără urmă. Acum: le arăți și le ascunzi
  doar cu 🖥.
- **Actualizări.** Înainte: aplicația verifica la 6 ore. Acum: verifică la 30 de minute.

## 2026-11-21 · 2026.11.21.8
- **Asistentul.** Înainte: scria titluri în program sau cerea o listă. Acum: pune cântările reale din bibliotecă
  (add_songs, pick_songs), iar căutarea înțelege și cuvinte scrise aproximativ.
