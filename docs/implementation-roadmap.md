# Umsetzungs-Roadmap und Abnahmecheckliste

Stand: 2026-07-17

## Phase 1 – Gemeinsamer Katalog

- [x] Server-seitige Suche, Filter und Cursor-Paginierung
- [x] Besitzdaten nach aktivem `runId`
- [x] Bannlistenlimit, Genesys-Punkte und Deckverwendung im Katalogeintrag
- [x] Alle/Im Besitz/Nicht im Besitz in Deck und Binder
- [ ] Vollständige Filteroberfläche für alle API-Filter
- [x] Mobile gestufte Katalog-/Arbeitsfläche-/Details-Navigation

## Phase 2 – Decks

- [x] Nicht besessene Karten in Entwürfen zulassen
- [x] Maximum drei Exemplare über Main/Extra/Side serverseitig erzwingen
- [x] Zusammengefasste Bedarfsliste
- [x] Bedarf in gemeinsame Wunschliste übernehmen
- [x] Zentraler Spielbarkeitsguard für Export und Duellanfrage
- [x] Entwurfsstatus und Export-Sperre in der Deckbibliothek
- [ ] Turnierregistrierungs-Guard an allen zukünftigen Deckzuordnungsendpunkten
- [ ] Duplizieren/Umbenennen/Löschen und Bibliotheksfilter

## Phase 3 – Binder und Wunschliste

- [x] Gesamtkatalog im Binder
- [x] Nicht besessene Karten über Inspector zur Wunschliste
- [x] Nur konkrete freie Druckversionen platzierbar
- [x] Kampagnenweite Doppelbelegung serverseitig gesperrt
- [x] 18 Slots, Seiten, Autosave, Undo/Redo
- [x] Kampagnen- und Spieler-isoliertes Wunschlistenmodell/API
- [ ] Eigene Wunschlistenübersicht mit Erledigt-Filter

## Phase 4 – Sandbox-Regelversionen

- [x] Versioniertes Datenmodell mit Autor, Status, Aktivierungszeitpunkt und JSON-Konfiguration
- [x] Migration vorhandener Kampagnen auf Version 1
- [x] API für Entwurf, Terminierung und Aktivierung
- [x] Start-Credits verändern keine bestehenden Wallets
- [x] Regelversion an Öffnungen, Progressionsschritte, Rewards und Turniere schreiben
- [x] Kategorisierte Host-Oberfläche für Economy, Progression, Decks, Trades, Turniere und Aktivierung
- [ ] Presets beim Auswählen als vollständige Wertvorschau anwenden

## Phase 5 – Custom Packs

- [x] Definition, unveränderliche Version, Pool, Slots und Kampagnenzugriff
- [x] Vier Era-Vorlagen als editierbare Ausgangskonfiguration
- [x] Validierung für leere Pools, unerreichbare Rarities und Packgröße
- [x] Deterministische Simulation mit frei wählbarem Seed und Standard 10.000 Packs
- [x] Veröffentlichung friert eine Version ein; Änderungen starten eine Folgeversion
- [x] Private Vorlagen und kampagnenübergreifendes Kopieren im Service und API
- [x] Custom-Pack-Studio mit Kartenpool, Rarity-Zuweisung, Simulation und Veröffentlichung
- [x] Auditierbare Custom-Pack-Öffnung aus dem Studio
- [ ] Private Vorlagen in der Oberfläche verwalten
- [ ] Custom Packs zusätzlich in Standard-Shop, Progression und Turnierrewards auswählbar machen

## Phase 6 – Härtung und Rollout

- [x] TypeScript-Gesamtprüfung
- [x] Unit-/Integrationstests: 72 bestanden, 1 bewusst übersprungen
- [x] Playwright-Abnahme Desktop und Mobile für Deck, Binder, Regeln und Custom Packs
- [x] Referenz-/App-Screenshotvergleich und `design-qa.md: final result: passed`
- [x] Integrationstest für unveränderliche, reproduzierbare Custom-Pack-Öffnungen
- [ ] Zusätzliche Integrationstests für Regelhistorie und Wunschliste
- [ ] Preview-Deployment, Migration und Smoke-Test
- [ ] Produktions-Rollout und vollständiger E2E-Smoke

Online-Reihenfolge: Katalog → Deckeditor → Binder/Wunschliste → Regelversionen → Custom Packs → E2E-Smoke. Eine Phase wird erst nach Migration, Tests und Preview-Abnahme produktiv freigegeben.
