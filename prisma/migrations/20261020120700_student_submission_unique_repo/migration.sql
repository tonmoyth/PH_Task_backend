-- DropIndex
DROP INDEX IF EXISTS "Submission_repoUrlNormalized_key";

-- CreateIndex
CREATE UNIQUE INDEX "Submission_studentId_repoUrlNormalized_key" ON "Submission"("studentId", "repoUrlNormalized");
