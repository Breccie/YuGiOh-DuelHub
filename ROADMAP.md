# Roadmap zum Online-Release

Das langfristige kampagnenzentrierte Sandbox-Zielbild und der Ausbauplan stehen in
[docs/product-vision.md](docs/product-vision.md).

Stand: 2026-08-05

## Release-Reihenfolge

| Phase | Ziel | Status |
| --- | --- | --- |
| 1. Online-Basis | Env-Profile, sichere Migrationen, API-Health, Seed-Schutz | Implementiert und lokal geprueft |
| 2. Kampagnenflow | Login -> Kampagnenauswahl -> aktive Kampagne -> serverseitige Guards | Implementiert, Rollen-/Online-Smoke weiter ausbauen |
| 3. Gemeinsamer Editor | All-Cards-Katalog, Besitzfilter, Deck-, Binder- und Wunschlistenfluss | Implementiert und per Desktop/Mobile-Playwright abgenommen |
| 4. Regelversionen | Vollständige Sandboxbereiche, Versionierung und historische Referenzen | Implementiert; zentrale Limits und Gates werden serverseitig erzwungen |
| 5. Custom Packs | Editor, Zugriff, Planung, Reward-only und idempotentes Öffnen | Implementiert und lokal integriert geprüft |
| 6. Trades und Turniere | Atomare Credits, Freigaben, Modi, Deck-Snapshots, Standings und MVP | Implementiert und lokal integriert geprüft |
| 7. Deployment-Abnahme | Postgres-Smoke und Smoke gegen echte Vercel/Render-URLs | Lokal/CI vorbereitet; Produktions-Cutover separat zu bestätigen |

## P0 vor externem Deployment

- `npm run db:generate`, `typecheck`, `lint`, `test`, `build` muessen gruen sein.
- `npm run test:e2e:online` muss lokal gegen Postgres gruen sein.
- Render `/health` muss mit `APP_MODE=production` starten.
- Vercel muss `API_BASE_URL` verwenden und darf ohne lokale DB keine Kampagnendaten anzeigen.
- `CORS_ORIGIN` muss exakt auf die Vercel-URL zeigen.

## P1 fuer den Freundeskreis-Release

- Kampagnenauswahl nach Login manuell durchtesten.
- Dashboard pro Kampagne auf offene Aktionen pruefen: Gratispacks, freigeschaltete Packs, Rewards, Trades, Match-Reports.
- Deckeditor mit echter Online-Kampagne durchspielen: Karte hinzufuegen/entfernen, Banlist wechseln, Genesys-Werte sehen, `.ydk` exportieren.
- Trade-UI manuell mit zwei Accounts testen: wer ist dran, was ist reserviert, was wird uebertragen.
- Turnier-UI manuell testen: Einladung, Pairing, Score melden, Gegner bestaetigt, Abschluss, Credits.
- Custom Pack mit produktiver Kampagne erstellen, simulieren, veroeffentlichen und einen idempotenten Retry der Oeffnung pruefen.
- Geplante Regelversion einmal per Datum und einmal per Progressionsschritt aktivieren und die historischen Referenzen kontrollieren.

## Nach dem Cutover

- Deployment-Smoke gegen echte Vercel/Render-URLs regelmäßig ausführen.
- Pack-/Promo-Daten weiter vervollstaendigen.
- Nicht matchbare offizielle Genesys-Karten als Known Issue pflegen.
- E-Mail/Passwort-Reset oder bessere Account-Wiederherstellung ergaenzen.
- Mehrbieter-Auktionen sind als eigenes, kampagnengebundenes Produkt mit Karten- und Creditreservierung, Überbieten, Abbruch ohne Gebot und atomarem Abschluss umgesetzt. Zeitlich moderierte Draft-Tauschfenster bleiben über die versionierten Tauschfensterregeln steuerbar.
- Beitrittsanfragen mit Owner-/Organizer-Freigabe und die einmalige `PLAYER_CHOICE`-Startpackauswahl sind umgesetzt und integriert getestet.

## Nicht-Ziel

Keine In-App-Duelle. EDOPro bleibt extern; Duel Hub speichert nur Organisation, Deckexporte, Match-Reports, Bestaetigungen und Rewards.
