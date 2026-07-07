# Roadmap nach Desktop-MVP

Stand: 2026-07-07

## Abschluss der Arbeitsphasen

| Phase | Status | Ergebnis |
| --- | --- | --- |
| 1. Ueberblick herstellen | Fertig | Projektanalyse, belegte Bereiche, Risiken und MVP-Grenze geklaert. |
| 2. Desktop-MVP stabilisieren | Fertig | `db:generate`, Demo-Seed, Desktop-Smoke, Typecheck, Tests und Lint gruen. |
| 3. Worktree sortieren | Fertig | `WORKTREE_INVENTORY.md` mit Commit-Gruppen und Risiken erstellt. |
| 4. Kernflow produktreif machen | Fertig fuer aktuellen Stand | Production-Build und Desktop-Smoke gruen; LCP-Hinweise fuer initial sichtbare Pack-/Binderbilder adressiert. |
| 5. Daten & Assets bereinigen | Fertig fuer aktuellen Stand | Promo-Daten-Audit gruen; Pack-Asset-Luecken sind bekannt und nicht MVP-blockierend. |
| 6. Online-Dev stabilisieren | Fertig fuer aktuellen Stand | Online-Smoke auf freien Ports gruen; alter Register-500 nicht reproduziert. |
| 7. Erweiterungen priorisieren | Fertig | Diese Roadmap legt die naechste Reihenfolge fest. |

## Naechste Prioritaeten

### P0: Nicht starten, bevor der Worktree sauber ist

- Die Gruppen aus `WORKTREE_INVENTORY.md` einzeln reviewen und committen.
- Zuerst Dokumentation und Smoke-/Safety-Infrastruktur sichern.
- Danach API-/Run-/Service-Aenderungen in getrennten Commits reviewen.

### P1: Kernprodukt abrunden

- Desktop-Kernseiten visuell gegen Referenzen pruefen: `/packs`, `/collection`, `/decks`, `/login`.
- Collection/Binder-Flow manuell durchgehen: Binder waehlen, Slot setzen, speichern, erneut laden.
- Deck-Flow manuell durchgehen: Karte hinzufuegen, Legalitaetszustand verstehen, `.ydk` herunterladen.
- Fehlermeldungen fuer Pack-Opening, Deck-Export und Login auf Nutzerverstaendlichkeit pruefen.

### P2: Daten und Assets verbessern

- Fruehe Core-Booster priorisieren: LON, LOD, DCR, AST, SOD normalisieren.
- Niedrigqualitative Booster-Quellen wie PGD, MFC, RDS, FET, TLM als Generierungs-Backlog behalten.
- Errata-Timeline bewusst klein starten: nur Karten ergaenzen, die fuer den MVP-Test relevant sind.
- `audit-pack-assets` nur laufen lassen, wenn Report-/Manifest-Aenderungen bewusst gewollt sind.

### P3: Online-Dev ausbauen

- Online-Smoke standardisieren, damit Portkonflikte wie `3234` automatisch vermieden oder klar gemeldet werden.
- Desktop- und Online-Smoke nicht parallel starten, weil Next.js nur einen Dev-Server pro App-Verzeichnis erlaubt.
- Den nachlaufenden Rewards-Request mit 401 nach Online-Smoke beobachten; aktuell kein Blocker.
- API- und Frontend-Proxies fuer Collection, Packs, Decks und Runs weiter angleichen.

### P4: Erweiterungen spaeter

- Trades produktreif machen.
- Duellanfragen und EDOPro-Bruecke konkretisieren.
- Turniere UI-seitig ausbauen.
- Profile/Friends/Social erst nach stabilem Kernflow priorisieren.
- 3D-/Animationspolitur nur dort fortsetzen, wo sie Kernseiten nicht verlangsamt.

## Definition von "fertig" fuer diesen Abschnitt

Dieser Abschnitt ist fertig, wenn:

- alle sieben Arbeitsphasen dokumentiert sind,
- Desktop- und Online-Smoke gruen sind,
- Promo-Daten fehlerfrei auditiert sind,
- Pack-Asset-Restarbeiten priorisiert sind,
- der Worktree eine klare Commit-Reihenfolge hat.

Dieser Zustand ist erreicht.
