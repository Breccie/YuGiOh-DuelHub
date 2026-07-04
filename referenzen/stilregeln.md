# Stilregeln

## Kernregel

- Es gibt genau eine gemeinsame App-Shell.
- Diese Shell richtet sich immer nach `ui/pack-auswahl-referenz-01.png`.
- Keine Unterseite darf für Sidebar, Top-Chips, Fenstersteuerung, Transparenz oder Grundhelligkeit eine eigene Shell-Variante einführen.

## Was global festgelegt ist

- Shell, linkes Menü, aktive Navigation, obere HUD-Chips:
  `ui/pack-auswahl-referenz-01.png`
- Bühnenhintergrund, Monolith, Boden, Mondlicht, oberer Hero-Bereich:
  `ui/hintergrundbild-referenz-01.png`
- Materialität, Panelkanten, Schriftwirkung, Mikrodetails:
  `ui/ui-material-detailset-02-menu-aus-packref.png`
- Buttons, Suche, Dropdowns, Tabs, Pagination, Fenstersteuerung:
  `ui/ui-zustaende-navigation-controls-02-menu-aus-packref.png`

## Was Unterseiten noch selbst definieren dürfen

- ihre innere Inhaltskomposition
- ihre Kartenmodule
- ihre Detailspalten
- ihre Binder- oder Deck-spezifischen Layouts
- ihre modalen Arbeitsflächen

## Was Unterseiten nicht mehr selbst definieren dürfen

- eine breitere oder andere Sidebar
- ein anderes Header-HUD
- ein anderes Profilmodul oben rechts
- andere Fensterbuttons
- andere Shell-Farben oder andere Glas-/Schattenlogik

## Wann eine neue Vollbild-Referenz nötig ist

- wenn eine Seite eine neue innere Raumaufteilung bekommt
- wenn ein neuer Produktmodus entsteht
- wenn eine neue physische Metapher hinzukommt
- wenn ein neuer Overlay-Typ oder Editor-Typ gebraucht wird

## Asset-Regel

- Finale Shell-Assets kommen nur noch aus `public/app-assets/console-icon-sprite.svg`, `public/app-assets/pack-stage-bg-moon-monolith.png`, `public/app-assets/binder-spread-base.svg` und `public/app-assets/inscription-texture.png`.
- Alte Platzhalter- oder Alt-Sprites sind keine gültige Grundlage mehr.

## Arbeitsregel bei Unklarheit

- Wenn eine Referenz der globalen Shell-Regel widerspricht, gewinnt immer die Pack-Shell.
- Wenn danach noch etwas unklar bleibt, wird es nicht frei interpretiert, sondern zuerst geklärt.
