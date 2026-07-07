import { DomainError } from "@ygo/domain";

export function isSameOriginMutation(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  if (!origin || !host) {
    return false;
  }

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function requireSameOriginMutation(
  request: Request,
  message = "Mutationen muessen aus der App heraus kommen.",
) {
  if (isSameOriginMutation(request)) {
    return;
  }

  throw new DomainError({
    code: "invalid_origin",
    message,
    status: 403,
  });
}
