# Schimbări: ce funcționa înainte și cum funcționează acum
Cele mai noi sunt sus. Claude Code adaugă aici o linie la fiecare schimbare de comportament (regula de aur din CLAUDE.md).

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
