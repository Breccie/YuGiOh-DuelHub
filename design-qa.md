**Design QA: Sammlung und Binder-Editor**

source visual truth paths:

- `C:\Users\Emil\Documents\Yu-Gi-Oh\referenzen\ui\sammlung-binder-verwaltung-referenz-01.png`
- `C:\Users\Emil\Documents\Yu-Gi-Oh\referenzen\ui\sammlung-binder-editor-referenz-01.png`

implementation screenshot paths:

- `C:\Users\Emil\Documents\Yu-Gi-Oh\output\ui-audit\collection-current-viewport.png`
- `C:\Users\Emil\Documents\Yu-Gi-Oh\output\ui-audit\collection-editor-current-viewport.png`

comparison evidence:

- `C:\Users\Emil\Documents\Yu-Gi-Oh\output\ui-audit\collection-main-comparison.png`
- `C:\Users\Emil\Documents\Yu-Gi-Oh\output\ui-audit\collection-editor-comparison.png`

viewport: `1536x1024`

state: authenticated `YUGI-001`

routes:

- `/collection`
- `/collection?mode=edit&binder=cmr0e81sv0005v6aoptq21hjm`

**Observed Differences Before Patch**

- The collection main page was dominated by one open binder panel and did not read like the binder-management reference.
- Binder cards were secondary and pushed below the fold instead of being the primary overview.
- The main page sidebar was narrower than the reference shell.
- The editor had Binder left and Sammlung right, but the Sammlung panel started too low and felt attached to the binder workspace instead of acting like a permanent card-pool panel.
- The main page had no persistent selected-binder detail panel like the reference.

**Patches Made**

- Rebuilt `/collection` around a reference-like binder-management layout: wide console sidebar, title/header stats, four-card binder overview, persistent right detail panel, and a visible open selected binder below the overview.
- Reduced binder-card density and removed the large repeated edit buttons from each card; edit is now a compact icon on cards and a primary action in the detail panel.
- Added real selected-binder detail data: cover, counts, kind split, cover name, updated timestamp, and edit action.
- Changed the collection header stats to user-facing real collection values instead of a raw total-database ratio.
- Raised the editor Sammlung panel so it starts near the control band like the Master-Duel-style reference.
- Kept the editor interaction model intact: drag/click from Sammlung right into Binder left, page switching, slot clearing, undo/redo, and save.

**Remaining Accepted Drift**

- [P3] The reference shows extra global chips such as banlist, era, profile, and sharing. The implementation uses only currently functional app data, avoiding non-working placeholder controls.
- [P3] The live account only has four binders, so the main-page overview has one full row instead of the reference's two-row sample. The layout supports more binders without changing structure.
- [P3] The active binder has only three filled cards, so the editor spread looks emptier than the reference sample. This is data state, not layout drift.

**Required Fidelity Surfaces**

- Fonts and typography: passed for the existing app system.
- Spacing and layout rhythm: passed with accepted P3 drift.
- Colors and visual tokens: passed; dark/gold/ember shell remains consistent.
- Image quality and asset fidelity: passed; uses real binder, cover, icon, and card assets.
- Copy and content: passed; no placeholder explanatory blocks were added.

**Verification**

- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run desktop:build:web` passed.
- Fresh authenticated screenshots captured.
- Main-page and editor comparison images generated.

final result: passed
