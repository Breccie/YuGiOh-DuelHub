# Abnahme-Checkliste

Diese Checkliste ist vor jeder Fertigmeldung Pflicht.

## Pflicht vor "fertig"

1. Nicht nur den Code prüfen, sondern die betroffenen Seiten auch sichtbar kontrollieren.
2. Nach jeder größeren UI-Änderung mindestens die direkt betroffenen Screens live öffnen.
3. Vor der Fertigmeldung prüfen, ob Layout, Assets, Größen, Positionen und Zustände wirklich zur Referenz passen.
4. Wenn etwas sichtbar falsch aussieht, nicht erst auf Nutzerfeedback warten, sondern direkt selbst nachbessern.
5. Erst "fertig" sagen, wenn Codeprüfung und Sichtprüfung beide bestanden sind.

## Mindestprüfung

- `npm run typecheck`
- `npm run build`
- Sichtprüfung der geänderten Seiten
- Prüfen, ob neue Assets wirklich eingebunden sind und keine alten Platzhalter mehr sichtbar sind

## Verboten

- Sichtbare Platzhalter als final ausgeben
- Eine Änderung nur deshalb als korrekt ansehen, weil der Build grün ist
- Auf Nutzerhinweis warten, obwohl ein sichtbarer Fehler bereits selbst erkennbar ist
