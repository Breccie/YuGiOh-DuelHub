# Online-kompatibler Release-MVP

Stand: 2026-07-08

## Ziel

Der naechste Release ist ein online-kompatibler Freundeskreis-Hub. Browser und Desktop sollen dieselbe API, dieselbe Kampagne und dieselbe PostgreSQL-Datenbank nutzen. EDOPro bleibt die Duel-Engine; diese App organisiert Packs, Sammlung, Deckbau, Bannlisten, `.ydk`-Export, Trades, Turniere, externe Ergebnisbestaetigung und Belohnungen.

## Muss koennen

- Registrieren und Login gegen den API-Service.
- Kampagne erstellen, beitreten oder aktive Kampagne auswaehlen.
- Kampagneneinstellungen verwalten: Startcredits, Packpreis, Displaygroesse, Gratispacks pro Set, Turnierbelohnungen.
- Packs online oeffnen und Sammlungseintraege kampagnengebunden speichern.
- Beliebig viele Decks und Binder pro Kampagne nutzen.
- Decks gegen Banlists und Genesys-Werte pruefen.
- Decks als `.ydk` fuer EDOPro exportieren.
- Trades zwischen zwei Accounts erstellen, reservieren, akzeptieren und von beiden Seiten bestaetigen.
- Turniere erstellen, Teilnehmer verwalten, Pairings erzeugen, externe Scores melden und vom Gegner bestaetigen lassen.
- Turnierabschluss vergibt Credits/Rewards und kann naechste Sets/Packs freischalten.

## Bewusst nicht im Release-MVP

- In-App-Duelle oder eine Duel-Engine.
- Oeffentlicher Massendienst mit Produktions-SLA.
- Vollstaendige Spezialprodukt-/Promo-Abdeckung fuer alle historischen Produkte.
- Vollstaendige historische Errata-Timeline ohne Known Issues.
- Offline-Desktop als Quelle der Wahrheit fuer echte Online-Kampagnen.

## Primaerer Arbeitsmodus

- Online: Supabase Free Postgres + Render Free API + Vercel Frontend.
- `APP_MODE=production` oder `APP_MODE=online-dev` nutzt `API_BASE_URL`.
- Next-Kompatibilitaetsrouten proxien im Online-Modus konsequent auf `/api/v1/*`.
- SQLite bleibt `desktop-demo` fuer lokale Vorschau und Regression.

## Reproduzierbare Befehle

```bash
npm run db:generate
npm run typecheck
npm run lint
npm run test
npm run build
```

Online lokal:

```bash
npm run online:infra
npm run db:migrate
npm run db:seed:base
npm run test:e2e:online
```

Desktop-Demo-Regression:

```bash
npm run db:seed:demo
npm run test:e2e:smoke
```

## Akzeptanzkriterien

- Kein Online-Flow faellt bei `APP_MODE=online-dev` oder `production` still auf lokale SQLite-Daten zurueck.
- Zwei Accounts koennen dieselbe Kampagne nutzen.
- Pack-Opening erzeugt Collection-Eintraege in der aktiven Kampagne.
- Trades reservieren Karten, verhindern freie Weiternutzung und uebertragen Besitz erst nach beiden Bestaetigungen.
- Turnierergebnisse werden von einem Spieler gemeldet und vom Gegner bestaetigt.
- Turnierabschluss vergibt Credits/Rewards und kann Kampagnenfortschritt freigeben.
- Deckbau, Legalitaetspruefung und `.ydk`-Export funktionieren gegen dieselbe Online-Kampagne.

## Aktuelle Online-Abnahme

Der Online-Smoke prueft jetzt den Release-Kern gegen Next -> Fastify -> API-Postgres:

- zwei echte Browser-Sessions
- Registrierung und Sessions
- gemeinsame aktive Kampagne
- Pack-Opening fuer beide Accounts
- Sammlungseintraege in der API-Datenbank
- Trade erstellen, annehmen, beidseitig bestaetigen und Besitzerwechsel pruefen
- Turnier erstellen, Teilnehmer hinzufuegen, Pairing erzeugen
- Score melden, Gegnerbestaetigung speichern, Turnier abschliessen
- Reward-Grant und Credit-Ledger fuer Turnierbelohnung pruefen

## Hosting-Grenzen

Der erste Release ist fuer Freundeskreise. Render Free kann schlafen, Supabase Free und Vercel Free haben Speicher-, Laufzeit- und Bandbreitenlimits. Der erste Request nach Sleep kann langsam sein; das ist fuer den Hobby-Release akzeptiert.
