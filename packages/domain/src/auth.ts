import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function normalizeDuelistId(value: string) {
  return value.trim().toUpperCase();
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [algorithm, salt, expectedHash] = storedHash.split(":");

  if (algorithm !== "scrypt" || !salt || !expectedHash) {
    return false;
  }

  const derivedHash = scryptSync(password, salt, 64).toString("hex");
  const expectedBuffer = Buffer.from(expectedHash, "hex");
  const derivedBuffer = Buffer.from(derivedHash, "hex");

  if (expectedBuffer.length !== derivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, derivedBuffer);
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
