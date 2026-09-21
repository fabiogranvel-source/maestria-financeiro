import { db } from "@/db";
import { projectCosts, cashTransactions, projects } from "@/db/schema";
import { requireUser, jsonOk, jsonError, AuthError, audit } from "@/lib/auth";
import { eq, and } from "drizzle-orm";

// PUT: editar (atualiza caixa correspondente, sem duplicar) | DELETE: soft delete/estorno
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const cid = Number(id);
    const body = await req.json().catch(() => ({}));
    const cur = await db.select().from(projectCosts).where(eq(projectCosts.id, cid)).limit(1);
    if (cur.length === 0) return jsonError("Custo não encontrado.", 404);
    const c = cur[0];

    const patch: Record<string, unknown> = { updatedAt: new Date(), updatedBy: user.id };
    if (body.description !== undefined) patch.description = String(body.description);
    if (body.categoryId !== undefined) patch.categoryId = body.categoryId ? Number(body.categoryId) : null;
    if (body.amountCents !== undefined) {
      const v = Math.round(Number(body.amountCents));
      if (!Number.isFinite(v) || v <= 0) return jsonError("Valor deve ser maior que zero.");
      patch.amountCents = v;
    }
    if (body.dueDate !== undefined) patch.dueDate = body.dueDate ? String(body.dueDate).slice(0, 10) : null;
    if (body.notes !== undefined) patch.notes = body.notes ? String(body.notes) : null;
    if (body.paymentMethod !== undefined) patch.paymentMethod = body.paymentMethod ? String(body.paymentMethod) : null;

    await db.transaction(async (tx) => {
      await tx.update(projectCosts).set(patch).where(eq(projectCosts.id, cid));
      // se já pago, atualizar movimentação de caixa correspondente (sem criar nova)
      if (c.status === "paid") {
        const cashPatch: Record<string, unknown> = {};
        if (patch.amountCents !== undefined) cashPatch.amountCents = patch.amountCents;
        if (patch.description !== undefined || patch.amountCents !== undefined) {
          const proj = await tx.select().from(projects).where(eq(projects.id, c.projectId)).limit(1);
          cashPatch.description = `${String(patch.description ?? c.description)} — ${proj[0]?.title || ""}`.trim();
        }
        if (body.paidAt) cashPatch.occurredAt = String(body.paidAt).slice(0, 10);
        if (patch.paymentMethod !== undefined) cashPatch.method = patch.paymentMethod;
        if (Object.keys(cashPatch).length > 0) {
          await tx
            .update(cashTransactions)
            .set(cashPatch)
            .where(
              and(
                eq(cashTransactions.sourceType, "project_cost"),
                eq(cashTransactions.sourceId, cid),
                eq(cashTransactions.reversed, false)
              )
            );
        }
      }
    });
    await audit(user.id, "update", "project_cost", cid, patch);
    return jsonOk({ id: cid });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    throw e;
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const cid = Number(id);
    const body = await req.json().catch(() => ({}));
    const cur = await db.select().from(projectCosts).where(eq(projectCosts.id, cid)).limit(1);
    if (cur.length === 0) return jsonError("Custo não encontrado.", 404);
    const c = cur[0];
    if (c.status === "paid") {
      // estorno: marca caixa reversed + entrada compensatória, custo -> cancelled
      const reason = String(body.reason || "Estorno");
      await db.transaction(async (tx) => {
        await tx
          .update(projectCosts)
          .set({ status: "cancelled", updatedAt: new Date(), updatedBy: user.id })
          .where(eq(projectCosts.id, cid));
        const entries = await tx
          .select()
          .from(cashTransactions)
          .where(
            and(
              eq(cashTransactions.sourceType, "project_cost"),
              eq(cashTransactions.sourceId, cid)
            )
          );
        for (const e of entries) {
          await tx
            .update(cashTransactions)
            .set({ reversed: true, reversalReason: reason })
            .where(eq(cashTransactions.id, e.id));
        }
        await tx
          .insert(cashTransactions)
          .values({
            type: "entry",
            amountCents: Number(c.amountCents),
            occurredAt: c.paidAt || String(new Date().toISOString()).slice(0, 10),
            description: `Estorno de custo #${cid}`,
            projectId: c.projectId,
            sourceType: "project_cost",
            sourceId: cid,
            idempotencyKey: `cash:cost-reversal:${cid}`,
            createdBy: user.id,
            notes: reason,
          })
          .onConflictDoNothing({ target: cashTransactions.idempotencyKey });
      });
      await audit(user.id, "reverse", "project_cost", cid, { reason });
    } else {
      await db
        .update(projectCosts)
        .set({ status: "cancelled", deletedAt: new Date(), updatedBy: user.id })
        .where(eq(projectCosts.id, cid));
      await audit(user.id, "cancel", "project_cost", cid);
    }
    return jsonOk({ id: cid });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    throw e;
  }
}
