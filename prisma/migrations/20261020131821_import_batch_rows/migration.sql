/*
  Warnings:

  - Added the required column `fileName` to the `ImportBatch` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fileSha256` to the `ImportBatch` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "ImportBatch" DROP CONSTRAINT "ImportBatch_fileId_fkey";

-- AlterTable
ALTER TABLE "ImportBatch" ADD COLUMN     "fileName" TEXT NOT NULL,
ADD COLUMN     "fileSha256" TEXT NOT NULL,
ADD COLUMN     "rows" JSONB,
ALTER COLUMN "fileId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
