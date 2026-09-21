import { db } from "@/db";
import { settings, cashTransactions, balanceAdjustments } from "@/db/schema";
import { requireUser, jsonOk, jsonError, AuthError, audit } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { todayISO } from "@/lib/format";

export async function GET() {
  try {
    await requireUser();
    const s = await db.select().from(settings).limit(1);
    const adj = await db.select().from(balanceAdjustments).orderBy(balanceAdjustments.id);
    return jsonOk({ settings: s[0] || null, adjustments: adj });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    throw e;
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const s = await db.select().from(settings).limit(1);
    const row = s[0];
    if (!row) return jsonError("Configurações não inicializadas.", 500);

    // saldo inicial só pode ser definido diretamente se ainda não houver movimentação de abertura
    if (body.openingBalanceCents !== undefined && body.openingBalanceDate) {
      const cents = Math.round(Number(body.openingBalanceCents) || 0);
      const date = String(body.openingBalanceDate).slice(0, 10);
      const hasOpening = await db
        .select()
        .from(cashTransactions)
        .where(eq(cashTransactions.sourceType, "opening_balance"))
        .limit(1);
      if (hasOpening.length === 0) {
        await db.transaction(async (tx) => {
          await tx
            .update(settings)
            .set({ openingBalanceCents: cents, openingBalanceDate: date, updatedAt: new Date() })
            .where(eq(settings.id, row.id));
          if (cents !== 0) {
            await tx.insert(cashTransactions).values({
              type: cents >= 0 ? "entry" : "exit",
              amountCents: Math.abs(cents),
              occurredAt: date,
              description: "Saldo inicial da empresa",
              sourceType: "opening_balance",
              sourceId: row.id,
              idempotencyKey: `cash:opening:${row.id}`,
              createdBy: user.id,
            });
          }
        });
        await audit(user.id, "set", "opening_balance", row.id, { cents, date });
      } else {
        return jsonError("Saldo inicial já lançado. Use Ajuste de saldo para correções.", 400);
      }
    }
    if (body.companyName !== undefined) {
      await db
        .update(settings)
        .set({ companyName: String(body.companyName).slice(0, 80), updatedAt: new Date() })
        .where(eq(settings.id, row.id));
    }
    const updated = await db.select().from(settings).limit(1);
    return jsonOk(updated[0]);
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    throw e;
  }
}

export async function POST(req: Request) {
  // ajuste de saldo (histórico preservado)
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const cents = Math.round(Number(body.amountCents) || 0);
    const reason = String(body.reason || "").trim();
    const occurredAt = String(body.occurredAt || todayISO()).slice(0, 10);
    if (!cents) return jsonError("Valor do ajuste não pode ser zero.");
    if (!reason) return jsonError("Informe o motivo do ajuste.");
    const [adj] = await db
      .insert(balanceAdjustments)
      .values({ amountCents: cents, reason, occurredAt, createdBy: user.id })
      .returning();
    await db.insert(cashTransactions).values({
      type: cents >= 0 ? "entry" : "exit",
      amountCents: Math.abs(cents),
      occurredAt,
      description: `Ajuste de saldo: ${reason}`,
      sourceType: "adjustment",
      sourceId: adj.id,
      idempotencyKey: `cash:adjustment:${adj.id}`,
      createdBy: user.id,
    });
    await audit(user.id, "create", "balance_adjustment", adj.id, { cents, reason });
    return jsonOk(adj, 201);
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    throw e;
  }
}
