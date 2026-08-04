ALTER TABLE "CustomPackSlot"
  ADD COLUMN "rarityWeights" JSONB;

UPDATE "CustomPackSlot" AS slot
SET "rarityWeights" = (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'rarity', rarity.value,
        'weight', CASE WHEN rarity.ordinality = 1 THEN 100 ELSE slot."weight" END
      )
      ORDER BY rarity.ordinality
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements_text(slot."allowedRarities") WITH ORDINALITY AS rarity(value, ordinality)
);
