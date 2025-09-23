import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/src/lib/db";
import { inngest } from "@/src/lib/inngest";
import { ApiError, idParam, jsonError } from "@/src/lib/api";
import { ImportStatus } from "@prisma/client";

export const runtime = "nodejs";

// POST /api/imports/:jobId/retry
export async function POST(
  _req: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  try {
    const params = await context.params;
    const { userId } = await auth();
    if (!userId) throw new ApiError(401, "unauthorized");
    const parsed = idParam.safeParse(params.jobId);
    if (!parsed.success) throw new ApiError(400, "invalid_job_id");
    const jobId = parsed.data;

    const job = await prisma.importJob.findFirst({
      where: { id: jobId, userId },
    });
    if (!job) throw new ApiError(404, "not_found");
    if (job.status !== ImportStatus.FAILED)
      throw new ApiError(400, "job_not_failed");

    const file = await prisma.importFile.findUnique({ where: { jobId } });
    if (!file) throw new ApiError(409, "missing_original_file");

    // Prevent infinite retries
    if (job.retryCount >= 3) throw new ApiError(429, "retry_limit_reached");

    // Reset job status and increment retry count
    await prisma.importJob.update({
      where: { id: jobId },
      data: {
        status: ImportStatus.PENDING,
        error: null,
        warning: null,
        retryCount: { increment: 1 },
      },
    });

    const isExcel = /\.(xlsx|xls|csv)$/i.test(job.filename);
    await inngest.send({
      name: isExcel ? "excel/ingested" : "pdf/ingested",
      data: {
        userId,
        jobId: job.id,
        filename: job.filename,
        fileBuffer: Buffer.from(file.data).toString("base64"),
        retry: true,
        retryCount: job.retryCount + 1,
      },
    });

    return Response.json({ retried: true, retryCount: job.retryCount + 1 });
  } catch (e) {
    return jsonError(e);
  }
}
