import { db } from "@/db";
import { installmentPlans, categories, expenses } from "@/db/schema";
import { requireUser, jsonOk, jsonError, AuthError } from "@/lib/auth";
import { eq, desc, sql } from "drizzle-orm";

export async function GET() {
  try {
    await requireUser();
    const plans = await db
      .select({
        id: installmentPlans.id,
        description: installmentPlans.description,
        categoryId: installmentPlans.categoryId,
        categoryName: categories.name,
        installmentAmountCents: installmentPlans.installmentAmountCents,
        totalInstallments: installmentPlans.totalInstallments,
        firstDueDate: installmentPlans.firstDueDate,
        status: installmentPlans.status,
        notes: installmentPlans.notes,
      })
      .from(installmentPlans)
      .leftJoin(categories, eq(categories.id, installmentPlans.categoryId))
      .orderBy(desc(installmentPlans.id));

    const stats = await db
      .select({
        planId: expenses.installmentPlanId,
        paid: sql<number>`count(*) filter (where ${expenses.status} = 'paid')`,
        total: sql<number>`count(*)`,
        remainingCents: sql<number>`coalesce(sum(case when ${expenses.status} = 'pending' then ${expenses.amountCents} else 0 end),0)`,
        nextDue: sql<string | null>`min(case when ${expenses.status} = 'pending' then ${expenses.dueDate} end)`,
      })
      .from(expenses)
      .groupBy(expenses.installmentPlanId);

    const map = new Map(stats.map((s) => [s.planId, s]));
    return jsonOk(
      plans.map((p) => {
        const s = map.get(p.id);
        const paid = Number(s?.paid || 0);
        return {
          ...p,
          installmentAmountCents: Number(p.installmentAmountCents),
          paidCount: paid,
          remainingCount: p.totalInstallments - paid,
          remainingCents: Number(s?.remainingCents || 0),
          nextDue: s?.nextDue || null,
        };
      })
    );
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    throw e;
  }
}
