import { db } from "@/db";
import { cashTransactions, categories, settings } from "@/db/schema";
import { requireUser, jsonOk, jsonError, AuthError } from "@/lib/auth";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { competenceRange, todayISO } from "@/lib/format";

export async function GET(req: Request) {
  try {
    await requireUser();
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month") || todayISO().slice(0, 7);
    const { start, end } = competenceRange(month);

    // saldo anterior = soma de tudo antes do mês (não reversados, líquidos)
    const before = await db
      .select({
        inCents: sql<number>`coalesce(sum(case when ${cashTransactions.type} = 'entry' and ${cashTransactions.reversed} = false then ${cashTransactions.amountCents} else 0 end),0)`,
        outCents: sql<number>`coalesce(sum(case when ${cashTransactions.type} = 'exit' and ${cashTransactions.reversed} = false then ${cashTransactions.amountCents} else 0 end),0)`,
      })
      .from(cashTransactions)
      .where(lte(cashTransactions.occurredAt, start) && sql`${cashTransactions.occurredAt} < ${start}`);

    const inMonth = await db
      .select({
        inCents: sql<number>`coalesce(sum(case when ${cashTransactions.type} = 'entry' and ${cashTransactions.reversed} = false then ${cashTransactions.amountCents} else 0 end),0)`,
        outCents: sql<number>`coalesce(sum(case when ${cashTransactions.type} = 'exit' and ${cashTransactions.reversed} = false then ${cashTransactions.amountCents} else 0 end),0)`,
      })
      .from(cashTransactions)
      .where(and(gte(cashTransactions.occurredAt, start), lte(cashTransactions.occurredAt, end)));

    const rows = await db
      .select({
        id: cashTransactions.id,
        type: cashTransactions.type,
        amountCents: cashTransactions.amountCents,
        occurredAt: cashTransactions.occurredAt,
        description: cashTransactions.description,
        categoryId: cashTransactions.categoryId,
        categoryName: categories.name,
        projectId: cashTransactions.projectId,
        sourceType: cashTransactions.sourceType,
        sourceId: cashTransactions.sourceId,
        method: cashTransactions.method,
        reversed: cashTransactions.reversed,
        notes: cashTransactions.notes,
      })
      .from(cashTransactions)
      .leftJoin(categories, eq(categories.id, cashTransactions.categoryId))
      .where(and(gte(cashTransactions.occurredAt, start), lte(cashTransactions.occurredAt, end)))
      .orderBy(desc(cashTransactions.occurredAt), desc(cashTransactions.id));

    const prevIn = Number(before[0]?.inCents || 0);
    const prevOut = Number(before[0]?.outCents || 0);
    // Como o saldo inicial está lançado como cash entry (opening_balance), ele já entra no cálculo.
    const opening = prevIn - prevOut;
    const entries = Number(inMonth[0]?.inCents || 0);
    const exits = Number(inMonth[0]?.outCents || 0);

    return jsonOk({
      month,
      start,
      end,
      openingCents: opening,
      entriesCents: entries,
      exitsCents: exits,
      balanceCents: opening + entries - exits,
      items: rows
        .filter((r) => !r.reversed)
        .map((r) => ({ ...r, amountCents: Number(r.amountCents) })),
    });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    throw e;
  }
}
