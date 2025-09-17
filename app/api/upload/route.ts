import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/src/lib/db";
import { inngest } from "@/src/lib/inngest";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return new Response("Expect multipart/form-data", { status: 400 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return new Response("file is required", { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  const job = await prisma.importJob.create({
    data: { userId, filename: file.name, status: "PENDING" },
  });

  const lower = file.name.toLowerCase();
  const isExcel = /\.(xlsx|xls|csv)$/.test(lower);
  await inngest.send({
    name: isExcel ? "excel/ingested" : "pdf/ingested",
    data: { userId, jobId: job.id, filename: file.name, fileBuffer: base64 },
  });

  return Response.json({ jobId: job.id });
}
