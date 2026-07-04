# Build-Prompt für den nächsten Chat

```text
Ich möchte in diesem Chat jetzt die App umsetzen lassen.

Aufgabe dieses Chats:
Baue die UI meiner Yu-Gi-Oh-Desktop-App so pixelnah wie realistisch möglich auf Basis der vorhandenen Referenzen und der dokumentierten Referenzregeln.

Wichtige Grundregel:
Nicht frei redesignen.
Nicht kreativ interpretieren, wenn Referenzen oder Audit-Regeln etwas bereits festlegen.
Nicht zwischen alten und neuen Referenzen mischen, wenn das Referenz-Audit eine Priorität festlegt.
Wenn eine Referenz im Audit als älterer Zwischenstand markiert ist, darf sie nicht als führende Entscheidungsgrundlage verwendet werden.

Zuerst zwingend prüfen:
- `referenzen/referenz-audit.md`
- `referenzen/README.md`
- `referenzen/viewport.md`
- `referenzen/stilregeln.md`
- `referenzen/abnahme-checkliste.md`

Diese Dateien sind Pflichtbasis.
Wenn dort Regeln oder Prioritäten stehen, haben sie Vorrang vor loser Bildinterpretation.

Projektziel:
Ich baue eine Yu-Gi-Oh-Progression-App im Stil einer echten hochwertigen Desktop-App.
Nicht wie eine Website.
Nicht wie ein generisches Game-Dashboard.
Nicht nur grob inspiriert.
Die Umsetzung soll so nah wie möglich an den Referenzen liegen.

Wichtige Referenzregeln:
- `referenzen/referenz-audit.md` ist die autoritative Einordnung aller UI-Dateien.
- Es darf nur aus den dort als `kanonisch` markierten Referenzen direkt gebaut werden.
- `Hilfsreferenz` darf nur ergänzend verwendet werden.
- `älterer Zwischenstand` darf nicht als führende Entscheidungsgrundlage benutzt werden.

Wichtige festgelegte Prioritäten:
- Für Shell, linkes Menü, Helligkeit des Menüs, Transparenz und aktive Navigation gilt immer:
  `referenzen/ui/pack-auswahl-referenz-01.png`
- Das linke Menü soll sichtbar, schlicht und hochwertig wirken, aber nicht überverziert oder unnötig ornamental sein.
- Für den globalen Bühnenhintergrund, Monolith, Boden und Licht gilt immer:
  `referenzen/ui/hintergrundbild-referenz-01.png`
- Für Binder-Material, Ringmechanik und physischen Binder-Look gilt immer:
  `referenzen/ui/sammlung-binder-referenz-01.png`
- Für Decks offen gilt immer:
  `referenzen/ui/decks-seite-referenz-03-offen-kanonisch.png`
- Für Decks eingeklappt gilt immer:
  `referenzen/ui/decks-seite-referenz-02-eingefahren.png`
- Für menürelevante Systemdetails gelten besonders:
  `referenzen/ui/ui-zustaende-navigation-controls-02-menu-aus-packref.png`
  `referenzen/ui/ui-material-detailset-02-menu-aus-packref.png`

Kanonische Vollbild-Referenzen:
- `referenzen/ui/start-seite-referenz-01.png`
- `referenzen/ui/packs-seite-referenz-01.png`
- `referenzen/ui/sammlung-binder-filter-referenz-01.png`
- `referenzen/ui/sammlung-binder-verwaltung-referenz-01.png`
- `referenzen/ui/sammlung-binder-editor-referenz-01.png`
- `referenzen/ui/decks-seite-referenz-02-eingefahren.png`
- `referenzen/ui/decks-seite-referenz-03-offen-kanonisch.png`
- `referenzen/ui/regeln-seite-referenz-01.png`
- `referenzen/ui/regeln-detail-referenz-01.png`
- `referenzen/ui/tausch-seite-referenz-01.png`
- `referenzen/ui/tausch-angebot-erstellen-referenz-01.png`
- `referenzen/ui/tausch-angebot-detail-referenz-01.png`

Kanonische System- und Zustandsreferenzen:
- `referenzen/ui/ui-zustaende-navigation-controls-02-menu-aus-packref.png`
- `referenzen/ui/ui-zustaende-kartenmodule-01.png`
- `referenzen/ui/ui-zustaende-scroll-pagination-01.png`
- `referenzen/ui/ui-leere-zustaende-01.png`
- `referenzen/ui/ui-dialoge-overlays-01.png`
- `referenzen/ui/ui-feedback-loading-01.png`
- `referenzen/ui/ui-material-detailset-02-menu-aus-packref.png`

Nicht führend, also nicht als Hauptgrundlage verwenden:
- `referenzen/ui/decks-seite-referenz-01.png`
- `referenzen/ui/ui-zustaende-navigation-controls-01.png`
- `referenzen/ui/ui-material-detailset-01.png`

Viewport-Regel:
- Zielgröße für die pixelnahe Umsetzung ist `1536 x 1024 px`
- Nicht frei auf andere Proportionen umdenken, solange keine neue Referenz dafür existiert

Arbeitsauftrag:
1. Lies zuerst Audit, README und Viewport-Datei.
2. Lies danach zwingend die Abnahme-Checkliste und halte sie ein.
3. Prüfe dann die kanonischen Referenzen.
4. Baue die UI so nah wie möglich an den Referenzen.
5. Wenn ein Konflikt entsteht, entscheide ausschließlich nach dem Referenz-Audit.
6. Wenn eine Stelle trotz Audit und Referenzen immer noch nicht eindeutig ist, benenne die Lücke klar statt sie kreativ zu lösen.
7. Bevor du größere UI-Abschnitte baust, nenne kurz, welche kanonischen Referenzen dafür gerade gelten.
8. Vermeide unnötige Erklärungstexte in der Oberfläche.
9. Umlaute immer als echte Umlaute schreiben.

Besonders wichtig für die Umsetzung:
- Desktop-App statt Website
- Dunkle cineastische Duel-Console-Optik
- Linkes Menü halbtransparent, klar lesbar, schlicht und nahe an `pack-auswahl-referenz-01.png`
- Große Hero-Bühnen und sauberes Auslaufen des Hintergrunds
- Hohe Materialqualität ohne überladen zu wirken
- Sammlung als echter Binder
- Decks mit sauber definierter offener und eingeklappter Detailspalte
- Regeln und Tausch im gleichen Produktstil, nicht wie fremde Unterseiten
- Zustände, Dialoge, Feedback und Loading nicht improvisieren, sondern an den Systemtafeln ausrichten

Wichtige Verhaltensregel:
Wenn du bemerkst, dass ältere Zwischenstände von kanonischen Referenzen abweichen, dann folge nicht dem älteren Zwischenstand.
Folge immer dem Audit.

Deine Ausgabe in diesem Chat soll so arbeiten:
- Erst kurz sagen, welche Referenzen du als führend verwendest
- Dann direkt umsetzen
- Danach knapp nennen, wo du bewusst nach Audit priorisiert hast

Pflicht vor jeder Fertigmeldung:
- Nicht nur Build und Typecheck prüfen
- Geänderte Seiten immer auch sichtbar kontrollieren
- Sichtbare Fehler selbst erkennen und vor der Fertigmeldung korrigieren
```
