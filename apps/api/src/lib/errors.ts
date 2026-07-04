import type { FastifyReply } from "fastify";
import { ZodError } from "zod";
import { toApiError } from "../../../../packages/domain/src";

export function sendApiError(
  reply: FastifyReply,
  error: unknown,
  fallbackMessage: string,
) {
  if (error instanceof ZodError) {
    const apiError = {
      code: "validation_error",
      message: error.issues[0]?.message ?? fallbackMessage,
      status: 400,
      details: error.flatten(),
    };

    return reply.status(400).send({
      error: apiError.message,
      errorDetail: apiError,
    });
  }

  const apiError = toApiError(error, fallbackMessage);
  return reply.status(apiError.status).send({
    error: apiError.message,
    errorDetail: apiError,
  });
}
