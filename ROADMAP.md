# Roadmap zum Online-Release

Das langfristige kampagnenzentrierte Sandbox-Zielbild und der Ausbauplan stehen in
[docs/product-vision.md](docs/product-vision.md).

Stand: 2026-07-24

## Release-Reihenfolge

| Phase | Ziel | Status |
| --- | --- | --- |
| 1. Online-Basis | Env-Profile, sichere Migrationen, API-Health, Seed-Schutz | Implementiert und lokal geprueft |
| 2. Kampagnenflow | Login -> Kampagnenauswahl -> aktive Kampagne -> serverseitige Guards | Implementiert, Rollen-/Online-Smoke weiter ausbauen |
| 3. Gemeinsamer Editor | All-Cards-Katalog, Besitzfilter, Deck-, Binder- und Wunschlistenfluss | Implementiert und per Desktop/Mobile-Playwright abgenommen |
| 4. Regelversionen | Presets, sofortige/datums-/checkpointbasierte Aktivierung, historische Referenzen | Kern implementiert; Rollen, Änderungsgründe, Credit-Limit, Catch-up, Trade-Frist und Matchmodus durchgesetzt |
| 5. Custom Packs | Entwurf, Slots/Gewichte, Simulation, Veröffentlichung und idempotentes Öffnen | Private Vorlagen und Kampagnenkopie implementiert; vollständige Reward-Einbindung offen |
| 6. Trade-/Turnier-MVP | Reservierung, Bestätigung, Standings, Abschluss und Rewards | Implementiert; zusätzliche Sandbox-Modi offen |
| 7. Deployment-Abnahme | Postgres-Smoke und Smoke gegen echte Vercel/Render-URLs | Wartet auf echte Projekt-Credentials |

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

## P2 nach erstem Release

- Deployment-Smoke gegen echte Vercel/Render-URLs automatisieren.
- Pack-/Promo-Daten weiter vervollstaendigen.
- Nicht matchbare offizielle Genesys-Karten als Known Issue pflegen.
- E-Mail/Passwort-Reset oder bessere Account-Wiederherstellung ergaenzen.
- Organizer-Rechte und Kampagnenbeitritt UX-seitig verbessern.
- Deck-Autosave mit Konfliktwiederholung ergaenzen.
- Custom Packs vollstaendig in Progression/Rewards integrieren.
- Verbleibende Sandbox-Regeln (unter anderem Pack-/Sammlungsoptionen, Deck-Lock und zusätzliche Turniermodi) in allen Verbrauchern umsetzen.
- Credit-Anteile in Trades erst nach einem eigenen, atomaren Ledger-Transferkonzept aktivieren; die Option bleibt bis dahin sichtbar als nicht verfügbar deaktiviert.

## Nicht-Ziel

Keine In-App-Duelle. EDOPro bleibt extern; Duel Hub speichert nur Organisation, Deckexporte, Match-Reports, Bestaetigungen und Rewards.
