-- AlterTable
ALTER TABLE "public"."ImportJob" ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "warning" TEXT;

-- CreateTable
CREATE TABLE "public"."ImportFile" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ImportFile_jobId_key" ON "public"."ImportFile"("jobId");

-- CreateIndex
CREATE INDEX "ImportFile_userId_createdAt_idx" ON "public"."ImportFile"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."ImportFile" ADD CONSTRAINT "ImportFile_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."ImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
