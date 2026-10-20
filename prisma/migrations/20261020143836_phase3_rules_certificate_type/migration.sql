-- CreateEnum
CREATE TYPE "CertificateType" AS ENUM ('RECYCLING', 'END_OF_LIFE');

-- AlterEnum
ALTER TYPE "RuleType" ADD VALUE 'EPR_TARGET';

-- AlterTable
ALTER TABLE "Certificate" ADD COLUMN     "type" "CertificateType" NOT NULL DEFAULT 'RECYCLING';
