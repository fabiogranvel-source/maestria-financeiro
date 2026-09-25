import { db } from "@/db";
import {
  projects, clients, receivables, paymentsReceived, projectCosts,
  categories, projectStatusHistory, attachments,
} from "@/db/schema";
import { requireUser, jsonOk, jsonError, AuthError, audit } from "@/lib/auth";
import { eq, and, isNull, desc, inArray } from "drizzle-orm";
import {
  getProjectFinanceInventory,
  validateFinancialChange,
  buildAutoReceivablesPlan,
  isAutoReceivable,
  BLOCKED_HAS_PAYMENTS_MESSAGE,
  BLOCKED_OPEN_CHARGES_MESSAGE,
  BLOCKED_HAS_PAYMENTS_DELETE_MESSAGE,
} from "@/lib/project-finance";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;
    const pid = Number(id);
    const p = await db
      .select({
        id: projects.id,
        clientId: projects.clientId,
        archived: projects.deletedAt,
        clientName: clients.name,
        clientPhone: clients.phone,
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
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .innerJoin(clients, eq(clients.id, projects.clientId))
      .where(eq(projects.id, pid))
      .limit(1);
    if (p.length === 0) return jsonError("Projeto não encontrado.", 404);
    const proj = p[0];

    const recs = await db
      .select()
      .from(receivables)
      .where(eq(receivables.projectId, pid))
      .orderBy(receivables.id);
    const pays = await db
      .select()
      .from(paymentsReceived)
      .where(eq(paymentsReceived.projectId, pid))
      .orderBy(desc(paymentsReceived.paidAt), desc(paymentsReceived.id));
    const costs = await db
      .select({
        id: projectCosts.id,
        description: projectCosts.description,
        categoryId: projectCosts.categoryId,
        categoryName: categories.name,
        amountCents: projectCosts.amountCents,
        status: projectCosts.status,
        dueDate: projectCosts.dueDate,
        paidAt: projectCosts.paidAt,
        paymentMethod: projectCosts.paymentMethod,
        notes: projectCosts.notes,
        createdAt: projectCosts.createdAt,
      })
      .from(projectCosts)
      .leftJoin(categories, eq(categories.id, projectCosts.categoryId))
      .where(and(eq(projectCosts.projectId, pid), isNull(projectCosts.deletedAt)))
      .orderBy(desc(projectCosts.id));
    const history = await db
      .select()
      .from(projectStatusHistory)
      .where(eq(projectStatusHistory.projectId, pid))
      .orderBy(desc(projectStatusHistory.id));
    const files = await db
      .select({
        id: attachments.id,
        fileName: attachments.fileName,
        mimeType: attachments.mimeType,
        sizeBytes: attachments.sizeBytes,
        relatedType: attachments.relatedType,
        relatedId: attachments.relatedId,
        createdAt: attachments.createdAt,
      })
      .from(attachments)
      .where(and(eq(attachments.relatedType, "project"), eq(attachments.relatedId, pid)))
      .orderBy(desc(attachments.id));

    const receivedCents = pays
      .filter((x) => !x.reversedAt)
      .reduce((s, x) => s + Number(x.amountCents), 0);
    const costCents = costs
      .filter((c) => c.status !== "cancelled")
      .reduce((s, c) => s + Number(c.amountCents), 0);
    const total = Number(proj.totalValueCents);
    const pending = Math.max(0, total - receivedCents);
    const profit = total - costCents;
    const margin = total > 0 ? (profit / total) * 100 : 0;

    return jsonOk({
      project: {
        ...proj,
        totalValueCents: total,
        downPaymentCents: Number(proj.downPaymentCents),
      },
      finance: {
        totalCents: total,
        receivedCents,
        pendingCents: pending,
        costCents,
        profitCents: profit,
        marginPct: Math.round(margin * 10) / 10,
      },
      receivables: recs.map((r) => ({
        ...r,
        amountCents: Number(r.amountCents),
        receivedCents: Number(r.receivedCents),
      })),
      payments: pays.map((x) => ({ ...x, amountCents: Number(x.amountCents) })),
      costs: costs.map((c) => ({ ...c, amountCents: Number(c.amountCents) })),
      history,
      files,
    });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    throw e;
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const pid = Number(id);
    const body = await req.json().catch(() => ({}));
    const cur = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, pid), isNull(projects.deletedAt)))
      .limit(1);
    if (cur.length === 0) return jsonError("Projeto não encontrado.", 404);
    const before = cur[0];

    const inventory = await getProjectFinanceInventory(pid);
    const financialsLocked = inventory.activePayments > 0 || inventory.receivablesWithReceipts > 0;

    // ---------- Campos administrativos (sempre editáveis) ----------
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    const beforeSnapshot: Record<string, unknown> = {};

    if (body.title !== undefined) {
      const t = String(body.title).trim();
      if (!t) return jsonError("Nome do projeto é obrigatório.");
      patch.title = t;
    }
    if (body.description !== undefined) patch.description = body.description ? String(body.description) : null;
    if (body.notes !== undefined) patch.notes = body.notes ? String(body.notes) : null;
    if (body.deliveryForecast !== undefined)
      patch.deliveryForecast = body.deliveryForecast ? String(body.deliveryForecast).slice(0, 10) : null;

    // ---------- Cliente ----------
    if (body.clientId !== undefined) {
      const newClientId = Number(body.clientId);
      if (!Number.isFinite(newClientId) || newClientId <= 0) return jsonError("Cliente inválido.");
      if (newClientId !== before.clientId) {
        const [cl] = await db.select().from(clients).where(eq(clients.id, newClientId)).limit(1);
        if (!cl) return jsonError("Cliente não encontrado.", 404);
        patch.clientId = newClientId;
      }
    }

    // ---------- Campos financeiros ----------
    const wantsTotal = body.totalValueCents !== undefined;
    const wantsDown = body.downPaymentCents !== undefined;
    const newTotal = wantsTotal ? Math.round(Number(body.totalValueCents)) : Number(before.totalValueCents);
    const newDown = wantsDown ? Math.round(Number(body.downPaymentCents)) : Number(before.downPaymentCents);
    const totalChanged = wantsTotal && newTotal !== Number(before.totalValueCents);
    const downChanged = wantsDown && newDown !== Number(before.downPaymentCents);

    const newSaleDate = body.saleDate ? String(body.saleDate).slice(0, 10) : before.saleDate;
    const newBalanceMode = body.balanceMode !== undefined ? String(body.balanceMode) : before.balanceMode;
    const newBalanceDueDate =
      body.balanceDueDate !== undefined
        ? body.balanceDueDate
          ? String(body.balanceDueDate).slice(0, 10)
          : null
        : before.balanceDueDate;

    // Qualquer alteracao que exija recalcular cobrancas trava quando ha recebimento.
    const affectsReceivables = totalChanged || downChanged;

    if (financialsLocked && (totalChanged || downChanged)) {
      await audit(user.id, "update_blocked", "project", pid, {
        reason: "payments_present",
        before: { totalValueCents: Number(before.totalValueCents), downPaymentCents: Number(before.downPaymentCents) },
        attempted: { totalValueCents: newTotal, downPaymentCents: newDown },
      });
      return jsonError(BLOCKED_HAS_PAYMENTS_MESSAGE, 409);
    }

    if (financialsLocked && body.balanceMode !== undefined && body.balanceMode !== before.balanceMode) {
      await audit(user.id, "update_blocked", "project", pid, {
        reason: "payments_present",
        field: "balanceMode",
        before: before.balanceMode,
        attempted: String(body.balanceMode),
      });
      return jsonError(BLOCKED_HAS_PAYMENTS_MESSAGE, 409);
    }

    if (!financialsLocked) {
      const err = validateFinancialChange(inventory, newTotal, newDown);
      if (err) {
        await audit(user.id, "update_blocked", "project", pid, {
          reason: "invalid_values",
          attempted: { totalValueCents: newTotal, downPaymentCents: newDown },
        });
        return jsonError(err, 400);
      }
    }

    if (wantsTotal) patch.totalValueCents = newTotal;
    if (wantsDown) patch.downPaymentCents = newDown;
    if (body.saleDate) patch.saleDate = newSaleDate;
    if (body.balanceMode !== undefined) patch.balanceMode = newBalanceMode;
    if (body.balanceDueDate !== undefined) patch.balanceDueDate = newBalanceDueDate;

    // ---------- Status ----------
    let statusChanged = false;
    if (body.status !== undefined && body.status !== before.status) {
      patch.status = String(body.status);
      statusChanged = true;
    }

    // Snapshot "antes" para auditoria (somente campos realmente alterados)
    for (const k of Object.keys(patch)) {
      if (k === "updatedAt") continue;
      beforeSnapshot[k] = (before as unknown as Record<string, unknown>)[k] ?? null;
    }

    await db.transaction(async (tx) => {
      if (statusChanged) {
        await tx.insert(projectStatusHistory).values({
          projectId: pid,
          fromStatus: before.status,
          toStatus: String(body.status),
          changedBy: user.id,
        });
      }

      await tx.update(projects).set(patch).where(eq(projects.id, pid));

      // Recria somente as cobranças automáticas, e somente quando não há recebimento.
      if (affectsReceivables && !financialsLocked) {
        const existing = await tx.select().from(receivables).where(eq(receivables.projectId, pid));
        const autoRows = existing.filter(
          (r) =>
            isAutoReceivable(r.description) &&
            Number(r.receivedCents) === 0 &&
            r.status !== "cancelled"
        );
        if (autoRows.length > 0) {
          await tx
            .delete(receivables)
            .where(
              and(
                eq(receivables.projectId, pid),
                inArray(
                  receivables.id,
                  autoRows.map((r) => r.id)
                )
              )
            );
        }
        const plan = buildAutoReceivablesPlan(
          pid,
          patch.clientId ? Number(patch.clientId) : before.clientId,
          newSaleDate,
          newTotal,
          newDown,
          newBalanceMode,
          newBalanceDueDate
        );
        if (plan.length > 0) {
          await tx.insert(receivables).values(
            plan.map((r) => ({
              projectId: pid,
              clientId: patch.clientId ? Number(patch.clientId) : before.clientId,
              description: r.description,
              amountCents: r.amountCents,
              receivedCents: 0,
              dueDate: r.dueDate,
              condition: r.condition,
              status: "pending",
              createdBy: user.id,
            }))
          );
        }
      } else if (
        !affectsReceivables &&
        (body.clientId !== undefined && patch.clientId !== undefined) &&
        !financialsLocked
      ) {
        // Troca de cliente sem alteração de valores: atualiza as cobranças automáticas pendentes.
        const existing = await tx.select().from(receivables).where(eq(receivables.projectId, pid));
        const autoPending = existing.filter(
          (r) => isAutoReceivable(r.description) && Number(r.receivedCents) === 0 && r.status !== "cancelled"
        );
        for (const r of autoPending) {
          await tx.update(receivables).set({ clientId: Number(patch.clientId) }).where(eq(receivables.id, r.id));
        }
      }
    });

    await audit(user.id, "update", "project", pid, {
      before: beforeSnapshot,
      after: { ...patch, updatedAt: undefined },
      receivablesRebuilt: affectsReceivables && !financialsLocked,
    });

    return jsonOk({ id: pid, financialsLocked });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    throw e;
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const pid = Number(id);
    const cur = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, pid), isNull(projects.deletedAt)))
      .limit(1);
    if (cur.length === 0) return jsonError("Projeto não encontrado.", 404);

    const inv = await getProjectFinanceInventory(pid);

    // Bloqueia se houver cobrança em aberto.
    if (inv.receivablesOpen > 0) {
      await audit(user.id, "delete_blocked", "project", pid, {
        reason: "open_receivables",
        openReceivables: inv.receivablesOpen,
      });
      return jsonError(BLOCKED_OPEN_CHARGES_MESSAGE, 409, { openReceivables: inv.receivablesOpen });
    }

    // Bloqueia se houver pagamento recebido não estornado.
    if (inv.activePayments > 0) {
      await audit(user.id, "delete_blocked", "project", pid, {
        reason: "active_payments",
        activePayments: inv.activePayments,
      });
      return jsonError(BLOCKED_HAS_PAYMENTS_DELETE_MESSAGE, 409, { activePayments: inv.activePayments });
    }

    // Soft delete: preserva todo o histórico financeiro.
    await db.update(projects).set({ deletedAt: new Date() }).where(eq(projects.id, pid));
    await audit(user.id, "archive", "project", pid, {
      title: cur[0].title,
      preservedReceivables: inv.receivablesTotal,
      reversedPayments: inv.reversedPayments,
      activeCosts: inv.activeCosts,
    });
    return jsonOk({ id: pid, archived: true });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    throw e;
  }
}
