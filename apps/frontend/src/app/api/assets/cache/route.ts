import { NextResponse } from "next/server";
import { requireViewerSession } from "@/lib/auth";
import { clearAssetCache, getAssetCacheStats } from "@/lib/asset-cache";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const prisma = getPrisma();
    await requireViewerSession(prisma);
    const stats = await getAssetCacheStats();

    return NextResponse.json({
      cache: stats,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Asset-Cache konnte nicht gelesen werden.";

    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  try {
    const prisma = getPrisma();
    await requireViewerSession(prisma);
    const stats = await clearAssetCache();

    return NextResponse.json({
      cache: stats,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Asset-Cache konnte nicht geleert werden.";

    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 },
    );
  }
}
