import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { MediaAssetKind, PrismaClient } from "@prisma/client";
import type { CreateMediaUploadIntentRequest, MediaAssetDto } from "@ygo/contracts";
import { DomainError } from "@ygo/domain";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const MEDIA_QUOTA_BYTES = 100 * 1024 * 1024;
const MAX_SOURCE_PIXELS = 25_000_000;
const INTENT_TTL_MS = 2 * 60 * 60 * 1000;
const STALE_MEDIA_AGE_MS = 24 * 60 * 60 * 1000;

type UploadIntent = CreateMediaUploadIntentRequest & {
  ownerId: string;
  storageKey: string;
  provider: "LOCAL" | "SUPABASE";
  expiresAt: number;
};

function mediaSecret() {
  return process.env.COOKIE_SECRET?.trim() || "duel-hub-local-media-secret";
}

function encodeIntent(intent: UploadIntent) {
  const payload = Buffer.from(JSON.stringify(intent)).toString("base64url");
  const signature = createHmac("sha256", mediaSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function decodeIntent(token: string): UploadIntent {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) throwInvalidIntent();
  const expected = createHmac("sha256", mediaSecret()).update(payload).digest();
  const received = Buffer.from(signature, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throwInvalidIntent();
  let intent: UploadIntent;
  try {
    intent = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as UploadIntent;
  } catch {
    throwInvalidIntent();
  }
  if (intent.expiresAt < Date.now()) throwInvalidIntent("Der Upload ist abgelaufen.");
  return intent;
}

function throwInvalidIntent(message = "Der Medien-Upload ist ungültig."): never {
  throw new DomainError({ code: "invalid_media_upload", message, status: 400 });
}

function localMediaDirectory() {
  const configured = process.env.DESKTOP_MEDIA_DIR?.trim();
  return configured || path.join(tmpdir(), "duel-hub-user-media");
}

function supabaseConfig() {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const stagingBucket = process.env.SUPABASE_MEDIA_STAGING_BUCKET?.trim() || "duel-hub-media-staging";
  const mediaBucket = process.env.SUPABASE_MEDIA_BUCKET?.trim() || "duel-hub-media";
  return url && serviceRoleKey ? { url, serviceRoleKey, stagingBucket, mediaBucket } : null;
}

function getSupabase() {
  const config = supabaseConfig();
  if (!config) {
    throw new DomainError({
      code: "media_storage_unavailable",
      message: "Der Online-Medienspeicher ist noch nicht konfiguriert.",
      status: 503,
    });
  }
  return { config, client: createClient(config.url, config.serviceRoleKey, { auth: { persistSession: false } }) };
}

function shouldUseSupabaseStorage() {
  return process.env.APP_MODE === "production" || Boolean(supabaseConfig());
}

function imageUrl(assetId: string) {
  return `/api/assets/media/${encodeURIComponent(assetId)}`;
}

async function usageCount(prisma: PrismaClient, assetId: string) {
  const [avatars, binders, decks, artwork, packImages] = await Promise.all([
    prisma.user.count({ where: { avatarAssetId: assetId } }),
    prisma.collectionBinder.count({ where: { coverAssetId: assetId } }),
    prisma.deck.count({ where: { deckBoxAssetId: assetId } }),
    prisma.customPackVersion.count({ where: { artworkAssetId: assetId } }),
    prisma.customPackVersion.count({ where: { packImageAssetId: assetId } }),
  ]);
  return avatars + binders + decks + artwork + packImages;
}

async function assertMediaQuota(prisma: PrismaClient, ownerId: string, incomingBytes: number) {
  const aggregate = await prisma.mediaAsset.aggregate({ where: { ownerId }, _sum: { byteSize: true } });
  if ((aggregate._sum.byteSize ?? 0) + incomingBytes > MEDIA_QUOTA_BYTES) {
    throw new DomainError({ code: "media_quota_exceeded", message: "Dein Medienkontingent von 100 MB ist ausgeschöpft.", status: 409 });
  }
}

async function cleanupStaleOwnerMedia(prisma: PrismaClient, ownerId: string) {
  const cutoff = new Date(Date.now() - STALE_MEDIA_AGE_MS);
  const generated = await prisma.mediaAsset.findMany({
    where: { ownerId, kind: "PACK_IMAGE", createdAt: { lt: cutoff } },
  });
  for (const asset of generated) {
    if (await usageCount(prisma, asset.id)) continue;
    await prisma.mediaAsset.delete({ where: { id: asset.id } });
    if (asset.storageProvider === "SUPABASE") {
      const { client, config } = getSupabase();
      await client.storage.from(config.mediaBucket).remove([asset.storageKey]);
    } else {
      await rm(/* turbopackIgnore: true */ path.join(localMediaDirectory(), asset.storageKey), { force: true });
    }
  }

  if (shouldUseSupabaseStorage()) {
    const { client, config } = getSupabase();
    const { data } = await client.storage.from(config.stagingBucket).list(ownerId, { limit: 1000 });
    const stale = (data ?? []).filter((entry) => entry.created_at && new Date(entry.created_at) < cutoff);
    if (stale.length) await client.storage.from(config.stagingBucket).remove(stale.map((entry) => `${ownerId}/${entry.name}`));
    return;
  }

  const directory = path.join(/*turbopackIgnore: true*/ localMediaDirectory(), ".staging", ownerId);
  const names = await readdir(/* turbopackIgnore: true */ directory).catch(() => [] as string[]);
  await Promise.all(names.map(async (name) => {
    const target = path.join(/*turbopackIgnore: true*/ directory, name);
    const info = await stat(/* turbopackIgnore: true */ target).catch(() => null);
    if (info && info.mtime < cutoff) await rm(/* turbopackIgnore: true */ target, { force: true });
  }));
}

export async function serializeMediaAsset(prisma: PrismaClient, asset: {
  id: string; kind: MediaAssetKind; name: string; width: number; height: number;
  byteSize: number; createdAt: Date;
}): Promise<MediaAssetDto> {
  const count = await usageCount(prisma, asset.id);
  return {
    id: asset.id,
    kind: asset.kind === "PACK_IMAGE" ? "PACK_ARTWORK" : asset.kind,
    name: asset.name,
    imageUrl: imageUrl(asset.id),
    width: asset.width,
    height: asset.height,
    byteSize: asset.byteSize,
    createdAt: asset.createdAt.toISOString(),
    usageCount: count,
    deletable: count === 0,
  };
}

export async function listMediaAssets(prisma: PrismaClient, ownerId: string, kind?: MediaAssetKind) {
  const assets = await prisma.mediaAsset.findMany({
    where: { ownerId, kind: kind ? kind : { not: "PACK_IMAGE" } },
    orderBy: { createdAt: "desc" },
  });
  return Promise.all(assets.map((asset) => serializeMediaAsset(prisma, asset)));
}

export async function createMediaUploadIntent(
  prisma: PrismaClient,
  ownerId: string,
  input: CreateMediaUploadIntentRequest,
) {
  await cleanupStaleOwnerMedia(prisma, ownerId).catch(() => undefined);
  await assertMediaQuota(prisma, ownerId, input.byteSize);

  const provider = shouldUseSupabaseStorage() ? "SUPABASE" : "LOCAL";
  const storageKey = `${ownerId}/${randomUUID()}.upload`;
  const uploadToken = encodeIntent({ ...input, ownerId, provider, storageKey, expiresAt: Date.now() + INTENT_TTL_MS });

  if (provider === "SUPABASE") {
    const { client, config } = getSupabase();
    const { data, error } = await client.storage.from(config.stagingBucket).createSignedUploadUrl(storageKey);
    if (error || !data) {
      throw new DomainError({ code: "media_upload_unavailable", message: "Der Bild-Upload konnte nicht vorbereitet werden.", status: 503 });
    }
    return { uploadToken, upload: { mode: "SIGNED" as const, url: data.signedUrl } };
  }

  return { uploadToken, upload: { mode: "LOCAL" as const, url: "/api/media/upload-content" } };
}

export async function storeLocalUpload(ownerId: string, token: string, bytes: Buffer) {
  const intent = decodeIntent(token);
  if (intent.ownerId !== ownerId || intent.provider !== "LOCAL") throwInvalidIntent();
  if (bytes.length !== intent.byteSize || bytes.length > 5 * 1024 * 1024) throwInvalidIntent("Die Dateigröße stimmt nicht mit dem Upload überein.");
  const target = path.join(/*turbopackIgnore: true*/ localMediaDirectory(), ".staging", intent.storageKey);
  await mkdir(/* turbopackIgnore: true */ path.dirname(target), { recursive: true });
  await writeFile(/* turbopackIgnore: true */ target, bytes, { flag: "wx" });
}

async function readStaging(intent: UploadIntent) {
  if (intent.provider === "SUPABASE") {
    const { client, config } = getSupabase();
    const { data, error } = await client.storage.from(config.stagingBucket).download(intent.storageKey);
    if (error || !data) throwInvalidIntent("Das hochgeladene Bild wurde nicht gefunden.");
    return Buffer.from(await data.arrayBuffer());
  }
  return readFile(/* turbopackIgnore: true */ path.join(localMediaDirectory(), ".staging", intent.storageKey));
}

async function removeStaging(intent: UploadIntent) {
  if (intent.provider === "SUPABASE") {
    const { client, config } = getSupabase();
    await client.storage.from(config.stagingBucket).remove([intent.storageKey]);
    return;
  }
  await rm(/* turbopackIgnore: true */ path.join(localMediaDirectory(), ".staging", intent.storageKey), { force: true });
}

function outputSize(kind: MediaAssetKind) {
  if (kind === "AVATAR") return { width: 512, height: 512 };
  if (kind === "PACK_ARTWORK") return { width: 900, height: 1125 };
  return { width: 1024, height: 1536 };
}

async function normalizeImage(bytes: Buffer, kind: MediaAssetKind) {
  const image = sharp(bytes, { animated: false, limitInputPixels: MAX_SOURCE_PIXELS });
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1) {
    throwInvalidIntent("Nur einzelne, statische Bilder sind erlaubt.");
  }
  if (!(["jpeg", "png", "webp"] as Array<string | undefined>).includes(metadata.format)) {
    throwInvalidIntent("Erlaubt sind JPEG-, PNG- und WebP-Bilder.");
  }
  const size = outputSize(kind);
  const output = await image.rotate().resize(size.width, size.height, { fit: "cover" }).webp({ quality: 84 }).toBuffer();
  return { output, ...size };
}

async function writeFinalAsset(provider: "LOCAL" | "SUPABASE", storageKey: string, bytes: Buffer) {
  if (provider === "SUPABASE") {
    const { client, config } = getSupabase();
    const { error } = await client.storage.from(config.mediaBucket).upload(storageKey, bytes, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: false,
    });
    if (error) throw new DomainError({ code: "media_store_failed", message: "Das Bild konnte nicht gespeichert werden.", status: 503 });
    return;
  }
  const target = path.join(/*turbopackIgnore: true*/ localMediaDirectory(), storageKey);
  await mkdir(/* turbopackIgnore: true */ path.dirname(target), { recursive: true });
  await writeFile(/* turbopackIgnore: true */ target, bytes, { flag: "wx" });
}

export async function finalizeMediaUpload(prisma: PrismaClient, ownerId: string, uploadToken: string) {
  const intent = decodeIntent(uploadToken);
  if (intent.ownerId !== ownerId) throwInvalidIntent();
  const source = await readStaging(intent);
  if (source.length !== intent.byteSize || source.length > 5 * 1024 * 1024) throwInvalidIntent("Die hochgeladene Dateigröße ist ungültig.");
  const normalized = await normalizeImage(source, intent.kind as MediaAssetKind);
  await assertMediaQuota(prisma, ownerId, normalized.output.length);
  const assetId = randomUUID();
  const storageKey = `${ownerId}/${assetId}.webp`;
  await writeFinalAsset(intent.provider, storageKey, normalized.output);
  await removeStaging(intent);
  const asset = await prisma.mediaAsset.create({
    data: {
      id: assetId,
      ownerId,
      kind: intent.kind as MediaAssetKind,
      name: intent.name,
      storageProvider: intent.provider,
      storageKey,
      mimeType: "image/webp",
      width: normalized.width,
      height: normalized.height,
      byteSize: normalized.output.length,
      sha256: createHash("sha256").update(normalized.output).digest("hex"),
    },
  });
  return serializeMediaAsset(prisma, asset);
}

export async function renameMediaAsset(prisma: PrismaClient, ownerId: string, assetId: string, name: string) {
  const current = await prisma.mediaAsset.findFirst({ where: { id: assetId, ownerId } });
  if (!current) throw new DomainError({ code: "media_not_found", message: "Das Bild wurde nicht gefunden.", status: 404 });
  const asset = await prisma.mediaAsset.update({ where: { id: assetId }, data: { name } });
  return serializeMediaAsset(prisma, asset);
}

export async function deleteMediaAsset(prisma: PrismaClient, ownerId: string, assetId: string) {
  const asset = await prisma.mediaAsset.findFirst({ where: { id: assetId, ownerId } });
  if (!asset) throw new DomainError({ code: "media_not_found", message: "Das Bild wurde nicht gefunden.", status: 404 });
  if (await usageCount(prisma, assetId)) {
    throw new DomainError({ code: "media_in_use", message: "Das Bild wird noch verwendet und kann nicht gelöscht werden.", status: 409 });
  }
  await prisma.mediaAsset.delete({ where: { id: assetId } });
  if (asset.storageProvider === "SUPABASE") {
    const { client, config } = getSupabase();
    await client.storage.from(config.mediaBucket).remove([asset.storageKey]);
  } else {
    await rm(/* turbopackIgnore: true */ path.join(localMediaDirectory(), asset.storageKey), { force: true });
  }
  return { deleted: true };
}

export async function resolveOwnedMediaAsset(
  prisma: PrismaClient,
  ownerId: string,
  assetId: string | null | undefined,
  kind: MediaAssetKind,
) {
  if (!assetId) return null;
  const asset = await prisma.mediaAsset.findFirst({ where: { id: assetId, ownerId, kind } });
  if (!asset) throw new DomainError({ code: "media_forbidden", message: "Dieses persönliche Design ist nicht verfügbar.", status: 403 });
  return asset;
}

export async function readMediaAsset(
  prisma: PrismaClient,
  assetId: string,
  viewerId?: string | null,
) {
  const asset = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
  if (!asset) throw new DomainError({ code: "media_not_found", message: "Das Bild wurde nicht gefunden.", status: 404 });
  if (asset.ownerId !== viewerId && (await usageCount(prisma, assetId)) === 0) {
    throw new DomainError({ code: "media_not_found", message: "Das Bild wurde nicht gefunden.", status: 404 });
  }
  if (asset.storageProvider === "SUPABASE") {
    const { client, config } = getSupabase();
    return { redirectUrl: client.storage.from(config.mediaBucket).getPublicUrl(asset.storageKey).data.publicUrl, bytes: null, mimeType: asset.mimeType };
  }
  return { redirectUrl: null, bytes: await readFile(/* turbopackIgnore: true */ path.join(localMediaDirectory(), asset.storageKey)), mimeType: asset.mimeType };
}

export async function readMediaAssetBytes(prisma: PrismaClient, assetId: string) {
  const asset = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
  if (!asset) throw new DomainError({ code: "media_not_found", message: "Das Bild wurde nicht gefunden.", status: 404 });
  if (asset.storageProvider === "SUPABASE") {
    const { client, config } = getSupabase();
    const { data, error } = await client.storage.from(config.mediaBucket).download(asset.storageKey);
    if (error || !data) throw new DomainError({ code: "media_read_failed", message: "Das Bild konnte nicht gelesen werden.", status: 503 });
    return Buffer.from(await data.arrayBuffer());
  }
  return readFile(/* turbopackIgnore: true */ path.join(localMediaDirectory(), asset.storageKey));
}

export async function createDerivedMediaAsset(
  prisma: PrismaClient,
  input: { ownerId: string; kind: "PACK_IMAGE"; name: string; bytes: Buffer; width: number; height: number },
) {
  const provider = shouldUseSupabaseStorage() ? "SUPABASE" : "LOCAL";
  await assertMediaQuota(prisma, input.ownerId, input.bytes.length);
  const assetId = randomUUID();
  const storageKey = `${input.ownerId}/${assetId}.webp`;
  await writeFinalAsset(provider, storageKey, input.bytes);
  return prisma.mediaAsset.create({
    data: {
      id: assetId,
      ownerId: input.ownerId,
      kind: input.kind,
      name: input.name,
      storageProvider: provider,
      storageKey,
      mimeType: "image/webp",
      width: input.width,
      height: input.height,
      byteSize: input.bytes.length,
      sha256: createHash("sha256").update(input.bytes).digest("hex"),
    },
  });
}

export function getMediaAssetUrl(assetId: string | null | undefined) {
  return assetId ? imageUrl(assetId) : null;
}
