"use client";

import { DeckEditorConsole } from "@/components/deck-editor-console";
import { DuelConsoleScaffold } from "@/components/duel-console-scaffold";
import type { DeckLegalitySnapshot } from "@/lib/deck-legality";

type DeckEditorWorkspaceProps = {
  viewer: {
    displayName: string;
  };
  activeDeck: DeckLegalitySnapshot["activeDeck"];
  availableBanlists: DeckLegalitySnapshot["editor"]["availableBanlists"];
  collectionCards: DeckLegalitySnapshot["editor"]["collectionCards"];
};

export function DeckEditorWorkspace({
  viewer,
  activeDeck,
  availableBanlists,
  collectionCards,
}: DeckEditorWorkspaceProps) {
  return (
    <DuelConsoleScaffold activePath="/decks" viewer={viewer} metrics={[]}>
      <section className="deck-editor-workspace flex h-[calc(100dvh-164px)] min-h-[560px] flex-col overflow-hidden rounded-[12px] border border-[rgba(144,174,198,0.14)] bg-[#05080d] text-[#f2e5d1] lg:h-[calc(100dvh-100px)] lg:min-h-[620px]">
        <div className="min-h-0 flex-1 overflow-y-auto p-2 sm:p-2.5 xl:overflow-hidden">
          <DeckEditorConsole
            key={activeDeck?.id ?? "new-deck"}
            activeDeck={activeDeck}
            availableBanlists={availableBanlists}
            collectionCards={collectionCards}
          />
        </div>
      </section>
    </DuelConsoleScaffold>
  );
}
