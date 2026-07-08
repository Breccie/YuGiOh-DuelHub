"use client";

import { startTransition, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DuelConsoleScaffold } from "@/components/duel-console-scaffold";
import { Panel, StatusPill } from "@/components/panel";
import { getApiErrorMessage } from "@/lib/api-client";
import { tradeClient } from "@/lib/trade-client";

type TradeCardOption = {
  id: string;
  name: string;
  rarity: string | null;
  setCode: string | null;
};

type TradePartnerOption = {
  userId: string;
  duelistId: string;
  displayName: string;
  favoriteEra: string | null;
  availableCards: TradeCardOption[];
};

export function TradeCreateConsole({
  viewer,
  collectionValue,
  latestBanlistName,
  activeEra,
  availableCards,
  partners,
}: {
  viewer: {
    displayName: string;
    duelistId: string;
  };
  collectionValue: string;
  latestBanlistName: string;
  activeEra: string;
  availableCards: TradeCardOption[];
  partners: TradePartnerOption[];
}) {
  const router = useRouter();
  const [partnerDuelistId, setPartnerDuelistId] = useState(partners[0]?.duelistId ?? "");
  const [offeredEntryIds, setOfferedEntryIds] = useState<string[]>([]);
  const [requestedEntryIds, setRequestedEntryIds] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const selectedPartner = useMemo(
    () => partners.find((partner) => partner.duelistId === partnerDuelistId) ?? null,
    [partnerDuelistId, partners],
  );
  const canSubmit =
    Boolean(partnerDuelistId) &&
    (offeredEntryIds.length > 0 || requestedEntryIds.length > 0);

  function toggleSelection(values: string[], setValues: (next: string[]) => void, id: string) {
    if (values.includes(id)) {
      setValues(values.filter((value) => value !== id));
      return;
    }

    setValues([...values, id]);
  }

  async function submitTrade() {
    if (!canSubmit) {
      setFeedback("Wähle zuerst einen Partner und mindestens eine Karte aus.");
      return;
    }

    setPending(true);
    setFeedback(null);

    try {
      const data = await tradeClient.create({
        responderDuelistId: partnerDuelistId,
        note: note || null,
        offeredEntryIds,
        requestedEntryIds,
      });

      const tradeId = data?.trade?.id;

      if (!tradeId) {
        throw new Error("Trade wurde angelegt, aber die Detail-ID fehlt.");
      }

      startTransition(() => router.push(`/trade/${tradeId}`));
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Trade konnte nicht erstellt werden."));
    } finally {
      setPending(false);
    }
  }

  return (
    <DuelConsoleScaffold
      activePath="/trade"
      viewer={viewer}
      metrics={[
        { icon: "book", label: "Sammlung", value: collectionValue },
        { icon: "scale", label: "Banlist", value: latestBanlistName },
        { icon: "hourglass", label: "Aktive Ära", value: activeEra },
      ]}
    >
      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel kicker="Angebot" title="Trade vorbereiten">
          <div className="grid gap-4">
            <label className="block">
              <span className="ui-kicker">Partner</span>
              <select
                className="ui-input mt-2"
                value={partnerDuelistId}
                onChange={(event) => {
                  setPartnerDuelistId(event.target.value);
                  setRequestedEntryIds([]);
                }}
              >
                <option value="">Partner wählen</option>
                {partners.map((partner) => (
                  <option key={partner.userId} value={partner.duelistId}>
                    {partner.displayName} ({partner.duelistId})
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="ui-kicker">Notiz</span>
              <textarea
                className="ui-input mt-2 min-h-[120px]"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Welche Karten suchst du und wann passt ein Handoff?"
              />
            </label>

            {feedback ? (
              <div className="rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-4 py-3 text-sm text-[#f0dfcc]">
                {feedback}
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] px-4 py-4">
                <p className="text-[0.72rem] uppercase tracking-[0.18em] text-[#9f8c77]">
                  Du gibst
                </p>
                <p className="mt-3 font-display text-[2rem] leading-none text-[#f0dcc0]">
                  {offeredEntryIds.length}
                </p>
              </div>
              <div className="rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] px-4 py-4">
                <p className="text-[0.72rem] uppercase tracking-[0.18em] text-[#9f8c77]">
                  Du suchst
                </p>
                <p className="mt-3 font-display text-[2rem] leading-none text-[#f0dcc0]">
                  {requestedEntryIds.length}
                </p>
              </div>
              <div className="rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] px-4 py-4">
                <p className="text-[0.72rem] uppercase tracking-[0.18em] text-[#9f8c77]">
                  Partner
                </p>
                <p className="mt-3 text-sm text-[#f0dfcc]">
                  {selectedPartner?.favoriteEra ?? "Offen"}
                </p>
              </div>
            </div>

            <button
              className="ui-button-primary disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              disabled={pending || !canSubmit}
              onClick={submitTrade}
            >
              {pending ? "Speichert..." : "Trade erstellen"}
            </button>
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel kicker="Deine Karten" title="Angebot">
            {availableCards.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {availableCards.map((card) => {
                const active = offeredEntryIds.includes(card.id);

                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => toggleSelection(offeredEntryIds, setOfferedEntryIds, card.id)}
                    className={`rounded-[18px] border px-4 py-4 text-left transition ${
                      active
                        ? "border-[rgba(207,91,66,0.3)] bg-[rgba(207,91,66,0.12)]"
                        : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[#f0dfcc]">{card.name}</p>
                      {active ? <StatusPill tone="ember">Gewählt</StatusPill> : null}
                    </div>
                    <p className="mt-2 text-xs text-[#9f8c77]">
                      {card.rarity ?? "Karte"}{card.setCode ? ` · ${card.setCode}` : ""}
                    </p>
                  </button>
                );
                })}
              </div>
            ) : (
              <div className="ui-empty rounded-[18px] px-4 py-5 text-sm">
                Keine frei tauschbaren Karten in deiner aktiven Kampagne.
              </div>
            )}
          </Panel>

          <Panel kicker="Partner-Karten" title={selectedPartner?.displayName ?? "Kein Partner ausgewählt"}>
            {selectedPartner ? (
              selectedPartner.availableCards.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {selectedPartner.availableCards.map((card) => {
                  const active = requestedEntryIds.includes(card.id);

                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => toggleSelection(requestedEntryIds, setRequestedEntryIds, card.id)}
                      className={`rounded-[18px] border px-4 py-4 text-left transition ${
                        active
                          ? "border-[rgba(88,163,169,0.28)] bg-[rgba(58,118,124,0.14)]"
                          : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-[#f0dfcc]">{card.name}</p>
                        {active ? <StatusPill tone="slate">Gewählt</StatusPill> : null}
                      </div>
                      <p className="mt-2 text-xs text-[#9f8c77]">
                        {card.rarity ?? "Karte"}{card.setCode ? ` · ${card.setCode}` : ""}
                      </p>
                    </button>
                  );
                  })}
                </div>
              ) : (
                <div className="ui-empty rounded-[18px] px-4 py-5 text-sm">
                  Dieser Partner hat in der aktiven Kampagne gerade keine frei tauschbaren Karten.
                </div>
              )
            ) : (
              <div className="ui-empty rounded-[18px] px-4 py-5 text-sm">
                Wähle zuerst einen Tauschpartner aus.
              </div>
            )}
          </Panel>
        </div>
      </section>
    </DuelConsoleScaffold>
  );
}
