import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { toApiError } from "@ygo/domain";

export function toNextErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof ZodError) {
    const apiError = {
      code: "validation_error",
      message: error.issues[0]?.message ?? fallbackMessage,
      status: 400,
      details: error.flatten(),
    };

    return NextResponse.json(
      {
        error: apiError.message,
        errorDetail: apiError,
      },
      { status: 400 },
    );
  }

  if (
    error instanceof Error &&
    (error as Error & { status?: number }).status === 503
  ) {
    const apiError = {
      code: "service_unavailable",
      message: error.message || fallbackMessage,
      status: 503,
    };

    return NextResponse.json(
      {
        error: apiError.message,
        errorDetail: apiError,
      },
      { status: 503 },
    );
  }

  const apiError = toApiError(error, fallbackMessage);
  return NextResponse.json(
    {
      error: apiError.message,
      errorDetail: apiError,
    },
    { status: apiError.status },
  );
}
