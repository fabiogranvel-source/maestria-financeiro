import { db } from "@/db";
import { projects, clients, receivables, paymentsReceived, projectCosts, projectStatusHistory } from "@/db/schema";
import { requireUser, jsonOk, jsonError, AuthError, audit } from "@/lib/auth";
import { validateMoney } from "@/lib/finance";
import { eq, desc, and, isNull, sql } from "drizzle-orm";

export async function GET(req: Request) {
  try {
    await requireUser();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const q = searchParams.get("q")?.trim().toLowerCase() || "";

    const rows = await db
      .select({
        id: projects.id,
        clientId: projects.clientId,
        clientName: clients.name,
        title: projects.title,
        description: projects.description,
        saleDate: projects.saleDate,
        totalValueCents: projects.totalValueCents,
        downPaymentCents: projects.downPaymentCents,
        balanceMode: projects.balanceMode,
        balanceDueDate: projects.balanceDueDate,
        deliveryForecast: projects.deliveryForecast,
        notes: projects.notes,
        status: projects.status,
        createdAt: projects.createdAt,
      })
      .from(projects)
      .innerJoin(clients, eq(clients.id, projects.clientId))
      .where(isNull(projects.deletedAt))
      .orderBy(desc(projects.saleDate), desc(projects.id));

    // agregados por projeto
    const recAgg = await db
      .select({
        projectId: receivables.projectId,
        receivedCents: sql<number>`coalesce(sum(${receivables.receivedCents}),0)`,
      })
      .from(receivables)
      .groupBy(receivables.projectId);
    const payAgg = await db
      .select({
        projectId: paymentsReceived.projectId,
        totalCents: sql<number>`coalesce(sum(case when ${paymentsReceived.reversedAt} is null then ${paymentsReceived.amountCents} else 0 end),0)`,
      })
      .from(paymentsReceived)
      .groupBy(paymentsReceived.projectId);
    const costAgg = await db
      .select({
        projectId: projectCosts.projectId,
        totalCents: sql<number>`coalesce(sum(case when ${projectCosts.deletedAt} is null and ${projectCosts.status} != 'cancelled' then ${projectCosts.amountCents} else 0 end),0)`,
      })
      .from(projectCosts)
      .groupBy(projectCosts.projectId);

    const payMap = new Map<number, number>(payAgg.map((r) => [r.projectId, Number(r.totalCents)]));
    const costMap = new Map<number, number>(costAgg.map((r) => [r.projectId, Number(r.totalCents)]));

    let list = rows.map((p) => {
      const received = payMap.get(p.id) || 0;
      const costs = costMap.get(p.id) || 0;
      const pending = Math.max(0, Number(p.totalValueCents) - received);
      const profit = Number(p.totalValueCents) - costs;
      const margin = Number(p.totalValueCents) > 0 ? (profit / Number(p.totalValueCents)) * 100 : 0;
      return {
        ...p,
        totalValueCents: Number(p.totalValueCents),
        downPaymentCents: Number(p.downPaymentCents),
        receivedCents: received,
        pendingCents: pending,
        costCents: costs,
        profitCents: profit,
        marginPct: Math.round(margin * 10) / 10,
      };
    });

    if (status && status !== "all") list = list.filter((p) => p.status === status);
    if (q) {
      list = list.filter(
        (p) =>
          p.clientName.toLowerCase().includes(q) ||
          p.title.toLowerCase().includes(q) ||
          (p.description || "").toLowerCase().includes(q)
      );
    }
    return jsonOk(list);
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    throw e;
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));

    // cliente: id existente ou nome novo
    let clientId: number | null = body.clientId ? Number(body.clientId) : null;
    const clientName = String(body.clientName || "").trim();
    if (!clientId && !clientName) return jsonError("Informe o cliente.");
    if (!clientId && clientName) {
      const [c] = await db.insert(clients).values({ name: clientName }).returning();
      clientId = c.id;
    }

    const title = String(body.title || "").trim() || "Projeto";
    const saleDate = String(body.saleDate || "").slice(0, 10);
    if (!saleDate) return jsonError("Data da venda é obrigatória.");
    const totalCents = Math.round(Number(body.totalValueCents) || 0);
    const downCents = Math.round(Number(body.downPaymentCents) || 0);
    const errTotal = validateMoney(totalCents, { field: "Valor da venda" });
    if (errTotal) return jsonError(errTotal);
    if (downCents < 0) return jsonError("Valor da entrada não pode ser negativo.");
    if (downCents > totalCents) return jsonError("Entrada não pode ser maior que o valor da venda.");

    const balanceMode = String(body.balanceMode || "undefined");
    const balanceDueDate = body.balanceDueDate ? String(body.balanceDueDate).slice(0, 10) : null;
    const deliveryForecast = body.deliveryForecast ? String(body.deliveryForecast).slice(0, 10) : null;
    const downReceived = !!body.downPaymentReceived;
    const status = String(body.status || "approved");

    // transação: projeto + receivables (entrada + saldo)
    const created = await db.transaction(async (tx) => {
      const [p] = await tx
        .insert(projects)
        .values({
          clientId: clientId!,
          title,
          description: body.description ? String(body.description) : null,
          saleDate,
          totalValueCents: totalCents,
          downPaymentCents: downCents,
          downPaymentReceived: downReceived,
          balanceMode,
          balanceDueDate,
          deliveryForecast,
          notes: body.notes ? String(body.notes) : null,
          status,
          createdBy: user.id,
        })
        .returning();

      await tx.insert(projectStatusHistory).values({
        projectId: p.id,
        fromStatus: null,
        toStatus: status,
        changedBy: user.id,
      });

      // receivable da entrada (se houver)
      if (downCents > 0) {
        await tx.insert(receivables).values({
          projectId: p.id,
          clientId: clientId!,
          description: "Entrada",
          amountCents: downCents,
          receivedCents: 0,
          dueDate: saleDate,
          condition: "fixed",
          status: "pending",
          createdBy: user.id,
        });
      }
      // receivable do saldo
      const balance = totalCents - downCents;
      if (balance > 0) {
        await tx.insert(receivables).values({
          projectId: p.id,
          clientId: clientId!,
          description: balanceMode === "on_delivery" ? "Saldo na entrega" : "Saldo",
          amountCents: balance,
          receivedCents: 0,
          dueDate: balanceMode === "fixed_date" && balanceDueDate ? balanceDueDate : null,
          condition: balanceMode === "on_delivery" ? "on_delivery" : balanceMode === "fixed_date" ? "fixed" : "undefined",
          status: "pending",
          createdBy: user.id,
        });
      }

      // se entrada já recebida, registrar pagamento + caixa
      if (downReceived && downCents > 0) {
        const recv = await tx
          .select()
          .from(receivables)
          .where(and(eq(receivables.projectId, p.id), eq(receivables.description, "Entrada")))
          .limit(1);
        const recvId = recv[0]?.id;
        const idem = `pay:${p.id}:${Date.now()}:down`;
        const [pay] = await tx
          .insert(paymentsReceived)
          .values({
            receivableId: recvId ?? null,
            projectId: p.id,
            amountCents: downCents,
            paidAt: saleDate,
            method: String(body.downPaymentMethod || "pix"),
            notes: "Entrada recebida no cadastro",
            idempotencyKey: idem,
            createdBy: user.id,
          })
          .returning();
        if (recvId) {
          await tx
            .update(receivables)
            .set({ receivedCents: downCents, status: "received", updatedAt: new Date() })
            .where(eq(receivables.id, recvId));
        }
        const { cashTransactions } = await import("@/db/schema");
        await tx.insert(cashTransactions).values({
          type: "entry",
          amountCents: downCents,
          occurredAt: saleDate,
          description: `Entrada — ${title}`,
          projectId: p.id,
          clientId: clientId!,
          sourceType: "payment_received",
          sourceId: pay.id,
          idempotencyKey: `cash:payment:${pay.id}`,
          method: String(body.downPaymentMethod || "pix"),
          createdBy: user.id,
        });
      }
      return p;
    });

    await audit(user.id, "create", "project", created.id, { title, totalCents });
    return jsonOk({ id: created.id }, 201);
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    console.error(e);
    return jsonError("Erro ao criar projeto.", 500);
  }
}
