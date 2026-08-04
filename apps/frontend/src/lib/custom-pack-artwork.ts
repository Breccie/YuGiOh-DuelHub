import type { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { createDerivedMediaAsset, readMediaAssetBytes, resolveOwnedMediaAsset } from "@/lib/media-service";

function escapeXml(value: string) {
  return value.replace(/[<>&'\"]/g, (character) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '\"': "&quot;",
  })[character] ?? character);
}

export async function createCustomPackImage(
  prisma: PrismaClient,
  input: { ownerId: string; artworkAssetId: string; name: string; code: string },
) {
  await resolveOwnedMediaAsset(prisma, input.ownerId, input.artworkAssetId, "PACK_ARTWORK");
  const artwork = await readMediaAssetBytes(prisma, input.artworkAssetId);
  const art = await sharp(artwork).resize(840, 1050, { fit: "cover" }).webp({ quality: 88 }).toBuffer();
  const title = escapeXml(input.name.toUpperCase());
  const code = escapeXml(input.code.toUpperCase());
  const base = Buffer.from(`
    <svg width="1024" height="1536" viewBox="0 0 1024 1536" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="foil" x1="0" y1="0" x2="1" y2="1">
          <stop stop-color="#d9dde1"/><stop offset=".18" stop-color="#424a52"/>
          <stop offset=".5" stop-color="#f3efe2"/><stop offset=".72" stop-color="#313940"/><stop offset="1" stop-color="#aeb6bd"/>
        </linearGradient>
      </defs>
      <rect width="1024" height="1536" rx="34" fill="url(#foil)"/>
    </svg>`);
  const overlay = Buffer.from(`
    <svg width="1024" height="1536" viewBox="0 0 1024 1536" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#05080b" stop-opacity=".08"/><stop offset="1" stop-color="#05080b" stop-opacity=".8"/></linearGradient>
      </defs>
      <rect x="72" y="164" width="880" height="1130" rx="22" fill="none" stroke="#f3d79c" stroke-width="12"/>
      <rect x="92" y="184" width="840" height="1050" rx="12" fill="none" stroke="#0d151d" stroke-width="6"/>
      <rect x="92" y="930" width="840" height="304" fill="url(#shade)"/>
      <rect x="0" y="0" width="1024" height="126" fill="#0b1117" fill-opacity=".88"/>
      <rect x="0" y="1370" width="1024" height="166" fill="#0b1117" fill-opacity=".9"/>
      ${Array.from({ length: 24 }, (_, i) => `<path d="M${i * 44} 10 L${i * 44 + 22} 116 L${i * 44 + 44} 10" fill="none" stroke="#f7f2e7" stroke-opacity=".25" stroke-width="4"/>`).join("")}
      ${Array.from({ length: 24 }, (_, i) => `<path d="M${i * 44} 1390 L${i * 44 + 22} 1518 L${i * 44 + 44} 1390" fill="none" stroke="#f7f2e7" stroke-opacity=".2" stroke-width="4"/>`).join("")}
      <text x="512" y="1120" text-anchor="middle" fill="#fff7e8" font-family="Georgia,serif" font-size="54" font-weight="700">${title.slice(0, 28)}</text>
      <text x="512" y="1188" text-anchor="middle" fill="#e5bd72" font-family="Arial,sans-serif" font-size="30" letter-spacing="8">${code}</text>
      <text x="512" y="1450" text-anchor="middle" fill="#e8edf1" font-family="Arial,sans-serif" font-size="24" letter-spacing="5">DUEL HUB CUSTOM PACK</text>
    </svg>`);
  const bytes = await sharp({ create: { width: 1024, height: 1536, channels: 4, background: "#11161b" } })
    .composite([
      { input: base, left: 0, top: 0 },
      { input: art, left: 92, top: 184 },
      { input: overlay, left: 0, top: 0, blend: "over" },
    ])
    .webp({ quality: 88 })
    .toBuffer();
  return createDerivedMediaAsset(prisma, {
    ownerId: input.ownerId,
    kind: "PACK_IMAGE",
    name: `${input.name} Booster`,
    bytes,
    width: 1024,
    height: 1536,
  });
}
