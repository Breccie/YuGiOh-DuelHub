"use client";

import Image from "next/image";
import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { StatusPill } from "@/components/panel";
import type { PackDashboardSnapshot } from "@/lib/pack-openings";

type PackCatalogBrowserProps = {
  snapshot: PackDashboardSnapshot;
};

type PackFilter = "ALL" | "CORE_BOOSTER" | "SPECIAL";

function classes(...tokens: Array<string | false | null | undefined>) {
  return tokens.filter(Boolean).join(" ");
}

function formatReleaseDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Noch nicht geöffnet";
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getProductLabel(productType: string) {
  if (productType === "CORE_BOOSTER") {
    return "Hauptbooster";
  }

  if (productType === "BOOSTER") {
    return "Spezialbooster";
  }

  if (productType === "SPECIAL") {
    return "Spezialprodukt";
  }

  return "Pack";
}

export function PackCatalogBrowser({ snapshot }: PackCatalogBrowserProps) {
  const [packFilter, setPackFilter] = useState<PackFilter>("CORE_BOOSTER");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const normalizedSearch = deferredSearch.trim().toLowerCase();

  const visibleSets = snapshot.sets.filter((set) => {
    if (packFilter === "CORE_BOOSTER" && set.productType !== "CORE_BOOSTER") {
      return false;
    }

    if (packFilter === "SPECIAL" && set.productType === "CORE_BOOSTER") {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    return `${set.name} ${set.code}`.toLowerCase().includes(normalizedSearch);
  });

  return (
    <div className="space-y-5">
      <div className="paper-card-strong rounded-[28px] p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <label className="block space-y-2">
            <span className="text-sm font-semibold text-[#202733]">Pack suchen</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              type="text"
              className="ui-input"
            />
          </label>

          <div className="flex flex-wrap items-end gap-2">
            {[
              { value: "CORE_BOOSTER", label: "Hauptbooster" },
              { value: "SPECIAL", label: "Spezialpacks" },
              { value: "ALL", label: "Alle" },
            ].map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setPackFilter(filter.value as PackFilter)}
                className={classes(
                  "rounded-full border px-4 py-2 text-sm font-semibold transition",
                  packFilter === filter.value
                    ? "border-[color:rgba(177,78,56,0.28)] bg-[color:rgba(177,78,56,0.12)] text-[#7f2d1d]"
                    : "border-[color:rgba(74,87,102,0.14)] bg-[color:rgba(255,255,255,0.66)] text-[#314254] hover:border-[color:rgba(177,78,56,0.18)]",
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <StatusPill tone="slate">{visibleSets.length} sichtbare Packs</StatusPill>
          <StatusPill tone="teal">
            {snapshot.recentOpenings.length} letzte Openings
          </StatusPill>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {visibleSets.map((set) => (
          <article key={set.id} className="catalog-card">
            <div className="relative aspect-[3/4] bg-[linear-gradient(180deg,#304255_0%,#1d2732_100%)]">
              {set.imageUrl ? (
                <Image
                  src={set.imageUrl}
                  alt={set.name}
                  fill
                  sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center text-base font-semibold text-[#fff3e2]">
                  {set.code}
                </div>
              )}
            </div>

            <div className="p-5">
              <div className="flex flex-wrap gap-2">
                <StatusPill tone={set.productType === "CORE_BOOSTER" ? "gold" : "teal"}>
                  {getProductLabel(set.productType)}
                </StatusPill>
                <StatusPill tone="slate">{set.code}</StatusPill>
              </div>

              <h3 className="mt-4 text-xl font-semibold text-[#fff6eb]">{set.name}</h3>
              <p className="mt-2 text-sm leading-7 text-[#d8dce1]">
                Release: {formatReleaseDate(set.releaseDate)}
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[18px] border border-[color:rgba(255,255,255,0.08)] bg-[color:rgba(255,255,255,0.08)] p-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-[#efc4b8]">
                    Packgröße
                  </p>
                  <p className="mt-2 text-lg font-semibold text-[#fff2de]">
                    {set.packSize}
                  </p>
                </div>
                <div className="rounded-[18px] border border-[color:rgba(255,255,255,0.08)] bg-[color:rgba(255,255,255,0.08)] p-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-[#efc4b8]">
                    Pool
                  </p>
                  <p className="mt-2 text-lg font-semibold text-[#fff2de]">
                    {set.cardPoolSize}
                  </p>
                </div>
              </div>

              <p className="mt-4 text-sm leading-7 text-[#d5d8de]">
                Bereits geöffnet: {set.totalOpened} · Letztes Öffnen:{" "}
                {formatDateTime(set.lastOpenedAt)}
              </p>

              <Link
                href={`/packs/${set.id}`}
                className="mt-5 inline-flex rounded-full border border-[color:rgba(255,233,214,0.18)] bg-[color:rgba(255,255,255,0.10)] px-4 py-2.5 text-sm font-semibold text-[#fff3e4] transition hover:bg-[color:rgba(255,255,255,0.16)]"
              >
                Pack-Seite öffnen
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
