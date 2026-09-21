import { db } from "@/db";
import { expenses, receivables, projectCosts } from "@/db/schema";
import { requireUser, jsonOk, jsonError, AuthError } from "@/lib/auth";
import { and, eq, gte, sql, ne, isNull } from "drizzle-orm";
import { todayISO, shiftMonth, competenceRange } from "@/lib/format";
import { ensureRecurringCompetences } from "@/lib/ensure";

// Próximos N meses: comprometido (contas pendentes com vencimento) + a receber previsto
export async function GET(req: Request) {
  try {
    await requireUser();
    await ensureRecurringCompetences(6);
    const { searchParams } = new URL(req.url);
    const months = Math.min(12, Math.max(3, Number(searchParams.get("months") || 6)));
    const base = todayISO().slice(0, 7);
    const out: {
      month: string;
      expensesCents: number;
      costsCents: number;
      totalOutCents: number;
      receivableCents: number;
      netCents: number;
      items: { kind: string; description: string; amountCents: number; dueDate: string | null }[];
    }[] = [];

    for (let i = 0; i < months; i++) {
      const m = shiftMonth(base, i);
      const { start, end } = competenceRange(m);

      const exps = await db
        .select({ description: expenses.description, amountCents: expenses.amountCents, dueDate: expenses.dueDate, kind: expenses.kind })
        .from(expenses)
        .where(
          and(
            eq(expenses.status, "pending"),
            gte(expenses.dueDate, start),
            sql`${expenses.dueDate} <= ${end}`,
            isNull(expenses.deletedAt)
          )
        );
      const costs = await db
        .select({ description: projectCosts.description, amountCents: projectCosts.amountCents, dueDate: projectCosts.dueDate })
        .from(projectCosts)
        .where(
          and(
            eq(projectCosts.status, "pending"),
            gte(projectCosts.dueDate, start),
            sql`${projectCosts.dueDate} <= ${end}`,
            isNull(projectCosts.deletedAt)
          )
        );
      const recs = await db
        .select({ amountCents: sql<number>`${receivables.amountCents} - ${receivables.receivedCents}` })
        .from(receivables)
        .where(
          and(
            ne(receivables.status, "received"),
            ne(receivables.status, "cancelled"),
            gte(receivables.dueDate, start),
            sql`${receivables.dueDate} <= ${end}`
          )
        );

      const eC = exps.reduce((s, x) => s + Number(x.amountCents), 0);
      const cC = costs.reduce((s, x) => s + Number(x.amountCents), 0);
      const rC = recs.reduce((s, x) => s + Number(x.amountCents), 0);
      out.push({
        month: m,
        expensesCents: eC,
        costsCents: cC,
        totalOutCents: eC + cC,
        receivableCents: rC,
        netCents: rC - eC - cC,
        items: [
          ...exps.map((x) => ({ kind: `Despesa ${x.kind}`, description: x.description, amountCents: Number(x.amountCents), dueDate: x.dueDate })),
          ...costs.map((x) => ({ kind: "Custo de obra", description: x.description, amountCents: Number(x.amountCents), dueDate: x.dueDate })),
        ].sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || "")),
      });
    }
    return jsonOk(out);
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    throw e;
  }
}
