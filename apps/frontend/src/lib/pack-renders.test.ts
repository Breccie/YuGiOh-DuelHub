import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getPackAssetManifestEntry } from "@/lib/pack-asset-manifest";
import { getPreferredPackHeroImage, hasOfficialPackRender } from "@/lib/pack-renders";

const MVP_PACK_CODES = ["LOB", "MRD", "SRL", "PSV", "IOC"];
const frontendPublicDir = path.join(process.cwd(), "apps", "frontend", "public");

describe("MVP pack renders", () => {
  it("keeps the early core boosters approved and bundled locally", () => {
    for (const code of MVP_PACK_CODES) {
      const manifestEntry = getPackAssetManifestEntry(code);
      const heroImageUrl = getPreferredPackHeroImage(code, code, null);

      expect(hasOfficialPackRender(code)).toBe(true);
      expect(heroImageUrl).toBe(`/pack-renders/${code}.png`);
      expect(manifestEntry).toMatchObject({
        code,
        assetStatus: "APPROVED_REAL",
        approvedImageUrl: `/pack-renders/${code}.png`,
      });
      expect(
        existsSync(path.join(frontendPublicDir, "pack-renders", `${code}.png`)),
      ).toBe(true);
    }
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
});
