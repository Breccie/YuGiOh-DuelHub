export type RuleTopic = {
  slug: string;
  title: string;
  kicker: string;
  summary: string;
  body: string[];
  checklist: string[];
};

export type RuleFaqItem = {
  id: string;
  question: string;
  answer: string;
};

export const ruleTopics: RuleTopic[] = [
  {
    slug: "progression",
    title: "Progression und Pack-Freischaltung",
    kicker: "Liga-Rhythmus",
    summary:
      "Die Liga bewegt sich gemeinsam durch historische Sets. Packs werden durch Saison-Checkpoints freigeschaltet, nicht durch lokale Einzelentscheidungen.",
    body: [
      "Jede Saison definiert einen Kartenpool, eine gültige Banlist und einen Fortschrittsplan. Sobald ein Checkpoint aktiv wird, erhalten alle berechtigten Spieler Zugriff auf dieselben neuen Sets.",
      "Pack-Openings bleiben nachvollziehbar: jede gezogene Kopie wird als eigene Collection-Entry gespeichert, damit Deckbau, Trades und Binder denselben Besitzstand sehen.",
      "Für die Desktop-Demo dürfen Seed-Daten schneller freigeschaltet sein. Im Online-Modus ist der Server die Quelle der Wahrheit.",
    ],
    checklist: [
      "Aktive Saison prüfen",
      "Checkpoint-Freischaltung bestätigen",
      "Pack öffnen und Pulls speichern",
      "Sammlung und Trade-Verfügbarkeit aktualisieren",
    ],
  },
  {
    slug: "season",
    title: "Saison, Liga und Rollen",
    kicker: "Organisation",
    summary:
      "Eine private Liga bündelt Spieler, Rollen, Zeitzone, aktive Saison und alle offiziellen Fortschrittsstände.",
    body: [
      "Owner verwalten die Liga und bestimmen Organizer. Organizer können Turniere, Checkpoints und Datenkorrekturen anstoßen. Player spielen, tauschen und melden Ergebnisse.",
      "Saisons fixieren Format, Errata-Policy, Banlist und Kartenpool zu einem Stichtag. Decklisten und Turnierergebnisse behalten diese Snapshots, auch wenn später neue Sets erscheinen.",
      "Beim Saisonabschluss werden Standings, Turniere, Decklisten, Trades und freigeschaltete Sets archiviert.",
    ],
    checklist: [
      "Liga-Rolle kennen",
      "Saison-Stichtag prüfen",
      "Format-Snapshot beim Deck speichern",
      "Archiv nach Saisonende sperren",
    ],
  },
  {
    slug: "banlist-errata",
    title: "Banlist und Errata",
    kicker: "Regelauslegung",
    summary:
      "Kartentexte, Limitierungen und Errata werden an den Saisonstand gebunden, damit alle Duelle denselben Regelrahmen nutzen.",
    body: [
      "Die jeweils aktive Banlist entscheidet, ob eine Karte verboten, limitiert oder semi-limitiert ist. Der Deckeditor prüft diesen Zustand gegen den gespeicherten Format-Snapshot.",
      "Errata werden über Stichtage gelöst. Eine Karte kann in älteren Formaten mit altem Text und in späteren Formaten mit neuerem Text bewertet werden.",
      "Wenn ein Import fehlerhafte Texte oder Limitierungen enthält, wird das über Admin-/Repair-Jobs korrigiert, nicht im normalen Request-Pfad.",
    ],
    checklist: [
      "Banlist-Version auswählen",
      "Errata-Stichtag beachten",
      "Decklegalität neu prüfen",
      "Korrekturen als Datenjob dokumentieren",
    ],
  },
  {
    slug: "deckbau",
    title: "Deckbau und Besitzprüfung",
    kicker: "Deckregeln",
    summary:
      "Decks müssen nicht nur formal legal sein, sondern auch aus tatsächlich vorhandenen Kartenkopien gebaut werden.",
    body: [
      "Main, Extra und Side Deck werden getrennt geprüft. Die Besitzprüfung zählt konkrete Collection-Entries und verhindert, dass dieselbe Kopie mehrfach eingeplant wird.",
      "Ein Deck kann als `.ydk` exportiert werden, damit EDOPro die externe Duel-Engine bleibt. Der Hub dokumentiert Besitz, Legalität und Export-Historie.",
      "Turniermeldungen sollen langfristig unveränderliche Deck-Snapshots bekommen, damit spätere Kartenänderungen alte Ergebnisse nicht verfälschen.",
    ],
    checklist: [
      "Mindestens 40 Karten im Main Deck",
      "Besitz pro Kopie prüfen",
      "Banlist-Konflikte lösen",
      "EDOPro-Export erstellen",
    ],
  },
  {
    slug: "edopro",
    title: "EDOPro-Handoff und Duelle",
    kicker: "Externe Engine",
    summary:
      "Der Duel Hub simuliert keine Duelle. EDOPro bleibt die Engine; der Hub plant, exportiert und dokumentiert Ergebnisse.",
    body: [
      "Duellanfragen verbinden Spieler, Deckexporte, geplante Termine und optionale Turnier-Matches. Der eigentliche Spielablauf findet in EDOPro statt.",
      "Für spätere Ergebnisvalidierung sollen Best-of-Three-Ergebnisse, Replay-/Log-Links und Bestätigungen beider Spieler gespeichert werden.",
      "Konflikte werden nicht automatisch entschieden. Sie erhalten einen Status und können von Organizer-Rollen geprüft werden.",
    ],
    checklist: [
      "Duellanfrage annehmen",
      "Termin und Plattform festlegen",
      "Deck nach EDOPro exportieren",
      "Ergebnis mit Nachweis melden",
    ],
  },
  {
    slug: "trades",
    title: "Trades und Reservierungen",
    kicker: "Tauschlogik",
    summary:
      "Trades sind versionierte Angebote. Akzeptierte Kartenkopien werden reserviert, bis beide Seiten den Abschluss bestätigen oder der Trade endet.",
    body: [
      "Jede Gegenofferte erzeugt eine neue Version. Dadurch bleibt nachvollziehbar, welche Karten zu welchem Zeitpunkt angeboten oder angefordert wurden.",
      "Reservierungen schützen Collection-Entries vor Doppelvergabe. Kritische Schreiboperationen brauchen Transaktionen und klare Konfliktfehler.",
      "Wishlist- und Auto-Match-Funktionen passen später gut in diesen Bereich, sollten aber auf derselben Reservierungslogik aufbauen.",
    ],
    checklist: [
      "Aktive Angebotsversion prüfen",
      "Reservierte Kopien anzeigen",
      "Beidseitige Bestätigung abwarten",
      "Konflikte mit stabilem Fehlercode melden",
    ],
  },
  {
    slug: "tournaments",
    title: "Turniere und Swiss-Pairings",
    kicker: "Wettbewerb",
    summary:
      "Turniere dokumentieren Teilnehmer, Runden, Pairings, Matchresultate und Standings innerhalb der aktiven Saison.",
    body: [
      "Swiss-Runden paaren Spieler anhand bisheriger Ergebnisse. Byes und Opponent-Match-Win-Rate fließen in die Standings ein.",
      "Matchresultate sollen transaktional gespeichert werden, damit Standings und Runde nicht auseinanderlaufen.",
      "Turniere greifen künftig auf Saison- und Deck-Snapshots zurück, damit historische Formate sauber reproduzierbar bleiben.",
    ],
    checklist: [
      "Teilnehmer einladen",
      "Runde starten",
      "Ergebnis melden",
      "Standings prüfen",
    ],
  },
  {
    slug: "faq",
    title: "Häufige Fragen",
    kicker: "Kurzantworten",
    summary:
      "Schnelle Orientierung für die häufigsten Fragen rund um Liga, Packs, Trades, Decks und EDOPro.",
    body: [
      "Die FAQ bündelt operative Antworten. Wenn eine Antwort spielentscheidend ist, gilt die konkrete Saison-, Banlist- oder Turnierregel.",
      "Unklare Sonderfälle sollten als Organizer-Entscheidung dokumentiert werden, damit zukünftige Runden konsistent bleiben.",
    ],
    checklist: [
      "Saisonregel zuerst lesen",
      "Organizer bei Sonderfällen einbeziehen",
      "Entscheidung dokumentieren",
    ],
  },
];

export const ruleFaqItems: RuleFaqItem[] = [
  {
    id: "pack-unlock",
    question: "Wer entscheidet, wann neue Packs freigeschaltet werden?",
    answer:
      "Im Online-Modus entscheidet die aktive Saison über Checkpoints. Lokale Pack-Historie darf daraus nichts mehr ableiten.",
  },
  {
    id: "edopro",
    question: "Wird EDOPro ersetzt?",
    answer:
      "Nein. Der Hub verwaltet Liga, Sammlung, Decks, Termine und Ergebnisse; EDOPro bleibt die Duel-Engine.",
  },
  {
    id: "trade-reservation",
    question: "Warum sind Karten in Trades manchmal gesperrt?",
    answer:
      "Akzeptierte oder aktive Trade-Versionen können konkrete Kartenkopien reservieren, damit dieselbe Kopie nicht doppelt getauscht wird.",
  },
  {
    id: "deck-snapshot",
    question: "Warum brauchen Decks Snapshots?",
    answer:
      "Snapshots halten Banlist, Format und Kartenpool fest, damit spätere Saisonfortschritte alte Turnierlisten nicht verändern.",
  },
];

export function getRulesOverview() {
  return {
    topics: ruleTopics,
    faq: ruleFaqItems,
  };
}

export function getRuleTopic(slug: string) {
  return ruleTopics.find((topic) => topic.slug === slug) ?? null;
}
