# Yu-Gi-Oh Duel Hub

Yu-Gi-Oh Duel Hub entwickelt sich jetzt in zwei klaren Modi:

- `desktop-demo`: lokale Electron-Vorschau mit Demo-Daten für Binder, Decks, Trades, Duels und Turniere
- `online-dev`: frühe Mehrnutzer-Topologie mit getrenntem Frontend, API-Service und PostgreSQL

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

## Online-Dev

```bash
npm run online:dev
```

`online:dev` startet PostgreSQL über Docker Compose, führt Prisma Generate/Migration/Base-Seed aus und startet danach API plus Frontend parallel. Dafür muss in `.env` mindestens `APP_MODE=online-dev`, `API_BASE_URL`, `API_DATABASE_URL`, `COOKIE_SECRET` und `CORS_ORIGIN` gesetzt sein.

Der neue API-Standard liegt unter `/api/v1/*` im Service und wird schrittweise über die bestehenden Next-Kompatibilitätsrouten gespiegelt. Aktuell sind unter anderem `auth`, `dashboard`, `collection`, `decks`, `duels`, `friends`, `packs`, `profiles`, `rules`, `tournaments` und `trades` im Service verdrahtet. Wenn die API im Online-Modus nicht erreichbar ist, antworten die Proxies mit `service_unavailable` statt auf lokale Datenbanklogik zurückzufallen.

## Wichtige Bereiche

- `/login` für Duelist-Accounts und Sessions
- `/collection` für Sammlung, Binder und Showcase
- `/decks` für Deckbau, Legalität und `.ydk`-Export
- `/trade` für Trade-Threads und Abschlusslogik
- `/duels` für Duellanfragen und Terminplanung
- `/rules` für Progression, Saison, Banlist, Deckbau, EDOPro und Trade-Regeln
- `/tournaments` für Swiss-Runden, Pairings und Standings
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
- `npm run db:studio` öffnet Prisma Studio für das neue API-Schema

Mehr Architektur-Details stehen in [docs/architecture.md](/C:/Users/Emil/Documents/Yu-Gi-Oh/docs/architecture.md).
