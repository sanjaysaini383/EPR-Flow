-- DropForeignKey
ALTER TABLE "Report" DROP CONSTRAINT "Report_fileId_fkey";

-- AlterTable
ALTER TABLE "Deadline" ADD COLUMN     "completedById" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "dedupeKey" TEXT,
ADD COLUMN     "reminderDays" INTEGER[] DEFAULT ARRAY[30, 7, 1]::INTEGER[],
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Reminder" ADD COLUMN     "offsetDays" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "fileName" TEXT NOT NULL,
ADD COLUMN     "sha256" TEXT NOT NULL,
ADD COLUMN     "sizeBytes" INTEGER NOT NULL,
ALTER COLUMN "fileId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Deadline_organizationId_dedupeKey_key" ON "Deadline"("organizationId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "Reminder_deadlineId_channel_recipient_offsetDays_key" ON "Reminder"("deadlineId", "channel", "recipient", "offsetDays");

-- CreateIndex
CREATE INDEX "Report_organizationId_createdAt_idx" ON "Report"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
