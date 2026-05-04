import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/src/lib/db";
import { ApiError, idParam, jsonError } from "@/src/lib/api";

export const runtime = "nodejs";

export async function DELETE(
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
      select: { id: true },
    });
    if (!job) throw new ApiError(404, "not_found");

    await prisma.importJob.delete({ where: { id: jobId } });
    return Response.json({ deleted: true });
  } catch (e) {
    return jsonError(e);
  }
}
