import { inngest } from "@/src/lib/inngest";
import { prisma } from "@/src/lib/db";
import { ImportStatus } from "@prisma/client";

/**
 * Cleanup stale import jobs & their draft transactions.
 * Definition of "stale":
 *  - status IN (PENDING, PROCESSING, REVIEW, FAILED)
 *  - createdAt < now - RETENTION_DAYS
 * By default RETENTION_DAYS = 7 (override via env IMPORT_JOB_REVIEW_RETENTION_DAYS)
 */
export const cleanupStaleImportJobs = inngest.createFunction(
  { id: "cleanup-stale-import-jobs" },
  { cron: "0 * * * *" }, // hourly at minute 0
  async ({ step }) => {
    const days = Number(process.env.IMPORT_JOB_REVIEW_RETENTION_DAYS || 7);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Find stale jobs first (limit to batches to avoid huge deletions at once)
    const staleJobs = await prisma.importJob.findMany({
      where: {
        status: {
          in: [
            ImportStatus.PENDING,
            ImportStatus.PROCESSING,
            ImportStatus.REVIEW,
            ImportStatus.FAILED,
          ],
        },
        createdAt: { lt: cutoff },
      },
      select: { id: true },
      take: 500, // safety limit
    });

    if (staleJobs.length === 0) {
      return { deletedJobs: 0, deletedDrafts: 0, cutoff: cutoff.toISOString() };
    }

    const ids = staleJobs.map((j) => j.id);

    // Delete draft transactions referencing these jobs
    const draftDelete = await prisma.draftTransaction.deleteMany({
      where: { jobId: { in: ids } },
    });
    // Delete the jobs themselves
    const jobDelete = await prisma.importJob.deleteMany({
      where: { id: { in: ids } },
    });

    return {
      deletedJobs: jobDelete.count,
      deletedDrafts: draftDelete.count,
      batch: ids.length,
      cutoff: cutoff.toISOString(),
      retentionDays: days,
    };
  }
);
