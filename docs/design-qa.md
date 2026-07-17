# Design-QA: Master-Duel-inspirierter Editor und Sandbox

Stand: 2026-07-17

## Geprüfter Umfang

- Deckbibliothek und Deckeditor auf Desktop und Mobile
- gemeinsamer Kartenkatalog mit Besitzumschaltung und Inspector
- Binderbibliothek und Bindereditor
- versionierte Kampagnenregeln
- Custom-Pack-Studio einschließlich Simulation, Veröffentlichung und Öffnung

## Referenzvergleich

Die Referenzen `referenzen/ui/decks-seite-referenz-03-offen-kanonisch.png` und `referenzen/ui/sammlung-binder-editor-referenz-01.png` wurden bei identischem Desktop-Kontext gemeinsam mit den Anwendungsscreenshots geprüft. Übernommen wurden die Bedienmuster Katalog/Arbeitsfläche/Inspector, die hohe Informationsdichte, persistente Filter und direkte Kartenaktionen. Farbwelt, Typografie, Panelradien und Navigation bleiben bewusst im bestehenden Duel-Console-Designsystem.

## Playwright-Nachweise

- `screenshots/editor-qa/deck-library-desktop.png`
- `screenshots/editor-qa/deck-editor-unowned-desktop.png`
- `screenshots/editor-qa/binder-library-desktop.png`
- `screenshots/editor-qa/binder-editor-unowned-desktop.png`
- `screenshots/editor-qa/deck-library-mobile.png`
- `screenshots/editor-qa/deck-editor-mobile.png`
- `screenshots/editor-qa/campaign-rules-desktop.png`
- `screenshots/editor-qa/custom-pack-simulation-desktop.png`

Der Chromium-Lauf hat folgende echten Aktionen erfolgreich ausgeführt: Login, Besitzfilter, Öffnen beider Editoren, Custom Pack erstellen, vier Rarity-Pools füllen, Entwurf speichern, 10.000 Packs simulieren, Version veröffentlichen und ein Pack mit Wallet-, Audit- und Sammlungsbuchung öffnen. `browser-errors.json` ist leer.

## Sichtprüfung

- Keine überlappenden Filter, abgeschnittenen Hauptaktionen oder unlesbaren Statusflächen.
- Desktop-Editor besitzt drei klar getrennte Arbeitsbereiche.
- Mobile Deckansicht verwendet Katalog/Deck/Details statt gequetschter Spalten.
- Nicht besessene Karten und fehlender Bedarf sind klar erkennbar.
- Regeloberfläche und Custom-Pack-Studio verwenden vorhandene Komponenten, Abstände und Assets.

final result: passed
