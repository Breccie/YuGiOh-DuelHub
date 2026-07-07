# Desktop-Demo-MVP

Stand: 2026-07-07

## Ziel

Der naechste sinnvolle Meilenstein ist ein stabiler lokaler Desktop-Demo-Loop. Er soll beweisen, dass Yu-Gi-Oh Duel Hub als Progression-Hub funktioniert, bevor Online-Mehrnutzer, Trades, Duelle, Turniere und weitere Politur wieder priorisiert werden.

## Muss koennen

- Demo-Account anmelden oder anlegen.
- Einen aktiven Progression-Run laden.
- Eine Pack-Auswahl anzeigen.
- Ein Pack oeffnen.
- Die gezogenen Karten als Sammlungseintraege speichern.
- Die Sammlung anzeigen.
- Ein Deck aus Sammlungs-Karten erstellen oder bearbeiten.
- Deck-Legalitaet anzeigen.
- Einen EDOPro-kompatiblen `.ydk`-Export erzeugen.

## Bewusst nicht im MVP

- Online-Multiplayer als primaerer Pfad.
- PostgreSQL/API-Service als MVP-Blocker.
- Friends, Trades, Duellanfragen und Turniere.
- Vollstaendige Spezialprodukt- und Promo-Abdeckung.
- Vollstaendige historische Errata-Timeline.
- Finale Asset-Abdeckung fuer alle Booster.

## Primaerer Arbeitsmodus

- `APP_MODE=desktop-demo`
- lokale Next.js/Electron-Demo mit SQLite
- API-Service nur als separates Risiko nach dem Desktop-MVP

## Reproduzierbare Befehle

```bash
npm run db:generate
npm run db:seed:demo
npm run test:e2e:smoke
npm run typecheck
npm run test
npm run lint
```

`npm run test:e2e:smoke` ist die fuehrende technische MVP-Abnahme, weil sie den lokalen Desktop/Web-Kernflow im Browser prueft und einen isolierten Smoke-Datenbankstand nutzt.

## Akzeptanzkriterien

- `npm run db:generate` laeuft erfolgreich.
- `npm run db:seed:demo` laeuft erfolgreich.
- `npm run test:e2e:smoke` laeuft erfolgreich.
- `npm run typecheck`, `npm run test` und `npm run lint` laufen erfolgreich.
- Der Smoke-Flow weist nach, dass Pack-Opening Sammlungseintraege erzeugt.
- Ein Deck kann per App-API erstellt und mit einer Sammlungs-Karte befuellt werden.
- Ein `.ydk`-Export wird erzeugt.
- P0/P1-Fehler im Desktop-MVP sind entweder behoben oder explizit als Blocker dokumentiert.

## Git-Arbeitsstand-Inventar

Der Worktree war vor dieser MVP-Datei bereits umfangreich geaendert. Diese Aenderungen werden nicht verworfen.

| Gruppe | Dateien / Muster | Bewertung |
| --- | --- | --- |
| API-Service | `apps/api/prisma/schema.prisma`, `apps/api/src/server.ts`, `apps/api/src/routes/*`, `apps/api/src/lib/runtime-config*` | Bereits aktive Online/API-Arbeit; nicht Desktop-MVP-blockierend, aber testen. |
| Frontend API-Routen | `apps/frontend/src/app/api/**` | Enthalten Desktop-Kompatibilitaetsrouten und neue `/api/v1/runs/*`-Routen; fuer Smoke relevant. |
| Frontend Seiten | `apps/frontend/src/app/{decks,duels,settings,tournaments,trade}/**` | UI/SSR-Anpassungen; Desktop-Sichtpruefung nach Kernflow. |
| Frontend Domain/Services | `apps/frontend/src/lib/*` | Kernlogik fuer Collection, Decks, Packs, Progression, Trades, Turniere; MVP-relevant fuer Packs/Collection/Decks. |
| Tests | `*.test.ts`, `*.integration.test.ts` in `apps` und `packages` | Positiv: vorhandene Regression-Absicherung. |
| Scripts | `scripts/e2e-smoke.ts`, `scripts/e2e-online-smoke.ts`, Import-/Repair-Scripts | `e2e-smoke` ist MVP-Abnahme; Online-Smoke bleibt nachrangig. |
| Contracts | `packages/contracts/src/index.ts` | API-/DTO-Vertrag; bei P0/P1-Fixes mitpruefen. |
| Dependencies | `package.json`, `package-lock.json` | Scripts und Dependencies geaendert; nach Abschluss bewusst committen oder separat pruefen. |
| Generierte/lokale Artefakte | SQLite-DBs, `.next`, Logs, `output`, `tmp` | Nicht als MVP-Quellcode behandeln; nicht manuell kuratieren, ausser fuer QA-Belege. |

## Risiko-Liste

| Risiko | Prioritaet | Umgang |
| --- | --- | --- |
| Desktop-Kernflow bricht | P0 | Sofort fixen. |
| Kernflow funktioniert nur durch direkte API-Aufrufe, aber UI-Seite ist sichtbar instabil | P1 | Fixen, wenn Login/Packs/Collection/Decks betroffen sind. |
| Online-Register/API-Smoke liefert 500 | P2 fuer Desktop-MVP | Dokumentieren und erst nach Desktop-MVP isolieren. |
| Pack-Assets fuer spaetere Booster unfertig | P2 | MVP nur auf fruehe Kern-Booster begrenzen. |
| Vollstaendige Errata-Historie fehlt | P2 | MVP-Regeln nicht von kompletter Errata-Timeline abhaengig machen. |
| Worktree ist schwer zu ueberblicken | P1 | Aenderungen gruppiert committen oder vor weiterer Feature-Arbeit bereinigen. |

## Naechste Arbeitsregel

Bis dieser MVP gruen ist, werden nur P0/P1-Probleme am Desktop-Kernflow behoben. Neue Features, Online-Mehrnutzer-Ausbau und visuelle Politur ausserhalb der Kernseiten werden zurueckgestellt.

## Letzte Abnahme

2026-07-07:

- `npm run db:generate`: bestanden.
- `npm run db:seed:demo`: bestanden.
- `npm run test:e2e:smoke`: bestanden.
- `npm run test:e2e:online` mit `E2E_API_PORT=3235` und `E2E_ONLINE_PORT=3212`: bestanden.
- `npm run build`: bestanden.
- `npm run data:audit:promos`: bestanden, 635 Sets und 169 PromoSources geprueft, 0 Fehler, 0 Warnungen.
- Gefundene P0/P1-Blocker: keine.
- Die frueheren Next.js-LCP-Hinweise fuer initial sichtbare Pack- und Binderbilder wurden durch eager loading der Above-the-fold-Bilder adressiert.
- Hinweis: Der fruehere Online-Register-500 auf Port `3234` wurde auf einem frischen Online-Smoke-Port nicht reproduziert. Port `3234` war danach nicht mehr erreichbar; der alte Befund wird als Altprozess-/Portzustandsrisiko behandelt, nicht als aktueller Register-Codeblocker.
- Hinweis: Desktop- und Online-Smoke muessen sequenziell laufen. Parallel blockiert Next.js den zweiten Dev-Server fuer dasselbe App-Verzeichnis.
