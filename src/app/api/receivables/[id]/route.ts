import { db } from "@/db";
import { receivables } from "@/db/schema";
import { requireUser, jsonOk, jsonError, AuthError, audit } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const rid = Number(id);
    const body = await req.json().catch(() => ({}));
    const cur = await db.select().from(receivables).where(eq(receivables.id, rid)).limit(1);
    if (cur.length === 0) return jsonError("Cobrança não encontrada.", 404);
    const patch: Record<string, unknown> = { updatedAt: new Date(), updatedBy: user.id };
    if (body.description !== undefined) patch.description = String(body.description);
    if (body.dueDate !== undefined) patch.dueDate = body.dueDate ? String(body.dueDate).slice(0, 10) : null;
    if (body.condition !== undefined) patch.condition = String(body.condition);
    if (body.amountCents !== undefined) {
      const v = Math.round(Number(body.amountCents));
      if (!Number.isFinite(v) || v <= 0) return jsonError("Valor deve ser maior que zero.");
      if (v < Number(cur[0].receivedCents)) return jsonError("Valor não pode ser menor que o já recebido.");
      patch.amountCents = v;
      patch.status = Number(cur[0].receivedCents) >= v ? "received" : Number(cur[0].receivedCents) > 0 ? "partial" : "pending";
    }
    if (body.notes !== undefined) patch.notes = body.notes ? String(body.notes) : null;
    await db.update(receivables).set(patch).where(eq(receivables.id, rid));
    await audit(user.id, "update", "receivable", rid, patch);
    return jsonOk({ id: rid });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    throw e;
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const rid = Number(id);
    await db
      .update(receivables)
      .set({ status: "cancelled", updatedAt: new Date(), updatedBy: user.id })
      .where(eq(receivables.id, rid));
    await audit(user.id, "cancel", "receivable", rid);
    return jsonOk({ id: rid });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    throw e;
  }
}
