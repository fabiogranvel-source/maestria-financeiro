import { db } from "@/db";
import { projectCosts, cashTransactions, projects } from "@/db/schema";
import { requireUser, jsonOk, jsonError, AuthError, audit } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { todayISO } from "@/lib/format";

// POST: marcar custo como pago (gera única saída no caixa)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const cid = Number(id);
    const body = await req.json().catch(() => ({}));
    const paidAt = String(body.paidAt || todayISO()).slice(0, 10);
    const method = body.method ? String(body.method) : body.paymentMethod ? String(body.paymentMethod) : "pix";

    const cur = await db.select().from(projectCosts).where(eq(projectCosts.id, cid)).limit(1);
    if (cur.length === 0) return jsonError("Custo não encontrado.", 404);
    const c = cur[0];
    if (c.status === "paid") {
      // idempotente: verificar se caixa já existe
      return jsonOk({ id: cid, duplicate: true });
    }
    if (c.status === "cancelled") return jsonError("Custo cancelado.");

    await db.transaction(async (tx) => {
      await tx
        .update(projectCosts)
        .set({ status: "paid", paidAt, paymentMethod: method, updatedAt: new Date(), updatedBy: user.id })
        .where(eq(projectCosts.id, cid));
      const proj = await tx.select().from(projects).where(eq(projects.id, c.projectId)).limit(1);
      await tx
        .insert(cashTransactions)
        .values({
          type: "exit",
          amountCents: Number(c.amountCents),
          occurredAt: paidAt,
          description: `${c.description} — ${proj[0]?.title || ""}`.trim(),
          categoryId: c.categoryId,
          projectId: c.projectId,
          clientId: proj[0]?.clientId ?? null,
          sourceType: "project_cost",
          sourceId: cid,
          idempotencyKey: `cash:cost:${cid}`,
          method,
          createdBy: user.id,
        })
        .onConflictDoNothing({ target: cashTransactions.idempotencyKey });
    });
    await audit(user.id, "pay", "project_cost", cid, { paidAt, method });
    return jsonOk({ id: cid });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    console.error(e);
    return jsonError("Erro ao pagar custo.", 500);
  }
}
