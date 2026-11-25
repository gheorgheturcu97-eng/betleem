# Planificarea online (Pasul 3, varianta 2: cloud gratuit): planul de securitate

Status: **propunere, de aprobat de proprietar înainte de cod** (2026-11-24). Construiește peste ce există deja:
schema `supabase/migrations` (biserici, roluri lider/operator/muzician, coduri de biserică), `src/cloud.js`
(client Supabase fără dependențe), `src/plan.js` (programul și operațiile lui) și linkurile personale ale voluntarilor.

## Reverb, rețele și biserici (decizia proprietarului, 2026-11-24)
- Aplicația se numește **Reverb** (reverbw.com) și devine unealta de resurse pentru bisericile care se înscriu.
  Betleem e o biserică din Reverb (prima). Folderul de date rămâne `Documents/Betleem` pe calculatoarele existente.
- **Rețeaua Betleem** (bisericile proprietarului, ~12): văd **biblioteca de cântări a rețelei** (cea a Betleem-ului),
  doar citire; fiecare își poate adăuga cântările ei.
- **Orice altă biserică din Reverb**: **nu vede biblioteca Betleem**. Își scrie singură cântările sau le importă din
  Planning Center / ProPresenter. Regula stă în baza de date (RLS): `songs.network_id` / `songs.church_id`,
  iar o biserică vede o cântare doar dacă e a ei sau e a rețelei din care face parte.
- **Bisericile din Rețeaua Betleem** (lista proprietarului, 2026-11-24; numele lipsă le completează el, până atunci
  apare localitatea): Betleem · Medgidia (biserica principală, a ei e biblioteca rețelei) · Rhema · Cobadin ·
  Râul Vieții · Peștera · Izvorul (de confirmat: nume sau localitate) · Mircea Vodă · Satul Nou · Cuza Vodă · Băneasa.
- Schema veche avea „cântări comune pentru toată rețeaua” (`church_id = null`): se înlocuiește cu rețele explicite.

## Ce se schimbă pentru oameni
- Planificarea se deschide **din browser, de oriunde** (telefon, laptop de acasă), la o adresă fixă
  (ex. `https://betleem-app.github.io/planificare`), **chiar dacă Mac mini-ul e închis**.
  Se poate „instala” pe telefon ca aplicație (Adaugă pe ecranul principal).
- Betleem de pe Mac mini **trage singur** programul nou la pornire și la câteva minute, și îl ține local:
  duminica totul merge și fără internet. Ce schimbi în Betleem urcă înapoi în cloud.
- **Track-urile, fundalurile și numerele de telefon NU urcă în cloud.** Cântările (versuri + acorduri) urcă doar
  pentru biserica lor și rețeaua ei (decizia proprietarului, 24 nov: membrii repetă de pe telefon); nu în depozitul public.

## Cine vede ce (conturi cu roluri)
| Rol | Cine | Vede | Poate |
|---|---|---|---|
| Coordonator | păstorul, tu | tot, toate departamentele | adaugă/scoate oameni, schimbă roluri, „ieși de peste tot” |
| Lider de departament | lider închinare, media… | programul întreg + echipa lui cu telefoane | programează oamenii din departamentul lui |
| Membru / voluntar | muzicieni, tehnicieni… | programul (ce, când, cine slujește, fără telefoane), programările lui | ✓/✕ la programări, zile blocate, notițe |
| Oricine fără cont | — | nimic | — |

Numerele de telefon stau într-un tabel separat, citit doar de coordonatori și de liderul departamentului (regulă în
baza de date, nu doar în pagină).

## Cum se intră (fără parolă de ținut minte)
1. Coordonatorul adaugă omul în Betleem (nume, telefon, rol, departament). Aplicația face un **link personal**
   (24+ caractere aleatorii) și îl trimiți pe WhatsApp, ca acum.
2. Omul deschide linkul o dată; telefonul primește o sesiune și **ține minte** contul (nu mai cere nimic).
3. Opțional, mai târziu: „Intră cu Google / Apple” pentru cine vrea pe mai multe dispozitive.

Linkul se schimbă cu „↻ Link nou” (cel vechi moare), iar „⛔ Scoate” îi închide imediat toate sesiunile.

## Ce se întâmplă dacă…
- **Se pierde un telefon:** „↻ Link nou” + „ieși de pe toate dispozitivele” pentru acel om. Telefonul pierdut nu mai vede nimic.
- **Pleacă cineva din echipă:** „⛔ Scoate”: contul se închide, datele lui personale se șterg (GDPR).
- **Cineva încearcă linkuri la nimereală:** sunt imposibil de ghicit, iar încercările sunt limitate.
- **Pică internetul la biserică:** Betleem lucrează cu ultima copie; trimite schimbările când revine internetul.
- **Două persoane schimbă programul în același timp:** fiecare schimbare e o operație mică (ca acum în Betleem);
  se aplică pe rând, iar dacă două ating același loc, câștigă ultima și apare în „Istoric”.
- **Supabase pune proiectul pe pauză (planul gratuit, după 7 zile fără folosire):** Betleem îl atinge zilnic.
- **Furnizorul dispare / vrem să plecăm:** copia completă e mereu și pe Mac mini + NAS; programul se mută oricând.

## Cum e făcut (pe scurt, pentru cine continuă codul)
- **Supabase (gratuit):** tabelele `plans` (documentul programului pe biserică, fără telefoane), `plan_ops`
  (istoricul operațiilor), `people_private` (telefoane: RLS doar coordonator / lider de departament),
  `invites` (amprenta linkului, nu linkul). Toate cu RLS; nimic citibil fără cont.
- **Link personal → sesiune:** o funcție Supabase (Edge Function, gratuită) primește linkul, îl verifică după
  amprentă și dă sesiunea. Cheia de administrator stă doar în funcție, niciodată în pagină sau pe calculatoare.
- **Pagina web:** aceeași `planning.html`, cu un mod „online” care vorbește cu Supabase în loc de Mac mini,
  folosind același `plan.js`. Găzduită gratuit pe GitHub Pages (codul paginii e public, datele nu).
- **Mac mini:** `cloud.js` + sincronizare (trage la pornire și la 2–5 minute, urcă operațiile locale).

## Ce face proprietarul (o singură dată)
1. Cont gratuit pe supabase.com → proiect nou „betleem” (regiunea Frankfurt).
2. Îmi spune adresa proiectului și cheia publică (anon); cheia secretă (service role) o pune doar el, în setările
   funcției, după pașii pe care i-i arăt. Nu o trimite în chat.
3. Activează GitHub Pages pe depozit (un clic, îi arăt unde).

## Unde suntem
- ✅ **Pasul 1 (2026-11-24):** proiectul Supabase „Reverb app” (`wkkqvlnjauwpnuiwldem`, eu-west-1 Irlanda, gratuit).
  Tabele + reguli: `supabase/migrations/2026112420*`; rețeaua și cele 8 biserici: `supabase/seed-retea-betleem.sql`.
  Testul „cine vede ce” (`supabase/tests/cine-vede-ce.sql`) trece: membrul vede programul fără telefoane și nu
  poate scrie; liderul Rhema citește biblioteca Betleem dar n-o poate schimba; o biserică din afară vede doar ale ei
  și nu se poate băga în Betleem; anonimul nu vede nimic. Avertismentele de securitate Supabase: 0.
  Adresa și cheia publică: `apps/web/reverb-config.js`. Schema veche (nefolosită): `supabase/arhiva/`.
- ✅ **Pasul 2 (2026-11-24):** funcția `reverb-link` (supabase/functions/reverb-link: redeem / create / renew / remove;
  cheia secretă o dă Supabase funcției, n-o scrie nimeni) și pagina Reverb online `apps/web/index.html`
  (intră cu linkul `#t=…`, rămâne conectat; coordonatorul face linkuri, ↻ link nou, scoate). Verificat cap-coadă
  cu o biserică de probă (link → cont → vede doar biserica lui; liderul nu poate face linkuri; anonimul nu vede nimic).
  Găzduire: GitHub Pages din ramura `gh-pages` (proprietarul o pornește din Settings → Pages).
- ✅ **Departamente (2026-11-24):** tabelul `departments` (Betleem: Închinare, Copii, Asimilare și ospitalitate, Media),
  `members/invites.departments[]` + `leads[]` (liderul conduce unul sau mai multe); telefoanele: coordonatorul pe toate,
  liderul doar ale departamentelor pe care le conduce (`private.leads_any`). Pagina: bife pentru departamente, ✎ pe
  fiecare om (rol + departamente + ce conduce), filtru pe departament. Verificat cu Playwright pe o biserică de probă.
- ✅ Râul Vieții: departamentele Închinare și Tineret (2026-11-24).
- ✅ **Pasul 3a (2026-11-25): 🗓 Program în Reverb online.** `plans.doc` = același document ca `src/plan.js` (fără telefoane,
  linkuri, e-mailuri); `apps/web/core/plan.js` e o copie a lui `src/plan.js` (acum fără importuri Node). Liderii scriu tot
  documentul cu verificare de versiune (dacă altcineva a salvat între timp, operația se aplică din nou pe cea nouă).
  Membrii: doar `reverb_plan_answer` (✓/✕ pe locul lor) și `reverb_plan_away` (zilele lor). Fiecare om are `person_id`
  (rămâne la ↻ Link nou, același în toate bisericile lui); `reverb_people` = numele și departamentele, fără telefoane.
  Departamentele programului vin din `departments` (poziții implicite: Închinare, Media, Copii, Asimilare, Tineret).
  `churches.hub_url` (doar adrese din rețeaua locală) → Proiectez / MD & Track din link; `churches.logo_url` = logoul.
  Migrări: `20261124233000_reverb_program_online.sql`, `20261125090000…`, `20261125091000…`. Verificat cu Playwright.
- ✅ **Pasul 3b (2026-11-25): legătura cu calculatorul bisericii.** Cheie per calculator (`hub_devices`, doar amprenta;
  o face coordonatorul: `reverb-link` → `hubKey`; cheia veche se oprește). Calculatorul: `src/reverb-sync.js` — la 1 minut
  și la 3 s după o schimbare: `reverb-hub` pull → îmbinare în trei (servicii / departamente / oameni, față de copia pe care
  au căzut ultima dată de acord) → push cu verificare de versiune. Prima dată: departamentele cu același nume se unesc,
  oamenii cu link preiau voluntarul local cu același nume. Doar `services`, `departments`, `volunteers` (fără telefon,
  e-mail, link) călătoresc; ședințele, sarcinile, jurnalele rămân pe calculator. Cheia + copia comună:
  `Documents/Betleem/reverb-online.json` (0600). Verificat cap-coadă (calculator de probă ⇄ pagina linkului).
- De aplicat (a așteptat confirmarea): `20261125110000_reverb_person_id_default.sql` (person_id automat la orice link nou).
- ⏳ **Feedback după slujire** (cerut 2026-11-24): cine a fost programat la un serviciu primește după serviciu o
  notificare „Cum a fost?” și scrie un feedback (ce a mers, ce nu); îl citesc coordonatorul și liderul departamentului.
  Vine după Pasul 3 (are nevoie de programările online); notificarea = pe pagina Reverb (și push dacă e instalată pe telefon).
- ✅ **Cântările în Reverb online (2026-11-24):** 628 de cântări Betleem (din exportul MacBook) urcate prin funcția
  `reverb-import` (cheie de o singură folosință, doar amprenta în `import_tokens`; potrivire după local_id, fără dubluri).
  Pagina: 🎵 Cântări (caută, ton, acorduri da/nu, ⤢ toată pe ecran cu `core/fit.js`). `apps/web/core/song.js` și
  `fit.js` sunt copii din build/hub/core-dist și apps/local-hub/public: se recopiază când se schimbă.
  De făcut: butonul din aplicație „⇧ Trimite biblioteca în Reverb” (biblioteca reală de pe Mac mini, cu cântările ProPresenter).

## Ordinea construcției
1. Tabelele + regulile RLS + teste (cine vede ce) — fără să schimbe nimic în Betleem.
2. Linkurile personale → conturi; pagina „Intră”.
3. Pagina Planificare online (citire), apoi scriere pentru lideri.
4. Sincronizarea în Betleem (pornită dintr-un buton în ⚙, oprită implicit; duminica nu se schimbă nimic).
