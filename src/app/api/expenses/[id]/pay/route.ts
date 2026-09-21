import { db } from "@/db";
import { expenses, cashTransactions, installmentPlans } from "@/db/schema";
import { requireUser, jsonOk, jsonError, AuthError, audit } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import { todayISO } from "@/lib/format";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const eid = Number(id);
    const body = await req.json().catch(() => ({}));
    const paidAt = String(body.paidAt || todayISO()).slice(0, 10);
    const method = body.method ? String(body.method) : body.paymentMethod ? String(body.paymentMethod) : "pix";

    const cur = await db.select().from(expenses).where(eq(expenses.id, eid)).limit(1);
    if (cur.length === 0) return jsonError("Despesa não encontrada.", 404);
    const e = cur[0];
    if (e.status === "paid") return jsonOk({ id: eid, duplicate: true });
    if (e.status === "cancelled") return jsonError("Despesa cancelada.");

    await db.transaction(async (tx) => {
      await tx
        .update(expenses)
        .set({ status: "paid", paidAt, paymentMethod: method, updatedAt: new Date(), updatedBy: user.id })
        .where(eq(expenses.id, eid));
      await tx
        .insert(cashTransactions)
        .values({
          type: "exit",
          amountCents: Number(e.amountCents),
          occurredAt: paidAt,
          description: e.description,
          categoryId: e.categoryId,
          sourceType: "expense",
          sourceId: eid,
          idempotencyKey: `cash:expense:${eid}`,
          method,
          createdBy: user.id,
        })
        .onConflictDoNothing({ target: cashTransactions.idempotencyKey });

      // se for parcela, verificar encerramento do plano
      if (e.installmentPlanId) {
        const siblings = await tx
          .select({ id: expenses.id, status: expenses.status })
          .from(expenses)
          .where(eq(expenses.installmentPlanId, e.installmentPlanId));
        const allPaid = siblings.every((s) => s.id === eid || s.status === "paid");
        if (allPaid) {
          await tx
            .update(installmentPlans)
            .set({ status: "finished", updatedAt: new Date() })
            .where(eq(installmentPlans.id, e.installmentPlanId));
        }
      }
    });
    await audit(user.id, "pay", "expense", eid, { paidAt, method });
    return jsonOk({ id: eid });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    console.error(e);
    return jsonError("Erro ao pagar despesa.", 500);
  }
}
