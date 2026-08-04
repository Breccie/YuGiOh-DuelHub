"use client";

import { IconAdjustments, IconX } from "@tabler/icons-react";
import type {
  CardBanlistStatus,
  CardCatalogQuery,
  CardCatalogResponse,
  CardCatalogSort,
  CardOwnershipFilter,
} from "@ygo/contracts";

export type CardCatalogFilters = {
  ownership: CardOwnershipFilter;
  kind: "ALL" | "MONSTER" | "SPELL" | "TRAP" | "TOKEN";
  banlistStatus: CardBanlistStatus;
  monsterType: string;
  attribute: string;
  levelMin: string;
  levelMax: string;
  atkMin: string;
  atkMax: string;
  defMin: string;
  defMax: string;
  rarity: string;
  setCode: string;
};

export const emptyCardCatalogFilters: CardCatalogFilters = {
  ownership: "ALL",
  kind: "ALL",
  banlistStatus: "ALL",
  monsterType: "",
  attribute: "",
  levelMin: "",
  levelMax: "",
  atkMin: "",
  atkMax: "",
  defMin: "",
  defMax: "",
  rarity: "",
  setCode: "",
};

const sortOptions: Array<{ value: CardCatalogSort; label: string }> = [
  { value: "NAME_ASC", label: "Name A–Z" },
  { value: "NAME_DESC", label: "Name Z–A" },
  { value: "OWNED_DESC", label: "Meiste Kopien" },
  { value: "LEVEL_ASC", label: "Stufe/Rang/Link aufsteigend" },
  { value: "LEVEL_DESC", label: "Stufe/Rang/Link absteigend" },
  { value: "ATK_ASC", label: "ATK aufsteigend" },
  { value: "ATK_DESC", label: "ATK absteigend" },
  { value: "DEF_ASC", label: "DEF aufsteigend" },
  { value: "DEF_DESC", label: "DEF absteigend" },
  { value: "TYPE_ASC", label: "Kartentyp" },
  { value: "ATTRIBUTE_ASC", label: "Eigenschaft" },
  { value: "NEWEST_SET", label: "Neueste Sets" },
];

const defaultAttributes = ["DARK", "DIVINE", "EARTH", "FIRE", "LIGHT", "WATER", "WIND"];

function optionalNumber(value: string) {
  if (!value.trim()) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function buildCardCatalogFilterQuery(
  filters: CardCatalogFilters,
): Partial<CardCatalogQuery> {
  return {
    ownership: filters.ownership,
    kind: filters.kind === "ALL" ? undefined : filters.kind,
    banlistStatus: filters.banlistStatus,
    monsterType: filters.monsterType.trim() || undefined,
    attribute: filters.attribute || undefined,
    levelRankLinkMin: optionalNumber(filters.levelMin),
    levelRankLinkMax: optionalNumber(filters.levelMax),
    atkMin: optionalNumber(filters.atkMin),
    atkMax: optionalNumber(filters.atkMax),
    defMin: optionalNumber(filters.defMin),
    defMax: optionalNumber(filters.defMax),
    rarity: filters.rarity || undefined,
    setCode: filters.setCode.trim() || undefined,
  };
}

export function CardCatalogSortSelect({
  value,
  onChange,
  className = "ui-input h-9 py-1",
}: {
  value: CardCatalogSort;
  onChange: (value: CardCatalogSort) => void;
  className?: string;
}) {
  return (
    <select
      className={className}
      value={value}
      onChange={(event) => onChange(event.target.value as CardCatalogSort)}
      aria-label="Katalog sortieren"
    >
      {sortOptions.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}

export function CardCatalogFilterDrawer({
  value,
  onChange,
  facets,
  showOwnership = true,
  showBanlist = true,
}: {
  value: CardCatalogFilters;
  onChange: (value: CardCatalogFilters) => void;
  facets?: CardCatalogResponse["facets"];
  showOwnership?: boolean;
  showBanlist?: boolean;
}) {
  const chips: Array<{ key: keyof CardCatalogFilters; label: string }> = [];
  if (value.ownership !== "ALL") chips.push({ key: "ownership", label: value.ownership === "OWNED" ? "Im Besitz" : "Nicht im Besitz" });
  if (value.kind !== "ALL") chips.push({ key: "kind", label: value.kind });
  if (value.banlistStatus !== "ALL") chips.push({ key: "banlistStatus", label: value.banlistStatus.replace("_", " ") });
  if (value.monsterType) chips.push({ key: "monsterType", label: value.monsterType });
  if (value.attribute) chips.push({ key: "attribute", label: value.attribute });
  if (value.levelMin || value.levelMax) chips.push({ key: "levelMin", label: `Stufe ${value.levelMin || "0"}–${value.levelMax || "13"}` });
  if (value.atkMin || value.atkMax) chips.push({ key: "atkMin", label: `ATK ${value.atkMin || "0"}–${value.atkMax || "∞"}` });
  if (value.defMin || value.defMax) chips.push({ key: "defMin", label: `DEF ${value.defMin || "0"}–${value.defMax || "∞"}` });
  if (value.rarity) chips.push({ key: "rarity", label: value.rarity });
  if (value.setCode) chips.push({ key: "setCode", label: value.setCode });

  function patch(next: Partial<CardCatalogFilters>) {
    onChange({ ...value, ...next });
  }

  function clearChip(key: keyof CardCatalogFilters) {
    if (key === "levelMin") return patch({ levelMin: "", levelMax: "" });
    if (key === "atkMin") return patch({ atkMin: "", atkMax: "" });
    if (key === "defMin") return patch({ defMin: "", defMax: "" });
    patch({ [key]: emptyCardCatalogFilters[key] } as Partial<CardCatalogFilters>);
  }

  const attributes = facets?.attributes.length ? facets.attributes : defaultAttributes;

  return (
    <div className="card-filter-drawer">
      <details>
        <summary className="ui-button-neutral flex min-h-9 cursor-pointer list-none items-center justify-center gap-2 px-3 py-2 text-xs">
          <IconAdjustments size={15} /> Filter {chips.length ? `(${chips.length})` : ""}
        </summary>
        <div className="mt-2 grid gap-2 rounded-[8px] border border-white/10 bg-[rgba(7,11,17,0.94)] p-2.5 sm:grid-cols-2">
          {showOwnership ? <select className="ui-input h-9 py-1" value={value.ownership} onChange={(event) => patch({ ownership: event.target.value as CardOwnershipFilter })} aria-label="Besitz filtern">
            <option value="ALL">Alle Besitzstände</option><option value="OWNED">Im Besitz</option><option value="UNOWNED">Nicht im Besitz</option>
          </select> : null}
          <select className="ui-input h-9 py-1" value={value.kind} onChange={(event) => patch({ kind: event.target.value as CardCatalogFilters["kind"] })} aria-label="Kartentyp filtern">
            <option value="ALL">Alle Kartentypen</option><option value="MONSTER">Monster</option><option value="SPELL">Zauber</option><option value="TRAP">Fallen</option><option value="TOKEN">Token</option>
          </select>
          {showBanlist ? <select className="ui-input h-9 py-1" value={value.banlistStatus} onChange={(event) => patch({ banlistStatus: event.target.value as CardBanlistStatus })} aria-label="Bannlistenstatus filtern">
            <option value="ALL">Alle Bannlistenstatus</option><option value="LEGAL">Erlaubt</option><option value="FORBIDDEN">Verboten</option><option value="LIMITED">Limitiert</option><option value="SEMI_LIMITED">Halblimitiert</option>
          </select> : null}
          <input className="ui-input h-9 py-1" value={value.monsterType} onChange={(event) => patch({ monsterType: event.target.value })} list="card-monster-types" placeholder="Monstertyp" aria-label="Monstertyp filtern" />
          <datalist id="card-monster-types">{facets?.monsterTypes.map((type) => <option key={type} value={type} />)}</datalist>
          <select className="ui-input h-9 py-1" value={value.attribute} onChange={(event) => patch({ attribute: event.target.value })} aria-label="Eigenschaft filtern"><option value="">Alle Eigenschaften</option>{attributes.map((attribute) => <option key={attribute} value={attribute}>{attribute}</option>)}</select>
          <select className="ui-input h-9 py-1" value={value.rarity} onChange={(event) => patch({ rarity: event.target.value })} aria-label="Seltenheit filtern"><option value="">Alle Seltenheiten</option>{facets?.rarities.map((rarity) => <option key={rarity} value={rarity}>{rarity}</option>)}</select>
          <input className="ui-input h-9 py-1" value={value.setCode} onChange={(event) => patch({ setCode: event.target.value })} placeholder="Setcode" aria-label="Setcode filtern" />
          <div className="grid grid-cols-2 gap-1.5"><input className="ui-input h-9 py-1" type="number" min={0} max={13} value={value.levelMin} onChange={(event) => patch({ levelMin: event.target.value })} placeholder="Stufe min." aria-label="Stufe, Rang oder Link mindestens" /><input className="ui-input h-9 py-1" type="number" min={0} max={13} value={value.levelMax} onChange={(event) => patch({ levelMax: event.target.value })} placeholder="Stufe max." aria-label="Stufe, Rang oder Link höchstens" /></div>
          <div className="grid grid-cols-2 gap-1.5"><input className="ui-input h-9 py-1" type="number" value={value.atkMin} onChange={(event) => patch({ atkMin: event.target.value })} placeholder="ATK min." aria-label="ATK mindestens" /><input className="ui-input h-9 py-1" type="number" value={value.atkMax} onChange={(event) => patch({ atkMax: event.target.value })} placeholder="ATK max." aria-label="ATK höchstens" /></div>
          <div className="grid grid-cols-2 gap-1.5"><input className="ui-input h-9 py-1" type="number" value={value.defMin} onChange={(event) => patch({ defMin: event.target.value })} placeholder="DEF min." aria-label="DEF mindestens" /><input className="ui-input h-9 py-1" type="number" value={value.defMax} onChange={(event) => patch({ defMax: event.target.value })} placeholder="DEF max." aria-label="DEF höchstens" /></div>
          <button type="button" className="ui-button-neutral min-h-9" onClick={() => onChange(emptyCardCatalogFilters)}>Alle Filter zurücksetzen</button>
        </div>
      </details>
      {chips.length ? <div className="mt-2 flex flex-wrap gap-1.5">{chips.map((chip) => <button key={`${chip.key}:${chip.label}`} type="button" className="inline-flex items-center gap-1 rounded-full border border-teal-300/20 bg-teal-300/8 px-2 py-1 text-[0.65rem] text-teal-100" onClick={() => clearChip(chip.key)}>{chip.label}<IconX size={12} /></button>)}</div> : null}
    </div>
  );
}
