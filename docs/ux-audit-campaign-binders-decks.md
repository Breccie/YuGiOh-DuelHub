# UX-Audit: Kampagnen, Binder und Decks

Stand: 2026-07-12  
Viewport: 1440 × 1000  
Umgebung: lokale Desktop-Demo, Seed-Konto `YUGI-001`, aktive Kampagne `test`

Figma-Review-Board: [Duel Hub – Kampagnen, Binder & Deck UX Audit](https://www.figma.com/design/7zjJPt6ATlVojsAkPxE2Zo)

## Gesamturteil

Die visuelle Richtung ist konsistent und eigenständig. Die wichtigsten Probleme liegen nicht im Stil, sondern in Informationsarchitektur und Objektlogik: Kampagnenwahl, Kampagnenerstellung und Detailkonfiguration konkurrieren auf einer Seite; Binder-Cover werden als vier echte Binder angelegt; die Deckübersicht wiederholt das aktive Deck mehrfach und verdrängt die Bibliothek. Der Deckeditor hat bereits eine brauchbare Dreiteilung, braucht aber bessere Priorisierung, skalierbare Listen und vollständig sichtbare Bedienalternativen.

## Schritt 1 – Login

![Login](../output/playwright/campaign-audit-2026-07-12/01-login.png)

Gesundheit: **mittel**

- Stärke: klare Trennung zwischen Produktversprechen und Anmeldung; primäre Aktion ist eindeutig.
- Problem: Die Demo-Kontoliste enthält alte `VITEST-*`-Konten. Testdaten gelangen damit in die normale lokale Produkterfahrung und machen die Liste unübersichtlich.
- Problem: Die linke Marketingfläche ist sehr dominant, obwohl der primäre Job wiederkehrender Benutzer die Anmeldung ist.
- Accessibility-Risiko: dekorative Serifenschrift und kleine Textgrößen in den Feature-Karten können bei Zoom und schwächerem Kontrast schwer lesbar sein. Tastaturreihenfolge und tatsächliche Kontrastwerte wurden nicht vollständig gemessen.

## Schritt 2 – Kampagnen-Hub

![Kampagnen-Hub](../output/playwright/campaign-audit-2026-07-12/02-campaigns.png)

Gesundheit: **mittel bis schwach**

- Stärke: aktive Kampagne und vorhandene Mitgliedschaften sind erkennbar; Kampagnenkarten zeigen Rolle und Mitgliederzahl.
- Problem: „Kampagne wählen“ und ein sieben Felder großes Erstellformular teilen sich dieselbe visuelle Priorität. Für die häufige Aufgabe „vorhandene Kampagne öffnen“ entsteht unnötige Last.
- Problem: Ein Beitrittsweg fehlt vollständig. Es gibt nur Erstellen und Öffnen.
- Problem: Die Navigation für Packs, Sammlung, Decks, Turniere und Tausch ist bereits vollständig sichtbar. Der gewünschte gesperrte Zustand ohne Kampagne wird nicht erklärt oder vorbereitet.
- Problem: Erweiterte Regeln werden flach und ohne Preset, Gruppierung oder Erklärung präsentiert. Bereits die vorhandenen sieben Zahlen wirken technisch statt spielerisch.
- Empfehlung: Hub in drei klare Aktionen gliedern: **Fortsetzen**, **Beitreten**, **Erstellen**. Erstellen öffnet einen Wizard mit Preset und optionalen erweiterten Bereichen.
- Accessibility-Risiko: Viele Großbuchstaben mit breitem Tracking und mehrere sehr ähnliche dunkle Flächen erschweren schnelles Scannen. Der aktive Zustand sollte nicht nur über Farbe kommuniziert werden.

## Schritt 3 – Sammlung und Binder

![Binderübersicht](../output/playwright/campaign-audit-2026-07-12/03-collection-binders.png)

Gesundheit: **schwach**

- Stärke: Cover sind hochwertig und Binderkarten zeigen Aktivstatus, Karten- und Seitenzahl.
- Kritischer Befund: In der aktiven Kampagne existieren genau vier Binder; drei davon sind leer. Sie entsprechen eins zu eins den vier Cover-Varianten. Das bestätigt, dass Coveroptionen automatisch als Benutzer-Binder erzeugt werden.
- Problem: Leere Binder wirken wie bewusst erstellte Objekte. Es fehlt jede Erklärung, warum sie existieren.
- Problem: Die primäre Aktion zum Öffnen liegt auf der gesamten Karte, Bearbeiten ist nur ein kleines Symbol. Der Unterschied ist visuell nicht selbsterklärend.
- Problem: Die Seite widmet fast den gesamten ersten Viewport leeren Bindern; tatsächliche Karten und der geöffnete Binder liegen darunter.
- Empfehlung: standardmäßig genau einen Binder anlegen oder mit einem Empty State beginnen. Cover erst im Erstell-/Bearbeitungsdialog wählen.
- Empfehlung: vorhandene leere Auto-Binder über einen sicheren Aufräumdialog archivieren oder entfernen; keine stillen Löschungen.
- Accessibility-Risiko: Symbolschaltflächen sind visuell nicht beschriftet. Der DOM hatte zwar zugängliche Namen für Bearbeiten, aber Fokusdarstellung, Touch-Zielgröße und Screenreader-Ablauf müssen separat getestet werden.

## Schritt 4 – Deckübersicht

![Deckübersicht](../output/playwright/campaign-audit-2026-07-12/04-deck-overview.png)

Gesundheit: **schwach**

- Stärke: Legalitätsstatus, Main/Extra/Side-Zahlen und Export sind grundsätzlich sichtbar.
- Problem: Das aktive Deck wird gleichzeitig als große Kartenheldenfläche, Überschrift/Aktionsblock, Bibliothekskarte und Detailkarte dargestellt. Diese vier Wiederholungen verbrauchen viel Platz und vermitteln keine zusätzliche Information.
- Problem: Die Bibliothek ist visuell sekundär und horizontal angelegt. Bei vielen Decks wird Auswahl langsam und schwer vergleichbar.
- Problem: „Prüfen“ beschreibt nicht konkret, dass ein Legalitätsfehler vorliegt; die eigentliche Ursache ist erst im Editor sichtbar.
- Problem: „Deck wählen“ ist neben der darunterliegenden Bibliothek redundant.
- Empfehlung: Deckbibliothek als Hauptinhalt mit Listen-/Rasterumschaltung, Suche und Filtern. Ein kompakter Detailbereich zeigt das ausgewählte Deck mit Aktionen und konkretem Fehlertext.
- Accessibility-Risiko: Die großen Bildflächen und kleine Metadaten erzeugen eine starke visuelle, aber schwache semantische Hierarchie. Horizontales Scrollen darf nicht die einzige Möglichkeit sein, weitere Decks zu erreichen.

## Schritt 5 – Deckeditor

![Deckeditor](../output/playwright/campaign-audit-2026-07-12/05-deck-editor.png)

Gesundheit: **mittel**

- Stärke: Sammlung links, Deck rechts und Konfiguration oben bilden eine nachvollziehbare Grundstruktur. Das Legalitätsproblem wird konkret erklärt.
- Stärke: verfügbare, gesperrte und im Deck verwendete Kopien sind im Datenmodell/UI bereits vorgesehen.
- Problem: Der Kartenkatalog rendert eine sehr große Menge auf einmal. Ohne kompakte Ansicht, Pagination oder Virtualisierung wird der Editor bei großen Sammlungen schwer navigierbar.
- Problem: Die Bedienhilfe nennt Linksklick, Rechtsklick und Drag-and-drop. Diese Interaktionen sind nicht selbsterklärend und für Touch- sowie Tastaturnutzung ungeeignet, wenn keine gleichwertigen sichtbaren Buttons vorhanden sind.
- Problem: Konfiguration, Katalog, Deck und Kartendetails konkurrieren in einer langen Vollbildfläche. Der aktuelle Screenshot zeigt nur den oberen Teil; wichtige Bereiche liegen unterhalb des Folds.
- Empfehlung: sticky Deckbereiche, kompakter/virtueller Katalog, sichtbare `+ Main`, `+ Extra`, `+ Side` und `−`-Aktionen sowie ein eindeutiger Speicherstatus.
- Accessibility-Risiko: Rechtsklick und Drag-and-drop dürfen nur Komfortfunktionen sein. Fokusmanagement beim Öffnen/Schließen des Editors und Tastaturbedienung der Karten müssen funktional getestet werden.

## Höchste Priorität

1. Kampagnen-Gate und Beitrittsflow vor allen Sandbox-Details.
2. Auto-Erzeugung von vier Bindern stoppen und bestehende leere Binder diagnostizierbar aufräumen.
3. Deckbibliothek zum primären Inhalt machen und redundante aktive-Deck-Flächen entfernen.
4. Deckeditor mit sichtbaren, zugänglichen Alternativen zu Rechtsklick und Drag-and-drop versehen.
5. Demo-/Testdaten von normalen Seed-Konten trennen.

## Evidenzgrenzen

- Geprüft wurde die lokale Desktop-Demo mit einer aktiven Kampagne und einem Deck.
- Der Zustand eines komplett neuen Accounts ohne Kampagne wurde nicht erzeugt, weil das dauerhafte Testdaten verändert hätte.
- Das vom Benutzer erwähnte Konto mit elf Bindern war in diesem Lauf nicht sichtbar; der aktive Kampagnenzustand zeigte vier Binder. Die Code- und Screenshot-Evidenz erklärt die vier automatischen Binder, nicht abschließend alle elf historischen Objekte.
- Screenshots belegen keine vollständige WCAG-Konformität. Kontrastmessung, Screenreader, Fokusreihenfolge, Zoom, mobile Breakpoints und Tastaturaktionen benötigen eigene Tests.
