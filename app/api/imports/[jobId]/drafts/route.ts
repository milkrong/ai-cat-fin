import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/src/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  const params = await context.params;
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const jobId = params.jobId;
  const job = await prisma.importJob.findFirst({
    where: { id: jobId, userId },
  });
  if (!job) return new Response("Not found", { status: 404 });

  const drafts = await prisma.draftTransaction.findMany({
    where: { jobId },
    orderBy: { occurredAt: "asc" },
  });
  return Response.json({ job: { id: job.id, status: job.status }, drafts });
}
