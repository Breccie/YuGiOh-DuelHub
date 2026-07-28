import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { listFriendRequests } from "@/lib/friend-service";

const prisma = new PrismaClient();

describe("friend presence", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("shows presence only to accepted friends and uses the five-minute boundary", async () => {
    const tag = `vitest-presence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const users = await Promise.all(
      ["viewer", "online", "offline", "pending"].map((label) =>
        prisma.user.create({
          data: {
            duelistId: `${tag}-${label}`.toUpperCase(),
            email: `${tag}-${label}@example.test`,
            passwordHash: "test-hash",
            displayName: label,
          },
        }),
      ),
    );
    const [viewer, online, offline, pending] = users;
    const now = Date.now();

    try {
      await prisma.session.createMany({
        data: [
          {
            userId: online.id,
            tokenHash: `${tag}-online-token`,
            lastSeenAt: new Date(now - 4 * 60_000),
            expiresAt: new Date(now + 60 * 60_000),
          },
          {
            userId: offline.id,
            tokenHash: `${tag}-offline-token`,
            lastSeenAt: new Date(now - 6 * 60_000),
            expiresAt: new Date(now + 60 * 60_000),
          },
          {
            userId: pending.id,
            tokenHash: `${tag}-pending-token`,
            lastSeenAt: new Date(now - 60_000),
            expiresAt: new Date(now + 60 * 60_000),
          },
        ],
      });
      await prisma.friendship.createMany({
        data: [
          {
            requesterId: viewer.id,
            addresseeId: online.id,
            status: "ACCEPTED",
          },
          {
            requesterId: viewer.id,
            addresseeId: offline.id,
            status: "ACCEPTED",
          },
          {
            requesterId: viewer.id,
            addresseeId: pending.id,
            status: "PENDING",
          },
        ],
      });

      const requests = await listFriendRequests(prisma, viewer.id);
      const byDuelistId = new Map(
        requests.map((request) => [request.addressee.duelistId, request]),
      );

      expect(byDuelistId.get(online.duelistId)?.addressee).toMatchObject({
        isOnline: true,
        lastSeenAt: expect.any(String),
      });
      expect(byDuelistId.get(offline.duelistId)?.addressee).toMatchObject({
        isOnline: false,
        lastSeenAt: expect.any(String),
      });
      expect(byDuelistId.get(pending.duelistId)?.addressee).toMatchObject({
        isOnline: false,
        lastSeenAt: null,
      });
    } finally {
      await prisma.user.deleteMany({
        where: { id: { in: users.map((user) => user.id) } },
      });
    }
  });
});
