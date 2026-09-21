import { db } from "@/db";
import { expenses, categories, installmentPlans, recurringRules } from "@/db/schema";
import { requireUser, jsonOk, jsonError, AuthError, audit } from "@/lib/auth";
import { validateMoney, validateInstallments } from "@/lib/finance";
import { eq, desc, and, isNull } from "drizzle-orm";
import { ensureRecurringCompetences } from "@/lib/ensure";

export async function GET(req: Request) {
  try {
    await requireUser();
    await ensureRecurringCompetences(3);
    const { searchParams } = new URL(req.url);
    const kind = searchParams.get("kind");
    const status = searchParams.get("status");

    const rows = await db
      .select({
        id: expenses.id,
        description: expenses.description,
        categoryId: expenses.categoryId,
        categoryName: categories.name,
        kind: expenses.kind,
        amountCents: expenses.amountCents,
        status: expenses.status,
        dueDate: expenses.dueDate,
        paidAt: expenses.paidAt,
        paymentMethod: expenses.paymentMethod,
        notes: expenses.notes,
        recurringRuleId: expenses.recurringRuleId,
        installmentPlanId: expenses.installmentPlanId,
        installmentNumber: expenses.installmentNumber,
        competence: expenses.competence,
        createdAt: expenses.createdAt,
      })
      .from(expenses)
      .leftJoin(categories, eq(categories.id, expenses.categoryId))
      .where(isNull(expenses.deletedAt))
      .orderBy(desc(expenses.dueDate), desc(expenses.id));

    let list = rows.map((r) => ({ ...r, amountCents: Number(r.amountCents) }));
    if (kind && kind !== "all") list = list.filter((e) => e.kind === kind);
    if (status && status !== "all") list = list.filter((e) => e.status === status);
    return jsonOk(list);
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    throw e;
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const kind = String(body.kind || "unique");

    if (kind === "unique") {
      const description = String(body.description || "").trim();
      if (!description) return jsonError("Descrição é obrigatória.");
      const amountCents = Math.round(Number(body.amountCents) || 0);
      const err = validateMoney(amountCents, { field: "Valor" });
      if (err) return jsonError(err);
      const dueDate = body.dueDate ? String(body.dueDate).slice(0, 10) : null;
      const [row] = await db
        .insert(expenses)
        .values({
          description,
          categoryId: body.categoryId ? Number(body.categoryId) : null,
          kind: "unique",
          amountCents,
          status: "pending",
          dueDate,
          competence: dueDate ? dueDate.slice(0, 7) : null,
          notes: body.notes ? String(body.notes) : null,
          createdBy: user.id,
        })
        .returning();
      await audit(user.id, "create", "expense", row.id, { kind, amountCents });
      return jsonOk(row, 201);
    }

    if (kind === "recurring") {
      const description = String(body.description || "").trim();
      if (!description) return jsonError("Descrição é obrigatória.");
      const amountCents = Math.round(Number(body.amountCents) || 0);
      const err = validateMoney(amountCents, { field: "Valor" });
      if (err) return jsonError(err);
      const dueDay = Number(body.dueDay) || 10;
      if (dueDay < 1 || dueDay > 31) return jsonError("Dia do vencimento inválido.");
      const startDate = String(body.startDate || "").slice(0, 10);
      if (!startDate) return jsonError("Data inicial é obrigatória.");
      const endDate = body.endDate ? String(body.endDate).slice(0, 10) : null;
      const [rule] = await db
        .insert(recurringRules)
        .values({
          description,
          categoryId: body.categoryId ? Number(body.categoryId) : null,
          amountCents,
          periodicity: "monthly",
          dueDay,
          startDate,
          endDate,
          status: "active",
          notes: body.notes ? String(body.notes) : null,
          createdBy: user.id,
        })
        .returning();
      await ensureRecurringCompetences(3);
      await audit(user.id, "create", "recurring_rule", rule.id, { description, amountCents });
      return jsonOk(rule, 201);
    }

    if (kind === "installment") {
      const description = String(body.description || "").trim();
      if (!description) return jsonError("Descrição é obrigatória.");
      const amountCents = Math.round(Number(body.installmentAmountCents ?? body.amountCents) || 0);
      const err = validateMoney(amountCents, { field: "Valor da parcela" });
      if (err) return jsonError(err);
      const total = Number(body.totalInstallments);
      const verr = validateInstallments(total);
      if (verr) return jsonError(verr);
      const firstDue = String(body.firstDueDate || "").slice(0, 10);
      if (!firstDue) return jsonError("Data da primeira parcela é obrigatória.");

      const plan = await db.transaction(async (tx) => {
        const [p] = await tx
          .insert(installmentPlans)
          .values({
            description,
            categoryId: body.categoryId ? Number(body.categoryId) : null,
            installmentAmountCents: amountCents,
            totalInstallments: total,
            firstDueDate: firstDue,
            periodicity: "monthly",
            notes: body.notes ? String(body.notes) : null,
            status: "active",
            createdBy: user.id,
          })
          .returning();
        // gerar exatamente N parcelas mensais
        const [fy, fm, fd] = firstDue.split("-").map(Number);
        for (let i = 0; i < total; i++) {
          const d = new Date(Date.UTC(fy, fm - 1 + i, 1));
          const y = d.getUTCFullYear();
          const m = d.getUTCMonth() + 1;
          const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
          const day = Math.min(fd, lastDay);
          const due = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          await tx.insert(expenses).values({
            description: `${description} ${i + 1}/${total}`,
            categoryId: body.categoryId ? Number(body.categoryId) : null,
            kind: "installment",
            amountCents,
            status: "pending",
            dueDate: due,
            competence: due.slice(0, 7),
            installmentPlanId: p.id,
            installmentNumber: i + 1,
            notes: body.notes ? String(body.notes) : null,
            createdBy: user.id,
          });
        }
        return p;
      });
      await audit(user.id, "create", "installment_plan", plan.id, { description, amountCents, total });
      return jsonOk(plan, 201);
    }

    return jsonError("Tipo de despesa inválido.");
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    console.error(e);
    return jsonError("Erro ao criar despesa.", 500);
  }
}
