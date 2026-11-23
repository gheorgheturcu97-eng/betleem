# Betleem pe iPhone (aplicația propriu-zisă)

Aplicația e o ușă mică: ține minte adresa calculatorului bisericii și deschide Betleem de pe el (`/m.html`).
Tot ce e în aplicație vine de pe calculator, deci fiecare actualizare a lui Betleem apare singură și pe telefon.

## O singură dată, pe MacBook
1. Instalează **Xcode** din App Store și deschide-l o dată (acceptă licența, lasă-l să instaleze componentele iOS).
2. Xcode → Settings → **Accounts** → ＋ → Apple ID (contul tău).

## Pune aplicația pe iPhone
1. Dublu-clic pe `ios/App/App.xcodeproj` (se deschide în Xcode; prima dată descarcă singur Capacitor, ~1 minut).
2. Stânga sus: clic pe **App** (iconița albastră) → tabul **Signing & Capabilities** → la **Team** alege numele tău.
   Dacă zice că „ro.betleem.echipa” e luat, schimbă Bundle Identifier în ceva al tău, de ex. `ro.betleem.ghita`.
3. Leagă iPhone-ul cu cablul. Pe iPhone: Setări → Confidențialitate și securitate → **Mod dezvoltator** → Pornit (repornește).
4. Sus în Xcode alege iPhone-ul tău (în loc de simulator) și apasă **▶**.
5. Prima dată, pe iPhone: Setări → General → VPN și gestionare dispozitiv → încrede-te în contul tău.
6. Deschide **Betleem**, scrie adresa din laptop (📱 Telefoane → „Aplicația Betleem”), de ex. `192.168.1.20:4545`.

Cu Apple ID gratuit aplicația merge 7 zile, apoi o pui din nou cu ▶. Cu Apple Developer (99 $/an) o trimiți la
toată echipa prin TestFlight.

Vrei doar să vezi cum arată? În Xcode alege un **iPhone simulator** și apasă ▶ (pe același Mac cu Betleem pornit,
adresa e `localhost:4545`).
