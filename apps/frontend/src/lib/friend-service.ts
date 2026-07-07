import type { Prisma, PrismaClient } from "@prisma/client";
import type { FriendRequestDto } from "@/lib/app-dtos";

type FriendshipRecord = Prisma.FriendshipGetPayload<{
  include: {
    requester: true;
    addressee: true;
  };
}>;

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
    },
    addressee: {
      userId: friendship.addressee.id,
      duelistId: friendship.addressee.duelistId,
      displayName: friendship.addressee.displayName,
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
    include: {
      requester: true,
      addressee: true,
    },
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
    include: {
      requester: true,
      addressee: true,
    },
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
    include: {
      requester: true,
      addressee: true,
    },
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
    include: {
      requester: true,
      addressee: true,
    },
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
    include: {
      requester: true,
      addressee: true,
    },
  });

  return toFriendRequestDto(updated);
}
