# Lokale Bannlisten

Lege hier zusätzliche `.lflist.conf`-Dateien ab, wenn du historische oder eigene Formate importieren willst.

Der Importer lädt automatisch:

- die offiziellen Listen aus `ProjectIgnis/LFLists`
- das klassische TCG-Monatsarchiv aus der großen `ygopro`-`lflist.conf`
- zusätzlich alle lokalen Dateien in diesem Ordner
- auch mehrere `!`-Header-Blöcke innerhalb einer einzelnen Datei

Beispiel-Dateinamen:

- `2011-09-classic-tcg.lflist.conf`
- `edison-archive.lflist.conf`

Wichtig:

- Jede Liste braucht eine `!`-Header-Zeile wie `!2011.09 Classic TCG`.
- Karten werden über ihre Passcodes zu den importierten Karten gemappt.
- Nach neuen Dateien einfach `npm run import:ygo -- --skip-catalog` ausführen.
