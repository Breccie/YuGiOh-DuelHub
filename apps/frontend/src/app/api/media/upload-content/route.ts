import { NextResponse } from "next/server";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { requireSameOriginMutation } from "@/lib/api-route-security";
import { requireViewerSession } from "@/lib/auth";
import { storeLocalUpload } from "@/lib/media-service";
import { getPrisma } from "@/lib/prisma";

export async function PUT(request: Request) {
  try {
    requireSameOriginMutation(request, "Uploads müssen aus der App erfolgen.");
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const token = request.headers.get("x-media-upload-token") ?? "";
    const bytes = Buffer.from(await request.arrayBuffer());
    await storeLocalUpload(session.userId, token, bytes);
    return NextResponse.json({ uploaded: true });
  } catch (error) {
    return toNextErrorResponse(error, "Das Bild konnte nicht hochgeladen werden.");
  }
}
