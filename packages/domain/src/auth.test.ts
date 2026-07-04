import { describe, expect, it } from "vitest";
import { hashPassword, normalizeDuelistId, verifyPassword } from "./auth";

describe("auth domain helpers", () => {
  it("normalizes duelist ids", () => {
    expect(normalizeDuelistId("  yugi-001  ")).toBe("YUGI-001");
  });

  it("hashes and verifies passwords", () => {
    const hash = hashPassword("duelhub123");

    expect(hash.startsWith("scrypt:")).toBe(true);
    expect(verifyPassword("duelhub123", hash)).toBe(true);
    expect(verifyPassword("wrong-password", hash)).toBe(false);
  });
});
