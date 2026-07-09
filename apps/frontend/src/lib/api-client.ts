type ApiErrorPayload = {
  error?: string;
  errorDetail?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

export class ApiClientError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, options?: { status?: number; code?: string; details?: unknown }) {
    super(message);
    this.name = "ApiClientError";
    this.status = options?.status ?? 500;
    this.code = options?.code;
    this.details = options?.details;
  }
}

async function readApiJsonResponse<T>(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload & T;

  if (!response.ok) {
    throw new ApiClientError(
      payload.errorDetail?.message ??
        payload.error ??
        `Anfrage fehlgeschlagen (${response.status}).`,
      {
        status: response.status,
        code: payload.errorDetail?.code,
        details: payload.errorDetail?.details,
      },
    );
  }

  return payload as T;
}

async function requestApiJson<TResponse>(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  const response = await fetch(input, init);

  return readApiJsonResponse<TResponse>(response);
}

function createJsonHeaders(headers?: HeadersInit) {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("content-type", "application/json");

  return requestHeaders;
}

export async function apiGetJson<TResponse>(
  input: RequestInfo | URL,
  init?: Omit<RequestInit, "method" | "body">,
) {
  return requestApiJson<TResponse>(input, {
    ...init,
    method: "GET",
  });
}

export async function apiPost<TResponse>(
  input: RequestInfo | URL,
  init?: Omit<RequestInit, "method" | "body">,
) {
  return requestApiJson<TResponse>(input, {
    ...init,
    method: "POST",
  });
}

export async function apiDeleteJson<TResponse, TBody = undefined>(
  input: RequestInfo | URL,
  body?: TBody,
  init?: Omit<RequestInit, "method" | "body">,
) {
  return requestApiJson<TResponse>(input, {
    ...init,
    method: "DELETE",
    headers: createJsonHeaders(init?.headers),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function apiPostJson<TResponse, TBody>(
  input: RequestInfo | URL,
  body: TBody,
  init?: Omit<RequestInit, "method" | "body">,
) {
  return requestApiJson<TResponse>(input, {
    ...init,
    method: "POST",
    headers: createJsonHeaders(init?.headers),
    body: JSON.stringify(body),
  });
}

export async function apiPatchJson<TResponse, TBody>(
  input: RequestInfo | URL,
  body: TBody,
  init?: Omit<RequestInit, "method" | "body">,
) {
  return requestApiJson<TResponse>(input, {
    ...init,
    method: "PATCH",
    headers: createJsonHeaders(init?.headers),
    body: JSON.stringify(body),
  });
}

export async function apiPutJson<TResponse, TBody>(
  input: RequestInfo | URL,
  body: TBody,
  init?: Omit<RequestInit, "method" | "body">,
) {
  return requestApiJson<TResponse>(input, {
    ...init,
    method: "PUT",
    headers: createJsonHeaders(init?.headers),
    body: JSON.stringify(body),
  });
}

export function getApiErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallbackMessage;
}

export function isActiveRunRequiredError(error: unknown) {
  return (
    error instanceof ApiClientError &&
    (error.code === "active_run_required" ||
      (error.status === 409 && /kampagne|runde/i.test(error.message)))
  );
}
