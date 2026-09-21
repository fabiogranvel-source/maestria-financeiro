import { db } from "@/db";
import { categories, settings, users } from "@/db/schema";
import { DEFAULT_CATEGORIES } from "./constants";
import bcrypt from "bcryptjs";

export async function ensureSeed() {
  // settings singleton
  const s = await db.select().from(settings).limit(1);
  if (s.length === 0) {
    await db.insert(settings).values({ companyName: "Maestria", openingBalanceCents: 0 });
  }
  // categories
  const existing = await db.select().from(categories);
  const have = new Set(existing.map((c) => c.name.toLowerCase()));
  for (const name of DEFAULT_CATEGORIES) {
    if (!have.has(name.toLowerCase())) {
      await db.insert(categories).values({ name, kind: "both" });
    }
  }
  // admin default se não houver usuários
  const us = await db.select().from(users).limit(1);
  if (us.length === 0) {
    const hash = await bcrypt.hash("maestria123", 10);
    await db.insert(users).values({
      name: "Administrador",
      email: "admin@maestria.local",
      passwordHash: hash,
      role: "admin",
    });
  }
}

export async function ensureRecurringCompetences(uptoMonthsAhead = 3) {
  // Gera competências futuras de regras recorrentes ativas (idempotente por rule+competence)
  const { recurringRules, expenses } = await import("@/db/schema");
  const { eq, and } = await import("drizzle-orm");
  const rules = await db.select().from(recurringRules).where(eq(recurringRules.status, "active"));
  const now = new Date();
  for (const r of rules) {
    const start = new Date(r.startDate + "T12:00:00Z");
    const end = r.endDate ? new Date(r.endDate + "T12:00:00Z") : null;
    // gerar do mês do start até hoje+uptoMonthsAhead
    const limit = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + uptoMonthsAhead + 1, 0));
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    const limitM = new Date(Date.UTC(limit.getUTCFullYear(), limit.getUTCMonth(), 1));
    while (cursor <= limitM) {
      const y = cursor.getUTCFullYear();
      const m = cursor.getUTCMonth() + 1;
      const comp = `${y}-${String(m).padStart(2, "0")}`;
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const day = Math.min(r.dueDay || 10, lastDay);
      const due = `${comp}-${String(day).padStart(2, "0")}`;
      const dueD = new Date(due + "T12:00:00Z");
      const beforeStart = dueD < new Date(r.startDate + "T12:00:00Z") && comp < r.startDate.slice(0, 7);
      const afterEnd = end ? dueD > end : false;
      if (!beforeStart && !afterEnd) {
        const found = await db
          .select({ id: expenses.id })
          .from(expenses)
          .where(and(eq(expenses.recurringRuleId, r.id), eq(expenses.competence, comp)))
          .limit(1);
        if (found.length === 0) {
          await db.insert(expenses).values({
            description: r.description,
            categoryId: r.categoryId,
            kind: "recurring",
            amountCents: r.amountCents,
            status: "pending",
            dueDate: due,
            competence: comp,
            recurringRuleId: r.id,
            notes: r.notes,
          });
        }
      }
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }
}
