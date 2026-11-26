# Planul: ce construim mai departe

Fiecare pas de mai jos are un **prompt gata de lipit în Claude Code**. Fă un singur pas o dată. Fiecare pas se termină cu:
teste verzi, captură de ecran verificată, actualizare publicată (`node scripts/publish-update.mjs`), commit și push,
apoi un rezumat scurt în română.

Deciziile de mai jos au fost luate împreună cu proprietarul. Nu le schimba fără să întrebi.

---

## Pasul 0. Duminica de probă (înainte de funcții noi)
Verifică pe aparatura reală tot ce scrie „neverificat” în STARE.md. Eu notez unde se încurcă voluntarii.

> Prompt: „Citește docs/STARE.md. Fă-mi o listă de verificare pentru o duminică de probă, cu pașii pe care îi apăs eu,
> pentru tot ce e marcat neverificat. Apoi, pe rând, după ce îți spun ce n-a mers, repară.”

## Pasul 1. Track-urile (pentru concertul de colinde)
Decizii:
- Fiecare cântare are o **hartă** salvată o dată pentru totdeauna: tempo, ton, măsură și unde începe fiecare secțiune.
  Versurile, track-urile și comenzile vocale folosesc aceeași hartă.
- **AI-ul pe ghidul vorbit** găsește singur track-ul vorbit (nu doar după numele „Cue” sau „Guide”) și ascultă
  „Verse”, „Chorus”, „Bridge”, inclusiv în română. Pune marcajul cu o măsură după anunț, la începutul secțiunii,
  arată secțiunile pe track și voluntarul le confirmă sau le mută dintr-un clic.
  Trebuie reparată descărcarea Whisper, care rămânea la 0%.
- **Cântările fără track**: aplicația își face singură „track-ul” din click, pad și ghid vorbit. Nu se salvează
  audio, doar harta.
  - Ghidul folosește vocea standard („One, two, three, four”, „Chorus”…) din arhiva pe care o dă proprietarul.
    Verifică licența înainte să o incluzi; dacă nu poate fi publică, rămâne doar local, în Documents/Betleem.
  - În timp ce merge click-ul, tastele **1, 2, 3…** pun secțiunile. Maparea se poate schimba, fără conflict cu
    Cmd+1/2/3, care sunt deja folosite. Clic dreapta pe track: „pune Refren aici”.
- **Pad-uri de calitate**, câte unul pe fiecare ton (din fișierele proprietarului), cu trecere lină la cântarea următoare.
- **Un singur folder pentru toate track-urile**, legat de bibliotecă, pe NAS când va exista.
- **Îmbinări**: de exemplu refrenul din „Domnul Miracolelor” urmat de „Tu ești vrednic”. AI-ul le leagă în versuri și
  în track-uri, cu potrivire de ton și tempo.
- Sărituri fluide între secțiuni, cu track-urile pregătite din timp.

> Prompt 1a: „Pasul 1 din docs/PLAN.md, partea cu harta cântării și AI-ul pe ghidul vorbit. Repară întâi descărcarea
> Whisper. Testează pe track-ul de cue din «Domnul Miracolelor» pe care ți-l dau.”
> Prompt 1b: „Pasul 1, cântările fără track: click + pad + ghid din vocile din arhiva <cale>, tastele 1-2-3 și clic dreapta.”
> Prompt 1c: „Pasul 1, pad-uri de calitate din folderul <cale> și folderul unic de track-uri.”
> Prompt 1d: „Pasul 1, îmbinări de secțiuni între cântări, făcute de asistent.”

### Pasul 1+. MD & Track ca DAW de worship (scriptul din 2026-11-25; auditul e în documentul „Reverb · MD & Track”, tabul „Audit și plan DAW”)
Fluxul: IMPORT → ANALIZĂ → ARANJARE → SONG MAP → REPETIȚIE → LIVE. O etapă începe doar când cea dinainte e stabilă pe
Mac mini. Ce schimbă sunetul vine oprit („Motor nou (probă)”) până trece o duminică de probă.
- [x] E1 Audit și diagnoză (test de sincronizare: 8 track-uri, Chromium).
- [x] E2a Pornire simultană + ținere în pas prin viteză (music.js `alignAt`/`keepInStep`, test/music-sync.test.js). Neverificat pe placă.
- [x] E2b Motor cu un singur ceas (`StemEngine` + `stem-worklet.js`), oprit implicit („Motor nou (probă)”). MacBook M1 Pro 16 GB. Neverificat pe placă.
- [ ] E2c Încărcarea următoarei cântări în avans; waveform din motor (fără a doua decodare).
- [x] E3 Click în motorul nou (pe eșantion, grid pentru harta de tempo). Harta din Ableton se leagă în E4.
- [ ] E4 Song Map (`songmap.js`): bară/beat, încredere, sursă, blocat; cue-urile vechi convertite.
- [ ] E5 Arrangement Workspace: snap bară/beat, loop pe secțiune, undo/redo, split/merge secțiuni, grupuri de track-uri.
- [ ] E6 Analiza într-un Worker, cu cache pe disc (peaks, BPM, structură); ghid + cue → propunere cu încredere, confirmată de om.
- [ ] E7 Versurile urmează Song Map-ul.
- [ ] E8 Biblioteca de pe NAS: index, scanare incrementală, potrivire titlu/BPM/ton/durată.
- [ ] E9 Comenzi vocale: cuvânt-declanșator, aliasuri, microfonul MD de pe placă.
- [ ] E10 MIDI: intrări, MIDI Learn pentru transport/secțiuni/click/loop.
- [ ] E11 Rutare cu bus-uri și grupuri; validare pe aparatura reală.

## Pasul 2. Lumini (concertul de colinde)
Decizii:
- Fără o a patra zonă. Un tab **„Fundaluri | Lumini”** cu scene (Închinare, Predică, Aprins), cu trecere lină între
  ele, legate de slide-uri sau de secțiuni.
- Prin **MIDI pe cablul USB**, către dimmer-ul Eurolite (modelul exact se află la biserică). DMX vine mai târziu,
  printr-o interfață USB-DMX ieftină.
- Fără aplicații de lumini cumpărate.

> Prompt: „Pasul 2 din docs/PLAN.md. Dimmer-ul e Eurolite <model>, primește MIDI <ce scrie în manual>.”

## Pasul 3. Temelia: securitate și server (OBLIGATORIU înainte de orice acces din afară)
Decizii:
- **Nimic deschis în router.** Calculatoarele și NAS-urile bisericilor (Betleem, Peștera…) se leagă printr-o rețea
  privată (Tailscale, gratuit). Telefoanele intră printr-un tunel securizat gratuit.
- **Conturi cu roluri**: voluntar, lider de echipă, coordonator. Fiecare vede doar ce îi trebuie, iar datele
  personale le văd doar coordonatorii. Până la 100 de oameni.
- **Logare fără email și fără parolă**: liderul adaugă omul cu numele și telefonul, iar aplicația face un link
  personal, trimis pe WhatsApp. Telefonul îl ține minte. Linkul se anulează dintr-un clic. Google sau Apple vin mai
  târziu, opțional.
- Conexiuni criptate, copii de siguranță zilnice, jurnal de acces.
- **NAS-ul** (modelul se află la biserică) e „casa” datelor: bibliotecă, track-uri, programe, backup.
  **Mac mini M4 Pro** e „creierul”: aplicația principală plus AI-ul local. Memoria se află la biserică; ideal 48 sau
  64 GB, iar la Mac mini nu se poate adăuga ulterior. Sarcinile grele se programează în afara slujbelor.

> Prompt: „Pasul 3 din docs/PLAN.md. Fă întâi un plan de securitate (cine ce vede, cum intră, ce se întâmplă dacă se
> pierde un telefon) și arată-mi-l înainte de cod. NAS-ul e <model>, Mac mini-ul are <X> GB.”

## Pasul 4. Planificare la nivel de Planning Center
Decizii:
- **Programe definite de fiecare biserică**: ce servicii are, ce îi trebuie la fiecare, invitați, minute.
  Liderul de închinare sau staff managerul scrie programul din timp, iar toți îl văd.
- **Departamente și roluri** (închinare, ospitalitate, media…). Fiecare om își vede programarea și rolul.
- **Voluntari**: își blochează datele, își pun o limită („maxim 2 duminici pe lună”), confirmă sau refuză din linkul
  lor, fără instalare (aplicație web pusă pe ecranul principal).
- **Asistentul programează** ținând cont de blocări și limite și împarte corect.
- **Notificări gratuite**: aplicația pregătește mesajele, iar liderul apasă trimite în WhatsApp; sau email.
  Notificări push mai târziu.
- **Mesaje de la păstor**: verset, încurajare, mulțumiri automate pentru toți cei care au slujit duminica.
- **Export PDF** frumos al programului (opțional cu acordurile) și un **QR permanent** la birou care arată mereu
  programul următor.
- Pastorul își **încarcă singur prezentarea** din Planificare, până în ultimul minut, și apare în biblioteca
  duminicii.

> Prompturi, câte unul pe rând: „Pasul 4, export PDF și QR”, „Pasul 4, departamente și roluri”, „Pasul 4, voluntari:
> blocări, limite, confirmări”, „Pasul 4, programarea făcută de asistent”, „Pasul 4, notificări și mesajele păstorului”,
> „Pasul 4, pastorul își încarcă prezentarea”.

## Pasul 5. Zona Lideri (separată de duminică)
Decizii:
- **Întâlnirea de marți**: agendă văzută de toți din timp, sarcini cu responsabil și termen, remindere,
  „pune în calendar”.
- **Viziunea și documentele** liderilor.
- **Obiective** cu procent atins. AI-ul citește planificarea și arată lunar un grafic „oameni versus programe”
  (cât timp merge spre oameni și cât spre programe).
- **Jurnal zilnic** (opțional, personal), cu un rezumat AI la final de zi față de obiectivele anului.
- Se construiește pe pași: întâi sarcinile și reminderele, apoi obiectivele, apoi jurnalul.

> Prompt: „Pasul 5 din docs/PLAN.md, prima parte: întâlnirea de marți cu agendă, sarcini și remindere.”

## Pasul 6. Proiecție peste ProPresenter
Mai întâi un studiu: ce îl face pe ProPresenter puternic. Apoi, pe rând, ce lipsește:
- 3 sau mai multe ecrane, fiecare cu aspectul lui;
- straturi care se șterg separat;
- treceri line între slide-uri;
- pasaje din Biblie peste mai multe capitole;
- mai multe aranjări pentru scenă;
- macro-uri;
- intrare video (cameră);
- animațiile din PowerPoint.

Plus **modul Predicator**: telefon sau tabletă cu înainte și înapoi, slide-ul următor, notițe și timpul rămas. Poate
mișca doar slide-urile predicii, iar regia preia oricând controlul. Intră prin QR, fără instalare, pe rețeaua bisericii.

> Prompt: „Pasul 6, studiu: caută pe internet funcțiile ProPresenter care contează pentru o biserică și compară-le
> cu docs/STARE.md. Dă-mi lista în ordinea importanței, fără să schimbi codul.” Apoi: „Pasul 6, modul Predicator.”

## Pasul 7. Poze
Decizii:
- Fotografii încarcă de pe telefon sau tabletă cu linkul lor, la **calitate originală**, direct în folderul
  bisericii de pe NAS. Folderele se fac automat după dată și eveniment, cu numele fotografului. Încărcarea continuă
  de unde a rămas.
- Căutare cu AI: se instalează **Immich** pe server și se leagă de aplicație, nu se construiește de la zero.
  Recunoașterea fețelor doar cu acord și oprită pentru copii.
- Opțional: o poză încărcată poate deveni fundal sau slide.

## Pasul 8. River (platforma pentru toate bisericile)
Decizii:
- **Miez comun**: proiecție, track-uri, planificare. Se actualizează doar semnat, de echipa Betleem.
- **Strat de personalizare** pe biserică (culori, logo, ce butoane se văd și unde, ce module, limba), păstrat într-un
  fișier pe care actualizările nu îl ating.
- Funcțiile noi vin **oprite**, cu mesajul „funcție nouă, vrei s-o activezi?”.
- **Agentul AI** schimbă doar stratul de personalizare, niciodată miezul.
- Aceleași reguli între miez și personalizare de la o versiune la alta. Mai târziu, alte limbi.

## Mereu
- Asistentul și „💡 Părere” peste tot. Feedback-ul oamenilor ajunge în propuneri.md, iar AI-ul propune îmbunătățiri,
  inclusiv despre comunicarea între departamente.
- Iconița din logo, installer refăcut cu biblioteca după importul din PCO.
