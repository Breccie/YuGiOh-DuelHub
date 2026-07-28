import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getFrontendRuntimeStatus } from "@/lib/app-mode";

const API_SERVICE_TIMEOUT_MS = 20_000;
const API_SERVICE_READ_ATTEMPTS = 2;

export function getApiBaseUrl() {
  const status = getFrontendRuntimeStatus();

  if (!status.onlineMode) {
    return null;
  }

  return status.apiBaseUrl;
}

export function shouldProxyToApiService() {
  return Boolean(getApiBaseUrl());
}

function createServiceUnavailablePayload(detail?: string) {
  return {
    error: "API-Service ist nicht erreichbar.",
    errorDetail: {
      code: "service_unavailable",
      message:
        detail ??
        "Der Online-Service konnte nicht erreicht werden. Prüfe Docker, API_BASE_URL und den API-Prozess.",
      status: 503,
    },
  };
}

function createForwardHeaders(options?: {
  contentType?: string | null;
  cookie?: string | null;
  userAgent?: string | null;
  headers?: HeadersInit;
}) {
  const requestHeaders = new Headers(options?.headers);

  if (options?.contentType) {
    requestHeaders.set("content-type", options.contentType);
  }

  if (options?.cookie) {
    requestHeaders.set("cookie", options.cookie);
  }

  if (options?.userAgent) {
    requestHeaders.set("user-agent", options.userAgent);
  }

  return requestHeaders;
}

export async function fetchApiService(
  servicePath: string,
  init?: RequestInit & {
    cookieHeader?: string | null;
    userAgent?: string | null;
  },
) {
  const baseUrl = getApiBaseUrl();

  if (!baseUrl) {
    throw new Error("API service proxy requested without API_BASE_URL.");
  }

  const forwardedHeaders = createForwardHeaders({
    headers: init?.headers,
    contentType:
      init?.headers instanceof Headers ? init.headers.get("content-type") : null,
    cookie: init?.cookieHeader ?? null,
    userAgent: init?.userAgent ?? null,
  });
  const requestMethod = (init?.method ?? "GET").toUpperCase();
  const attemptCount =
    !init?.signal && (requestMethod === "GET" || requestMethod === "HEAD")
      ? API_SERVICE_READ_ATTEMPTS
      : 1;
  let lastError: unknown;

  for (let attempt = 0; attempt < attemptCount; attempt += 1) {
    try {
      return await fetch(new URL(servicePath, baseUrl), {
        ...init,
        headers: forwardedHeaders,
        cache: "no-store",
        signal: init?.signal ?? AbortSignal.timeout(API_SERVICE_TIMEOUT_MS),
      });
    } catch (error) {
      lastError = error;
    }
  }

  const serviceError = new Error(
    lastError instanceof Error
      ? `API-Service nicht erreichbar: ${lastError.message}`
      : "API-Service nicht erreichbar.",
  );
  (
    serviceError as Error & {
      status?: number;
    }
  ).status = 503;
  throw serviceError;
}

export async function fetchApiServiceJson<T>(
  servicePath: string,
  init?: RequestInit & {
    cookieHeader?: string | null;
    userAgent?: string | null;
  },
) {
  const requestHeaders = await headers();
  const response = await fetchApiService(servicePath, {
    ...init,
    cookieHeader: init?.cookieHeader ?? requestHeaders.get("cookie"),
    userAgent: init?.userAgent ?? requestHeaders.get("user-agent"),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    errorDetail?: { message?: string };
  } & T;

  if (!response.ok) {
    const error = new Error(
      payload.errorDetail?.message ??
        payload.error ??
        `Request failed with ${response.status}`,
    );
    (
      error as Error & {
        status?: number;
      }
    ).status = response.status;
    throw error;
  }

  return payload;
}

export async function fetchApiRoute(request: Request, servicePath: string) {
  const contentType = request.headers.get("content-type");
  const cookie = request.headers.get("cookie");
  const userAgent = request.headers.get("user-agent");
  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.text();

  return fetchApiService(servicePath, {
    method: request.method,
    headers: contentType ? { "content-type": contentType } : undefined,
    body,
    cookieHeader: cookie,
    userAgent,
  });
}

export function toProxiedNextResponse(proxiedResponse: Response) {
  const responseHeaders = new Headers(proxiedResponse.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");

  return new NextResponse(proxiedResponse.body, {
    status: proxiedResponse.status,
    headers: responseHeaders,
  });
}

export async function proxyApiRoute(request: Request, servicePath: string) {
  try {
    const proxiedResponse = await fetchApiRoute(request, servicePath);

    return toProxiedNextResponse(proxiedResponse);
  } catch (error) {
    return NextResponse.json(
      createServiceUnavailablePayload(
        error instanceof Error ? error.message : undefined,
      ),
      {
        status: 503,
      },
    );
  }
}
