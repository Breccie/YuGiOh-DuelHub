ALTER TABLE "PlayGroupRun" ADD COLUMN "inviteCode" TEXT;
CREATE UNIQUE INDEX "PlayGroupRun_inviteCode_key" ON "PlayGroupRun"("inviteCode");
