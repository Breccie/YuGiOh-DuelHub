# Online Release Runbook

Ziel-Topologie fuer den ersten Freundeskreis-Release:

- Supabase Free: PostgreSQL fuer API-Daten
- Render Free: Fastify API unter `/api/v1/*`
- Vercel Free: Next.js Frontend
- Desktop: optionaler Client gegen dieselbe `API_BASE_URL`

## 1. Supabase vorbereiten

1. Neues Supabase-Projekt erstellen.
2. Postgres-Connection-String kopieren.
3. Fuer lokale Migrationen und Render `API_DATABASE_URL` auf die Supavisor Session-pooler-URL setzen. Sie endet auf Port `5432`.
4. Alternativ geht die direkte URL, wenn dein Netzwerk IPv6 kann oder Supabase IPv4 Add-On aktiv ist.

Schema-Ziel ist [apps/api/prisma/schema.prisma](/C:/Users/Emil/Documents/Yu-Gi-Oh/apps/api/prisma/schema.prisma).

```bash
npm run db:generate
npm run db:migrate
npm run db:seed:base
```

`npm run db:migrate` nutzt `prisma migrate deploy`, damit lokale Smoke-Runs und Render/Supabase-Deployments ohne interaktive Prompts laufen. Fuer neue lokale Migrationen gibt es `npm run db:migrate:dev`.

## 2. Render API deployen

`render.yaml` enthaelt den Service-Blueprint. In Render setzen:

- `APP_MODE=production`
- `NODE_ENV=production`
- `API_HOST=0.0.0.0`
- `API_PORT=10000`
- `API_DATABASE_URL=<Supabase Supavisor Session pooler URL, Port 5432>`
- `COOKIE_SECRET=<zufaelliger Wert mit mindestens 32 Zeichen>`
- `CORS_ORIGIN=https://<vercel-app>.vercel.app`

Der Blueprint installiert Build-Tools mit `npm ci --include=dev`, weil der API-Service fuer den ersten Hobby-Release TypeScript direkt via `tsx` startet. Spaeter kann die API auf einen kompilierten `dist`-Start umgestellt werden.

Nach Deploy pruefen:

```bash
curl https://<render-api>.onrender.com/health
curl https://<render-api>.onrender.com/ready
```

`/health` prueft, ob der API-Prozess laeuft. Erwartet:
`{ "ok": true, "service": "ygo-api" }`.

`/ready` prueft zusaetzlich die Postgres-Verbindung. Erwartet:
`{ "ok": true, "service": "ygo-api", "database": "reachable" }`.
Wenn `/health` funktioniert, aber `/ready` `503` liefert, sind meist
`API_DATABASE_URL`, Supabase Pooler/IPv6/IPv4 oder Migration/Seed der naechste
Pruefpunkt.

## 3. Vercel Frontend deployen

In Vercel setzen:

- `APP_MODE=production`
- `API_BASE_URL=https://<render-api>.onrender.com`

Wichtig: Im Online-Modus nutzt das Frontend die API-Proxies. Lokale SQLite-Daten sind dann keine Quelle der Wahrheit.

## 4. Desktop online nutzen

Desktop bleibt Preview/Komfortclient. Fuer echte Kampagnen muss er dieselbe API nutzen:

```env
APP_MODE="production"
API_BASE_URL="https://<render-api>.onrender.com"
```

`desktop-demo` bleibt offline und lokal.

## 5. Smoke-Abnahme

Lokal gegen Postgres:

```bash
npm run online:infra
npm run online:prepare
npm run test:e2e:online
```

Manuell gegen Deployment:

- Registrieren/Login auf Vercel.
- Kampagne erstellen oder auswaehlen.
- Pack oeffnen und Sammlung pruefen.
- Deck bauen, Banlist/Genesys pruefen, `.ydk` exportieren.
- Mit zweitem Account Trade erstellen, akzeptieren, beidseitig bestaetigen.
- Turnier erstellen, Teilnehmer einladen, Score melden, Gegner bestaetigt, Turnier abschliessen.
- Credits/Rewards und naechste Freischaltungen pruefen.

## Free-Tier-Hinweise

- Render Free kann schlafen; erster Request nach Sleep kann langsam sein.
- Supabase Free hat Speicher- und Compute-Grenzen.
- Fuer Prisma nicht die Transaction-pooler-URL auf Port `6543` als alleinige `API_DATABASE_URL` verwenden; Migrationen brauchen Session/direct semantics.
- Vercel Free ist fuer Freundeskreis-Traffic geeignet, nicht fuer oeffentlichen Massendienst.
- Kein Produktions-SLA: fuer den ersten Release ist das akzeptiert.
