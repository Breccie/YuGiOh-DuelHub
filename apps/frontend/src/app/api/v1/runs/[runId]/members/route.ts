import { NextResponse } from "next/server";
import type { RunMemberDto } from "@ygo/contracts";
import { addRunMemberRequestSchema, runMemberSchema } from "@ygo/contracts";
import { z } from "zod";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireSameOriginMutation } from "@/lib/api-route-security";
import { requireViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { addRunMember, requireRunMembership } from "@/lib/run-service";

export const dynamic = "force-dynamic";

function serializeMember(member: {
  id: string;
  runId: string;
  userId: string;
  role: "OWNER" | "ORGANIZER" | "PLAYER";
  joinedAt: Date;
  user: {
    duelistId: string;
    displayName: string;
  };
}) {
  return runMemberSchema.parse({
    id: member.id,
    runId: member.runId,
    userId: member.userId,
    duelistId: member.user.duelistId,
    displayName: member.user.displayName,
    role: member.role,
    joinedAt: member.joinedAt.toISOString(),
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;

  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, `/api/v1/runs/${runId}/members`);
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    await requireRunMembership(prisma, {
      runId,
      userId: session.userId,
    });
    const members = await prisma.runMembership.findMany({
      where: {
        runId,
      },
      orderBy: {
        joinedAt: "asc",
      },
      include: {
        user: {
          select: {
            duelistId: true,
            displayName: true,
          },
        },
      },
    });

    return NextResponse.json(
      z.array(runMemberSchema).parse(members.map(serializeMember)),
    );
  } catch (error) {
    return toNextErrorResponse(error, "Kampagnen-Mitglieder konnten nicht geladen werden.");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;

  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, `/api/v1/runs/${runId}/members`);
  }

  try {
    requireSameOriginMutation(
      request,
      "Kampagnen-Einladungen muessen aus der App heraus kommen.",
    );

    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const body = addRunMemberRequestSchema.parse(await request.json());
    const member = await addRunMember(prisma, {
      runId,
      actorId: session.userId,
      duelistId: body.duelistId,
      role: body.role,
    });

    return NextResponse.json(serializeMember(member) satisfies RunMemberDto, {
      status: 201,
    });
  } catch (error) {
    return toNextErrorResponse(error, "Kampagnen-Mitglied konnte nicht hinzugefügt werden.");
  }
}
