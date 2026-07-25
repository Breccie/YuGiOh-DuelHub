# Design-QA: Master-Duel-inspirierter Editor und Sandbox

Stand: 2026-07-18

## Geprüfter Umfang

- Deckbibliothek und Deckeditor auf Desktop und Mobile
- gemeinsamer Kartenkatalog mit Besitzumschaltung und Inspector
- Binderbibliothek und Bindereditor
- versionierte Kampagnenregeln
- Custom-Pack-Studio einschließlich Simulation, Veröffentlichung und Öffnung

## Referenzvergleich

Die Referenzen `referenzen/ui/decks-seite-referenz-03-offen-kanonisch.png` und `referenzen/ui/sammlung-binder-editor-referenz-01.png` wurden bei identischem Desktop-Kontext gemeinsam mit den Anwendungsscreenshots geprüft. Übernommen wurden die Bedienmuster Katalog/Arbeitsfläche/Inspector, die hohe Informationsdichte, persistente Filter und direkte Kartenaktionen. Farbwelt, Typografie, Panelradien und Navigation bleiben bewusst im bestehenden Duel-Console-Designsystem.

## Playwright-Nachweise

Die aktuelle Abnahme liegt unter `output/playwright/final-audit/`, unter anderem:

- `deck-editor-reference-viewport.png` (1626 × 967),
- `binder-editor-reference-viewport.png` (1536 × 1024),
- `deck-editor-mobile-viewport.png` (390 × 844),
- `binder-editor-mobile-viewport.png` (390 × 844),
- `campaign-settings-desktop.png`,
- `custom-pack-desktop.png`.

Der Chromium-Lauf hat Login, Besitzfilter, Öffnen und Schließen beider Editoren,
Escape-/Fokuswiederherstellung sowie die Auswahl einer nicht besessenen Binderkarte
bis zur sichtbaren Wunschlistenaktion geprüft. Es wurden bewusst keine weiteren
QA-Binder, Wunschlisteneinträge oder Packöffnungen erzeugt. Die Browserkonsolen der
Desktop- und Mobile-Läufe enthielten keine Fehler.

## Sichtprüfung

- Keine überlappenden Filter, abgeschnittenen Hauptaktionen oder unlesbaren Statusflächen.
- Desktop-Editor besitzt drei klar getrennte Arbeitsbereiche.
- Mobile Deckansicht verwendet Katalog/Deck/Details statt gequetschter Spalten.
- Nicht besessene Karten und fehlender Bedarf sind klar erkennbar.
- Nicht besessene Binderkarten sind für Maus, Tastatur und Screenreader auswählbar,
  ohne fälschlich als deaktivierte Buttons angekündigt zu werden.
- Regeloberfläche und Custom-Pack-Studio verwenden vorhandene Komponenten, Abstände und Assets.

final result: passed
