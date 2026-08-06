import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getPackAssetManifestEntry } from "@/lib/pack-asset-manifest";
import {
  getPreferredPackBackImage,
  getPreferredPackHeroImage,
  hasOfficialPackRender,
} from "@/lib/pack-renders";

const EARLY_CORE_PACK_RENDERS = {
  LOB: "/pack-renders/LOB.png",
  MRD: "/pack-renders/MRD.png",
  MRL: "/pack-renders/normalized/MRL.webp",
  SRL: "/pack-renders/SRL.png",
  PSV: "/pack-renders/PSV.png",
  IOC: "/pack-renders/IOC.png",
} as const;
const frontendPublicDir = path.join(process.cwd(), "apps", "frontend", "public");

describe("MVP pack renders", () => {
  it("keeps the early core boosters approved and bundled locally", () => {
    for (const [code, renderUrl] of Object.entries(EARLY_CORE_PACK_RENDERS)) {
      const manifestEntry = getPackAssetManifestEntry(code);
      const heroImageUrl = getPreferredPackHeroImage(code, code, null);

      expect(hasOfficialPackRender(code)).toBe(true);
      expect(heroImageUrl).toBe(renderUrl);
      expect(manifestEntry).toMatchObject({
        code,
        assetStatus: "APPROVED_REAL",
        approvedImageUrl: renderUrl,
      });
      expect(
        existsSync(path.join(frontendPublicDir, ...renderUrl.split("/").filter(Boolean))),
      ).toBe(true);
    }
  });

  it("keeps Magic Ruler and Spell Ruler on distinct verified wrappers", () => {
    const magicRuler = getPackAssetManifestEntry("MRL");
    const spellRuler = getPackAssetManifestEntry("SRL");

    expect(magicRuler).toMatchObject({
      setName: "Magic Ruler",
      approvedImageUrl: "/pack-renders/normalized/MRL.webp",
    });
    expect(magicRuler?.sourceUrl).not.toContain("SRL");
    expect(spellRuler).toMatchObject({
      setName: "Spell Ruler",
      approvedImageUrl: "/pack-renders/SRL.png",
    });
    expect(magicRuler?.approvedImageUrl).not.toBe(spellRuler?.approvedImageUrl);
  });

  it("uses imported real images for special products without approved pack renders", () => {
    const heroImageUrl = getPreferredPackHeroImage(
      "DB1",
      "Dark Beginning 1",
      "https://images.ygoprodeck.com/images/sets/DB1.jpg",
    );

    expect(heroImageUrl).toBe(
      "/api/assets/remote?url=https%3A%2F%2Fimages.ygoprodeck.com%2Fimages%2Fsets%2FDB1.jpg",
    );
  });

  it("versions resolver URLs so stale redirect caches cannot hide replaced pack art", () => {
    const heroImageUrl = getPreferredPackHeroImage(
      "PGD",
      "Pharaonic Guardian",
      null,
    );

    expect(heroImageUrl).toBe(
      "/api/assets/packs/PGD?v=original-pack-v10&name=Pharaonic+Guardian",
    );
  });

  it("uses the bundled raster asset instead of a text-based pack-back placeholder", () => {
    const backImageUrl = getPreferredPackBackImage("UNLISTED");

    expect(backImageUrl).toBe("/app-assets/fallback-pack.webp");
    expect(
      existsSync(path.join(frontendPublicDir, "app-assets", "fallback-pack.webp")),
    ).toBe(true);
  });
});
