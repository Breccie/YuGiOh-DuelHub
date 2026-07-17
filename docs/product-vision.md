# Yu-Gi-Oh Duel Hub – Produktvision und Sandbox-Zielbild

Stand: 2026-07-17

Der aktuelle visuelle Befund zu Kampagnen, Bindern und Decks ist in
[ux-audit-campaign-binders-decks.md](ux-audit-campaign-binders-decks.md) dokumentiert.

Der interaktive lokale Wireframe für das gemeinsame Editor-System liegt unter
[wireframes/editor-system.html](wireframes/editor-system.html).

## Produktversprechen

Der Duel Hub ist eine kampagnenzentrierte Sandbox für private Yu-Gi-Oh!-Gruppen. Er ersetzt keine Duel-Engine. Er organisiert Kampagnenregeln, Freischaltungen, Packs, Sammlungen, Decks, Trades, Turniere und Belohnungen. EDOPro bleibt die externe Duel-Engine.

Die zentrale Regel lautet:

> Ohne aktive Kampagne gibt es keinen Zugriff auf kampagnengebundene Spielfunktionen.

Nach dem Login landet ein Benutzer deshalb immer zuerst im Kampagnen-Hub. Dort kann er eine Kampagne erstellen, per Einladung oder Code beitreten oder eine bereits beigetretene Kampagne aktivieren.

## Account- und Kampagnengrenzen

### Accountgebunden

- Login, Profil und Account-Einstellungen
- Freundesliste und Freundschaftsanfragen
- öffentliche Profilinformationen
- veröffentlichte Showcase-Binder als unveränderliche oder bewusst aktualisierte Profilansicht
- Einladungen und Beitrittsanfragen zu Kampagnen

### Kampagnengebunden

- Credits und Credit-Ledger
- Pack-Shop, Freischaltungen und Pack-Öffnungen
- Kartenkopien und Arbeits-Binder
- Decks, Formate, Bannlisten und Legalitätsprüfung
- Trades und Kartenreservierungen
- Duellanfragen im Kampagnenkontext
- Turniere, Ergebnisse, Standings und Belohnungen
- Progression, Historie, Promo-Zugänge und Custom Packs

Ein öffentlicher Showcase-Binder darf Karten aus einer Kampagne präsentieren, muss aber als Profilveröffentlichung klar von dem veränderlichen Kampagnen-Binder getrennt werden. Verlässt ein Benutzer eine Kampagne, bleiben veröffentlichte Snapshots lesbar; die Kampagnenkarten selbst bleiben in der Kampagne.

## Primärer Benutzerfluss

1. Benutzer registriert sich oder meldet sich an.
2. App öffnet `/campaigns` statt des normalen Dashboards.
3. Ohne aktive Kampagne sind nur Profil, Freunde, öffentliche Binder und Kampagnenbeitritt erreichbar.
4. Benutzer erstellt eine Kampagne, tritt einer bei oder aktiviert eine vorhandene.
5. Erst danach werden Dashboard, Packs, Sammlung, Decks, Trades, Duelle und Turniere freigeschaltet.
6. Beim Kampagnenwechsel werden alle kampagnengebundenen Ansichten und lokalen Cache-Projektionen gewechselt oder geleert.

Direkte Links auf kampagnengebundene Seiten müssen ohne aktive Mitgliedschaft serverseitig auf den Kampagnen-Hub umleiten. Eine bloße ausgegraute Navigation reicht als Zugriffsschutz nicht.

## Rollen und Beitritt

- **Owner:** besitzt die Kampagne und verwaltet Regeln sowie Rollen. Kampagnen bleiben dauerhaft aktiv; Löschen und Archivieren sind nicht Teil dieses Ausbaus.
- **Organizer:** verwaltet Progression, Turniere, Rewards und Mitglieder im erlaubten Umfang.
- **Player:** spielt, öffnet Packs, baut Decks und handelt.
- **Spectator (optional):** darf öffentliche Kampagnenstände sehen, besitzt aber keine Sammlung.

Beitrittsarten:

- Einladung durch Owner/Organizer
- kurzlebiger Einladungslink
- Kampagnencode mit optionaler Freigabe
- Beitrittsanfrage für auffindbare private Kampagnen

Nachträglich beitretende Spieler erhalten Startressourcen nach einer expliziten Kampagnenregel: voller Startwert, aktueller Catch-up-Wert, Organizer-Zuweisung oder keine automatische Ausstattung.

## Kampagnen-Erstellung: Presets plus erweiterte Sandbox

Die Erstellung soll nicht mit einem riesigen Pflichtformular beginnen. Der Host wählt zuerst ein Preset und kann anschließend jeden Bereich erweitern.

Empfohlene Presets:

- Classic Progression
- Sealed League
- Draft / Cube
- Tournament Ladder
- Vollständig benutzerdefiniert

### Grunddaten

- Name, Beschreibung und Kampagnenbild
- Region: TCG, OCG, Global oder Custom
- Zeitzone und Sprache
- Sichtbarkeit und Beitrittsart
- maximale Spielerzahl
- Startdatum und optionales Enddatum
- Owner-/Organizer-Rechte

### Wirtschaft

- Start-Credits
- Credit-Obergrenze oder unbegrenzt
- Standardpreis pro Pack
- Preis pro Display
- Displaygröße
- individuelle Preise pro Set oder Custom Pack
- erlaubte Kaufarten: Pack, Display, Bundle
- tägliche/wöchentliche Kaufgrenzen oder unbegrenzt
- Credit-Belohnungen für Teilnahme, Sieg, Platzierung und Organizer-Grants
- Rückerstattungs- und Korrekturregeln mit Ledger-Eintrag

### Startausstattung

- Anzahl Start-Packs
- Auswahl: festes Set, mehrere Sets, zufälliger Pool oder Spielerwahl
- gemeinsame oder individuelle Startprodukte
- Starter-/Structure-Deck erlaubt
- Startkarten oder feste Promo-Zuteilung
- Catch-up-Regel für spätere Mitglieder

### Progression und Freischaltung

- manuelle, datumsbasierte oder turnierbasierte Progression
- Anzahl freigeschalteter Sets pro Schritt
- normale Packs und Promo-Produkte getrennt oder gemeinsam behandeln
- Anzahl Gratispacks pro neuer Set-Freischaltung
- Anzahl Gratis-Promo-Picks oder zufälliger Promos
- Freischaltung nach abgeschlossenem Turnier, Anzahl Matches, Datum oder Organizer-Aktion
- Reihenfolge nach realem Release-Datum, eigener Timeline oder Abstimmung
- bereits veröffentlichte Reprints zulassen oder sperren
- Rückwärtsfreischaltung und zeitlich begrenzte Events

### Pack- und Sammlungsregeln

- Duplikate im Pack erlaubt oder pro Pack begrenzt
- First-Edition-/Reprint-Trennung
- Kartenkopien pro Druck oder nur pro Kartenname verwalten
- maximale Sammlungsgröße optional
- manuelle Grants erlauben und protokollieren
- Dusting/Verkaufen optional
- Binder-Anzahl und Seitenlimit oder unbegrenzt
- reservierte Karten in Binder/Deck sichtbar halten, aber nicht erneut handelbar

### Deck- und Formatregeln

- Formatprofil und Bannliste
- Genesys-Punktelimit
- Errata-Regel
- Main-/Extra-/Side-Deck-Grenzen
- Besitzprüfung verpflichtend oder Sandbox-Ausnahme
- Proxies erlaubt oder verboten
- mehrere Formate innerhalb einer Kampagne
- Deck-Lock vor Turnieren
- öffentliche, private oder nur für Organizer sichtbare Decklisten

### Trade-Regeln

- Trades aktiviert/deaktiviert
- Mindestmitgliedsdauer vor Trades
- direkte Trades, Auktionen oder Draft-Tauschfenster
- Organizer-Freigabe optional
- Kartenwerte/Trade-Limits optional
- Abbruch- und Reservierungsfristen

### Turnier- und Reward-Regeln

- Swiss, Round Robin, Single Elimination oder manuell
- Best-of-1/3/5
- automatische oder manuelle Pairings
- Ergebnisbestätigung durch Gegner oder Organizer
- Credits für Platz 1, Platz 2, Teilnahme und individuelle Platzierungen
- normale Reward-Packs, Promo-Packs und feste Karten getrennt konfigurierbar
- Progressionsfreischaltung nach Turnierabschluss
- Mindestteilnehmerzahl für Rewards/Freischaltung
- wiederholbare oder einmalige Turnierbelohnungen

### Audit und Fairness

- Zufalls-Seed und Audit-Hash für Pack-Öffnungen
- sichtbares Kampagnen-Regelprotokoll
- Änderungsverlauf mit Autor und Zeitpunkt
- Regeländerungen sofort, ab Datum oder ab nächstem Progressionsschritt aktivieren
- bestehende Öffnungen und Rewards niemals rückwirkend neu berechnen

## Custom Packs

Custom Packs gehören einer Kampagne oder einer wiederverwendbaren privaten Vorlage. Sie dürfen offizielle Packs nicht überschreiben.

### Pack-Metadaten

- Name, Code, Beschreibung und Cover
- Era/Veröffentlichungsdatum oder eigener Timeline-Punkt
- Region und Produkttyp
- Packgröße und optionale Displaygröße
- Preis, Verfügbarkeit und Reward-only-Status
- Entwurf oder veröffentlichte, unveränderliche Version

### Kartenpool

- Karten über Suche hinzufügen
- konkrete Druckversion oder nur Kartenidentität wählen
- Rarity pro Karte: Common, Rare, Super Rare, Ultra Rare, Secret Rare sowie Custom
- mehrere Rarities derselben Karte erlauben
- Karten gruppenweise importieren, entfernen und filtern
- CSV/JSON-Import als spätere Komfortfunktion

### Kollation

Für Version 1 soll der Host keine abstrakten Prozentwerte pflegen müssen. Er wählt eine Kollationsvorlage passend zur Era und weist Karten Rarity-Buckets zu.

Beispiele:

- frühes TCG-Pack: 8 Common + 1 Rare-or-better
- modernes Core-Set: garantierte Rare-/Foil-Slots nach Vorlage
- Promo-Pack: 1 bis N Slots aus definierten Pools
- vollständig benutzerdefiniert: Slots mit erlaubten Rarities und Gewichten

Wichtig: „Era“ darf nur eine Vorlage vorschlagen. Die endgültige Kollation wird als versionierte Pack-Konfiguration gespeichert. So verändert eine spätere Codeänderung keine bereits laufende Kampagne.

Empfohlenes Datenmodell:

- `CustomPackDefinition`
- `CustomPackVersion`
- `CustomPackCardPoolEntry`
- `CustomPackSlot`
- `CampaignPackAccess`

Jede Öffnung referenziert die konkrete Pack-Version. Kartenwahrscheinlichkeiten ergeben sich aus Slot-Regeln und Pool-Gewichten. Vor Veröffentlichung zeigt die UI eine Simulation über beispielsweise 10.000 virtuelle Packs mit erwarteter Rarity-Verteilung und Warnungen für leere Slots.

## Sammlung und Binder

### Aktuelles Problem

Die aktuelle Default-Logik erzeugt beim ersten Öffnen einer Kampagnensammlung automatisch für jedes Cover aus `binderCoverCatalog` einen eigenen Binder. Cover-Optionen werden dadurch fälschlich zu Benutzerobjekten. Zusammen mit Seed-, Alt- oder manuell erzeugten Daten erklärt das eine hohe, schwer nachvollziehbare Binderzahl.

### Ziel

- Neue Kampagne erzeugt genau einen Arbeits-Binder oder gar keinen bis zur ersten Benutzeraktion.
- Cover werden erst beim Erstellen/Bearbeiten ausgewählt.
- Binderliste zeigt Name, Kampagne, Seitenzahl, belegte Slots, Aktualisierung und Status.
- Klarer aktiver Binder und klare Aktion „Binder öffnen“.
- Löschen, Archivieren, Umbenennen und Duplizieren mit Bestätigung.
- Kampagnen-Binder und veröffentlichte Profil-Showcases sind visuell und technisch getrennt.
- Bestehende Mehrfach-Binder werden nicht still gelöscht; ein Diagnose-/Aufräumdialog bietet Zusammenführen, Archivieren oder Entfernen leerer Binder an.

## Decks

### Verbindliche Referenzrichtung

Deck- und Binder-Editor sollen keine neuen Grundinteraktionen erfinden. Sie orientieren
sich an den etablierten Bedienmustern von **EDOPro** und **Yu-Gi-Oh! Master Duel**,
übersetzt in das bestehende visuelle System des Duel Hub.

- EDOPro dient als Referenz für dichte Suche und Filter, schnelle Maus-/Tastaturbedienung,
  unmittelbares Hinzufügen/Entfernen und klar getrennte Main-/Extra-/Side-Ziele.
- Master Duel dient als Referenz für visuelle Gruppierung, Karteninspektor,
  Deckzählung, Legalitätsfeedback sowie Controller-/Touch-freundliche Aktionen.
- Geschützte Grafiken, Sounds und konkrete Assets werden nicht kopiert. Übernommen
  werden Informationsarchitektur, Interaktionsmuster und bewährte Arbeitsabläufe.
- Der Binder-Editor verwendet denselben Kartenkatalog, dieselben Filter und denselben
  Karteninspektor wie der Deck-Editor. Anstelle von Main/Extra/Side besitzt er
  Binderseiten und 18 geordnete Slots mit klarer Seiten- und Platzierungsnavigation.
- Gemeinsame Editor-Komponenten sollen technisch geteilt werden, damit Suche,
  Filter, Kartenstatus und Accessibility nicht doppelt implementiert werden.

### Ziel für die Übersicht

- Deckliste als primärer Einstieg, nicht ein dekoratives Einzelkarten-Motiv.
- Pro Deck: Name, Format, Main/Extra/Side, Legalitätsstatus, letzte Änderung und Turnier-Lock.
- klare Aktionen: Öffnen, Duplizieren, Exportieren, Umbenennen, Archivieren/Löschen.
- Filter nach Format, Legalität und Aktualität.
- verständlicher Empty State mit „Erstes Deck erstellen“.

### Ziel für den Editor

- Sammlung/Kartensuche links, Deckbereiche in der Mitte, Inspector/Legalität rechts.
- Drag-and-drop plus vollständig zugängliche Tastatur-/Button-Alternative.
- verfügbare Kopien, verwendete Kopien und reservierte Kopien sichtbar.
- Legalitätsfehler direkt an Karte und Deckbereich erklären.
- Änderungen autospeichern, aber mit sichtbarem Speicherstatus und Konfliktbehandlung.
- `.ydk`-Import und -Export.
- mobile Ansicht als gestufter Flow statt gequetschtem Drei-Spalten-Layout.

## Technische Leitplanken

- Jede kampagnengebundene Tabelle trägt `runId` oder ist eindeutig über ein kampagnengebundenes Elternobjekt erreichbar.
- Jeder kampagnengebundene API-Endpunkt prüft Session, Mitgliedschaft und aktive/angegebene Kampagne.
- Keine stille Rückfalllogik auf eine erste oder Demo-Kampagne.
- Account-Endpunkte dürfen keine Kampagnendaten vermischen.
- Kampagnenwechsel invalidiert Sync-Cache und serverseitige Cache-Projektionen.
- Einstellungen werden versioniert; Öffnungen und Rewards referenzieren den damals aktiven Stand.
- Owner-Aktionen sind auditierbar und nach Möglichkeit reversibel, aber historische Ledger-Einträge werden nicht gelöscht.

## Priorisierte Umsetzung

### Phase 0 – Daten und UX klären

- produktive Binderzahl und Herkunft diagnostizieren
- Kampagnen-, Binder- und Deck-Flows mit zwei Rollen visuell auditieren
- bestehende Daten auf fehlende oder falsche `runId`-Zuordnung prüfen

### Phase 1 – Kampagnen-Gate

- Login immer nach `/campaigns`
- zentrale serverseitige Membership-/Active-Run-Guard
- Navigation ohne Kampagne reduzieren
- Beitrittscode/Einladungsflow
- Kampagnenwechsel räumt Cache sauber auf

### Phase 2 – Sandbox-Einstellungen

- Settings in Kategorien und Presets gliedern
- Startausstattung, Progression, Promo-, Deck-, Trade- und Turnierregeln ergänzen
- Konfigurationsversionen und Änderungsprotokoll einführen

### Phase 3 – Binder reparieren

- nur einen oder keinen Default-Binder erzeugen
- Migration/Aufräumassistent für leere Mehrfach-Binder
- Binder-Navigation und Veröffentlichung neu ordnen

### Phase 4 – Deck-Erfahrung

- Übersicht informationsorientiert neu strukturieren
- Editor-Informationsarchitektur und mobile Bedienung überarbeiten
- Import/Export, Copy-Accounting und Legalitätsfeedback härten

### Phase 5 – Custom Packs

- versioniertes Datenmodell und CRUD
- Kartensuche und Rarity-Zuweisung
- Era-/Kollationsvorlagen
- Simulation, Validierung und Veröffentlichung
- Einbindung in Shop, Progression und Rewards

### Phase 6 – Härtung

- Online-E2E für Kampagnengate, Beitritt und Custom Packs
- Rollen-/Berechtigungstests
- Datenmigration und Rollback-Plan
- Performance- und Accessibility-Abnahme

## Definition of Done für das Sandbox-Ziel

- Ein neuer Account kann außerhalb einer Kampagne keine kampagnengebundene Aktion ausführen.
- Zwei Accounts können sicher derselben Kampagne beitreten und vollständig getrennte andere Kampagnen nutzen.
- Owner kann alle dokumentierten Sandbox-Regeln über Presets und erweiterte Einstellungen konfigurieren.
- Custom Pack kann ohne Codeänderung erstellt, simuliert, veröffentlicht, freigeschaltet und geöffnet werden.
- Binder entstehen nachvollziehbar und veröffentlichte Showcases sind vom Kampagnenbesitz getrennt.
- Deckübersicht und Editor machen Status, Besitz und Legalität ohne Rätsel verständlich.
- Regeln, Pack-Versionen, Öffnungen, Trades und Rewards sind historisch auditierbar.

## Verbindliche Produktentscheidungen

- Ein Spieler kann mehreren Kampagnen angehören, aber genau eine Kampagne ist für kampagnengebundene Aktionen aktiv.
- Veröffentlichte Profil-Showcases bleiben technisch von Arbeits-Bindern getrennt.
- Custom Packs gehören zunächst einer Kampagne und können als private Vorlage in eine andere Kampagne kopiert werden.
- Version 1 enthält frühes TCG, GX/5D's, modernes Core-Set und Promo/freie Slots.
- Regeländerungen gelten sofort, ab Datum oder ab nächstem Progressionsschritt; historische Aktionen bleiben unverändert.
- Kampagnen bleiben dauerhaft aktiv. Es gibt in diesem Ausbau weder Löschen noch Archivieren.
