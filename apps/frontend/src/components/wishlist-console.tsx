"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { ViewerSession, WishlistItem } from "@ygo/contracts";
import { DuelConsoleScaffold } from "@/components/duel-console-scaffold";
import { Panel, StatusPill } from "@/components/panel";
import { getApiErrorMessage } from "@/lib/api-client";
import { wishlistClient } from "@/lib/wishlist-client";

type CompletionFilter = "OPEN" | "COMPLETED" | "ALL";

export function WishlistConsole({ session }: { session: ViewerSession }) {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [filter, setFilter] = useState<CompletionFilter>("OPEN");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    void wishlistClient
      .list()
      .then((payload) => {
        if (isMounted) {
          setItems(payload.items);
        }
      })
      .catch((error) => {
        if (isMounted) {
          setFeedback(
            getApiErrorMessage(error, "Wunschliste konnte nicht geladen werden."),
          );
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const visibleItems = useMemo(
    () =>
      items.filter((item) =>
        filter === "ALL"
          ? true
          : filter === "COMPLETED"
            ? item.completed
            : !item.completed,
      ),
    [filter, items],
  );

  async function updateQuantity(item: WishlistItem, desiredQuantity: number) {
    setPendingId(item.id);
    setFeedback(null);
    try {
      const payload = await wishlistClient.upsert({
        cardId: item.cardId,
        desiredQuantity,
        priority: item.priority,
        note: item.note,
      });
      setItems(payload.items);
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Wunsch konnte nicht aktualisiert werden."));
    } finally {
      setPendingId(null);
    }
  }

  async function remove(item: WishlistItem) {
    setPendingId(item.id);
    setFeedback(null);
    try {
      await wishlistClient.remove(item.id);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Wunsch konnte nicht entfernt werden."));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <DuelConsoleScaffold
      activePath="/wishlist"
      viewer={session}
      metrics={[
        { icon: "mail", label: "Offen", value: String(items.filter((item) => !item.completed).length) },
        { icon: "book", label: "Erfüllt", value: String(items.filter((item) => item.completed).length) },
      ]}
    >
      <Panel kicker="Sammlung" title="Wunschliste">
        <div className="flex flex-wrap gap-2">
          {([
            ["OPEN", "Offen"],
            ["COMPLETED", "Erledigt"],
            ["ALL", "Alle"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={filter === value ? "ui-button-primary" : "ui-button-neutral"}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {feedback ? (
          <p role="status" className="mt-4 rounded-[14px] border border-[rgba(255,255,255,0.08)] px-4 py-3 text-sm text-[#f0dfcc]">
            {feedback}
          </p>
        ) : null}

        <div className="mt-5 grid gap-3">
          {visibleItems.map((item) => (
            <article
              key={item.id}
              className="grid gap-4 rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] p-4 sm:grid-cols-[72px_1fr_auto]"
            >
              <div className="relative h-24 w-[68px] overflow-hidden rounded-lg bg-black/30">
                {item.imageUrl ? (
                  <Image src={item.imageUrl} alt="" fill sizes="68px" className="object-cover" unoptimized />
                ) : null}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold text-[#f0dfcc]">{item.name}</h2>
                  <StatusPill tone={item.completed ? "teal" : "gold"}>
                    {item.completed ? "Erfüllt" : `${item.missingQuantity} fehlen`}
                  </StatusPill>
                </div>
                <p className="mt-2 text-sm text-[#baa58a]">
                  Gewünscht {item.desiredQuantity} · Vorhanden {item.ownedQuantity} · Priorität {item.priority}
                </p>
                {item.note ? <p className="mt-2 text-sm text-[#cdb79c]">{item.note}</p> : null}
              </div>
              <div className="flex items-center gap-2 sm:flex-col sm:items-stretch">
                <button
                  type="button"
                  className="ui-button-neutral"
                  disabled={pendingId === item.id || item.desiredQuantity <= 1}
                  onClick={() => void updateQuantity(item, item.desiredQuantity - 1)}
                >
                  −
                </button>
                <button
                  type="button"
                  className="ui-button-neutral"
                  disabled={pendingId === item.id || item.desiredQuantity >= 99}
                  onClick={() => void updateQuantity(item, item.desiredQuantity + 1)}
                >
                  +
                </button>
                <button
                  type="button"
                  className="ui-button-danger"
                  disabled={pendingId === item.id}
                  onClick={() => void remove(item)}
                >
                  Entfernen
                </button>
              </div>
            </article>
          ))}
          {visibleItems.length === 0 ? (
            <div className="ui-empty rounded-[18px] px-5 py-8 text-sm">
              Für diesen Filter gibt es noch keine Wünsche.
            </div>
          ) : null}
        </div>
      </Panel>
    </DuelConsoleScaffold>
  );
}
