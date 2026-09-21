import { db } from "@/db";
import { receivables, paymentsReceived, cashTransactions, projects } from "@/db/schema";
import { requireUser, jsonOk, jsonError, AuthError, audit } from "@/lib/auth";
import { eq, sql } from "drizzle-orm";
import { todayISO } from "@/lib/format";
import crypto from "crypto";

// POST: registrar recebimento (total ou parcial) — transacional + idempotente
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const receivableId = Number(id);
    const body = await req.json().catch(() => ({}));
    const amountCents = Math.round(Number(body.amountCents) || 0);
    if (!Number.isFinite(amountCents) || amountCents <= 0)
      return jsonError("Valor recebido deve ser maior que zero.");
    const paidAt = String(body.paidAt || todayISO()).slice(0, 10);
    const method = String(body.method || "pix");
    const clientKey: string | undefined = body.idempotencyKey;
    const idem = clientKey || `recv:${receivableId}:${amountCents}:${paidAt}:${crypto.randomBytes(4).toString("hex")}`;

    // idempotência: se já existe pagamento com a key, retornar o existente
    if (clientKey) {
      const dup = await db
        .select()
        .from(paymentsReceived)
        .where(eq(paymentsReceived.idempotencyKey, clientKey))
        .limit(1);
      if (dup.length > 0) return jsonOk({ paymentId: dup[0].id, duplicate: true });
    }

    const rec = await db.select().from(receivables).where(eq(receivables.id, receivableId)).limit(1);
    if (rec.length === 0) return jsonError("Conta a receber não encontrada.", 404);
    const r = rec[0];
    if (r.status === "cancelled") return jsonError("Esta cobrança está cancelada.");

    const open = Number(r.amountCents) - Number(r.receivedCents);
    // confirmação se ultrapassar: o front pede confirmação; aqui permitimos com flag
    const confirmed = !!body.confirmedOverpay;

    const result = await db.transaction(async (tx) => {
      const [pay] = await tx
        .insert(paymentsReceived)
        .values({
          receivableId,
          projectId: r.projectId,
          amountCents,
          paidAt,
          method,
          notes: body.notes ? String(body.notes) : null,
          idempotencyKey: idem,
          createdBy: user.id,
        })
        .returning();

      const newReceived = Number(r.receivedCents) + amountCents;
      const newStatus = newReceived >= Number(r.amountCents) ? "received" : "partial";
      await tx
        .update(receivables)
        .set({ receivedCents: newReceived, status: newStatus, updatedAt: new Date(), updatedBy: user.id })
        .where(eq(receivables.id, receivableId));

      // caixa: uma única entrada (idempotente por payment id)
      await tx
        .insert(cashTransactions)
        .values({
          type: "entry",
          amountCents,
          occurredAt: paidAt,
          description: `Recebido — ${r.description}`,
          projectId: r.projectId,
          sourceType: "payment_received",
          sourceId: pay.id,
          idempotencyKey: `cash:payment:${pay.id}`,
          method,
          createdBy: user.id,
        })
        .onConflictDoNothing({ target: cashTransactions.idempotencyKey });

      return pay;
    });

    await audit(user.id, "receive", "receivable", receivableId, {
      amountCents,
      paidAt,
      method,
      openBefore: open,
      confirmed,
    });
    return jsonOk({ paymentId: result.id }, 201);
  } catch (e: unknown) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    // unique violation => duplicidade de clique
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("unique") || msg.includes("duplicate") || msg.includes("23505")) {
      return jsonOk({ duplicate: true });
    }
    console.error(e);
    return jsonError("Erro ao registrar recebimento.", 500);
  }
}
