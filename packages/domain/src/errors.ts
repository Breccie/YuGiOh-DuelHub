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

export function toApiError(error: unknown, fallbackMessage: string): ApiError {
  if (isDomainError(error)) {
    return {
      code: error.code,
      message: error.message,
      status: error.status,
      details: error.details,
    };
  }

  return {
    code: "internal_error",
    message: error instanceof Error ? error.message : fallbackMessage,
    status: 500,
  };
}
