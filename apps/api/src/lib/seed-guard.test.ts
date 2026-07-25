import { describe, expect, it } from "vitest";
import { assertDestructiveBaseSeedAllowed } from "./seed-guard";

describe("destructive base seed guard", () => {
  it("blocks production even with an explicit destructive opt-in", () => {
    expect(() =>
      assertDestructiveBaseSeedAllowed({
        APP_MODE: "production",
        ALLOW_DESTRUCTIVE_BASE_SEED: "1",
      }),
    ).toThrow(/niemals in Produktion/i);
  });

  it("requires an explicit opt-in outside production", () => {
    expect(() =>
      assertDestructiveBaseSeedAllowed({ APP_MODE: "online-dev" }),
    ).toThrow(/ALLOW_DESTRUCTIVE_BASE_SEED=1/i);
  });

  it("allows an explicitly opted-in disposable development database", () => {
    expect(() =>
      assertDestructiveBaseSeedAllowed({
        APP_MODE: "online-dev",
        NODE_ENV: "development",
        ALLOW_DESTRUCTIVE_BASE_SEED: "1",
      }),
    ).not.toThrow();
  });
});
