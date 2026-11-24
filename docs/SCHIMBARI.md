# Schimbări: ce funcționa înainte și cum funcționează acum
Cele mai noi sunt sus. Claude Code adaugă aici o linie la fiecare schimbare de comportament (regula de aur din CLAUDE.md).

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
