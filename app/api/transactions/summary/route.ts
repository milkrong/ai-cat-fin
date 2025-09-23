import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/src/lib/db";
import { NextResponse } from "next/server";
import { monthParamSchema, jsonError } from "@/src/lib/api";
import {
  startOfMonth,
  endOfMonth,
  parseISO,
  isValid,
  differenceInCalendarDays,
} from "date-fns";

// GET /api/transactions/summary?month=YYYY-MM
export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const rawMonth = searchParams.get("month") || undefined;
    // Validate month param shape if provided
    if (rawMonth !== undefined) {
      monthParamSchema.parse({ month: rawMonth });
    }
    const now = new Date();
    let monthDate: Date;
    if (rawMonth) {
      const parsed = parseISO(rawMonth + "-01");
      monthDate = isValid(parsed) ? parsed : now;
    } else {
      monthDate = now;
    }
    const from = startOfMonth(monthDate);
    const to = endOfMonth(monthDate);

    // Use aggregation: group by day and sum
    // Prisma doesn't support date_trunc cross-dialect uniformly, so we do a raw query for performance.
    // Postgres specific raw SQL.
    const daily = await prisma.$queryRawUnsafe<
      { day: Date; income: number; expense: number; count: bigint }[]
    >(
      `SELECT
        date_trunc('day', "occurredAt")::date AS day,
        SUM(CASE WHEN "amount" > 0 THEN "amount" ELSE 0 END)::double precision AS income,
        SUM(CASE WHEN "amount" < 0 THEN "amount" ELSE 0 END)::double precision AS expense,
        COUNT(*)::bigint as count
      FROM "Transaction"
      WHERE "userId" = $1 AND "occurredAt" >= $2 AND "occurredAt" <= $3
      GROUP BY 1
      ORDER BY 1 ASC`,
      userId,
      from,
      to
    );

    let income = 0;
    let expense = 0; // negative aggregate
    let txCount = 0;
    let hasNegative = false;
    for (const d of daily) {
      income += Number(d.income || 0);
      expense += Number(d.expense || 0);
      txCount += Number(d.count || 0);
      if (Number(d.expense || 0) < 0) hasNegative = true;
    }

    const calendarDays = differenceInCalendarDays(to, from) + 1;
    const activeDays = daily.length || 1;

    const avgIncomePerDay = income / calendarDays;
    const avgExpensePerDay = Math.abs(expense) / calendarDays; // positive
    const avgIncomeActiveDay = income / activeDays;
    const avgExpenseActiveDay = Math.abs(expense) / activeDays;

    // Heuristic: If user data uses positive numbers for expenses (no negatives at all),
    // reinterpret them as expenses so UI matches expectation.
    let signMode: "standard" | "positive-expense" = "standard";
    if (!hasNegative && income > 0 && expense === 0) {
      // Flip semantics: all income -> expense
      signMode = "positive-expense";
      expense = -income; // make it negative aggregate
      // Transform daily entries
      for (const d of daily) {
        d.expense = -d.income; // make negative
        d.income = 0 as any;
      }
      income = 0;
    }

    return NextResponse.json({
      month:
        rawMonth ||
        `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}`,
      income,
      expense, // negative
      expenseAbs: Math.abs(expense),
      net: income + expense,
      txCount,
      days: daily.map((d) => ({
        date: d.day.toISOString().slice(0, 10),
        income: Number(d.income || 0),
        expense: Number(d.expense || 0), // negative
        expenseAbs: Math.abs(Number(d.expense || 0)),
        count: Number(d.count || 0),
      })),
      averages: {
        calendar: { income: avgIncomePerDay, expense: avgExpensePerDay },
        active: { income: avgIncomeActiveDay, expense: avgExpenseActiveDay },
      },
      signMode,
    });
  } catch (e) {
    return jsonError(e);
  }
}
