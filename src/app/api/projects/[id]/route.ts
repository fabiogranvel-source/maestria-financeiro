import { db } from "@/db";
import {
  projects, clients, receivables, paymentsReceived, projectCosts,
  categories, projectStatusHistory, attachments,
} from "@/db/schema";
import { requireUser, jsonOk, jsonError, AuthError, audit } from "@/lib/auth";
import { eq, and, isNull, desc } from "drizzle-orm";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;
    const pid = Number(id);
    const p = await db
      .select({
        id: projects.id,
        clientId: projects.clientId,
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
      .where(and(eq(projects.id, pid), isNull(projects.deletedAt)))
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
    const cur = await db.select().from(projects).where(eq(projects.id, pid)).limit(1);
    if (cur.length === 0) return jsonError("Projeto não encontrado.", 404);

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.title !== undefined) patch.title = String(body.title);
    if (body.description !== undefined) patch.description = body.description ? String(body.description) : null;
    if (body.saleDate) patch.saleDate = String(body.saleDate).slice(0, 10);
    if (body.totalValueCents !== undefined) {
      const v = Math.round(Number(body.totalValueCents));
      if (!Number.isFinite(v) || v <= 0) return jsonError("Valor da venda deve ser maior que zero.");
      patch.totalValueCents = v;
    }
    if (body.balanceMode !== undefined) patch.balanceMode = String(body.balanceMode);
    if (body.balanceDueDate !== undefined)
      patch.balanceDueDate = body.balanceDueDate ? String(body.balanceDueDate).slice(0, 10) : null;
    if (body.deliveryForecast !== undefined)
      patch.deliveryForecast = body.deliveryForecast ? String(body.deliveryForecast).slice(0, 10) : null;
    if (body.notes !== undefined) patch.notes = body.notes ? String(body.notes) : null;
    if (body.status !== undefined && body.status !== cur[0].status) {
      patch.status = String(body.status);
      await db.insert(projectStatusHistory).values({
        projectId: pid,
        fromStatus: cur[0].status,
        toStatus: String(body.status),
        changedBy: user.id,
      });
    }
    await db.update(projects).set(patch).where(eq(projects.id, pid));
    await audit(user.id, "update", "project", pid, patch);
    return jsonOk({ id: pid });
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
    // soft delete
    await db.update(projects).set({ deletedAt: new Date() }).where(eq(projects.id, pid));
    await audit(user.id, "archive", "project", pid);
    return jsonOk({ id: pid });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    throw e;
  }
}
