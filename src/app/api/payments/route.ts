import { db } from "@/db";
import { receivables, paymentsReceived, cashTransactions, projects } from "@/db/schema";
import { requireUser, jsonOk, jsonError, AuthError, audit } from "@/lib/auth";
import { eq, and, asc } from "drizzle-orm";
import { todayISO } from "@/lib/format";

// Recebimento direto no projeto (distribui nas cobranças em aberto por ordem)
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const projectId = Number(body.projectId);
    const amountCents = Math.round(Number(body.amountCents) || 0);
    if (!projectId) return jsonError("Projeto é obrigatório.");
    if (!Number.isFinite(amountCents) || amountCents <= 0)
      return jsonError("Valor recebido deve ser maior que zero.");
    const paidAt = String(body.paidAt || todayISO()).slice(0, 10);
    const method = String(body.method || "pix");
    const clientKey: string | undefined = body.idempotencyKey;

    if (clientKey) {
      const dup = await db
        .select()
        .from(paymentsReceived)
        .where(eq(paymentsReceived.idempotencyKey, clientKey))
        .limit(1);
      if (dup.length > 0) return jsonOk({ paymentId: dup[0].id, duplicate: true });
    }

    const proj = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (proj.length === 0) return jsonError("Projeto não encontrado.", 404);

    const openRecs = await db
      .select()
      .from(receivables)
      .where(and(eq(receivables.projectId, projectId)))
      .orderBy(asc(receivables.id));

    const pay = await db.transaction(async (tx) => {
      const idem = clientKey || `pay:${projectId}:${Date.now()}:${amountCents}`;
      // vincula à primeira cobrança em aberto (para rastreio)
      const first = openRecs.find((r) => r.status !== "received" && r.status !== "cancelled") || null;
      const [p] = await tx
        .insert(paymentsReceived)
        .values({
          receivableId: first?.id ?? null,
          projectId,
          amountCents,
          paidAt,
          method,
          notes: body.notes ? String(body.notes) : (body.description ? String(body.description) : null),
          idempotencyKey: idem,
          createdBy: user.id,
        })
        .returning();

      // distribui baixa nas cobranças
      let rest = amountCents;
      for (const r of openRecs) {
        if (rest <= 0) break;
        if (r.status === "received" || r.status === "cancelled") continue;
        const open = Number(r.amountCents) - Number(r.receivedCents);
        if (open <= 0) continue;
        const apply = Math.min(open, rest);
        rest -= apply;
        const newReceived = Number(r.receivedCents) + apply;
        await tx
          .update(receivables)
          .set({
            receivedCents: newReceived,
            status: newReceived >= Number(r.amountCents) ? "received" : "partial",
            updatedAt: new Date(),
            updatedBy: user.id,
          })
          .where(eq(receivables.id, r.id));
      }
      // se sobrou (overpay), cria/atualiza cobrança "Ajuste" ? Não: deixa overpay registrado no payment.
      // caixa único
      await tx
        .insert(cashTransactions)
        .values({
          type: "entry",
          amountCents,
          occurredAt: paidAt,
          description: `Recebido — ${proj[0].title}`,
          projectId,
          clientId: proj[0].clientId,
          sourceType: "payment_received",
          sourceId: p.id,
          idempotencyKey: `cash:payment:${p.id}`,
          method,
          createdBy: user.id,
        })
        .onConflictDoNothing({ target: cashTransactions.idempotencyKey });
      return p;
    });

    await audit(user.id, "receive", "payment", pay.id, { projectId, amountCents, paidAt, method });
    return jsonOk({ paymentId: pay.id }, 201);
  } catch (e: unknown) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("23505") || msg.includes("unique") || msg.includes("duplicate"))
      return jsonOk({ duplicate: true });
    console.error(e);
    return jsonError("Erro ao registrar recebimento.", 500);
  }
}
