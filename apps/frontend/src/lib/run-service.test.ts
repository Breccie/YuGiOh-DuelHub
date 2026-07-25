import { describe, expect, it } from "vitest";
import { applyCreditLimit, assertCanAssignRunRole } from "@/lib/run-service";

describe("campaign role assignment", () => {
  it("never allows the campaign owner membership to be changed", () => {
    expect(() =>
      assertCanAssignRunRole({
        actorRole: "OWNER",
        requestedRole: "PLAYER",
        existingRole: "OWNER",
        targetIsOwner: true,
      }),
    ).toThrow(/Owner-Rolle/);
  });

  it("allows organizers to add players but not to promote members", () => {
    expect(() =>
      assertCanAssignRunRole({
        actorRole: "ORGANIZER",
        requestedRole: "PLAYER",
        existingRole: null,
        targetIsOwner: false,
      }),
    ).not.toThrow();

    expect(() =>
      assertCanAssignRunRole({
        actorRole: "ORGANIZER",
        requestedRole: "ORGANIZER",
        existingRole: "PLAYER",
        targetIsOwner: false,
      }),
    ).toThrow(/Organizer dürfen nur Spieler/);
  });

  it("allows owners to assign organizer and player roles", () => {
    expect(() =>
      assertCanAssignRunRole({
        actorRole: "OWNER",
        requestedRole: "ORGANIZER",
        existingRole: "PLAYER",
        targetIsOwner: false,
      }),
    ).not.toThrow();
  });
});

describe("campaign credit limit", () => {
  it("caps positive grants without affecting debits", () => {
    expect(
      applyCreditLimit({ balance: 90, amount: 25, creditLimit: 100 }),
    ).toEqual({ appliedAmount: 10, balanceAfter: 100 });
    expect(
      applyCreditLimit({ balance: 90, amount: -20, creditLimit: 100 }),
    ).toEqual({ appliedAmount: -20, balanceAfter: 70 });
  });
});
