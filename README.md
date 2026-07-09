# Yu-Gi-Oh Duel Hub

Yu-Gi-Oh Duel Hub ist ein Progression-, Sammlungs- und Deckbau-Hub fuer Yu-Gi-Oh-Kampagnen. Duelle selbst laufen extern ueber EDOPro; diese App kuemmert sich um Packs, Sammlung, Deckbau, Bannlisten, `.ydk`-Export, Trades, Kampagnen und Turnierorganisation.

Yu-Gi-Oh Duel Hub entwickelt sich jetzt in zwei klaren Modi:

- `production` / `online-dev`: Online-Release-Pfad mit Browser/Desktop gegen denselben API-Service und dieselbe PostgreSQL-Kampagne
- `desktop-demo`: lokale Electron-Vorschau mit Demo-Daten für Binder, Decks, Trades, Kampagnen und Turniere

## Architektur

- `apps/frontend` enthält die Next.js-Oberfläche und die bestehenden Kompatibilitätsrouten.
- `apps/api` ist das neue Service-Split-Ziel für HTTP-API, Sessions und späteren Mehrnutzerbetrieb.
- `packages/contracts` ist die gemeinsame Quelle für Zod-Schemas, DTOs und API-Fehlerformen.
- `packages/domain` kapselt pure Regellogik und Domain-Helfer ohne Next- oder Electron-Abhaengigkeiten.
- `prisma/` bleibt das Desktop-Demo-Schema, `apps/api/prisma/` ist der neue PostgreSQL-Pfad.

## Desktop-Demo

```bash
npm install
npm run db:generate
npm run db:push:legacy
npm run db:seed:demo
npm run desktop:dev
```

`APP_MODE=desktop-demo` ist der Standard für `npm run dev` und ignoriert `API_BASE_URL`, damit eine alte oder nicht erreichbare API-Konfiguration die lokale Demo nicht blockiert.

Für einen produktionsnahen lokalen Desktop-Start:

```bash
npm run desktop:preview
```

Windows-Build:

```bash
npm run desktop:dist
```

Die Desktop-Builds bundlen nur noch den expliziten Demo-Seed und nicht die aktive Entwicklungsdatenbank.

## Online-Release

```bash
npm run online:dev
```

`online:dev` startet PostgreSQL über Docker Compose, führt Prisma Generate/Migration/Base-Seed aus und startet danach API plus Frontend parallel. Dafür muss in `.env` mindestens `APP_MODE=online-dev`, `API_BASE_URL`, `API_DATABASE_URL`, `COOKIE_SECRET` und `CORS_ORIGIN` gesetzt sein. `npm run db:migrate` ist bewusst nicht-interaktiv und nutzt `prisma migrate deploy`; neue lokale Migrationen werden mit `npm run db:migrate:dev` erzeugt.

Für den lokalen Online-Smoke ohne den kombinierten Dev-Start:

```bash
npm run online:infra
npm run online:prepare
npm run test:e2e:online
```

`test:e2e:online` startet API und Frontend selbst auf Testports. Wenn Docker/Postgres nicht läuft, bricht der Smoke früh mit einer Preflight-Meldung ab, statt später im Cleanup einen Prisma-Fehler zu werfen.

Nach einem Render-Deploy prueft `/health` nur den API-Prozess; `/ready` prueft zusaetzlich die Postgres-Verbindung.

Der Ziel-Stack für den ersten Freundeskreis-Release ist Supabase Free Postgres, Render Free API und Vercel Frontend. Die passenden Vorlagen liegen in `.env.online-api.example` und `.env.online-frontend.example`; für Prisma/Supabase wird die Supavisor Session-pooler-URL auf Port `5432` genutzt. Details stehen in [docs/online-release.md](/C:/Users/Emil/Documents/Yu-Gi-Oh/docs/online-release.md).

Der neue API-Standard liegt unter `/api/v1/*` im Service und wird schrittweise über die bestehenden Next-Kompatibilitätsrouten gespiegelt. Aktuell sind unter anderem `auth`, `dashboard`, `collection`, `decks`, `duels`, `friends`, `packs`, `profiles`, `rules`, `tournaments` und `trades` im Service verdrahtet. `duels` ist dabei kein In-App-Spielclient, sondern hoechstens Koordination/Ergebnis- oder EDOPro-Kontext. Wenn die API im Online-Modus nicht erreichbar ist, antworten die Proxies mit `service_unavailable` statt auf lokale Datenbanklogik zurückzufallen.

## Wichtige Bereiche

- `/login` für Duelist-Accounts und Sessions
- `/collection` für Sammlung, Binder und Showcase
- `/decks` für Deckbau, Bannlisten-Legalität und `.ydk`-Export nach EDOPro
- `/trade` für Trade-Threads und Abschlusslogik
- `/duels` nur fuer externe EDOPro-Koordination oder spaetere Ergebnisnotizen, nicht fuer In-App-Duelle
- `/rules` für Progression, Saison, Banlist, Deckbau, EDOPro und Trade-Regeln
- `/tournaments` für Kampagnen-Turniere, Pairings, Standings, Set-Freischaltungen und Waehrungsbelohnungen
- `/settings` für Profil, Desktop-Präferenzen und Session-Verwaltung

## Daten und Import

Echte Karten-, Set- und Bannlistendaten können über den Importer nachgeladen werden:

```bash
npm run import:ygo
```

Feinsteuerung für historische Korrekturen bleibt in:

- [data/import-overrides/set-overrides.json](/C:/Users/Emil/Documents/Yu-Gi-Oh/data/import-overrides/set-overrides.json)
- [data/import-overrides/errata-timeline.json](/C:/Users/Emil/Documents/Yu-Gi-Oh/data/import-overrides/errata-timeline.json)
- [data/banlists/README.md](/C:/Users/Emil/Documents/Yu-Gi-Oh/data/banlists/README.md)

## Entwicklung

- `npm run typecheck` prüft Frontend, API-Service und gemeinsame Packages
- `npm run lint` prüft Frontend, API, Packages und Build-Skripte
- `npm run test` führt die neuen Vitest-Checks für Domain- und API-Bausteine aus
- `npm run test:e2e:online` prüft den Online-Kernflow mit zwei Accounts, gemeinsamer Kampagne, Pack-Opening, Trade, Turnier-Score-Bestaetigung und Reward
- `npm run db:studio` öffnet Prisma Studio für das neue API-Schema

Mehr Architektur-Details stehen in [docs/architecture.md](/C:/Users/Emil/Documents/Yu-Gi-Oh/docs/architecture.md).
