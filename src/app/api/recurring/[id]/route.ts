import { db } from "@/db";
import { recurringRules, expenses } from "@/db/schema";
import { requireUser, jsonOk, jsonError, AuthError, audit } from "@/lib/auth";
import { eq, and, gte, sql } from "drizzle-orm";

// PUT: editar regra. scope: "single" (só competência) | "forward" (desta em diante) | "rule" (padrão futuro)
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const rid = Number(id);
    const body = await req.json().catch(() => ({}));
    const scope = String(body.scope || "forward");
    const fromCompetence: string | null = body.fromCompetence || null; // YYYY-MM

    const cur = await db.select().from(recurringRules).where(eq(recurringRules.id, rid)).limit(1);
    if (cur.length === 0) return jsonError("Regra não encontrada.", 404);

    if (scope === "single" && body.expenseId) {
      // alterar somente esta competência (a expense específica)
      const eid = Number(body.expenseId);
      const patch: Record<string, unknown> = { updatedAt: new Date(), updatedBy: user.id };
      if (body.amountCents !== undefined) {
        const v = Math.round(Number(body.amountCents));
        if (!Number.isFinite(v) || v <= 0) return jsonError("Valor deve ser maior que zero.");
        patch.amountCents = v;
      }
      if (body.dueDate) {
        patch.dueDate = String(body.dueDate).slice(0, 10);
        patch.competence = String(body.dueDate).slice(0, 7);
      }
      await db.update(expenses).set(patch).where(eq(expenses.id, eid));
      await audit(user.id, "update_single", "recurring_competence", eid, patch);
      return jsonOk({ id: rid, scope });
    }

    // forward ou rule: atualiza regra + competências futuras pendentes (nunca retroativo)
    const rulePatch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.description !== undefined) rulePatch.description = String(body.description);
    if (body.categoryId !== undefined) rulePatch.categoryId = body.categoryId ? Number(body.categoryId) : null;
    if (body.amountCents !== undefined) {
      const v = Math.round(Number(body.amountCents));
      if (!Number.isFinite(v) || v <= 0) return jsonError("Valor deve ser maior que zero.");
      rulePatch.amountCents = v;
    }
    if (body.dueDay !== undefined) rulePatch.dueDay = Number(body.dueDay);
    if (body.endDate !== undefined) rulePatch.endDate = body.endDate ? String(body.endDate).slice(0, 10) : null;
    if (body.status !== undefined) rulePatch.status = String(body.status);
    if (body.notes !== undefined) rulePatch.notes = body.notes ? String(body.notes) : null;
    await db.update(recurringRules).set(rulePatch).where(eq(recurringRules.id, rid));

    if (scope === "forward" && (rulePatch.amountCents !== undefined || rulePatch.description !== undefined)) {
      // atualiza competências pendentes >= fromCompetence (ou todas futuras pendentes)
      const conditions = [eq(expenses.recurringRuleId, rid), eq(expenses.status, "pending")];
      if (fromCompetence) {
        conditions.push(gte(expenses.competence, fromCompetence));
      } else {
        const todayComp = new Date().toISOString().slice(0, 7);
        conditions.push(gte(expenses.competence, todayComp));
      }
      const expPatch: Record<string, unknown> = { updatedAt: new Date(), updatedBy: user.id };
      if (rulePatch.amountCents !== undefined) expPatch.amountCents = rulePatch.amountCents;
      if (rulePatch.description !== undefined) expPatch.description = rulePatch.description;
      if (rulePatch.categoryId !== undefined) expPatch.categoryId = rulePatch.categoryId;
      await db.update(expenses).set(expPatch).where(and(...conditions));
    }
    await audit(user.id, "update", "recurring_rule", rid, { scope, rulePatch });
    return jsonOk({ id: rid, scope });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    throw e;
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const rid = Number(id);
    const body = await req.json().catch(() => ({}));
    const deleteFuture = body.deleteFuture !== false; // padrão: remove futuras pendentes
    await db.transaction(async (tx) => {
      await tx
        .update(recurringRules)
        .set({ status: "closed", endDate: String(new Date().toISOString()).slice(0, 10), updatedAt: new Date() })
        .where(eq(recurringRules.id, rid));
      if (deleteFuture) {
        const todayComp = new Date().toISOString().slice(0, 7);
        await tx
          .update(expenses)
          .set({ status: "cancelled", deletedAt: new Date() })
          .where(
            and(
              eq(expenses.recurringRuleId, rid),
              eq(expenses.status, "pending"),
              gte(expenses.competence, todayComp)
            )
          );
      }
    });
    await audit(user.id, "close", "recurring_rule", rid);
    return jsonOk({ id: rid });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    throw e;
  }
}
