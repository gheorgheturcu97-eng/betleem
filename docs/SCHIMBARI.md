# Schimbări: ce funcționa înainte și cum funcționează acum
Cele mai noi sunt sus. Claude Code adaugă aici o linie la fiecare schimbare de comportament (regula de aur din CLAUDE.md).

## 2026-11-28 (seara) · Arhiva programelor și propunerile de cântări (Reverb online)
- **🗄 Arhivă.** Înainte: un program rămânea în listă până a doua zi. Acum: după ora de început + durata lui (cel puțin
  1 h 30) dispare din Planific, Proiectez, MD & Track și „Ești programat”; îl găsești jos, în „🗄 Arhivă”.
- **🎵 Propune o cântare.** Nou: cine a apăsat „Pot” vede în Planific „Propune o cântare” pentru acel program; alege cântarea și
  tonul; rubrica dispare imediat. Liderii văd „Propuneri de cântări” la program și le pun cu „＋ în program”. Cere funcția
  `reverb_plan_propose` din același fișier SQL (20261128210000), lipit o dată în Supabase.

## 2026-11-28 (seara) · 🔎 Importul prezentărilor verificat înainte și după (2026.11.28.19)
- **Ordinea pe Mac.** Înainte: un .pptx trecea întâi prin Keynote (care îl redesenează în felul lui), apoi prin PowerPoint.
  Acum: un PowerPoint e desenat de PowerPoint dacă e instalat, un Keynote de Keynote; LibreOffice doar după ele.
- **Analiza dinainte (`src/showcheck.js`, `prepareShow` în server.js).** Nou: citește prezentarea (slide-uri, ascunse,
  format, fonturi folosite și incluse, video, fișiere legate din afară), întreabă sistemul ce fonturi are (Mac: AppKit,
  Windows: System.Drawing), descarcă de pe Google Fonts ce lipsește și le **instalează pentru utilizator** (Mac:
  ~/Library/Fonts, Windows: %LOCALAPPDATA%\Microsoft\Windows\Fonts + registru HKCU), ca să le vadă Keynote / PowerPoint.
- **Verificarea de după + raport.** Nou: compară paginile ieșite cu slide-urile vizibile și arată „🔎 Verificarea importului”:
  cine a desenat, fonturi găsite / instalate / înlocuite, video și linkuri care lipsesc, și **tranzițiile**: păstrate la
  fel (cu durată și direcție), cele care nu există aici (ex. Morph → estompare) și slide-urile care trec singure.
- Calitatea paginilor: JPEG 0,94 (înainte 0,9).
- **🔤 Documente/Betleem/Fonturi.** Nou: fonturile pentru care biserica are licență (Calibri etc. din Office, fonturi cumpărate)
  puse acolo sunt instalate singure pentru utilizator (Keynote / PowerPoint / LibreOffice) și folosite în aplicație. Rămân
  doar pe acel calculator (nu intră în actualizări, pachete sau online).

## 2026-11-28 (seara) · Predicatorul își pune prezentarea din aplicație (Reverb online + 2026.11.28.19)
- **📎 / 🎨 la „Ești programat” (Reverb online).** Înainte: predicatorul putea trimite prezentarea doar din linkul către
  calculatorul bisericii. Acum: la locul lui de Predicator / Pastor / Vorbitor are „📎 Pune prezentarea” (PowerPoint,
  Keynote, PDF, poze, video, până la 200 MB) și „🎨 Link Canva”, le poate schimba sau scoate până în ultimul minut.
  Fișierul merge în Supabase (`prezentari`, cale cu parte aleatorie), apoi calculatorul îl aduce în 📥 Primite la
  următoarea sincronizare și Predica arată „📎 de la …”; linkul Canva apare în Live ca „🎨 Canva de la …”.
  Cere o dată migrarea `supabase/migrations/20261128210000_reverb_preacher_files.sql` (lipită în SQL Editor).

## 2026-11-28 (seara) · Cântarea ca la un stand de muzician (Reverb online)
- **Ecranul cu acordurile (`#vSong`, `drawSong`).** Înainte: secțiunile tăiate în slide-uri de 4 rânduri, numele secțiunii
  deasupra, font monospațiat, acorduri portocalii. Acum (după exemplul trimis de proprietar): titlul și autorul sus, tonul și
  BPM-ul în dreapta, numele secțiunii într-o coloană în stânga (pe telefon prescurtat și colorat: V1, C, B), acordurile
  albastre deasupra silabei, un refren cântat din nou apare scurt (↺ primul rând…), iar jos e harta cântării (V1 C V2 C B C):
  apeși și sari acolo, secțiunea la care ești se aprinde. Tonul, Acorduri da/nu, ⤢ toată piesa și ✎ au rămas.

## 2026-11-28 (seara) · Telefon: bara de sus, cântări ușor, cod pentru versuri, „Doar vede”; culorile timpului (2026.11.28.19 + Reverb online)
- **Bara cu zonele pe telefon (Reverb online).** Înainte: Planific / Proiectez / MD & Track stăteau în pagină și plecau la
  derulare. Acum: stau mereu sus, îngust; dispar doar când deschizi acordurile pe tot ecranul.
- **＋ Cântări în program (Proiectez, telefon).** Înainte: alegeai felul, scriai titlul exact și apăsai Adaugă. Acum: un buton
  mare deschide lista cu căutare (titlu, autor); ＋ adaugă imediat, „✓ în program” arată ce e deja; rămâne deschisă pentru
  următoarea. Rândul vechi (moment, verset) a rămas dedesubt.
  Acum (22:05): fiecare cântare din listă are și tonul (pornește din cel original); îl schimbi înainte de ＋.
- **Ordinea în program (Proiectez → Pregătește de acasă și Planific → Editează, telefon).** Înainte: săgeți ↑ ↓ la fiecare
  moment. Acum: ții degetul o clipă pe moment (vibrează) și îl tragi unde vrei; cu mouse-ul îl apuci direct. ✕ a rămas.
- **🔒 Codul pentru versuri (Oameni → Codul pentru versuri).** Nou, oprit implicit: când coordonatorul pune un cod, muzicienii îl
  scriu o dată (până închid aplicația) înainte să schimbe versuri, acorduri, ordinea strofelor sau tonul. Liderii nu au nevoie.
- **👁 Doar vede (Oameni → la fiecare om).** Nou: omul vede programul și răspunde la locul lui, dar nu mai are Proiectez,
  MD & Track și nu poate schimba nimic. Pornit pentru Cristi Vâșcea la cererea proprietarului (îl pornește coordonatorul).
- **⏱ Culorile timpului (Live, Planificare, telefonul predicatorului).** Înainte: doar ecranul de scenă colora timpul. Acum: și
  momentul de pe Live din program (control.html), și desfășurătorul din Planificare (numără invers, cele trecute estompate,
  „+4 min față de program”), și telefonul predicatorului: galben la 75 %, portocaliu la 90 %, roșu care clipește peste timp.

## 2026-11-28 · Posturi pe fiecare program + insistența până la răspuns (2026.11.28.18 + Reverb online)
- **Echipa unui program (Planificare și Reverb online, op `setNeed`, `s.need`).** Înainte: fiecare program primea toate
  posturile tuturor departamentelor și nu se putea scoate niciunul. Acum: ✕ pe un post sau „✕ tot” pe un departament îl
  scoate doar de la acel program; „＋ Adaugă un post” pune încă unul sau un post opțional (Chitară 2, Camera 2) ori un
  nume nou. Standardul bisericii rămâne neschimbat. „Copiază programul de la” copiază și posturile.
- **Posturi noi.** Media: Camera 1 (și Camera 2 opțional); Închinare: Chitară 2, Vocal 3, Vioară (opționale). Online se
  adaugă singure o dată; pe calculator le pui din Echipe → departament (bifa nouă „opțional”). Bisericile noi pornesc cu
  Media: Sunet, Live stream, Versuri, Camera 1/2 și Social media: Foto, Reels, Postări.
- **Programat și fără răspuns (Reverb online).** Înainte: cardul „Ești programat” era mereu albastru. Acum: cu 3 zile
  înainte galben care pulsează, cu 2 zile portocaliu, în ziua dinainte roșu care clipește, cu „Ultima zi: răspunde acum”,
  și o notificare de până la 3 ori pe zi (dimineață, prânz, seară) când e deschisă pagina. Liderii văd „N-a răspuns!”
  și butonul „📲 Amintește-i” (WhatsApp cu mesajul și linkul gata). Pe calculator, ⏳ se colorează la fel.
- **Desfășurătorul pe telefon.** Înainte: momentele erau numerotate 1, 2, 3. Acum: fiecare are ora la care începe.

## 2026-11-28 · Clic = scenă, dublu-clic = sală; slide „Gol”; miniaturi ca ecranul (2026.11.28.17)
- **Clic pe slide (control.html, op `cue`).** Înainte: un clic trimitea slide-ul pe ambele ecrane. Acum: un clic îl pune
  doar pe ecranul de scenă (portocaliu, „PE SCENĂ”; pe scenă scrie „Doar pe scenă”), dublu-clic îl trimite și în sală.
  Săgețile / Space merg ca înainte (pe ambele).
- **Slide „Gol” la începutul fiecărei cântări (`live.pre`).** Nou: sala nu vede nimic (fundalul rămâne), scena arată titlul
  și „Urmează” primul vers. Cu → de pe ultimul slide al unei cântări, următoarea cântare începe pe „Gol”.
- **Dublu-clic pe previzualizarea ecranului.** Înainte: pornea proiectorul / ecranul de scenă. Acum: ecranele pornesc singure
  (în aplicație, când e un al doilea monitor) când pui ceva pe ele; rămân și Ecrane → Proiector / Scenă.
- **Miniaturile slide-urilor.** Înainte: font, mărime și rânduri aproximative (rândurile goale apăreau). Acum: desenate exact
  ca ecranul din sală (același font, mărime la scară, aliniere, umbră, întunecare, micșorare la versuri lungi, engleza 🌐).

## 2026-11-28 · Engleza lângă cântare + căutare mai adâncă (2026.11.28.16)
- **🇬🇧 Varianta în engleză (control.html → Bibliotecă, `setEnglish`).** Nou: lângă fiecare cântare, butonul 🇬🇧 caută
  varianta în engleză (Worship Together, site-uri cu acorduri) sau primește textul lipit. Biblioteca rămâne în română;
  engleza stă în `song.en`. Cântările cu engleză primesc 🌐 și apar în folderul virtual „Bilingv”.
- **🌐 Bilingv (Proiectez, lângă aranjament, `itemBilingual`).** Nou, oprit implicit, per cântare din program: ecranul din
  sală arată engleza mai mică, cursiv, sub versurile în română (Verse 1 sub Verse 1, Chorus sub Chorus).
- **Căutarea pe internet (`src/websearch.js`, `src/extract.js`).** Înainte: căuta doar în română, primele câteva pagini.
  Acum: caută și în engleză (Worship Together, WorshipChords), mai multe pagini, și scoate acordurile din paginile
  „chord chart” (Intro / Verse / Chorus…).

## 2026-11-28 · PowerPoint: nu mai desenează în tăcere altfel (2026.11.28.15)
- **Import PowerPoint / Keynote (control.html, planning.html, `/api/convert`).** Înainte: dacă Keynote / PowerPoint nu
  puteau copia prezentarea exact (lipsă, fără voie, eroare), Betleem trecea în tăcere la desenul propriu (alte fonturi,
  texte suprapuse). Acum: importul se oprește și spune de ce (inclusiv dacă nu găsește Keynote sau PowerPoint în
  Aplicații și eroarea exactă), cu varianta sigură: în PowerPoint Fișier → Exportă → PDF și importă PDF-ul (identic).
  „Continuă oricum” păstrează desenul Betleem ca rezervă.

## 2026-11-28 · Bara de deasupra slide-urilor se poate ascunde (2026.11.28.14)
- **„⌃ Ascunde bara” (control.html).** Nou: un buton în capul listei de slide-uri ascunde bara cu Secțiunile, ordinea,
  Rândurile, Textul, fontul și tranziția; slide-urile primesc tot locul. „⌄ Arată bara” o aduce înapoi. Calculatorul ține
  minte alegerea.

## 2026-11-28 · ✂ Rupe aici taie doar slide-ul ales (2026.11.28.13)
- **Ruperea slide-ului (`breakSlide`).** Înainte: tăia secțiunea de la cursor până la capăt, iar restul se rearanja (de
  ex. „trei+patru | cinci+șase” devenea „trei | patru+cinci | șase”), părea că dispare un slide. Acum: doar slide-ul ales
  se rupe în două („trei | patru”), celelalte rămân exact cum erau. Test nou în hub.test.js.

## 2026-11-28 · Muți slide-uri trăgându-le; ⌘D repetă slide-ul ales; miniaturile arată MAJ (2026.11.28.12)
- **Mutare de slide-uri (`moveSlide`).** Nou: tragi un slide peste altul (linia portocalie arată unde intră) și se mută
  acolo, doar în acest program; ⌘Z anulează. Dacă slide-ul e o bucată dintr-o secțiune mai lungă, se mută doar bucata.
- **⌘D.** Înainte: repeta slide-ul de pe ecran, nu pe cel ales. Acum: repetă slide-ul (sau slide-urile ⇧/⌘-clic) alese
  în listă; dacă nu e ales nimic, tot pe cel de pe ecran.
- **Miniaturile.** Înainte: MAJ, fontul, culoarea sau alinierea puse pe un singur slide nu se vedeau în listă (doar pe
  ecran). Acum: miniatura arată la fel ca ecranul.

## 2026-11-28 · PowerPoint: exact ca în PowerPoint, sau spune de ce nu (2026.11.28.12)
- **Importul de prezentări pe Mac (`nativePdf` în server.js).** Înainte: încerca doar Keynote; dacă macOS nu-i dădea voie
  (Automatizare), trecea în tăcere la desenul propriu (alte fonturi, texte suprapuse). Acum: încearcă Keynote, apoi
  Microsoft PowerPoint; dacă macOS refuză, apare un mesaj cu pașii exacți (Setări sistem → Confidențialitate și
  securitate → Automatizare → Betleem → bifează Keynote și Microsoft PowerPoint), apoi slide-urile se desenează tot de
  Betleem ca rezervă.

## 2026-11-28 · Aranjamente ca în ProPresenter, nume standard Verse / Chorus, ✂ Rupe slide-ul (2026.11.28.12)
- **Aranjamente (control.html, `saveArrangement`/`deleteArrangement`).** Înainte: un singur rând „Ordine” și ＋ dintr-o
  listă. Acum: deasupra stă rândul „Secțiuni” (fiecare secțiune o dată, colorată, ca Groups în ProPresenter): clic o pune
  la sfârșit, tragi o pui unde vrei. În stânga ordinii e lista de aranjamente: „＋ Salvează ordinea ca…” o păstrează pe
  cântare cu un nume (Duminică, Scurt, Concert), o alegi oricând din listă, „🗑 Șterge” o scoate, „↺ Original” = ordinea
  din cântare.
- **Nume standard (🏷 în Cântări, `standardLabels`; `standardizeLabels` în song.ts).** Înainte: Strofa / Refren / Final
  amestecate cu VERSE / CHORUS din Planning Center. Acum, după un clic pe 🏷 (liderul, o singură dată, cu copie de
  siguranță): toate cântările au Verse 1, Chorus, Verse 2, Pre-Chorus, Bridge, Intro, Ending, Tag; secțiunile fără nume
  primesc nume; unde nu era ordine se pune Verse 1 · Chorus · Verse 2 · Chorus…; cântările noi și cele din PCO vin tot
  așa; butoanele de secțiune din editor arată aceleași nume.
- **✂ Rupe aici (editorul de slide).** Nou: pui cursorul la capătul unui rând și apeși ✂ (sau ⌘/Ctrl+Enter): de acolo
  începe un slide nou, ca Reflow în ProPresenter. Secțiunea e tăiată în două cu același nume, așa că ordinea din programe
  rămâne. ⌘Z anulează.

## 2026-11-28 · ↶ ↷ în Proiectez; aspectul copiat se pune pe toată cântarea (2026.11.28.12)
- **Anulează / Refă.** Înainte: în Proiectez butoanele ↶ ↷ erau ascunse (mergea doar ⌘Z). Acum: se văd sus, lângă
  telefon; ⌘Z / ⌘⇧Z merg ca înainte.
- **Editorul de slide: 📥 Lipește aspectul.** Înainte: punea aspectul copiat doar pe slide-ul deschis și trebuia ales apoi
  „toată cântarea” și Salvează. Acum: butonul se numește „📥 Lipește pe toată cântarea”: pune aspectul (font, mărime,
  culori, poziție, straturi) pe toate slide-urile cântării și închide editorul; ↶ sau ⌘Z îl anulează.

## 2026-11-28 · Siguranță: proiectorul nu se mai închide din greșeală (2026.11.28.11)
- **Fereastra proiectorului / scenei.** Înainte (2026.11.28.3–10): Esc apăsat când fereastra proiectorului avea focusul
  o închidea, iar dublu-clic pe previzualizare o închidea dacă era deschisă. Acum: Esc pe proiector nu face nimic;
  dublu-clic pe previzualizare doar pornește ecranul (sau îl readuce pe monitorul lui), nu îl mai închide.

## 2026-11-28 · Reparat: Esc care închidea o fereastră golea și ecranele (2026.11.28.10)
- **Esc (control.html).** Înainte: Esc care închidea editorul de slide (sau altă fereastră) pornea în același timp și
  „Ecran gol”, așa că Sala și Scena rămâneau fără versuri. Acum: Esc închide doar fereastra; în Live, Esc e tot
  „Ecran gol”, ca înainte.

## 2026-11-28 · Înapoi la așezarea de dinainte în Live (2026.11.28.9)
- **Coloana din dreapta cu Sala, Scena și fundalurile (2026.11.28.6–8) a fost scoasă, la cererea proprietarului.** Acum:
  ca înainte, ecranele sus, slide-urile la mijloc, fundalurile jos. Rămân numele scurte ale butoanelor (＋ Adaugă,
  ⇩ Din rețea, 📌 Fixează) și restul schimbărilor de azi.

## 2026-11-28 · Copiezi slide-uri cu ⌘C / ⌘V; scrii direct pe slide (2026.11.28.8)
- **Copiere de slide-uri (control.html + `pasteSlides` în server.js).** Înainte: ⌘C pe un slide copia doar textul, iar
  ⌘V îl repeta numai în aceeași cântare. Acum: alegi unul sau mai multe slide-uri (⇧-clic = de la până la, ⌘-clic = încă
  unul; nimic nu pleacă pe ecran), ⌘C, apoi clic pe slide-ul după care vrei și ⌘V — merge și în altă cântare. Slide-ul
  adus din altă cântare se adaugă la cântarea respectivă, dar ordinea ei din bibliotecă rămâne aceeași; în program apare
  unde l-ai lipit. ⌘Z anulează.
- **Editorul de slide (✎).** Înainte: textul se scria într-o căsuță sub slide și trebuia apăsat „Salvează”. Acum: scrii
  direct pe slide (căsuța a dispărut); ✥ mută caseta, colțul o mărește. La închidere (Esc, „Gata” sau clic în afară) se
  salvează singur, iar în listă rămâi pe slide-ul la care ai lucrat. „Renunță” închide fără să păstreze.

## 2026-11-28 · Panourile se ascund doar când vrei tu + mod zi clar (2026.11.28.7)
- **Modul zi (☀, glass.css).** Înainte: totul alb pe alb, text gri foarte deschis, butoane și tonuri (G, A) aproape
  invizibile. Acum: fundal gri deschis, panouri albe curate cu chenar și umbră, text gri mai închis, butoane și câmpuri
  cu chenar vizibil, tonurile ca etichete, programul ales evidențiat. Modul noapte: neschimbat.
- **Panourile din stânga și din dreapta.** Înainte (2026.11.28.3–6): cât era ceva pe ecran se retrăgeau singure și ieșeau
  la trecerea cu mouse-ul. Acum: stau pe loc. Le ascunzi tu cu mânerul ‹ / › de pe marginea lor (sau Ctrl/⌘+1 / 3);
  rămâne o bară subțire „Program ›” / „‹ Cântări · Biblia”, iar un clic pe ea le aduce înapoi. Retragerea automată
  există în continuare, oprită: Vizualizare → „Retrage Programul și Cântările cât ești pe ecran”.

## 2026-11-28 · Live fără spații goale (2026.11.28.6)
- **Așezarea din mijloc în Live (control.html, stilul `#pp-side`).** Înainte: sus o bandă cu cele două previzualizări mici
  în mijloc și gol în stânga și în dreapta; jos fundalurile pe un rând cu loc gol în capăt. Acum: slide-urile stau în
  stânga, pe toată înălțimea; în dreapta e o coloană cu Sala și Scena una sub alta, iar sub ele fundalurile, într-o grilă
  care umple tot locul (🔍 le face mai mari / mai mici). Butoanele fundalurilor au nume scurte: ＋ Adaugă, ⇩ Din rețea,
  📌 Fixează. Ctrl/⌘+2 (sau 🖥) ascunde previzualizările și fundalurile urcă în locul lor.

## 2026-11-28 · Ecranul de scenă ca în ProPresenter (2026.11.28.5)
- **Scena (`public/stage.html`).** Înainte: jos, „Urmează” era o coloană mică în stânga și „În program” o coloană în
  dreapta, iar slide-ul următor ieșea mic. Acum: slide-ul următor stă pe toată lățimea, chiar sub versurile de acum
  (cu acorduri, cel puțin ~70% din mărimea lor; versurile de acum rămân cele mai mari), iar „În program” e un singur rând
  lung jos (titlu · ton · minute › următorul…). Setările rămân aceleași: „Urmează · mărime / loc / culoare”.

## 2026-11-28 · Planning Center: cântările înlocuiesc cântările identice din bibliotecă (2026.11.28.4)
- **Importul din Planning Center (`mergePcoSongs`, `sameSongs` în src/server.js).** Înainte: o cântare din PCO se
  potrivea cu biblioteca doar după id sau după exact același titlu, așa că „1. Este-un vânt ce-adie” sau „10000 motive
  (Cântă suflete)” rămâneau în plus, ca dubluri; iar varianta din PCO fără acorduri nu înlocuia nimic. Acum: se
  recunoaște aceeași cântare și cu număr în față, cu paranteze, fără diacritice sau după primele versuri. Cu bifa
  „Cântările din Planning Center sunt cele corecte”: versurile, acordurile, tonul, ordinea și titlul vin din PCO (varianta
  veche rămâne salvată în cântare), iar dacă aceeași cântare era de mai multe ori în bibliotecă, copiile se unesc într-una
  (programele care foloseau o copie folosesc cântarea înlocuită; înainte se face o copie a bibliotecii). Cântările aduse
  din contul altei biserici rămân neatinse. La final scrie câte au fost înlocuite și câte dubluri s-au unit.

## 2026-11-28 · Mai mult loc în Live (2026.11.28.3)
- **Programul și Cântările cât ești pe ecran.** Înainte: stăteau mereu deschise, iar slide-urile aveau loc puțin.
  Acum: cât timp e ceva pe ecran (nu „Ecran gol”), se retrag în câte o bară subțire („Program ›”, „‹ Cântări · Biblia”);
  treci cu mouse-ul pe bară și se deschid peste slide-uri, fără să mute nimic. Se oprește din Vizualizare →
  „Retrage Programul și Cântările cât ești pe ecran”.
- **Butoanele din lista de cântări (✎ ＋ 🗑).** Înainte: țineau loc gol pe fiecare rând, iar titlurile erau tăiate.
  Acum: apar peste rând doar la trecerea cu mouse-ul.
- **Proiector ↗ / Scenă ↗.** Înainte: butoane peste previzualizare. Acum: dublu-clic pe previzualizarea Sălii sau a
  Scenei pornește ecranul; încă un dublu-clic îl închide (Esc apăsat pe fereastra proiectorului îl închide și el).
  Punctul de lângă SALĂ / SCENĂ e verde cât timp ecranul e pornit. Clic simplu: tot aspectul ecranului.
  Esc în Live rămâne „Ecran gol”, ca până acum.

## 2026-11-28 · Slide-urile din Proiectez arată ca în ProPresenter (2026.11.28.2)
- **Lista de slide-uri (control.html, `#slides`).** Înainte: carduri mici cu text înghesuit, eticheta secțiunii sus și
  o margine colorată. Acum: fiecare slide e un ecran mic 16:9, cu fundalul cântării și fontul de pe proiector, textul
  centrat ca pe ecran, iar dedesubt o bandă în culoarea secțiunii cu numărul și numele (Strofa 1, Refren…). Slide-ul de
  pe ecran are chenar și scrie „PE ECRAN”. Clic pe nume tot schimbă secțiunea; butoanele 📋 ⧉ ✎ 🗑 apar tot la trecerea
  cu mouse-ul. Mărimea se schimbă tot din 🔍.

## 2026-11-28 · Reparat: programele noi și cântările nu mai dispar după sincronizarea cu Reverb online
- **Sincronizarea cu Reverb online (`src/reverb-sync.js`).** Înainte: pe un calculator legat de Reverb online (ex. Mac
  mini), un program nou făcut aici sau cântările adăugate într-un program dispăreau după câteva secunde, pentru că copia
  „convenită” cu internetul era legată de programul real și sincronizarea punea înapoi varianta de pe internet. Acum:
  copia convenită e separată, așa că ce faci aici rămâne și urcă online.
- **Același serviciu schimbat în două locuri.** Înainte: dacă un serviciu era schimbat și aici (cântări), și pe telefon
  (echipa), câștiga varianta de pe internet întreagă. Acum: se îmbină pe bucăți (momentele una câte una, locurile din
  echipă unul câte unul), deci rămân ambele schimbări. Programul de pe ecrane are întâietate tot aici.
  Teste noi în `test/reverb-sync.test.js`.

## 2026-11-26 · Reverb pentru Linux + click-ul în motorul nou (E3)
- **Linux (nou).** Reverb-Linux.tar.gz (x86_64): Electron 42.3.0 + hub-ul semnat 2026.11.25.8; `instaleaza.sh` (o dată,
  fără parolă) pune Reverb în meniu și pe Desktop; `reverb.sh` pornește cu `--no-sandbox`. Datele în Documente/Betleem,
  actualizările vin singure. Verificat pe un Linux fără ecran (xvfb): instalarea, pornirea, hub-ul pe :4545.
  Nu am folosit AppImage (unealta lui ar fi trebuit descărcată și rulată).
- **Click-ul (motorul nou, E3).** Înainte: click-ul era programat separat și „ajustat” după track-uri. Acum, cu
  „Motor nou (probă)”: click-ul e făcut chiar în motor, pe același eșantion ca track-urile (accent pe măsura 1, mai
  repede când e tempo-ul mai mare, rămâne pe grila cântării și după un salt); acceptă și o hartă de tempo (grid).
  Test în `test/stem-engine.test.js`. Motorul vechi: neschimbat.

## 2026-11-26 · 2026.11.25.8 · MD & Track: „Motor nou (probă)”, toate track-urile pe același ceas
- **Nou, oprit implicit** (⚙ Rutare → Motor audio → „Motor nou (probă)”, se aplică după repornire). Înainte: fiecare
  track era un `<audio>` separat, cu ceasul lui și stretch-ul lui de tempo. Acum, cu motorul nou: track-urile sunt
  decodate o dată și citite de un singur AudioWorklet (`public/stem-worklet.js`, clasa `StemEngine` din music.js) pe
  ceasul audio: nu se pot depărta; tempo-ul e un singur stretch (WSOLA) ales pe mixul tuturor și aplicat la fel
  fiecăruia, tonul rămâne; la tempo original e copie exactă. Saltul la secțiune se face pe ceasul audio, exact pe
  următoarea măsură, cu 5 ms de crossfade (fără click). Mixerul, rutarea, tonul și talkback-ul sunt aceleași.
- **Saltul „la următoarea măsură”** (ambele motoare). Înainte: cu tempo-ul schimbat, măsura era calculată din tempo-ul
  nou, deci saltul cădea greșit. Acum: din tempo-ul în care sunt înregistrate track-urile (`trackTempo`).
- Testat: `test/stem-engine.test.js` (copie exactă la tempo original; la 1,25 track-urile rămân identice între ele și
  tonul rămâne 440 Hz; saltul la momentul planificat, fără click; sfârșitul cântării) și în Chromium cu 8 track-uri de
  90 s (încărcare 2,3 s, tempo 1,15 exact, saltul la 1,00 s, pauză fixă). Memorie: ~115 MB pe track stereo de 5 min.
  **Neverificat pe Mac și pe placa de sunet.**

## 2026-11-25 · 2026.11.25.7 · MD & Track: track-urile pornesc și rămân împreună
- **Pornirea.** Înainte: `play()` pornea stem-urile fără să aștepte să fie toate la aceeași poziție (33–51 ms
  diferență; la prima redare după încărcare un stem putea porni din altă parte). Acum: toate sunt duse la aceeași
  poziție și așteptate, apoi pornesc odată.
- **Ținerea în pas.** Înainte: la 0,5 s, un stem mai departe de 40 ms sărea (un mic click); la tempo schimbat
  (1,15) diferența ajungea la 0,5 s, cu ~12 sărituri în 20 s. Acum: la 0,1 s viteza fiecărui stem e ajustată fin
  (±2 %, tonul rămâne); sare doar peste 150 ms. Măsurat: 0 sărituri, de obicei sub 35 ms. Neverificat pe placă.
- Auditul complet și planul pe etape: documentul „Reverb · MD & Track”, tabul „Audit și plan DAW”; docs/PLAN.md Pasul 1+.

## 2026-11-25 · Reverb online · ✦ agentul care programează echipa
- **Planific din link (lideri).** Înainte: liderul punea fiecare om de mână, loc cu loc. Acum: **✦ Programează echipa**
  (sus, lângă „8 duminici”) completează locurile libere din următoarele 5 săptămâni, iar **✦ Completează echipa** pe
  fiecare serviciu doar pe acela. Aceleași reguli ca asistentul de pe calculatorul bisericii (`fill_team` /
  `autoAssign` din plan.js): doar oameni din departament, nu în zilele blocate, sub limita lunară, nu de două ori în
  același serviciu, întâi cine a slujit mai puțin în ultimele 8 săptămâni; cine e deja pus rămâne. Fiecare om pus
  primește notificarea și răspunde Pot / Nu pot. Arată la final câte locuri a pus și câte au rămas libere și de ce.

## 2026-11-25 · 2026.11.25.6 · actualizările pe Windows
- **Windows nu primea actualizări.** Înainte: Windows nu lasă redenumit folderul din care rulează aplicația
  (Documente/Betleem/update/hub), deci fiecare actualizare se oprea cu EPERM (în erori.log). Acum: dacă redenumirea nu
  merge, fișierele noi se copiază peste cele vechi (package.json la final) și versiunea nouă pornește la următoarea
  deschidere. Test nou în `test/updater.test.js`. Pe PC-ul care s-a blocat, o dată de mână: închizi Reverb, ștergi
  folderul update\hub, redeschizi (pornește versiunea din aplicație, care ia singură actualizarea).

## 2026-11-25 · Reverb online · 📲 Reverb ca aplicație pe telefon (fără App Store / Play)
- Înainte: doar o pagină în browser (pe iPhone, „Adaugă pe ecranul principal” era pomenit doar la notificări).
  Acum: sub notificări, „Reverb ca aplicație pe telefon”: pe Android/Chrome un buton **Instalează** (o atingere),
  pe iPhone pașii Partajează → Adaugă pe ecranul principal. Iconița deschide Reverb pe tot ecranul; fără internet
  se deschide ultima copie a paginii (sw.js). Se poate ascunde cu ✕.
- Iconița de pe iPhone își ține propria memorie, deci prima dată cere linkul: pe pagina de întâmpinare există acum
  „Lipește aici linkul primit” → Intră.

## 2026-11-25 · 2026.11.25.5 · 📦 Reverb pentru Mac ca DMG, fără Terminal
- **Pachetul pentru alte biserici** (⚙ → Dă aplicația altor biserici). Înainte: Betleem-Mac.zip + două comenzi în
  Terminal (xattr, codesign). Acum: **Reverb.dmg**, făcut și semnat (ad hoc) pe Mac-ul bisericii: dublu-clic, tragi
  Reverb în Aplicații, apoi o singură dată Setări sistem → Confidențialitate și securitate → Deschide oricum. Aplicația
  se numește Reverb pe Mac; înăuntru fiecare biserică își vede numele. Linkurile vechi (…/Betleem-Mac.zip) dau tot DMG-ul.
- Pasul următor (când există cont Apple Developer): semnare Developer ID + notarizare, ca să se deschidă fără întrebare.

## 2026-11-25 · Reverb online · 🛠 pregătește serviciul de acasă (Proiectez + MD & Track)
- **Proiectez din link.** Înainte: doar „Programul de azi”, de citit. Acum: „Pregătește de acasă”: alegi serviciul
  (următoarele 10), atingi un moment și îl pregătești: ordinea (↑ ↓ ✕), cântări noi, pasaje biblice („Ioan 3:16-18”
  → carte, capitol, versete), cine conduce, minute, notă pentru echipă și **fundalul** (cele 19 fundaluri Reverb).
  Ajunge singur pe calculatorul bisericii în cel mult un minut; duminică operatorul doar deschide programul.
- **MD & Track din link.** Înainte: doar „Repetă acasă”. Acum: „Pregătește pentru trupă”: pentru fiecare cântare din
  program, **tonul** și **ordinea părților** (strofe, refren, bridge), cu acordurile transpuse văzute în dreapta.
  Liderii pot tot; echipa de Închinare (fără să fie lideri) poate doar tonul și ordinea (funcția `reverb_plan_item`).
- Prezentările, pozele, video-urile și track-urile se pun încă la biserică (urmează încărcarea lor de acasă).

## 2026-11-25 · 2026.11.25.4 · aspect calm și profesionist (aplicație + Reverb online)
- **Aspectul aplicației** (Planificare, Proiectez, MD&TRACK, Setări, cele trei uși). Înainte: fundal cu pete colorate
  (mov, turcoaz, portocaliu, roz), auriu strălucitor pe butoane, margini și chenare peste tot, butoane-pastilă, emoji ca
  iconițe. Acum: fundal grafit liniștit, un singur albastru discret pentru ce e important, sticlă doar unde se suprapun
  straturile, umbre fine în loc de chenare, iconițe desenate (SVG), Setările ca listă, serviciile din Planificare ca o
  cronologie cu dată. Tot în `public/calm.css` (încărcat ultimul); nicio funcție mutată. Culoarea aleasă de biserică în
  ⚙ → Aspect și funcții are în continuare prioritate. Modul zi și Modul rapid păstrează același aspect.
- **Telefonul (m.html)**: bară de tab-uri translucidă, iconițe desenate, culori grafit. Acordurile rămân la fel.
- **Reverb online (site-ul din link)**: reproiectat la fel: întâmpinarea bisericii compactă, „Anunță-mă când sunt
  programat” ca indicație mică cu iconiță, zonele Planific / Proiectez / MD&Track ca file cu iconițe, serviciile grupate
  pe luni ca o listă cu dată, ecranul „Bine ai venit” fără card. Înainte: carduri mari cu chenare și emoji.

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
