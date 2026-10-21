-- AlterTable
ALTER TABLE "Certificate" ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedById" TEXT,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "submittedById" TEXT;

-- CreateTable
CREATE TABLE "StoredFileContent" (
    "fileId" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,

    CONSTRAINT "StoredFileContent_pkey" PRIMARY KEY ("fileId")
);

-- AddForeignKey
ALTER TABLE "StoredFileContent" ADD CONSTRAINT "StoredFileContent_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "StoredFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
