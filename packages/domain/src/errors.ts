import type { ApiError } from "../../contracts/src";

export class DomainError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(options: {
    code: string;
    message: string;
    status?: number;
    details?: unknown;
  }) {
    super(options.message);
    this.name = "DomainError";
    this.code = options.code;
    this.status = options.status ?? 400;
    this.details = options.details;
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}

function isPublicClientError(
  error: unknown,
): error is Error & { code: string; status: number; details?: unknown } {
  if (!(error instanceof Error)) {
    return false;
  }

  const candidate = error as Error & {
    code?: unknown;
    status?: unknown;
    details?: unknown;
  };

  return (
    typeof candidate.code === "string" &&
    typeof candidate.status === "number" &&
    candidate.status >= 400 &&
    candidate.status < 500
  );
}

export function toApiError(error: unknown, fallbackMessage: string): ApiError {
  if (isDomainError(error)) {
    return {
      code: error.code,
      message: error.message,
      status: error.status,
      details: error.details,
    };
  }

  if (isPublicClientError(error)) {
    return {
      code: error.code,
      message: error.message,
      status: error.status,
      details: error.details,
    };
  }

  return {
    code: "internal_error",
    message: fallbackMessage,
    status: 500,
  };
}
