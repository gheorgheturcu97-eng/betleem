# Securitatea: cine vede ce și cum se intră de acasă

Scris pentru Pasul 11. Ce e marcat ✅ există în cod (versiunea 2026.11.22.2). Ce e marcat ⏳ urmează.

## Principiul
**Aplicația stă pe rețeaua bisericii.** Din internet se vede doar o „ușă” mică, pe care o deschide liderul, și
care are numai paginile voluntarilor. Nu se deschide niciun port în router. Calculatorul bisericii nu se vede din
internet; un tunel (Tailscale Funnel) aduce doar cererile pentru acea ușă.

## Cine vede ce
| Cine | Cum intră | Ce vede / ce poate |
|---|---|---|
| Liderul, pe calculatorul bisericii | e pe acel calculator | tot |
| Lider pe alt calculator sau telefon din biserică | PIN de lider, pe Wi-Fi | Planificare, Lideri, setări |
| Operator (proiecție, sunet) | PIN de operator, pe Wi-Fi | Live, slide-uri, track-uri; nu schimbă programul |
| Predicator | QR cu PIN propriu, pe Wi-Fi | doar slide-urile predicii; regia preia oricând |
| Voluntar | **linkul lui personal** (din biserică sau ✅ de acasă, prin ușă) | programările lui, ✓/✕, zilele blocate, limita lunară, sarcinile lui; agenda liderilor dacă e lider |
| Oricine are QR-ul de la birou | ✅ din biserică sau de acasă | programul următor (fără nume de telefoane, fără date personale) |
| Oricine din internet | — | nimic altceva: orice altă adresă primește „Nu există” |

Numerele de telefon nu ies din Planificare (doar liderii le văd) și nu apar nici pe pagini, nici în PDF.

## Ce se întâmplă dacă…
- **Se pierde un telefon de voluntar:** liderul apasă „↻ Link nou” în fișa omului. Linkul vechi nu mai merge. ✅
- **Cineva încearcă PIN-uri la rând:** după 5 greșeli, adresa lui așteaptă 1 min, apoi 2, 4… până la o oră. ✅
- **Cineva încearcă linkuri la nimereală din internet:** linkurile au 24 de caractere aleatorii (imposibil de
  ghicit), iar după câteva încercări greșite adresa e blocată (429). ✅
- **Se pierde PIN-ul predicatorului:** „↻ PIN nou” în 📱 Telefoane. ✅
- **Se strică calculatorul:** copia zilnică din Documente/Betleem/backup (30 de zile) și, dacă e setat, de pe NAS. ✅
- **Vrem să vedem cine a intrat:** ⚙ Setări → 🔒 → „Ultimele intrări din internet”. Jurnalul păstrează ora, pagina
  și o amprentă a adresei, nu adresa întreagă. ✅

## Pașii pe care îi face proprietarul (o singură dată)
1. Pe calculatorul care stă pornit la biserică (Mac mini), instalează **Tailscale** de pe tailscale.com/download și
   intră cu un cont al bisericii.
2. În Terminal: `tailscale funnel --bg 4546` (4546 = ușa Betleem). Copiază adresa `https://….ts.net` pe care o scrie.
3. În Betleem: ⚙ Setări → 🔒 Acces de acasă și backup → bifează „Deschide ușa” și lipește adresa.
4. Montează NAS-ul (Finder → Go → Connect to Server) și pune calea folderului la „Copii de siguranță”.
5. Opțional, pentru celelalte biserici: Tailscale pe calculatoarele lor, în aceeași rețea privată (doar pentru noi,
   nu pentru public).

## Ce urmează (⏳)
- **11b:** liderii și operatorii folosesc Planificarea și proiecția de acasă, de pe telefon. Nu prin ușa publică, ci
  prin rețeaua privată Tailscale (doar dispozitivele adăugate de noi) sau cu cont personal pe dispozitiv. Până
  atunci, ușa publică rămâne doar pentru voluntari.
- Conturi personale pentru lideri (în locul unui PIN comun), cu „ieși de pe toate dispozitivele”.
- Copia de siguranță criptată când pleacă din clădire (dacă vom folosi și un cloud).
