import { db } from "@/db";
import { recurringRules, categories, expenses } from "@/db/schema";
import { requireUser, jsonOk, jsonError, AuthError } from "@/lib/auth";
import { eq, desc, sql } from "drizzle-orm";
import { ensureRecurringCompetences } from "@/lib/ensure";

export async function GET() {
  try {
    await requireUser();
    await ensureRecurringCompetences(3);
    const rules = await db
      .select({
        id: recurringRules.id,
        description: recurringRules.description,
        categoryId: recurringRules.categoryId,
        categoryName: categories.name,
        amountCents: recurringRules.amountCents,
        dueDay: recurringRules.dueDay,
        startDate: recurringRules.startDate,
        endDate: recurringRules.endDate,
        status: recurringRules.status,
        notes: recurringRules.notes,
      })
      .from(recurringRules)
      .leftJoin(categories, eq(categories.id, recurringRules.categoryId))
      .orderBy(desc(recurringRules.id));

    // próxima competência em aberto por regra
    const open = await db
      .select({
        ruleId: expenses.recurringRuleId,
        count: sql<number>`count(*)`,
        nextDue: sql<string | null>`min(${expenses.dueDate})`,
      })
      .from(expenses)
      .where(eq(expenses.status, "pending"))
      .groupBy(expenses.recurringRuleId);

    const openMap = new Map(open.map((o) => [o.ruleId, o]));
    return jsonOk(
      rules.map((r) => ({
        ...r,
        amountCents: Number(r.amountCents),
        openInfo: openMap.get(r.id) || null,
      }))
    );
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    throw e;
  }
}
