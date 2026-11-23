# ProPresenter 7 în Betleem: analiză și arhitectură (de aprobat înainte de cod)

Răspuns la cererea „Integrarea funcționalităților ProPresenter 7”. **Nimic din ce e mai jos nu e încă implementat.**
Respectă regula de aur din CLAUDE.md: construim pe ce există, nu facem o a doua aplicație.

---

## 0. Principiul de interfață cerut: „totul la vedere, iar în adânc se editează”
Fiecare funcție nouă are trei niveluri, mereu în aceeași ordine:

| Nivel | Cum ajungi | Ce faci acolo | Exemplu |
|---|---|---|---|
| **1. La vedere** | e deja pe ecran: o țeglă sau un buton | folosești pe loc, în slujbă | look-ul „Predică”, prop-ul „Logo”, tranziția „Fade” |
| **2. Meniul de context** | clic dreapta (sau două degete pe trackpad) | acțiuni rapide pe acel obiect | „Duplică”, „Aplică stilul și la celelalte”, „Pune pe ecran fără tranziție” |
| **3. Substratul de editare** | dublu-clic, apăsare lungă (~0,6 s) sau „✎ Editează în detaliu” din meniu | editorul complet al acelui obiect | editorul de slide cu straturi, editorul de look, de prop, de ecran de scenă |

Nota pentru Mac: „click-ul profund” (Force Click) nu ajunge la aplicațiile web din Electron/Chromium. De aceea îl
înlocuim cu **apăsare lungă** și **dublu-clic**, care merg și pe Windows, și pe telefon.

---

## 1. Ce avem deja (de refolosit, nu de refăcut)

| Funcția ProPresenter | Ce avem în Betleem | Unde e |
|---|---|---|
| Cântări cu grupuri și aranjamente | ✅ cântarea are etichete (Strofa, Refren…), iar aranjamentul se rearanjează din etichete | `packages/core/src/song.ts`, `parseSong`, `arrange`, `toSlides` |
| Playlist | ✅ programul (setlist), cu tipuri de momente; Planificarea; import din Planning Center | `src/plan.js`, `db.setlist` |
| Import PowerPoint / PDF | ✅ fiecare pagină ca imagine, cu tranzițiile din PowerPoint (fade, push, wipe…) | `public/importer.js`, `slidesFor()` |
| Stage display | ✅ ecran separat, pe alt monitor ales după nume; acum/următorul, acorduri, ceas, timerul slujbei, mesaj doar pe scenă | `public/stage.html`, `/api/displays` |
| Straturi pe ecranul principal | 🟡 fundal (imagine/video), text, logo, mesaj, numărătoare, negru, fixe în cod | `public/main.html` |
| Golirea straturilor | 🟡 ⏻ Ecran gol (Esc), ascunde textul, logo | `control.html` |
| Tranziții | 🟡 textul se estompează (0,25 s); paginile PowerPoint au tranzițiile lor | `main.html` |
| Aspectul textului | 🟡 un singur „look” pe ecran (font, mărime, culoare, poziție, umbră, majuscule); bara rapidă de deasupra slide-urilor | `db.display.main/stage`, `qLook` |
| Props | 🟡 doar logo-ul și mesajul | `live.logo`, `live.message` |
| Editor | 🟡 editorul de text al cântării; momentele programului se editează; **nu** există editor vizual de slide | `control.html` |
| Import ProPresenter 7 (.pro) | ❌ nu există (era doar în plan) | — |
| Looks salvate, props proprii, straturi libere pe slide, aranjări de scenă salvate | ❌ | — |

**Concluzie:** importul .pro, editorul vizual, straturile libere, props, looks și aranjările de scenă salvate sunt
lucruri noi. Restul se extinde: stage display, tranzițiile, aspectul, golirea pe straturi.

---

## 2. Ce am găsit în repository-ul ProPresenter7-Proto
- Licența e **MIT**: putem folosi și include fișierele `.proto`, păstrând licența. Fișierele sunt **neoficiale**,
  obținute prin inginerie inversă, și nu sunt susținute de Renewed Vision.
- `autogen-proto/` are 148 de fișiere `.proto` (rv.data.*), actualizate automat la fiecare versiune ProPresenter.
  Mai există dosarele „Proto 7.16”, „7.16.2” și „19beta”, deci **structura se schimbă între versiuni**.
- Structurile care ne interesează:
  - `Presentation`: titlu, CCLI (autor, editor, an), **cue_groups** (grupurile, cu nume și culoare),
    **arrangements**, **cues** (slide-urile), timeline, referință biblică, cântec (music key).
  - `Cue` → `Action` → `PresentationSlide`: `base_slide` (Slide), **notes**, **chord_chart**, **transition**.
  - `Slide`: **elements** (straturi), culoarea fundalului, mărimea (de obicei 1920×1080), uuid.
  - `Graphics.Element`: **bounds** (x, y, l, h), rotation, **opacity**, locked, **hidden**, fill, stroke, shadow,
    feather, flip, **text** și media (prin fill).
  - `Graphics.Text`: **rtf_data**, adică textul e salvat ca **RTF**, nu ca text simplu. Mai are aliniere verticală,
    margini, transform (majuscule), scale behavior, ChordPro.
  - `Playlist` / `PlaylistItem`: playlist-urile (inclusiv elemente ascunse, antet, prezentare, media).
  - Mai sunt `Look`, `Prop`, `Stage` (layouts), `Masks`, `Macros`, `Transition`, `Effects`. Pe acestea le putem
    citi mai târziu, ca să importăm direct looks/props/stage din ProPresenter.

### Ce înseamnă pentru noi
1. **Decodarea**: Protocol Buffers are nevoie de schemă. Două variante:
   - **A (recomandat):** `protobufjs`, bibliotecă JS pură (MIT, fără cod nativ), folosită **doar pe hub, la
     import**. Citește direct fișierele `.proto` din repository, deci o versiune nouă ProPresenter înseamnă doar
     fișiere `.proto` noi. Ar fi a doua dependență, după `ws`. **Cere aprobarea ta.**
   - **B:** un decodor mic, scris de noi, doar pentru câmpurile de care avem nevoie. Fără dependențe, dar fragil
     la versiuni noi și mai multă muncă.
2. **RTF**: scriem un cititor RTF mic, al nostru (fără dependențe): textul, fontul, mărimea, bold/italic,
   culoarea, alinierea. Ce nu înțelegem păstrăm ca text simplu și **raportăm** („formatare parțială”).
3. **Media**: un `.pro` simplu ține doar **căile** spre imagini și video de pe calculatorul cu ProPresenter.
   Exportul de playlist (`.proPlaylist`, care e o arhivă zip) include și fișierele. Importul caută media în pachet,
   apoi în folderul ales de tine. Ce lipsește apare în raport, nu se ignoră în tăcere.
4. **Nimic distructiv:** fișierele ProPresenter doar se citesc, pe o copie. Nu scriem niciodată înapoi în ele.

---

## 3. Modelul comun de date (extinde ce avem)
Toate pozițiile sunt pe o pânză virtuală de **1920×1080**. Ecranele le scalează. Totul se salvează în
`Documents/Betleem/library.json`, ca acum: colecții noi, fără schimbarea celor vechi.

```text
Presentation   { id, title, source:{kind:'pro'|'pptx'|'betleem', file, version}, ccli{}, groups[], arrangements[],
                 slides[], defaultTransition?, meta{} }            → db.presentations (NOU)
SlideGroup     { id, name, color, slideIds[] }                     (= cue_groups; la cântări = etichetele existente)
Arrangement    { id, name, groupIds[] }                            (= aranjamentul cântării, pe care îl avem deja)
Slide          { id, layers[], background?, transition?, notes, chords?, hidden?, label? }
Layer          { id, type:'text'|'image'|'video'|'shape', name, x,y,w,h, rotation, opacity, z, hidden, locked,
                 text?, style?{font,size,weight,italic,color,align,valign,upper,shadow,stroke,lineHeight},
                 src?, fit?, loop?, fill?, radius?, anim?{in,out,duration} }
MediaAsset     { file (în media/), kind, w,h, duration?, from? }   (media/ există deja)
Playlist       = programul (db.setlist / plan.services); PlaylistItem = momentul, cu kind nou 'presentation'
                 (presentationId); song, bible, media rămân ca acum
Prop           { id, name, layers[], on:false, screens:['main','stage'] }   → db.props (NOU); live.props = [id…]
Transition     { type:'cut'|'fade'|'crossfade'|'dissolve' (apoi 'slide','zoom'), duration }
Look           { id, name, main:{ show:{text,bg,props,media}, style?, transition? }, stage:{ layoutId }, props?[] }
                 → db.looks (NOU); live.look; db.display rămâne „look-ul curent”, deci totul e compatibil
StageLayout    { id, name, widgets[{type:'current'|'next'|'lyrics'|'chords'|'title'|'clock'|'timer'|'notes'|'message',
                 x,y,w,h, style}] }                                 → db.stageLayouts (NOU); cel implicit = stage.html de azi
Screen         = monitoarele, alese după nume (avem /api/displays)
```
Cântările rămân cântări. Un slide de cântare e generat din text, ca azi, și primește aspectul din look. Nu le
transformăm în prezentări cu straturi, ca să rămână ușor de editat, de transpus și cu acorduri.

---

## 4. Modulele și cum comunică
Toate trec prin același drum care există deja: **mesaj WebSocket → hub (server.js) → `broadcast()` → ecrane**.

| Modul | Fișiere noi | Fișiere modificate | Ce face |
|---|---|---|---|
| 1. Compatibilitate ProPresenter | `src/propresenter/decode.js`, `rtf.js`, `map.js`, `proto/` (MIT) | `server.js` (rută `/api/import/pro`), `package.json` (dacă alegi varianta A) | .pro / .proPlaylist → Presentation sau Song + media + raport |
| 2. Slide Engine | `public/render.js` (un singur desenator de straturi) | `main.html`, `stage.html`, `control.html` (previzualizări) | același desen în ecran, în listă, în editor |
| 3. Multi-layer | (în render.js + editor) | `server.js` `slidesFor()` (slide-uri cu straturi) | straturi independente, editabile, niciodată imagini „turnate” |
| 4. Media Engine | — | `importer.js`, `server.js` | refolosește media/, video, conversiile existente |
| 5. Stage Display | — | `stage.html` (widget-uri), `server.js` | aranjări de scenă salvate; cea implicită = ce e azi |
| 6. Props | — | `main.html`, `control.html` (tab „Props” lângă Fundaluri / Lumini) | logo, bannere, texte permanente, pornite și oprite separat |
| 7. Transitions | `public/transitions.js` | `main.html` (două straturi pentru crossfade) | cut / fade / crossfade / dissolve, cu durată; implicit pe look, prezentare sau slide |
| 8. Looks | — | `server.js`, `control.html` (bandă de look-uri deasupra previzualizărilor), `main.html`, `stage.html` | „Serviciu / Predică / Închinare” dintr-un clic |
| Editorul (substratul) | `public/editor.js` (în control.html, fereastră peste) | `control.html` | dublu-clic / apăsare lungă pe slide, prop, look, scenă |

---

## 5. Cum arată în aplicație (nivelurile din §0)
- **Proiectez, deasupra previzualizărilor**: o bandă de **Looks** (țigle: Serviciu, Predică, Închinare…).
  - Clic = activează.
  - Clic dreapta = Duplică / Redenumește / Setează ca implicit.
  - Dublu-clic = editorul de look (ce se vede pe Sală, ce aranjare are Scena, ce props, ce tranziție).
- **Lângă Fundaluri | Lumini**: tabul **Props**, cu țigle pornit/oprit. Dublu-clic = editorul de prop, cu aceleași
  straturi ca slide-ul.
- **Pe slide-uri**:
  - clic = pe ecran (ca acum);
  - clic dreapta = Duplică, Copiază formatarea, Lipește formatarea, Aplică stilul la toate slide-urile selectate,
    Tranziție, Ascunde;
  - dublu-clic sau apăsare lungă = **editorul de slide**: pânza 16:9, straturile trase cu mouse-ul, mânere de
    mărime, panoul cu proprietăți (font, mărime, greutate, culoare + transparență, aliniere, X/Y, lățime/înălțime,
    fundal), lista de straturi (ordine, vizibil, blocat), Undo/Redo (Cmd/Ctrl+Z, ⇧Z).
- **La Scenă**: dublu-clic pe previzualizarea Scenă = editorul de aranjare a scenei (widget-uri trase pe pânză).
- **Import**: tragi un `.pro` sau `.proPlaylist` în program, la fel ca PowerPoint-ul azi. La final apare raportul:
  „12 slide-uri, 3 grupuri, 2 aranjamente, 4 imagini, 1 video lipsă: …”.

---

## 6. Ordinea de lucru (fiecare fază se testează și se aprobă separat)
1. **Import ProPresenter**, doar citire:
   - .pro de cântare → cântare cu grupuri și aranjamente;
   - .pro de prezentare → Presentation cu straturi;
   - .proPlaylist → program + media;
   - raport complet;
   - teste pe **fișierele voastre reale**.
2. **render.js + straturi pe ecran**. Prezentările importate apar corect pe Sală, în previzualizări și pe Scenă.
   Cântările nu se schimbă.
3. **Tranziții**: cut, fade, crossfade, dissolve, cu durată; implicit pe look, prezentare sau slide.
4. **Editorul de slide** (substratul), cu Undo/Redo, duplicare și stiluri copiate sau aplicate pe mai multe slide-uri.
5. **Props**.
6. **Looks**.
7. **Aranjările de scenă** (Stage layouts) și editorul lor.
8. Mai târziu: slide / zoom, animații pe straturi, import de looks, props și stage direct din ProPresenter, macro-uri.

Înainte de fiecare fază: o copie a `library.json` (avem deja backup-ul zilnic; facem unul și manual) și teste
automate noi. La final: STARE.md, SCHIMBARI.md („Înainte / Acum”) și documentația modulului.

---

## 7. Riscuri (spuse dinainte)
- **Fișierele .proto sunt neoficiale** și se schimbă între versiuni. Importul trebuie să fie tolerant: ce nu
  recunoaște trece în raport, nu strică importul. Testăm pe versiunea ProPresenter pe care o aveți.
- **RTF**: formatarea complexă (mai multe fonturi într-un rând, efecte) poate ieși simplificată. Textul se păstrează
  mereu, iar raportul spune ce s-a simplificat.
- **Media lipsă** la `.pro` simple (căi de pe alt calculator). Soluția e exportul `.proPlaylist` sau alegerea
  folderului.
- **Duminica**: straturile și tranzițiile noi ating ecranul principal. Le pornim în spatele unei opțiuni până le
  verifici. Cântările și PowerPoint-ul merg exact ca azi până atunci.
- **Performanța pe Mac mini**: straturi CSS, nu canvas sau WebGL; video doar pe stratul de fundal sau pe un strat
  video. Măsurăm înainte de a porni implicit.
- **Mărimea lucrării**: e cel mai mare pas de până acum. Fazele 1–3 sunt utile singure; editorul (4) e cel mai mult
  de lucru.

---

## 8. Ce am nevoie de la tine ca să încep
1. **Aprobarea** acestui plan și alegerea pentru decodare: **A** (`protobufjs`, recomandat) sau **B** (decodor
   propriu).
2. **2–3 fișiere reale**:
   - o cântare `.pro`;
   - o prezentare `.pro` cu imagini (de exemplu anunțuri);
   - un export de playlist `.proPlaylist`.
   Plus versiunea de ProPresenter de pe care vin (meniul ProPresenter → About).
3. Ce looks folosiți de obicei (de exemplu Serviciu, Predică, Închinare) și ce vrea echipa să vadă pe Scenă în
   fiecare.
