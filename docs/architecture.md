# Architektur

## Produktgrenze

Die App besitzt die Progressionslogik:

- Pack-Freischaltung nach Release-Reihenfolge
- Sammlung und Besitzhistorie
- Freunde und Trades
- Deckbau gegen Sammlung
- Bannlisten- und Errata-basierte Legalitätsprüfung

Der Duel-Simulator bleibt später extern:

- EDOPro als Duel-Engine

## Client-Strategie

Der Online-Release trennt den App-Core in zwei Schichten:

- Next.js UI und Kompatibilitaetsrouten
- Fastify API-Service unter `/api/v1/*`
- PostgreSQL als gemeinsame Kampagnen-Datenbank
- gemeinsame Contracts und Domain-Regeln

Wenn eine Desktop-App gewünscht ist, bleibt sie eine dünne Shell:

- Electron als Desktop-Container
- im echten Online-Betrieb gegen dieselbe `API_BASE_URL`
- in `desktop-demo` mit lokaler SQLite-Vorschau

So vermeiden wir, dass Web und Desktop verschiedene Quellen der Wahrheit bekommen.

## Warum Electron und nicht Tauri als erster Weg

Die aktuelle App nutzt serverseitige Next.js-Features:

- API-Routen
- Datenbankzugriffe im App-Core
- produktionsnahe Node-Server-Ausführung

Deshalb ist Electron als frühe Desktop-Hülle der pragmatischere Weg. Die App kann ihren bestehenden Node-/Next-Core behalten und später trotzdem als Web und Desktop weiterleben.

## Kernmodell

### Packs

- `CardSet`
  - Set-Metadaten, Region, Release-Date, Pack-Größe
- `SetCard`
  - konkrete Karten-zu-Set-Zuordnung
  - Rarity
  - Set-Code
  - Pull-Gewicht
- `PackOpening`
  - ein Öffnungsvorgang
- `PackPull`
  - ein gezogener Slot innerhalb dieses Öffnungsvorgangs

### Sammlung

- `CollectionEntry`
  - genau eine besessene Kartenkopie
  - optional mit Link zur konkreten `SetCard`
  - Quelle: Pack, Trade, Import, manueller Grant
  - Lock-State für Trades

Dieses Modell ist absichtlich granular. Ein einfacher Zähler pro Karte reicht nicht, wenn du:

- reale Duplikate handeln willst
- Reprints unterscheiden willst
- Besitz pro Set nachvollziehen willst
- pending Trades sauber sperren willst

### Regeln

- `FormatProfile`
  - z. B. "Classic Progression"
- `Banlist`
  - Snapshot mit `effectiveFrom`
- `BanlistEntry`
  - Limit je Karte
- `CardTextVersion`
  - historische Textstufen einer Karte
  - inkl. `effectiveFrom`
  - optional `effectiveTo`
  - `isErrata`

## Errata-Modell

Die App braucht zwei getrennte Dinge:

1. Was sagt die eigentliche Bannliste?
2. Wie soll das Format mit Errata umgehen?

Darum gibt es eine eigene `ErrataPolicy`:

- `USE_LATEST_TEXT`
- `LOCK_TO_SNAPSHOT_TEXT`
- `BAN_ON_ERRATA`

Für dein Projekt ist `BAN_ON_ERRATA` der Default.

Das bedeutet:

- Sobald das Snapshot-Datum die erste Errata-Version einer Karte erreicht oder überschreitet,
- wird die Karte für dieses Format illegal,
- auch wenn die Bannliste selbst sie nicht explizit verbietet.

## Legalitäts-Pipeline

1. Deck wählt eine `Banlist`
2. Deck-Snapshot-Datum wird bestimmt
3. Für jede Karte wird die aktive `CardTextVersion` aufgelöst
4. Format-Errata-Policy wird angewandt
5. Bannlistenlimit wird angewandt
6. Sammlungsbesitz wird geprüft
7. Ergebnis wird als Issue-Liste ausgegeben

## Datenimport später

### Karten und Sets

Vorgesehene Quelle:

- YGOPRODeck API

Nutzung:

- Karten-Metadaten
- Sets
- Set-Listen / Pack-Zuordnungen

Aktueller Stand im Repo:

- `scripts/import-ygo-data.ts` importiert TCG-Set-Metadaten und Karten
- `CardSet.isOpenable` trennt Packs von nicht öffnungsfähigen Produkten
- `SetCard` speichert echte Set-Raritäten

### Bannlisten

Vorgesehene Quelle:

- Project Ignis `LFLists`

Nutzung:

- Snapshot-Import pro Format / Stichtag

Aktueller Stand im Repo:

- offizielle aktuelle `LFLists` werden direkt importiert
- zusätzliche historische Dateien können lokal in `data/banlists/` abgelegt werden

### Duel-Logik

Vorgesehene Quelle:

- EDOPro / Project Ignis

Nutzung:

- Duelle
- Kartenskripte
- bestehende Regellogik

### Errata

Hier braucht die App einen eigenen, expliziten Layer.

Grund:

- Set-Daten und Bannlisten sind gut öffentlich verfügbar.
- Historische Oracle-Text-Timelines sind typischerweise nicht als einheitlicher Komplettfeed verfügbar.

Deshalb ist `CardTextVersion` bereits jetzt im Modell, obwohl das Starter-Repo noch keine echte Import-Pipeline dafür mitbringt.

Aktueller Stand im Repo:

- jede importierte Karte bekommt zunächst einen aktuellen Textstand
- lokale Override-Dateien können daraus echte Errata-Zeitlinien machen

## Warum SQLite im Starter?

Weil du damit sofort entwickeln und validieren kannst:

- kein Cloud-Setup
- keine externe DB
- schneller Seed

Wenn die App online oder mit mehreren Spielern gleichzeitig laufen soll:

- `apps/api/prisma/schema.prisma` auf PostgreSQL/Supabase nutzen
- Frontend im `online-dev`/`production`-Modus nur ueber `API_BASE_URL` betreiben
- SQLite nur als `desktop-demo` behandeln

Das Domänenmodell selbst bleibt dabei weitgehend stabil.
