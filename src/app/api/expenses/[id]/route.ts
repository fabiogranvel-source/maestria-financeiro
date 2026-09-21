import { db } from "@/db";
import { expenses, cashTransactions } from "@/db/schema";
import { requireUser, jsonOk, jsonError, AuthError, audit } from "@/lib/auth";
import { eq, and } from "drizzle-orm";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const eid = Number(id);
    const body = await req.json().catch(() => ({}));
    const cur = await db.select().from(expenses).where(eq(expenses.id, eid)).limit(1);
    if (cur.length === 0) return jsonError("Despesa não encontrada.", 404);
    const e = cur[0];

    const patch: Record<string, unknown> = { updatedAt: new Date(), updatedBy: user.id };
    if (body.description !== undefined) patch.description = String(body.description);
    if (body.categoryId !== undefined) patch.categoryId = body.categoryId ? Number(body.categoryId) : null;
    if (body.amountCents !== undefined) {
      const v = Math.round(Number(body.amountCents));
      if (!Number.isFinite(v) || v <= 0) return jsonError("Valor deve ser maior que zero.");
      patch.amountCents = v;
    }
    if (body.dueDate !== undefined) {
      patch.dueDate = body.dueDate ? String(body.dueDate).slice(0, 10) : null;
      patch.competence = body.dueDate ? String(body.dueDate).slice(0, 7) : e.competence;
    }
    if (body.notes !== undefined) patch.notes = body.notes ? String(body.notes) : null;

    await db.transaction(async (tx) => {
      await tx.update(expenses).set(patch).where(eq(expenses.id, eid));
      if (e.status === "paid") {
        const cashPatch: Record<string, unknown> = {};
        if (patch.amountCents !== undefined) cashPatch.amountCents = patch.amountCents;
        if (patch.description !== undefined) cashPatch.description = String(patch.description);
        if (patch.categoryId !== undefined) cashPatch.categoryId = patch.categoryId;
        if (Object.keys(cashPatch).length > 0) {
          await tx
            .update(cashTransactions)
            .set(cashPatch)
            .where(
              and(
                eq(cashTransactions.sourceType, "expense"),
                eq(cashTransactions.sourceId, eid),
                eq(cashTransactions.reversed, false)
              )
            );
        }
      }
    });
    await audit(user.id, "update", "expense", eid, patch);
    return jsonOk({ id: eid });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    throw e;
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const eid = Number(id);
    const body = await req.json().catch(() => ({}));
    const cur = await db.select().from(expenses).where(eq(expenses.id, eid)).limit(1);
    if (cur.length === 0) return jsonError("Despesa não encontrada.", 404);
    const e = cur[0];
    if (e.status === "paid") {
      const reason = String(body.reason || "Estorno");
      await db.transaction(async (tx) => {
        await tx
          .update(expenses)
          .set({ status: "cancelled", updatedAt: new Date(), updatedBy: user.id })
          .where(eq(expenses.id, eid));
        const entries = await tx
          .select()
          .from(cashTransactions)
          .where(and(eq(cashTransactions.sourceType, "expense"), eq(cashTransactions.sourceId, eid)));
        for (const c of entries) {
          await tx
            .update(cashTransactions)
            .set({ reversed: true, reversalReason: reason })
            .where(eq(cashTransactions.id, c.id));
        }
        await tx
          .insert(cashTransactions)
          .values({
            type: "entry",
            amountCents: Number(e.amountCents),
            occurredAt: e.paidAt || String(new Date().toISOString()).slice(0, 10),
            description: `Estorno de despesa #${eid}`,
            sourceType: "expense",
            sourceId: eid,
            idempotencyKey: `cash:expense-reversal:${eid}`,
            createdBy: user.id,
            notes: reason,
          })
          .onConflictDoNothing({ target: cashTransactions.idempotencyKey });
      });
      await audit(user.id, "reverse", "expense", eid, { reason });
    } else {
      await db
        .update(expenses)
        .set({ status: "cancelled", deletedAt: new Date(), updatedBy: user.id })
        .where(eq(expenses.id, eid));
      await audit(user.id, "cancel", "expense", eid);
    }
    return jsonOk({ id: eid });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    throw e;
  }
}
