# Bethlehem Network Churches

O aplicație gratuită și open-source pentru rețeaua de biserici Bethlehem: planificarea serviciului, echipe,
biblioteca de cântări comună, proiecția versurilor (înlocuiește ProPresenter / FreeShow), modul live pe telefon,
ședința de joi și un asistent AI local.

## Ce funcționează deja

**Local Hub**: rulează pe Mac Mini-ul bisericii, fără internet.

| Pagina | Pentru cine | Ce arată |
|---|---|---|
| `/control.html` | operatorul media | programul, slide-urile, căutare, import din link, editor, fundaluri |
| `/main.html` | proiectorul (sala) | doar versuri, pe fundal |
| `/stage.html` | ecranul de pe scenă | versuri cu acorduri, slide-ul următor, ceasul |
| `/live.html` | telefoanele oamenilor | versuri live, acorduri, programul; cu PIN, controlează slide-urile |

## Pornire pe Mac Mini

1. Instalează **Node.js 22.18 sau mai nou** (de pe nodejs.org, varianta LTS).
2. Deschide Terminal în folderul proiectului:
   ```bash
   cd apps/local-hub
   npm install
   PIN=1234 LEADER_PIN=9999 npm start
   ```
   - `PIN` = pentru operatori (pot muta slide-uri, edita versuri)
   - `LEADER_PIN` = pentru lider (poate schimba programul)
3. Terminalul îți arată adresele, de exemplu `http://192.168.1.20:4545/control.html`.
4. Pe Mac Mini deschide `/main.html` pe proiector și `/stage.html` pe ecranul de scenă. Dublu-clic = ecran complet.
5. Pe telefoane, în rețeaua Wi-Fi a bisericii: `http://192.168.1.20:4545` (poți face un cod QR cu adresa asta).

Logo: pune `logo.png` în `apps/local-hub/data/media/`. Fundalurile se încarcă din pagina de control.

Taste: **Spațiu / →** înainte, **←** înapoi, **B** ecran negru, **L** logo.

## Cum scrii o cântare
```
Strofa 1:
[G]Mare e [D]Domnul și [Em]vrednic de laudă

Refren:
[C]Aleluia, [D]aleluia
```
Linie goală = slide nou. Poți lipi și acorduri **deasupra** versurilor; se convertesc automat.

## Pentru dezvoltare cu Claude Code
Deschide folderul cu Claude Code. Fișierul `CLAUDE.md` îi spune tot ce trebuie: structura, regulile și ce urmează.
Specificația completă e în `docs/SPEC.md`, iar ordinea de lucru în `docs/ROADMAP.md`.

Prima comandă bună pentru Claude Code:
> Citește CLAUDE.md și docs/ROADMAP.md, rulează testele, apoi începe Faza 1, punctul 2 (importul de pe resursecrestine.ro).

## Baza de date (Supabase)
1. Fă un cont gratuit pe supabase.com și un proiect nou.
2. În **SQL Editor** rulează `supabase/migrations/0001_network.sql`, apoi `supabase/seed.sql`.
3. Urmează instrucțiunile din capul fișierului `seed.sql` ca să devii administrator.

## Teste
```bash
cd packages/core && npm test
cd apps/local-hub && npm test
```
Testele de securitate pentru baza de date: `supabase/tests/README.md`.

## Licență
MIT, liber de folosit în orice biserică.
