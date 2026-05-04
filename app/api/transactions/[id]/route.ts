import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/src/lib/db";
import { ApiError, idParam, jsonError } from "@/src/lib/api";
import { z } from "zod";

export const runtime = "nodejs";

const transactionPatchSchema = z.object({
  occurredAt: z.string().datetime().optional(),
  description: z.string().trim().min(1).max(300).optional(),
  merchant: z.string().trim().max(200).optional().nullable(),
  amount: z.coerce.number().finite().optional(),
  currency: z.string().trim().min(3).max(8).optional(),
  category: z.string().trim().max(80).optional().nullable(),
});

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const { userId } = await auth();
    if (!userId) throw new ApiError(401, "unauthorized");

    const parsedId = idParam.safeParse(params.id);
    if (!parsedId.success) throw new ApiError(400, "invalid_transaction_id");

    const existing = await prisma.transaction.findFirst({
      where: { id: parsedId.data, userId },
      select: { id: true },
    });
    if (!existing) throw new ApiError(404, "not_found");

    const body = await req.json().catch(() => ({}));
    const data = transactionPatchSchema.parse(body);
    const tx = await prisma.transaction.update({
      where: { id: parsedId.data },
      data: {
        ...(data.occurredAt ? { occurredAt: new Date(data.occurredAt) } : {}),
        ...(data.description !== undefined
          ? { description: data.description }
          : {}),
        ...(data.merchant !== undefined ? { merchant: data.merchant || null } : {}),
        ...(data.amount !== undefined ? { amount: data.amount } : {}),
        ...(data.currency !== undefined
          ? { currency: data.currency.toUpperCase() }
          : {}),
        ...(data.category !== undefined ? { category: data.category || null } : {}),
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

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const { userId } = await auth();
    if (!userId) throw new ApiError(401, "unauthorized");

    const parsedId = idParam.safeParse(params.id);
    if (!parsedId.success) throw new ApiError(400, "invalid_transaction_id");

    const existing = await prisma.transaction.findFirst({
      where: { id: parsedId.data, userId },
      select: { id: true },
    });
    if (!existing) throw new ApiError(404, "not_found");

    await prisma.transaction.delete({ where: { id: parsedId.data } });
    return Response.json({ deleted: true });
  } catch (e) {
    return jsonError(e);
  }
}
