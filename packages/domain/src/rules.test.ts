import { describe, expect, it } from "vitest";
import { getRuleTopic, ruleTopics } from "./rules";

describe("rules domain", () => {
  it("keeps rule slugs unique", () => {
    const slugs = ruleTopics.map((topic) => topic.slug);

    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("contains the core online league rule areas", () => {
    expect(getRuleTopic("progression")).not.toBeNull();
    expect(getRuleTopic("season")).not.toBeNull();
    expect(getRuleTopic("banlist-errata")).not.toBeNull();
    expect(getRuleTopic("edopro")).not.toBeNull();
  });
});
