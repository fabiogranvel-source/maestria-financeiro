import { db } from "@/db";
import { paymentsReceived, receivables, cashTransactions } from "@/db/schema";
import { requireUser, jsonOk, jsonError, AuthError, audit } from "@/lib/auth";
import { eq, and } from "drizzle-orm";

// Estorno de recebimento: marca reversed, reabre cobrança proporcional, marca caixa reversed + lança saída de estorno
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const pid = Number(id);
    const body = await req.json().catch(() => ({}));
    const reason = String(body.reason || "Estorno").trim();

    const pay = await db.select().from(paymentsReceived).where(eq(paymentsReceived.id, pid)).limit(1);
    if (pay.length === 0) return jsonError("Pagamento não encontrado.", 404);
    const p = pay[0];
    if (p.reversedAt) return jsonError("Este recebimento já foi estornado.");

    await db.transaction(async (tx) => {
      await tx
        .update(paymentsReceived)
        .set({ reversedAt: new Date(), reversalReason: reason })
        .where(eq(paymentsReceived.id, pid));

      // reabrir cobrança vinculada proporcionalmente (redistribuição simples: volta para a vinculada)
      if (p.receivableId) {
        const rec = await tx.select().from(receivables).where(eq(receivables.id, p.receivableId)).limit(1);
        if (rec.length > 0) {
          const r = rec[0];
          const newReceived = Math.max(0, Number(r.receivedCents) - Number(p.amountCents));
          await tx
            .update(receivables)
            .set({
              receivedCents: newReceived,
              status: newReceived <= 0 ? "pending" : newReceived >= Number(r.amountCents) ? "received" : "partial",
              updatedAt: new Date(),
              updatedBy: user.id,
            })
            .where(eq(receivables.id, r.id));
        }
      }

      // marca entrada original como reversed e cria saída compensatória
      const entries = await tx
        .select()
        .from(cashTransactions)
        .where(
          and(
            eq(cashTransactions.sourceType, "payment_received"),
            eq(cashTransactions.sourceId, pid)
          )
        );
      for (const e of entries) {
        await tx
          .update(cashTransactions)
          .set({ reversed: true, reversalReason: reason })
          .where(eq(cashTransactions.id, e.id));
      }
      await tx.insert(cashTransactions).values({
        type: "exit",
        amountCents: Number(p.amountCents),
        occurredAt: p.paidAt,
        description: `Estorno de recebimento #${pid}`,
        projectId: p.projectId,
        sourceType: "payment_received",
        sourceId: pid,
        idempotencyKey: `cash:payment-reversal:${pid}`,
        createdBy: user.id,
        notes: reason,
      });
    });

    await audit(user.id, "reverse", "payment", pid, { reason });
    return jsonOk({ id: pid });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    console.error(e);
    return jsonError("Erro ao estornar.", 500);
  }
}
