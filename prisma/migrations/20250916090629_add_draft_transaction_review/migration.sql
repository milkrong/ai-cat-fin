-- AlterEnum
ALTER TYPE "public"."ImportStatus" ADD VALUE 'REVIEW';

-- CreateTable
CREATE TABLE "public"."DraftTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "merchant" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "raw" JSONB,
    "category" TEXT,
    "categoryScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DraftTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DraftTransaction_jobId_idx" ON "public"."DraftTransaction"("jobId");

-- CreateIndex
CREATE INDEX "DraftTransaction_userId_occurredAt_idx" ON "public"."DraftTransaction"("userId", "occurredAt");

-- AddForeignKey
ALTER TABLE "public"."DraftTransaction" ADD CONSTRAINT "DraftTransaction_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."ImportJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
