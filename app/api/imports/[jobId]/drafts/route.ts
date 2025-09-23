import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/src/lib/db";
import { idParam, jsonError, ApiError } from "@/src/lib/api";

export const runtime = "nodejs";

export async function GET(
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

    const drafts = await prisma.draftTransaction.findMany({
      where: { jobId },
      orderBy: { occurredAt: "asc" },
    });
    return Response.json({ job: { id: job.id, status: job.status }, drafts });
  } catch (e) {
    return jsonError(e);
  }
}
