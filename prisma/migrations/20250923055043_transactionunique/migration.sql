/*
  Warnings:

  - You are about to alter the column `amount` on the `DraftTransaction` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(18,2)`.
  - You are about to alter the column `amount` on the `Transaction` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(18,2)`.
  - A unique constraint covering the columns `[jobId,occurredAt,description,amount]` on the table `DraftTransaction` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "public"."DraftTransaction" DROP CONSTRAINT "DraftTransaction_jobId_fkey";

-- AlterTable
ALTER TABLE "public"."DraftTransaction" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "public"."Transaction" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2);

-- CreateIndex
CREATE UNIQUE INDEX "DraftTransaction_jobId_occurredAt_description_amount_key" ON "public"."DraftTransaction"("jobId", "occurredAt", "description", "amount");

-- CreateIndex
CREATE INDEX "ImportJob_userId_createdAt_idx" ON "public"."ImportJob"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_userId_category_idx" ON "public"."Transaction"("userId", "category");

-- AddForeignKey
ALTER TABLE "public"."DraftTransaction" ADD CONSTRAINT "DraftTransaction_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."ImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
