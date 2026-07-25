-- Repair legacy references before enforcing the relations introduced by this migration.
UPDATE "CampaignRuleVersion" AS version
SET
  "effectiveCheckpointId" = NULL,
  "status" = CASE
    WHEN version."status" = 'SCHEDULED'::"CampaignRuleVersionStatus"
      AND version."effectiveAt" IS NULL
      THEN 'DRAFT'::"CampaignRuleVersionStatus"
    ELSE version."status"
  END
WHERE version."effectiveCheckpointId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "RunProgressionCheckpoint" AS checkpoint
    WHERE checkpoint."id" = version."effectiveCheckpointId"
      AND checkpoint."runId" = version."runId"
  );

UPDATE "RewardGrant" AS record
SET "ruleVersionId" = NULL
WHERE record."ruleVersionId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "CampaignRuleVersion" AS version
    WHERE version."id" = record."ruleVersionId" AND version."runId" = record."runId"
  );

UPDATE "RunProgressionCheckpoint" AS record
SET "ruleVersionId" = NULL
WHERE record."ruleVersionId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "CampaignRuleVersion" AS version
    WHERE version."id" = record."ruleVersionId" AND version."runId" = record."runId"
  );

UPDATE "Tournament" AS record
SET "ruleVersionId" = NULL
WHERE record."ruleVersionId" IS NOT NULL
  AND (
    record."runId" IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM "CampaignRuleVersion" AS version
      WHERE version."id" = record."ruleVersionId" AND version."runId" = record."runId"
    )
  );

UPDATE "PackOpening" AS record
SET "ruleVersionId" = NULL
WHERE record."ruleVersionId" IS NOT NULL
  AND (
    record."runId" IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM "CampaignRuleVersion" AS version
      WHERE version."id" = record."ruleVersionId" AND version."runId" = record."runId"
    )
  );

UPDATE "PackOpeningBatch" AS record
SET "ruleVersionId" = NULL
WHERE record."ruleVersionId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "CampaignRuleVersion" AS version
    WHERE version."id" = record."ruleVersionId" AND version."runId" = record."runId"
  );

UPDATE "PackOpening" AS opening
SET "customPackVersionId" = NULL
WHERE opening."customPackVersionId" IS NOT NULL
  AND (
    opening."runId" IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM "CustomPackVersion" AS version
      JOIN "CustomPackDefinition" AS definition ON definition."id" = version."definitionId"
      WHERE version."id" = opening."customPackVersionId"
        AND definition."runId" = opening."runId"
    )
  );

UPDATE "CustomPackVersion" AS version
SET "status" = 'ARCHIVED'::"CustomPackStatus"
WHERE version."status" = 'PUBLISHED'::"CustomPackStatus"
  AND version."generatedSetId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "CardSet" AS card_set WHERE card_set."id" = version."generatedSetId"
  );

UPDATE "CustomPackVersion" AS version
SET "generatedSetId" = NULL
WHERE version."generatedSetId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "CardSet" AS card_set WHERE card_set."id" = version."generatedSetId"
  );

UPDATE "CustomPackVersion" AS version
SET "status" = 'ARCHIVED'::"CustomPackStatus"
WHERE version."status" = 'PUBLISHED'::"CustomPackStatus"
  AND EXISTS (
    SELECT 1
    FROM "CustomPackCardPoolEntry" AS entry
    LEFT JOIN "SetCard" AS printing ON printing."id" = entry."setCardId"
    WHERE entry."versionId" = version."id"
      AND entry."setCardId" IS NOT NULL
      AND (printing."id" IS NULL OR printing."cardId" <> entry."cardId")
  );

UPDATE "CustomPackCardPoolEntry" AS entry
SET "setCardId" = NULL
WHERE entry."setCardId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "SetCard" AS printing
    WHERE printing."id" = entry."setCardId" AND printing."cardId" = entry."cardId"
  );

-- Preserve the run's current pointer when it is valid; otherwise keep only the newest ACTIVE version.
UPDATE "PlayGroupRun" AS run
SET "activeRuleVersionId" = NULL
WHERE run."activeRuleVersionId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "CampaignRuleVersion" AS version
    WHERE version."id" = run."activeRuleVersionId"
      AND version."runId" = run."id"
      AND version."status" = 'ACTIVE'::"CampaignRuleVersionStatus"
  );

WITH ranked_active AS (
  SELECT
    version."id",
    ROW_NUMBER() OVER (
      PARTITION BY version."runId"
      ORDER BY
        (run."activeRuleVersionId" = version."id") DESC,
        version."version" DESC,
        version."createdAt" DESC,
        version."id" DESC
    ) AS rank
  FROM "CampaignRuleVersion" AS version
  JOIN "PlayGroupRun" AS run ON run."id" = version."runId"
  WHERE version."status" = 'ACTIVE'::"CampaignRuleVersionStatus"
)
UPDATE "CampaignRuleVersion" AS version
SET "status" = 'SUPERSEDED'::"CampaignRuleVersionStatus"
FROM ranked_active
WHERE version."id" = ranked_active."id" AND ranked_active.rank > 1;

UPDATE "PlayGroupRun" AS run
SET "activeRuleVersionId" = active_version."id"
FROM (
  SELECT DISTINCT ON (version."runId") version."runId", version."id"
  FROM "CampaignRuleVersion" AS version
  WHERE version."status" = 'ACTIVE'::"CampaignRuleVersionStatus"
  ORDER BY version."runId", version."version" DESC, version."createdAt" DESC, version."id" DESC
) AS active_version
WHERE run."id" = active_version."runId"
  AND run."activeRuleVersionId" IS DISTINCT FROM active_version."id";

-- Abort with a useful error if a future schema drift makes any cleanup incomplete.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "CampaignRuleVersion" AS version
    LEFT JOIN "RunProgressionCheckpoint" AS checkpoint
      ON checkpoint."id" = version."effectiveCheckpointId" AND checkpoint."runId" = version."runId"
    WHERE version."effectiveCheckpointId" IS NOT NULL AND checkpoint."id" IS NULL
  ) OR EXISTS (
    SELECT 1 FROM "RewardGrant" AS record
    LEFT JOIN "CampaignRuleVersion" AS version
      ON version."id" = record."ruleVersionId" AND version."runId" = record."runId"
    WHERE record."ruleVersionId" IS NOT NULL AND version."id" IS NULL
  ) OR EXISTS (
    SELECT 1 FROM "RunProgressionCheckpoint" AS record
    LEFT JOIN "CampaignRuleVersion" AS version
      ON version."id" = record."ruleVersionId" AND version."runId" = record."runId"
    WHERE record."ruleVersionId" IS NOT NULL AND version."id" IS NULL
  ) OR EXISTS (
    SELECT 1 FROM "Tournament" AS record
    LEFT JOIN "CampaignRuleVersion" AS version
      ON version."id" = record."ruleVersionId" AND version."runId" = record."runId"
    WHERE record."ruleVersionId" IS NOT NULL AND version."id" IS NULL
  ) OR EXISTS (
    SELECT 1 FROM "PackOpening" AS record
    LEFT JOIN "CampaignRuleVersion" AS version
      ON version."id" = record."ruleVersionId" AND version."runId" = record."runId"
    WHERE record."ruleVersionId" IS NOT NULL AND version."id" IS NULL
  ) OR EXISTS (
    SELECT 1 FROM "PackOpeningBatch" AS record
    LEFT JOIN "CampaignRuleVersion" AS version
      ON version."id" = record."ruleVersionId" AND version."runId" = record."runId"
    WHERE record."ruleVersionId" IS NOT NULL AND version."id" IS NULL
  ) OR EXISTS (
    SELECT 1 FROM "PackOpening" AS opening
    LEFT JOIN "CustomPackVersion" AS version ON version."id" = opening."customPackVersionId"
    LEFT JOIN "CustomPackDefinition" AS definition
      ON definition."id" = version."definitionId" AND definition."runId" = opening."runId"
    WHERE opening."customPackVersionId" IS NOT NULL AND definition."id" IS NULL
  ) OR EXISTS (
    SELECT 1 FROM "CustomPackVersion" AS version
    LEFT JOIN "CardSet" AS card_set ON card_set."id" = version."generatedSetId"
    WHERE version."generatedSetId" IS NOT NULL AND card_set."id" IS NULL
  ) OR EXISTS (
    SELECT 1 FROM "CustomPackCardPoolEntry" AS entry
    LEFT JOIN "SetCard" AS printing
      ON printing."id" = entry."setCardId" AND printing."cardId" = entry."cardId"
    WHERE entry."setCardId" IS NOT NULL AND printing."id" IS NULL
  ) OR EXISTS (
    SELECT 1 FROM "CampaignRuleVersion"
    WHERE "status" = 'ACTIVE'::"CampaignRuleVersionStatus"
    GROUP BY "runId" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'audit_integrity_hardening preflight failed: invalid legacy references remain';
  END IF;
END $$;

CREATE UNIQUE INDEX "CampaignRuleVersion_one_active_per_run_key"
  ON "CampaignRuleVersion"("runId")
  WHERE "status" = 'ACTIVE'::"CampaignRuleVersionStatus";

CREATE INDEX "RewardGrant_ruleVersionId_idx" ON "RewardGrant"("ruleVersionId");
CREATE INDEX "RunProgressionCheckpoint_ruleVersionId_idx" ON "RunProgressionCheckpoint"("ruleVersionId");
CREATE INDEX "Tournament_ruleVersionId_idx" ON "Tournament"("ruleVersionId");
CREATE INDEX "PackOpening_ruleVersionId_idx" ON "PackOpening"("ruleVersionId");
CREATE INDEX "PackOpening_customPackVersionId_idx" ON "PackOpening"("customPackVersionId");
CREATE INDEX "PackOpeningBatch_ruleVersionId_idx" ON "PackOpeningBatch"("ruleVersionId");
CREATE INDEX "CampaignRuleVersion_effectiveCheckpointId_idx" ON "CampaignRuleVersion"("effectiveCheckpointId");
CREATE INDEX "CustomPackVersion_generatedSetId_idx" ON "CustomPackVersion"("generatedSetId");
CREATE INDEX "CustomPackCardPoolEntry_setCardId_idx" ON "CustomPackCardPoolEntry"("setCardId");

ALTER TABLE "RewardGrant"
  ADD CONSTRAINT "RewardGrant_ruleVersionId_fkey"
  FOREIGN KEY ("ruleVersionId") REFERENCES "CampaignRuleVersion"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RunProgressionCheckpoint"
  ADD CONSTRAINT "RunProgressionCheckpoint_ruleVersionId_fkey"
  FOREIGN KEY ("ruleVersionId") REFERENCES "CampaignRuleVersion"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Tournament"
  ADD CONSTRAINT "Tournament_ruleVersionId_fkey"
  FOREIGN KEY ("ruleVersionId") REFERENCES "CampaignRuleVersion"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PackOpening"
  ADD CONSTRAINT "PackOpening_ruleVersionId_fkey"
  FOREIGN KEY ("ruleVersionId") REFERENCES "CampaignRuleVersion"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PackOpening"
  ADD CONSTRAINT "PackOpening_customPackVersionId_fkey"
  FOREIGN KEY ("customPackVersionId") REFERENCES "CustomPackVersion"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PackOpeningBatch"
  ADD CONSTRAINT "PackOpeningBatch_ruleVersionId_fkey"
  FOREIGN KEY ("ruleVersionId") REFERENCES "CampaignRuleVersion"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CampaignRuleVersion"
  ADD CONSTRAINT "CampaignRuleVersion_effectiveCheckpointId_fkey"
  FOREIGN KEY ("effectiveCheckpointId") REFERENCES "RunProgressionCheckpoint"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomPackVersion"
  ADD CONSTRAINT "CustomPackVersion_generatedSetId_fkey"
  FOREIGN KEY ("generatedSetId") REFERENCES "CardSet"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CustomPackCardPoolEntry"
  ADD CONSTRAINT "CustomPackCardPoolEntry_setCardId_fkey"
  FOREIGN KEY ("setCardId") REFERENCES "SetCard"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
