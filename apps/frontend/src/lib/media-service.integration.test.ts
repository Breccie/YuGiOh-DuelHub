import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import {
  createMediaUploadIntent,
  deleteMediaAsset,
  finalizeMediaUpload,
  listMediaAssets,
  readMediaAsset,
  storeLocalUpload,
} from "@/lib/media-service";

const prisma = new PrismaClient();

describe("personal media storage", () => {
  const ownerIds: string[] = [];
  let mediaDirectory: string;

  afterAll(async () => {
    if (ownerIds.length) await prisma.user.deleteMany({ where: { id: { in: ownerIds } } });
    await prisma.$disconnect();
    if (mediaDirectory) await rm(mediaDirectory, { recursive: true, force: true });
  });

  it("normalizes local uploads and protects referenced images from deletion", async () => {
    mediaDirectory = await mkdtemp(path.join(tmpdir(), "duel-hub-media-"));
    process.env.DESKTOP_MEDIA_DIR = mediaDirectory;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const owner = await prisma.user.create({
      data: {
        id: randomUUID(),
        duelistId: `MEDIA-${Date.now()}`,
        email: `media-${Date.now()}@example.test`,
        passwordHash: "test-hash",
        displayName: "Media Test",
      },
    });
    ownerIds.push(owner.id);

    const source = await sharp({
      create: { width: 640, height: 480, channels: 3, background: "#ca5b45" },
    }).png().toBuffer();
    const intent = await createMediaUploadIntent(prisma, owner.id, {
      kind: "AVATAR",
      name: "Mein Avatar",
      contentType: "image/png",
      byteSize: source.length,
    });
    expect(intent.upload.mode).toBe("LOCAL");
    await storeLocalUpload(owner.id, intent.uploadToken, source);
    const asset = await finalizeMediaUpload(prisma, owner.id, intent.uploadToken);

    expect(asset).toMatchObject({ kind: "AVATAR", width: 512, height: 512, deletable: true });
    const stored = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } });
    expect((await readFile(path.join(mediaDirectory, stored.storageKey))).subarray(0, 4).toString("hex")).toBe("52494646");
    await expect(readMediaAsset(prisma, asset.id, owner.id)).resolves.toMatchObject({ mimeType: "image/webp" });
    await expect(readMediaAsset(prisma, asset.id, "another-user")).rejects.toMatchObject({ code: "media_not_found", status: 404 });

    await prisma.user.update({ where: { id: owner.id }, data: { avatarAssetId: asset.id } });
    await expect(readMediaAsset(prisma, asset.id)).resolves.toMatchObject({ mimeType: "image/webp" });
    await expect(deleteMediaAsset(prisma, owner.id, asset.id)).rejects.toMatchObject({ code: "media_in_use", status: 409 });
    expect((await listMediaAssets(prisma, owner.id, "AVATAR"))[0]).toMatchObject({ id: asset.id, usageCount: 1, deletable: false });

    await prisma.user.update({ where: { id: owner.id }, data: { avatarAssetId: null } });
    await expect(deleteMediaAsset(prisma, owner.id, asset.id)).resolves.toEqual({ deleted: true });
  });

  it("rejects a tampered upload intent", async () => {
    const owner = await prisma.user.create({
      data: {
        id: randomUUID(),
        duelistId: `MEDIA-TAMPER-${Date.now()}`,
        email: `media-tamper-${Date.now()}@example.test`,
        passwordHash: "test-hash",
        displayName: "Media Tamper Test",
      },
    });
    ownerIds.push(owner.id);
    const intent = await createMediaUploadIntent(prisma, owner.id, {
      kind: "DECKBOX",
      name: "Deckbox",
      contentType: "image/webp",
      byteSize: 4,
    });
    await expect(storeLocalUpload(owner.id, `${intent.uploadToken}x`, Buffer.from("test")))
      .rejects.toMatchObject({ code: "invalid_media_upload", status: 400 });
  });
});
