import type { Prisma, PrismaClient } from "@prisma/client";
import type { FriendRequestDto } from "@/lib/app-dtos";

const friendshipInclude = {
  requester: {
    include: {
      sessions: {
        orderBy: { lastSeenAt: "desc" as const },
        take: 1,
        select: { lastSeenAt: true, expiresAt: true },
      },
    },
  },
  addressee: {
    include: {
      sessions: {
        orderBy: { lastSeenAt: "desc" as const },
        take: 1,
        select: { lastSeenAt: true, expiresAt: true },
      },
    },
  },
} satisfies Prisma.FriendshipInclude;

type FriendshipRecord = Prisma.FriendshipGetPayload<{
  include: typeof friendshipInclude;
}>;

function getPresence(
  friendship: FriendshipRecord,
  user: FriendshipRecord["requester"],
) {
  if (friendship.status !== "ACCEPTED") {
    return { lastSeenAt: null, isOnline: false };
  }

  const session = user.sessions[0];
  const now = Date.now();
  const lastSeenAt = session?.lastSeenAt ?? null;
  const isOnline = Boolean(
    session &&
      session.expiresAt.getTime() > now &&
      session.lastSeenAt.getTime() >= now - 5 * 60 * 1000,
  );

  return {
    lastSeenAt: lastSeenAt?.toISOString() ?? null,
    isOnline,
  };
}

function toFriendRequestDto(friendship: FriendshipRecord): FriendRequestDto {
  return {
    id: friendship.id,
    status: friendship.status,
    createdAt: friendship.createdAt.toISOString(),
    updatedAt: friendship.updatedAt.toISOString(),
    requester: {
      userId: friendship.requester.id,
      duelistId: friendship.requester.duelistId,
      displayName: friendship.requester.displayName,
      ...getPresence(friendship, friendship.requester),
    },
    addressee: {
      userId: friendship.addressee.id,
      duelistId: friendship.addressee.duelistId,
      displayName: friendship.addressee.displayName,
      ...getPresence(friendship, friendship.addressee),
    },
  };
}

export async function listFriendRequests(prisma: PrismaClient, viewerId: string) {
  const friendships = await prisma.friendship.findMany({
    where: {
      OR: [{ requesterId: viewerId }, { addresseeId: viewerId }],
    },
    orderBy: {
      updatedAt: "desc",
    },
    include: friendshipInclude,
  });

  return friendships.map(toFriendRequestDto);
}

export async function createFriendRequest(
  prisma: PrismaClient,
  viewerId: string,
  addresseeDuelistId: string,
) {
  const addressee = await prisma.user.findUnique({
    where: {
      duelistId: addresseeDuelistId.trim().toUpperCase(),
    },
  });

  if (!addressee) {
    throw new Error("Duelist wurde nicht gefunden.");
  }

  if (addressee.id === viewerId) {
    throw new Error("Du kannst dir nicht selbst eine Freundschaftsanfrage senden.");
  }

  const existingFriendship = await prisma.friendship.findFirst({
    where: {
      OR: [
        {
          requesterId: viewerId,
          addresseeId: addressee.id,
        },
        {
          requesterId: addressee.id,
          addresseeId: viewerId,
        },
      ],
    },
    include: friendshipInclude,
  });

  if (existingFriendship) {
    return toFriendRequestDto(existingFriendship);
  }

  const friendship = await prisma.friendship.create({
    data: {
      requesterId: viewerId,
      addresseeId: addressee.id,
      status: "PENDING",
    },
    include: friendshipInclude,
  });

  return toFriendRequestDto(friendship);
}

export async function respondToFriendRequest(
  prisma: PrismaClient,
  viewerId: string,
  requestId: string,
  action: "accept" | "decline" | "block",
) {
  const friendship = await prisma.friendship.findUnique({
    where: {
      id: requestId,
    },
    include: friendshipInclude,
  });

  if (!friendship || friendship.addresseeId !== viewerId) {
    throw new Error("Freundschaftsanfrage wurde nicht gefunden.");
  }

  const nextStatus =
    action === "accept" ? "ACCEPTED" : action === "block" ? "BLOCKED" : "PENDING";

  if (action === "decline") {
    await prisma.friendship.delete({
      where: {
        id: requestId,
      },
    });

    return null;
  }

  const updated = await prisma.friendship.update({
    where: {
      id: requestId,
    },
    data: {
      status: nextStatus,
    },
    include: friendshipInclude,
  });

  return toFriendRequestDto(updated);
}
