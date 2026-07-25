import { NextRequest, NextResponse } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function firstForwardedValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() || null;
}

export function isSameOriginApiRequest(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host =
    firstForwardedValue(request.headers.get("x-forwarded-host")) ??
    request.headers.get("host");
  const protocol =
    firstForwardedValue(request.headers.get("x-forwarded-proto")) ??
    request.nextUrl.protocol.replace(":", "");

  if (!origin || !host || !protocol) {
    return false;
  }

  try {
    return new URL(origin).origin === `${protocol}://${host}`;
  } catch {
    return false;
  }
}

export function proxy(request: NextRequest) {
  if (SAFE_METHODS.has(request.method) || isSameOriginApiRequest(request)) {
    return NextResponse.next();
  }

  return NextResponse.json(
    {
      error: "Mutationen müssen aus der App heraus erfolgen.",
      errorDetail: {
        code: "invalid_origin",
        message: "Mutationen müssen aus der App heraus erfolgen.",
        status: 403,
      },
    },
    { status: 403 },
  );
}

export const config = {
  matcher: "/api/:path*",
};
