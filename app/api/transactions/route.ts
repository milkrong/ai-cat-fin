import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/src/lib/db";
import { ApiError, jsonError } from "@/src/lib/api";
import { z } from "zod";

export const runtime = "nodejs";

const transactionBodySchema = z.object({
  occurredAt: z.string().datetime(),
  description: z.string().trim().min(1).max(300),
  merchant: z.string().trim().max(200).optional().nullable(),
  amount: z.coerce.number().finite(),
  currency: z.string().trim().min(3).max(8).default("CNY"),
  category: z.string().trim().max(80).optional().nullable(),
});

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) throw new ApiError(401, "unauthorized");

    const body = await req.json().catch(() => ({}));
    const data = transactionBodySchema.parse(body);
    const tx = await prisma.transaction.create({
      data: {
        userId,
        occurredAt: new Date(data.occurredAt),
        description: data.description,
        merchant: data.merchant || null,
        amount: data.amount,
        currency: data.currency.toUpperCase(),
        category: data.category || null,
        categoryScore: null,
        raw: { source: "manual" },
      },
    });

    return Response.json({
      transaction: {
        ...tx,
        amount: Number(tx.amount),
        occurredAt: tx.occurredAt.toISOString(),
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}
