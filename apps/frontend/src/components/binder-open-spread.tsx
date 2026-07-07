"use client";

import Image from "next/image";
import type { MouseEvent } from "react";
import {
  binderCardRects,
  binderPercentX,
  binderPercentY,
  binderSlotRects,
  binderSpreadHeight,
  binderSpreadWidth,
} from "@/lib/binder-open-layout";
import type { CollectionBinderSlotDto } from "@/lib/collection-showcase";

export type BinderEntryDragPayload = {
  cardId: string;
  cardName: string;
  collectionEntryId: string;
  entryReferenceId: string;
  imageUrl: string | null;
  printingLabel: string | null;
  rarity: string | null;
  setCode: string | null;
  kind: CollectionBinderSlotDto["kind"];
};

type BinderOpenSpreadProps = {
  className?: string;
  compact?: boolean;
  dragPreviewActive?: boolean;
  editable?: boolean;
  hoverSlotIndex?: number | null;
  onSelectSlot?: (slotIndex: number) => void;
  onSlotContextMenu?: (slotIndex: number, event: MouseEvent<HTMLElement>) => void;
  selectedSlotIndex?: number | null;
  showDebugGuides?: boolean;
  slots: CollectionBinderSlotDto[];
};

function classNames(...tokens: Array<string | false | null | undefined>) {
  return tokens.filter(Boolean).join(" ");
}

export function BinderOpenSpread({
  className,
  compact = false,
  dragPreviewActive = false,
  editable = false,
  hoverSlotIndex = null,
  onSelectSlot,
  onSlotContextMenu,
  selectedSlotIndex = null,
  showDebugGuides = false,
  slots,
}: BinderOpenSpreadProps) {
  const slotByIndex = new Map(slots.map((slot) => [slot.slotIndex, slot]));

  return (
    <div
      className={classNames(
        "relative overflow-hidden rounded-[30px] border border-[rgba(255,255,255,0.08)] bg-[#05070a] shadow-[0_30px_64px_rgba(0,0,0,0.44)]",
        className,
      )}
    >
      <div
        className={classNames(
          "relative [aspect-ratio:1672/941]",
          compact ? "min-h-[300px]" : "min-h-[520px]",
        )}
        onContextMenu={(event) => {
          event.preventDefault();

          const bounds = event.currentTarget.getBoundingClientRect();
          const localX = ((event.clientX - bounds.left) / bounds.width) * binderSpreadWidth;
          const localY = ((event.clientY - bounds.top) / bounds.height) * binderSpreadHeight;
          const slotIndex = binderSlotRects.findIndex(
            (slot) =>
              localX >= slot.x &&
              localX <= slot.x + slot.width &&
              localY >= slot.y &&
              localY <= slot.y + slot.height,
          );

          if (slotIndex >= 0) {
            onSlotContextMenu?.(slotIndex, event);
          }
        }}
      >
        <Image
          src="/app-assets/binder-open-base-clean.png"
          alt="Geöffneter Sammelordner"
          fill
          sizes="1600px"
          className="object-contain"
          priority
        />

        <div className="absolute inset-0 z-[1]">
          {binderSlotRects.map((slotRect, index) => {
            const cardRect = binderCardRects[index];
            const slot = slotByIndex.get(index) ?? {
              id: `empty-${index}`,
              slotIndex: index,
              status: "empty",
              collectionEntryId: null,
              entryReferenceId: null,
              cardId: null,
              cardName: null,
              imageUrl: null,
              printingLabel: null,
              setCode: null,
              rarity: null,
              kind: null,
              lockState: null,
            };

            const isSelected = selectedSlotIndex === index;
            const isDragTarget = dragPreviewActive && hoverSlotIndex === index;
            const canShowDropHint = editable && dragPreviewActive;
            const cardLeft = ((cardRect.x - slotRect.x) / slotRect.width) * 100;
            const cardTop = ((cardRect.y - slotRect.y) / slotRect.height) * 100;
            const cardWidth = (cardRect.width / slotRect.width) * 100;
            const cardHeight = (cardRect.height / slotRect.height) * 100;

            return (
              <button
                key={slot.id}
                type="button"
                data-binder-slot-index={index}
                onClick={() => onSelectSlot?.(index)}
                className={classNames(
                  "group absolute z-20 rounded-[18px] text-left transition focus-visible:outline-none",
                  isSelected && "shadow-[0_0_0_1px_rgba(247,189,142,0.32),0_0_24px_rgba(207,91,66,0.18)]",
                  isDragTarget && "shadow-[0_0_0_1px_rgba(255,214,171,0.46),0_0_26px_rgba(214,102,73,0.24)]",
                )}
                style={{
                  left: binderPercentX(slotRect.x),
                  top: binderPercentY(slotRect.y),
                  width: binderPercentX(slotRect.width),
                  height: binderPercentY(slotRect.height),
                }}
              >
                <div className="pointer-events-none relative h-full w-full">
                  {showDebugGuides ? (
                    <>
                      <span className="pointer-events-none absolute inset-0 rounded-[16px] border border-dashed border-[rgba(255,196,142,0.34)] bg-[rgba(207,91,66,0.04)]" />
                      <span
                        className="pointer-events-none absolute rounded-[12px] border border-[rgba(132,209,255,0.42)] bg-[rgba(132,209,255,0.05)]"
                        style={{
                          left: `${cardLeft}%`,
                          top: `${cardTop}%`,
                          width: `${cardWidth}%`,
                          height: `${cardHeight}%`,
                        }}
                      />
                    </>
                  ) : null}

                  {slot.status !== "empty" ? (
                    <div
                      className={classNames(
                        "pointer-events-none absolute overflow-hidden rounded-[10px] transition-transform duration-200 group-hover:translate-y-[-1px]",
                        slot.status === "missing"
                          ? "ring-1 ring-[rgba(216,116,89,0.36)]"
                          : "ring-1 ring-[rgba(236,238,244,0.08)]",
                      )}
                      style={{
                        left: `${cardLeft}%`,
                        top: `${cardTop}%`,
                        width: `${cardWidth}%`,
                        height: `${cardHeight}%`,
                      }}
                    >
                      {slot.imageUrl ? (
                        <Image
                          src={slot.imageUrl}
                          alt={slot.cardName ?? "Binderkarte"}
                          fill
                          sizes="220px"
                          unoptimized
                          draggable={false}
                          className={classNames(
                            "pointer-events-none select-none object-contain object-center [-webkit-user-drag:none]",
                            slot.status === "missing" && "opacity-58 grayscale-[0.22]",
                          )}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center px-3 text-center text-[0.68rem] font-semibold text-[#eadbc7]">
                          {slot.cardName ?? "Leerer Slot"}
                        </div>
                      )}

                      <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),transparent_28%,rgba(0,0,0,0.12))]" />

                      {slot.status === "missing" ? (
                        <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-full border border-[rgba(222,131,102,0.34)] bg-[rgba(99,34,24,0.72)] px-2 py-0.5 text-[0.48rem] font-semibold uppercase tracking-[0.1em] text-[#ffd8cb]">
                          Fehlend
                        </span>
                      ) : null}

                      {slot.lockState === "RESERVED" ? (
                        <span className="pointer-events-none absolute right-1.5 top-1.5 rounded-full border border-[rgba(214,164,92,0.32)] bg-[rgba(88,55,16,0.78)] px-2 py-0.5 text-[0.48rem] font-semibold uppercase tracking-[0.1em] text-[#ffe4ba]">
                          Reserviert
                        </span>
                      ) : null}

                      {canShowDropHint ? (
                        <span
                          className={classNames(
                            "pointer-events-none absolute inset-x-2 bottom-2 rounded-full border px-2 py-1 text-center text-[0.5rem] font-semibold uppercase tracking-[0.12em] transition",
                            isDragTarget
                              ? "border-[rgba(255,214,171,0.58)] bg-[rgba(91,35,22,0.88)] text-[#ffe6cd]"
                              : "border-[rgba(255,255,255,0.12)] bg-[rgba(5,7,10,0.68)] text-[#d9c5ad]",
                          )}
                        >
                          Ersetzen
                        </span>
                      ) : null}
                    </div>
                  ) : editable ? (
                    <div
                      className={classNames(
                        "pointer-events-none absolute inset-0 rounded-[16px] transition",
                        isDragTarget
                          ? "border border-[rgba(255,214,171,0.58)] bg-[rgba(255,214,171,0.09)]"
                          : canShowDropHint
                            ? "border border-dashed border-[rgba(255,214,171,0.22)] bg-[rgba(255,214,171,0.04)]"
                            : "border border-transparent",
                      )}
                    >
                      {canShowDropHint ? (
                        <span className="absolute inset-x-2 top-1/2 -translate-y-1/2 rounded-full border border-[rgba(255,214,171,0.2)] bg-[rgba(5,7,10,0.54)] px-2 py-1 text-center text-[0.5rem] font-semibold uppercase tracking-[0.12em] text-[#e9d3b7]">
                          Ablegen
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>

        <div className="pointer-events-none absolute inset-0 z-[2]">
          <Image
            src="/app-assets/binder-open-shadow-overlay-aligned.png"
            alt=""
            fill
            loading="eager"
            sizes="1600px"
            className="object-contain opacity-[0.38] mix-blend-multiply"
          />
        </div>

        <div className="pointer-events-none absolute inset-0 z-[3]">
          <Image
            src="/app-assets/binder-open-highlight-overlay-aligned.png"
            alt=""
            fill
            loading="eager"
            sizes="1600px"
            className="object-contain opacity-[0.62] mix-blend-screen"
          />
        </div>

        {showDebugGuides ? (
          <div className="pointer-events-none absolute right-5 top-5 z-[4] rounded-full border border-[rgba(255,214,171,0.22)] bg-[rgba(10,14,20,0.86)] px-3 py-1 text-[0.62rem] uppercase tracking-[0.16em] text-[#f3ddbf]">
            Slot-Guide aktiv · {binderSpreadWidth} × {binderSpreadHeight}
          </div>
        ) : null}
      </div>
    </div>
  );
}
