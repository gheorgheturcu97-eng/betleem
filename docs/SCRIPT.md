# Scriptul pentru Claude Code: pașii în ordine

Fă-i de sus în jos, în ritmul tău. Un pas = o sesiune. Bifează-i aici când sunt gata.
Pentru prezentarea de joi contează pașii 1–9; dacă nu ajungi la toți, sari peste ce nu e gata și arată ce merge.

**Cum îl folosești:** deschizi Terminal în folderul `betleem`, scrii `claude`, apoi lipești promptul sesiunii, cu
textul dintre ghilimele. O sesiune = un pas. La final, Claude Code testează, publică actualizarea și îți scrie ce
s-a schimbat („Înainte / Acum”). Repornești Betleem pe Mac și verifici.

Dacă ceva nu merge, scrie-i simplu ce ai văzut sau trage poza în Terminal. Dacă o sesiune s-a lungit mult, închide
cu `/exit` și începe una nouă cu același prompt: el citește STARE.md și știe unde a rămas.

**Ritmul:** cu Pro îți ajung, de obicei, una-două sesiuni pe zi; cu Max, mai multe. Dacă îți atinge limita, se
reîncarcă după câteva ore. 

---

## La începutul fiecărei sesiuni (îl adaugă singur prin CLAUDE.md, dar e bine de știut)
> „Citește CLAUDE.md, docs/STARE.md, docs/PLAN.md și docs/SCHIMBARI.md. Respectă regula de aur.”

## La sfârșitul fiecărei sesiuni
> „Gata? Rulează testele, verifică ecranul cu o captură, publică actualizarea, fă commit și push, actualizează
> STARE.md, PLAN.md și SCHIMBARI.md. Spune-mi în română, pe scurt, ce s-a schimbat și unde găsesc.”

---

## ☐ 1 · Pregătire pentru Peștera (înainte de duminică, fără funcții noi)
> „Mâine folosesc aplicația pentru prima dată la o slujbă reală, la biserica din Peștera (biserică mică de sat).
> NU adăuga funcții noi. Fă doar asta:
> 1) rulează testele și spune-mi dacă e totul verde;
> 2) verifică ce versiune am în Documents/Betleem/update/hub și dacă e ultima publicată;
> 3) fă-mi o listă scurtă de verificare pentru duminică dimineață: proiector, ecran de scenă, program, Ecran gol,
>    timer, telefoane, ce fac dacă se blochează ceva (repornire, unde e programul salvat);
> 4) spune-mi cum pregătesc programul de la Peștera ca o biserică separată în aplicație.
> Nu schimba codul decât dacă găsești o eroare care ar strica duminica. Dacă găsești una, repar-o și publică.”

**După slujbă:** notează pe telefon tot ce s-a încurcat. Cu asta începi pasul 2.

---

## ☐ 2 · Ce n-a mers la Peștera
> „Am folosit aplicația la Peștera. Iată ce n-a mers: <lista ta>. Repară pe rând, începând cu ce ar strica o
> duminică. Respectă regula de aur.”

## ☐ 3 · Harta cântării și AI-ul pe ghidul vorbit
> „Pasul 1a din docs/PLAN.md. Ce vreau, cap-coadă:
> - Fiecare cântare are o hartă salvată în bibliotecă (tempo, ton, măsură, secțiunile cu timpul lor). Versurile,
>   track-urile și comenzile vocale folosesc aceeași hartă. Unește cu ce există: cues, mark, beatOffset, bpm,
>   structura (arrangement). Nu face un al doilea sistem.
> - Repară descărcarea Whisper din aplicația desktop (la mine stătea la 0%). Arată progresul real și o eroare clară
>   dacă nu merge.
> - «Secțiunile din track-ul de cue» găsește singur track-ul vorbit (după nume ȘI ascultând care track are vorbire),
>   înțelege Verse, Chorus, Bridge, Pre-chorus, Tag, Outro, Intro, Instrumental, plus în română Strofa, Refren, Punte.
>   Pune marcajul la începutul secțiunii (anunțul vine de obicei cu o măsură înainte) și leagă fiecare secțiune de
>   slide-ul ei.
> - Marcajele se văd pe track cu nume și culoare. Le pot muta trăgând, redenumi și șterge cu clic dreapta.
> - Unește „Învață cue-urile” (manual) și varianta AI într-un singur buton «Secțiuni», cu două opțiuni: AI ascultă,
>   sau eu apăs.
> Testează pe track-ul de cue din «Domnul Miracolelor» din Documents/Betleem (caută-l). Spune-mi Înainte / Acum.”

## ☐ 4 · Cântări fără track: click, pad și ghid
Înainte de acest pas: pune arhiva cu vocile de ghid în `Documents/Betleem/ghid-voci.zip`.
> „Pasul 1b din docs/PLAN.md. Arhiva cu vocile de ghid e în Documents/Betleem/ghid-voci.zip. Dezarhiveaz-o în
> Documents/Betleem/ghid (NU în repo: e licențiată și rămâne locală) și leagă fiecare fișier de numele secțiunii lui.
> - Pentru o cântare fără track-uri, MD&TRACK face singur «track-ul virtual»: click + pad în tonul cântării + ghidul
>   vorbit cu o măsură înainte de fiecare secțiune, după harta cântării. Nu salvează audio, doar harta.
> - Construiesc harta live: pornesc click-ul cu BPM-ul cântării, iar în timp ce cântăm apăs 1, 2, 3… și se pune
>   secțiunea la măsura curentă. Maparea tastelor se poate schimba în Setări, fără conflict cu Cmd+1/2/3 și cu restul
>   scurtăturilor (verifică harta de taste existentă).
> - Clic dreapta pe linia de timp → «Pune aici…» cu lista secțiunilor.
> - Ghidul are fader propriu în mixer și rutare proprie (de obicei doar în căștile trupei).
> Spune-mi Înainte / Acum.”

## ☐ 5 · Export PDF și QR pentru program
> „Din Pasul 4 din docs/PLAN.md, doar exportul PDF și QR-ul:
> - În Planificare, la fiecare serviciu, un buton «📄 PDF»: programul aranjat frumos (biserica, data, ora, fiecare
>   moment cu minutele și ora la care începe, cântările cu tonul, cine conduce, invitații), cu logo-ul și culorile
>   bisericii. Opțional: la final, cântările cu acorduri, pentru muzicieni. Fără numere de telefon.
> - Un QR de pus la birou, care deschide mereu programul următor al bisericii (pagină doar de citit, fără PIN, fără
>   date personale). Deocamdată merge pe Wi-Fi-ul bisericii; din afară, abia după Pasul 3. Scrie asta lângă QR.
> - Combină cu ce există: pagina de telefon (live.html) și QR-ul de la 📱. Nu face o a treia pagină dacă una din ele
>   poate fi extinsă.
> Spune-mi Înainte / Acum.”

## ☐ 6 · Întâlnirea de marți: agendă, sarcini, remindere
> „Pasul 5 din docs/PLAN.md, prima parte. În Planificare, o zonă nouă «Lideri», separată de duminică:
> - Întâlniri (ex. «Marți, echipa de lideri»): agendă pe puncte, văzută de toți din timp; notițe în timpul întâlnirii.
> - Sarcini: ce, cine, până când, stare (de făcut / făcut). Din agendă transformi un punct în sarcină dintr-un clic.
> - Remindere: în aplicație (insignă cu numărul) și «📅 Pune în calendar» (fișier .ics pentru Apple, Google, Outlook).
> - Asistentul: «pune pe agenda de marți …», «ce sarcini am săptămâna asta», «dă-i lui X sarcina …».
> - Drepturi: doar liderii văd zona. Folosește PIN-ul de lider până la conturile din Pasul 3 și scrie asta în STARE.md.
> Refolosește lista de oameni din Echipe; nu face o a doua listă de oameni. Spune-mi Înainte / Acum.”

## ☐ 7 · Departamente, roluri și voluntari
> „Pasul 4 din docs/PLAN.md, partea cu oamenii, pe rețeaua bisericii (din afară abia după Pasul 3):
> - Departamente (închinare, ospitalitate, media, copii… fiecare biserică își face lista ei) și roluri în fiecare.
> - Programarea pe duminici: în grila lunară existentă alegi omul pentru fiecare rol. Extinde grila, nu face alta.
> - Fiecare voluntar are un link personal (QR) care deschide pagina lui: când e programat și la ce rol, butoanele
>   Confirm / Nu pot, datele blocate, limita «maxim N duminici pe lună». Fără parolă; linkul se poate anula.
> - Cine a blocat data sau și-a atins limita nu poate fi programat (apare gri, cu motivul).
> - Mesaj gata de trimis pe WhatsApp pentru fiecare om programat (liderul apasă trimite); numerele nu apar nicăieri
>   altundeva.
> - Planificat pentru până la 100 de oameni.
> Spune-mi Înainte / Acum.”

## ☐ 8 · Modul Predicator
> „Din Pasul 6 din docs/PLAN.md, modul Predicator:
> - Un QR (în 📱 Telefoane) care deschide pe telefon sau tabletă: slide-ul de acum și următorul, butoane mari ◀ ▶,
>   notițele predicii, timpul rămas din timerul slujbei.
> - Poate mișca doar slide-urile momentului «Predică» din programul curent. Regia vede că predicatorul are controlul și
>   îl poate prelua dintr-un clic.
> - Pe rețeaua bisericii, fără instalare, cu PIN de predicator separat.
> - Combină cu pagina de telefon existentă (live.html) dacă se poate, ca mod nou al ei.
> Spune-mi Înainte / Acum.”

## ☐ 9 · Repetiția prezentării pentru echipă
> „Prezint aplicația echipei. Fă-mi un scenariu de demonstrație de 15 minute care arată tot ce merge sigur:
> Planificare cu asistentul (vorbesc și face programul), PDF și QR, Lideri, voluntari, Proiectez, MD&TRACK cu
> secțiuni, telefoane și predicator. Pentru fiecare pas: ce apăs și ce spun. Treci prin el pe aplicația pornită local
> și repară orice se strică pe drum. Fără funcții noi.”

---

## După prezentare
### ☐ 10 · **Lumini pentru colinde** (Pasul 2):
   > „Pasul 2 din docs/PLAN.md. Dimmer-ul e Eurolite <model>; în manual scrie că primește MIDI <...>.”
### ☐ 11 · **Securitate și server** (Pasul 3), obligatoriu înainte de orice acces din afară:
    > „Pasul 3 din docs/PLAN.md. Întâi planul de securitate pe hârtie, arată-mi-l, abia apoi codul.
    > NAS-ul e <model>, Mac mini-ul are <X> GB.”
### ☐ 12 · **Pastorul își încarcă prezentarea singur** (Pasul 4):
    > „Pasul 4, pastorul își încarcă singur prezentarea din Planificare și o vede în biblioteca duminicii.”
### ☐ 13 · **Asistentul programează voluntarii** (Pasul 4):
    > „Pasul 4, programarea automată de către asistent, cu blocări, limite și împărțire corectă.”
### ☐ 14 · **Mesajele păstorului și mulțumirile** (Pasul 4):
    > „Pasul 4, mesajele păstorului: verset, încurajare, mulțumiri automate pentru cei care au slujit.”
### ☐ 15 · **Pad-uri de calitate și folderul unic de track-uri** (Pasul 1c):
    > „Pasul 1c din docs/PLAN.md; pad-urile sunt în <folder>.”
### ☐ 16 · **Îmbinări de secțiuni între cântări** (Pasul 1d):
    > „Pasul 1d din docs/PLAN.md.”
### ☐ 17 · **Obiective și graficul „oameni versus programe”, apoi jurnalul** (Pasul 5):
    > „Pasul 5, obiectivele și graficul lunar oameni versus programe.” Apoi: „Pasul 5, jurnalul zilnic.”
### ☐ 18 · **Proiecție peste ProPresenter** (Pasul 6):
    > „Pasul 6, studiul ProPresenter, fără cod.” Apoi câte un prompt pe fiecare funcție din listă.
### ☐ 19 · **Poze pe NAS cu Immich** (Pasul 7):
    > „Pasul 7 din docs/PLAN.md.”
### ☐ 20 · **River: miez și personalizare** (Pasul 8):
    > „Pasul 8 din docs/PLAN.md. Întâi arhitectura pe hârtie.”
