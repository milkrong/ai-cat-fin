import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/src/lib/db";
import { inngest } from "@/src/lib/inngest";
import { ApiError, jsonError } from "@/src/lib/api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) throw new ApiError(401, "unauthorized");

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      throw new ApiError(400, "invalid_content_type");
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new ApiError(400, "file_missing");
    }

    // Basic validation
    const MAX_BYTES = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_BYTES) throw new ApiError(413, "file_too_large");

    const lower = file.name.toLowerCase();
    const isExcel = /\.(xlsx|xls|csv)$/.test(lower);
    const isPdf = /\.pdf$/.test(lower);
    if (!isExcel && !isPdf) throw new ApiError(400, "unsupported_file_type");

    // (Optional) MIME sniff minimal (best effort)
    // Skipped due to Next.js routing constraints; could use file.slice & signature inspection.

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString("base64");

    const job = await prisma.importJob.create({
      data: { userId, filename: file.name, status: "PENDING" },
    });

    // Persist original file (raw bytes) for retry
    await prisma.importFile.create({
      data: {
        jobId: job.id,
        userId,
        mimeType: isPdf ? "application/pdf" : "application/vnd.ms-excel",
        size: buffer.length,
        data: buffer,
      },
    });

    await inngest.send({
      name: isExcel ? "excel/ingested" : "pdf/ingested",
      data: { userId, jobId: job.id, filename: file.name, fileBuffer: base64 },
    });

    return Response.json({ jobId: job.id });
  } catch (e) {
    return jsonError(e);
  }
}
