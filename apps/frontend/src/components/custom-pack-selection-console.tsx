import Image from "next/image";
import Link from "next/link";
import { IconArrowRight, IconEdit, IconPackage } from "@tabler/icons-react";
import type { PlayGroupRunDto, ViewerSession } from "@/lib/app-dtos";
import type { CustomPackRecord } from "@/lib/custom-pack-client";
import { DuelConsoleScaffold } from "@/components/duel-console-scaffold";
import { PackSectionNav } from "@/components/pack-section-nav";

function imageUrl(assetId: string | null) {
  return assetId ? `/api/assets/media/${encodeURIComponent(assetId)}` : "/app-assets/fallback-pack.webp";
}

export function CustomPackSelectionConsole({ session, activeRun, packs }: {
  session: ViewerSession;
  activeRun: PlayGroupRunDto;
  packs: CustomPackRecord[];
}) {
  const canEdit = activeRun.viewerRole === "OWNER" || activeRun.viewerRole === "ORGANIZER";
  const available = packs.flatMap((pack) => pack.versions
    .filter((version) => version.status === "PUBLISHED" && (version.accesses?.some((access) => access.runId === activeRun.id && access.isAvailableNow) ?? false))
    .slice(0, 1)
    .map((version) => ({ pack, version })));

  return (
    <DuelConsoleScaffold activePath="/packs" viewer={session} metrics={[{ icon: "package", label: "Kampagne", value: activeRun.name }]}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-white/10 bg-black/45 p-5 backdrop-blur-xl">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#cf6a45]">Packs</p>
          <h1 className="mt-1 text-3xl font-semibold text-[#f5e4ca]">Custom Packs</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#c7b6a1]">Von deiner Kampagne veröffentlichte Booster. Jede Öffnung nutzt denselben Aufreiß- und Austeilablauf wie reguläre Packs.</p>
        </div>
        {canEdit ? <Link href="/packs/custom/editor" className="ui-button ui-button-primary inline-flex items-center gap-2"><IconEdit size={18} /> Custom-Pack-Editor öffnen</Link> : null}
        <div className="w-full"><PackSectionNav active="custom" /></div>
      </div>

      {available.length ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {available.map(({ pack, version }) => {
            const access = version.accesses?.find((item) => item.runId === activeRun.id);
            const price = access?.price ?? version.price;
            return (
              <article key={version.id} className="group overflow-hidden rounded-2xl border border-white/10 bg-[rgba(7,10,14,.82)] p-4 shadow-xl backdrop-blur-xl">
                <div className="relative mx-auto aspect-[2/3] w-[72%] overflow-hidden rounded-xl bg-black/40 shadow-[0_18px_42px_rgba(0,0,0,.5)] transition duration-300 group-hover:-translate-y-1">
                  <Image src={imageUrl(version.packImageAssetId)} alt={`${pack.name} Booster`} fill sizes="(max-width: 640px) 65vw, 20vw" className="object-contain" />
                </div>
                <p className="mt-4 text-xs font-semibold uppercase tracking-[.16em] text-[#c96449]">{pack.code}</p>
                <h2 className="mt-1 text-lg font-semibold text-[#f5e4ca]">{pack.name}</h2>
                <div className="mt-2 flex gap-3 text-xs text-white/55"><span>{version.packSize} Karten</span><span>{price} Credits</span></div>
                <Link href={`/packs/custom/${version.id}`} className="ui-button ui-button-primary mt-4 flex w-full items-center justify-center gap-2">Booster öffnen <IconArrowRight size={17} /></Link>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="grid min-h-[340px] place-items-center rounded-2xl border border-dashed border-white/15 bg-black/35 p-8 text-center">
          <div><IconPackage className="mx-auto text-[#d4af70]" size={44} /><h2 className="mt-4 text-xl font-semibold text-white">Noch kein Custom Pack verfügbar</h2><p className="mt-2 text-sm text-white/55">{canEdit ? "Erstelle ein Pack, veröffentliche eine Version und gib sie anschließend für Spieler frei." : "Owner oder Organizer haben noch kein Custom Pack freigegeben."}</p>{canEdit ? <Link href="/packs/custom/editor" className="ui-button ui-button-primary mt-5 inline-flex">Erstes Custom Pack erstellen</Link> : null}</div>
        </div>
      )}
    </DuelConsoleScaffold>
  );
}
