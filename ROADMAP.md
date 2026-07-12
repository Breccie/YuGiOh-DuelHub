# Roadmap zum Online-Release

Das langfristige kampagnenzentrierte Sandbox-Zielbild und der Ausbauplan stehen in
[docs/product-vision.md](docs/product-vision.md).

Stand: 2026-07-08

## Release-Reihenfolge

| Phase | Ziel | Status |
| --- | --- | --- |
| 1. Online-Basis | Env-Profile, Render/Vercel/Supabase-Doku, API-Health | In Arbeit |
| 2. Datenparitaet | Auth, Kampagnen, Packs, Collection, Binder, Decks, Trades, Turniere, Rewards ueber API | In Arbeit |
| 3. Kampagnenflow | Login -> Kampagnenauswahl -> aktive Kampagne -> Dashboard-Aufgaben | Groesstenteils vorhanden, weiter haerten |
| 4. Trade-MVP | Online erstellen, reservieren, akzeptieren, beidseitig bestaetigen | Implementiert, Smoke erweitert |
| 5. Turnier-MVP | Externe Scores melden/bestaetigen, Standings, Abschluss, Rewards | Implementiert, Smoke erweitert |
| 6. Deck/Export | Bannlisten/Genesys live pruefen, `.ydk` exportieren | Vorhanden, Online-Smoke noch erweiterbar |
| 7. Deployment-Abnahme | Supabase/Render/Vercel setzen, Smoke gegen echte URLs | Wartet auf echte Projekt-Credentials |

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

## P2 nach erstem Release

- Deployment-Smoke gegen echte Vercel/Render-URLs automatisieren.
- Pack-/Promo-Daten weiter vervollstaendigen.
- Nicht matchbare offizielle Genesys-Karten als Known Issue pflegen.
- E-Mail/Passwort-Reset oder bessere Account-Wiederherstellung ergaenzen.
- Organizer-Rechte und Kampagnenbeitritt UX-seitig verbessern.

## Nicht-Ziel

Keine In-App-Duelle. EDOPro bleibt extern; Duel Hub speichert nur Organisation, Deckexporte, Match-Reports, Bestaetigungen und Rewards.
