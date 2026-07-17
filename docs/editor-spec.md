# Ausführbare Editor-Spezifikation

Stand: 2026-07-17

Diese Datei ist die verbindliche Spezifikation für Deck- und Binder-Editor. Die Bedienmuster orientieren sich an Yu-Gi-Oh! Master Duel und EDOPro; Farben, Typografie, Assets und Oberflächen bleiben Teil des Duel-Hub-Designsystems.

## Gemeinsamer Kartenkatalog

- Quelle ist `GET /api/v1/cards`; Besitz wird ausschließlich für die aktive Kampagne (`runId`) berechnet.
- Standardfilter ist **Alle Karten**. Der Dreifachschalter enthält **Alle Karten**, **Im Besitz** und **Nicht im Besitz**.
- Suche und Filter werden serverseitig ausgeführt und cursorbasiert paginiert.
- Unterstützte Filter: Text, Besitz, Kartenart, Monster-Untertyp, Attribut, Level/Rang/Link, ATK/DEF, Seltenheit, Setcode, Bannlistenstatus und Genesys-Punkte.
- Ein Katalogeintrag enthält Gesamt-, freie, reservierte und gehandelte Kopien, Deckverwendung, Bannlistenlimit, Punktewert und Errata-Stichtag.
- Nicht besessene Karten bleiben anklickbar und untersuchbar. Sie sind visuell abgeschwächt, aber nicht deaktiviert.
- Maus, Touch und Tastatur müssen dieselbe Kernaktion auslösen können; Drag-and-drop ist niemals die einzige Bedienmöglichkeit.

## Deckeditor

### Arbeitsbereiche

- Desktop: Katalog, Main/Extra/Side-Arbeitsfläche, Inspector/Legalität.
- Mobil: umschaltbare Ansichten Katalog, Deck und Details.
- Deckname, Bannliste und Autosave-Status bleiben sichtbar.
- Extra-Deck-Karten werden beim Hinzufügen nach Extra vorgeschlagen; alle Karten können explizit verschoben werden.

### Besitz und Entwürfe

- Nicht besessene Karten dürfen hinzugefügt und gespeichert werden.
- Über Main, Extra und Side zusammen sind höchstens drei Exemplare einer Kartenidentität erlaubt.
- Fehlende Karten werden pro Identität mit benötigt, vorhanden, fehlend und betroffenen Bereichen zusammengefasst.
- Einzelne oder alle fehlenden Karten lassen sich in die kampagnengebundene Wunschliste übernehmen.
- Erwerb einer fehlenden Karte aktualisiert die Spielbarkeit ohne Deckänderung.

### Legalität

Legalitätsprobleme werden getrennt nach `OWNERSHIP`, `BANLIST`, `DECK_SIZE`, `ERRATA` und `POINTS` angezeigt. Ein Bannlistenwechsel entfernt niemals Karten. Er berechnet Limits, Punkte und Status sofort neu und wird am Deck gespeichert.

Ein ungültiges Deck bleibt als **Entwurf** gespeichert. Der zentrale Guard `requirePlayableDeck` sperrt:

- `.ydk`-Export,
- Zuordnung zu einer Duellanfrage,
- Registrierung für Turnier oder Match.

### Autosave

- Jede Mutation zeigt Speichern, Gespeichert oder Fehler.
- Fehler bieten Wiederholung an und verwerfen keine lokalen Änderungen still.
- Suche, Filter und ausgewählte Karte bleiben nach Inspector- und Bereichswechsel erhalten.

## Deckbibliothek

- Jede Zeile/Karte zeigt Name, Bannliste, Main/Extra/Side, fehlende Karten, Spielbarkeit und letzte Änderung.
- Ungültige Decks heißen **Entwurf** und verlinken direkt zum konkreten Grund.
- Export ist für Entwürfe deaktiviert und zusätzlich serverseitig gesperrt.
- Zielaktionen: Öffnen, Duplizieren, Umbenennen, Exportieren und Löschen.
- Zielfilter: Spielbarkeit, Format, Bannliste und Aktualität.

## Bindereditor

- Verwendet denselben Katalog, Besitzschalter und Karteninspektor.
- Alle Karten sind sichtbar; nur eine konkrete freie `CollectionEntry` darf platziert werden.
- Beim Platzieren bleiben Set, Setcode und Seltenheit der Druckversion erhalten.
- Reservierte/gehandelte Kopien bleiben sichtbar, können aber nicht neu platziert werden.
- Dieselbe physische Kopie darf kampagnenweit nur in einem Binder-Slot liegen.
- Eine Seite besitzt genau 18 geordnete Slots. Seitenwechsel, Autosave, Undo und Redo bleiben erhalten.
- Nicht besessene Karten zeigen **Zur Wunschliste** statt **In Binder legen**.
- Profil-Showcases sind eigene Veröffentlichungen und niemals Arbeits-Binder.

## Wunschliste

- Schlüssel: Kampagne, Spieler und Kartenidentität.
- Daten: gewünschte Anzahl, Priorität und Notiz.
- Deckbedarf und Binder verwenden denselben Eintrag.
- Angezeigt werden gewünschte, inzwischen vorhandene und noch fehlende Exemplare.
- Vollständig erfüllte Einträge können ausgeblendet oder entfernt werden.

## Abnahmezustände

1. Alle Karten anzeigen, fehlende Karte hinzufügen, Bedarf prüfen, Export-Sperre bestätigen.
2. Karte erwerben; Deck wird ohne Bearbeitung spielbar, sofern keine anderen Fehler bestehen.
3. Bannliste wechseln, Limitfilter anwenden, neu laden; Auswahl und Status bleiben bestehen.
4. Vorhandene Druckversion im Binder platzieren; dieselbe Kopie kann in keinem zweiten Binder liegen.
5. Nicht vorhandene Karte aus dem Binder-Inspector zur Wunschliste hinzufügen.
6. Alle Kernaktionen sind ohne Drag-and-drop und mit sichtbarem Fokus möglich.
