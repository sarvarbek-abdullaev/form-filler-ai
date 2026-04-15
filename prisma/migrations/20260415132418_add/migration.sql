-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "fileId" TEXT,
ADD COLUMN     "status" "TransactionStatus" NOT NULL DEFAULT 'APPROVED';
