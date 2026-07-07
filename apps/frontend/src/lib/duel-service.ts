import type { Prisma, PrismaClient } from "@prisma/client";
import type { DuelRequestDto } from "@/lib/app-dtos";
import { getActiveRun, requireRunMembership } from "@/lib/run-service";

type DuelRequestRecord = Prisma.DuelRequestGetPayload<{
  include: {
    requester: true;
    opponent: true;
    requesterDeck: true;
    export: true;
    appointment: true;
  };
}>;

function parseDateTime(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Ungültiges Datum für die Duellplanung.");
  }

  return parsed;
}

function toDuelRequestDto(duelRequest: DuelRequestRecord): DuelRequestDto {
  return {
    id: duelRequest.id,
    status: duelRequest.status,
    message: duelRequest.message ?? null,
    createdAt: duelRequest.createdAt.toISOString(),
    requester: {
      userId: duelRequest.requester.id,
      duelistId: duelRequest.requester.duelistId,
      displayName: duelRequest.requester.displayName,
    },
    opponent: {
      userId: duelRequest.opponent.id,
      duelistId: duelRequest.opponent.duelistId,
      displayName: duelRequest.opponent.displayName,
    },
    deck: duelRequest.requesterDeck
      ? {
          id: duelRequest.requesterDeck.id,
          name: duelRequest.requesterDeck.name,
        }
      : null,
    appointment: duelRequest.appointment
      ? {
          id: duelRequest.appointment.id,
          proposedAt: duelRequest.appointment.proposedAt?.toISOString() ?? null,
          confirmedAt: duelRequest.appointment.confirmedAt?.toISOString() ?? null,
          platform: duelRequest.appointment.platform,
          note: duelRequest.appointment.note ?? null,
        }
      : null,
    exportReference: duelRequest.export
      ? {
          id: duelRequest.export.id,
          fileName: duelRequest.export.fileName,
          exportPath: duelRequest.export.exportPath ?? null,
        }
      : null,
    tournamentMatchId: duelRequest.tournamentMatchId ?? null,
  };
}

async function loadDuelRequest(prisma: PrismaClient, duelRequestId: string) {
  return prisma.duelRequest.findUnique({
    where: {
      id: duelRequestId,
    },
    include: {
      requester: true,
      opponent: true,
      requesterDeck: true,
      export: true,
      appointment: true,
    },
  });
}

export async function listDuelRequests(prisma: PrismaClient, viewerId: string) {
  const activeRun = await getActiveRun(prisma, viewerId);
  const duelRequests = await prisma.duelRequest.findMany({
    where: {
      runId: activeRun.id,
      OR: [{ requesterId: viewerId }, { opponentId: viewerId }],
    },
    orderBy: {
      updatedAt: "desc",
    },
    include: {
      requester: true,
      opponent: true,
      requesterDeck: true,
      export: true,
      appointment: true,
    },
  });

  return duelRequests.map(toDuelRequestDto);
}

export async function createDuelRequest(
  prisma: PrismaClient,
  viewerId: string,
  input: {
    opponentDuelistId: string;
    message?: string | null;
    requesterDeckId?: string | null;
    proposedAt?: string | null;
    confirmedAt?: string | null;
    note?: string | null;
    tournamentMatchId?: string | null;
  },
) {
  const activeRun = await getActiveRun(prisma, viewerId);
  const opponent = await prisma.user.findUnique({
    where: {
      duelistId: input.opponentDuelistId.trim().toUpperCase(),
    },
  });

  if (!opponent) {
    throw new Error("Gegnerprofil wurde nicht gefunden.");
  }

  if (opponent.id === viewerId) {
    throw new Error("Du kannst dir nicht selbst eine Duellanfrage senden.");
  }

  await requireRunMembership(prisma, {
    runId: activeRun.id,
    userId: opponent.id,
  });

  if (input.requesterDeckId) {
    const deck = await prisma.deck.findFirst({
      where: {
        id: input.requesterDeckId,
        userId: viewerId,
        runId: activeRun.id,
      },
    });

    if (!deck) {
      throw new Error("Ausgewähltes Deck wurde nicht gefunden.");
    }
  }

  const proposedAt = parseDateTime(input.proposedAt);
  const confirmedAt = parseDateTime(input.confirmedAt);
  const duelRequest = await prisma.duelRequest.create({
    data: {
      runId: activeRun.id,
      requesterId: viewerId,
      opponentId: opponent.id,
      requesterDeckId: input.requesterDeckId?.trim() || null,
      tournamentMatchId: input.tournamentMatchId?.trim() || null,
      status: confirmedAt ? "SCHEDULED" : "PENDING",
      message: input.message?.trim() || null,
      appointment:
        proposedAt || confirmedAt || input.note
          ? {
              create: {
                proposedAt,
                confirmedAt,
                note: input.note?.trim() || null,
                platform: "EDOPro",
              },
            }
          : undefined,
    },
    include: {
      requester: true,
      opponent: true,
      requesterDeck: true,
      export: true,
      appointment: true,
    },
  });

  return toDuelRequestDto(duelRequest);
}

export async function respondToDuelRequest(
  prisma: PrismaClient,
  viewerId: string,
  duelRequestId: string,
  action: "accept" | "decline" | "cancel",
) {
  const activeRun = await getActiveRun(prisma, viewerId);
  const duelRequest = await loadDuelRequest(prisma, duelRequestId);

  if (!duelRequest || duelRequest.runId !== activeRun.id) {
    throw new Error("Duellanfrage wurde nicht gefunden.");
  }

  if (action === "cancel" && duelRequest.requesterId !== viewerId) {
    throw new Error("Nur der Absender kann diese Anfrage stornieren.");
  }

  if ((action === "accept" || action === "decline") && duelRequest.opponentId !== viewerId) {
    throw new Error("Nur der Gegner kann auf diese Anfrage antworten.");
  }

  const nextStatus =
    action === "accept" ? "ACCEPTED" : action === "decline" ? "DECLINED" : "CANCELLED";

  const updated = await prisma.duelRequest.update({
    where: {
      id: duelRequest.id,
    },
    data: {
      status: nextStatus,
    },
    include: {
      requester: true,
      opponent: true,
      requesterDeck: true,
      export: true,
      appointment: true,
    },
  });

  return toDuelRequestDto(updated);
}

export async function scheduleDuelRequest(
  prisma: PrismaClient,
  viewerId: string,
  duelRequestId: string,
  input: {
    proposedAt?: string | null;
    confirmedAt?: string | null;
    note?: string | null;
    platform?: string | null;
  },
) {
  const activeRun = await getActiveRun(prisma, viewerId);
  const duelRequest = await loadDuelRequest(prisma, duelRequestId);

  if (
    !duelRequest ||
    duelRequest.runId !== activeRun.id ||
    (duelRequest.requesterId !== viewerId && duelRequest.opponentId !== viewerId)
  ) {
    throw new Error("Duellanfrage wurde nicht gefunden.");
  }

  const proposedAt = parseDateTime(input.proposedAt);
  const confirmedAt = parseDateTime(input.confirmedAt);

  const updated = await prisma.duelRequest.update({
    where: {
      id: duelRequest.id,
    },
    data: {
      status: confirmedAt ? "SCHEDULED" : duelRequest.status,
      appointment: duelRequest.appointment
        ? {
            update: {
              proposedAt,
              confirmedAt,
              note: input.note?.trim() || duelRequest.appointment.note || null,
              platform: input.platform?.trim() || duelRequest.appointment.platform,
            },
          }
        : {
            create: {
              proposedAt,
              confirmedAt,
              note: input.note?.trim() || null,
              platform: input.platform?.trim() || "EDOPro",
            },
          },
    },
    include: {
      requester: true,
      opponent: true,
      requesterDeck: true,
      export: true,
      appointment: true,
    },
  });

  return toDuelRequestDto(updated);
}
