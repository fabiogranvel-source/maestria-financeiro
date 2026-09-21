import { db } from "@/db";
import { projectCosts, categories, projects, clients } from "@/db/schema";
import { requireUser, jsonOk, jsonError, AuthError, audit } from "@/lib/auth";
import { eq, desc, and, isNull } from "drizzle-orm";

// Lista geral (contas a pagar de obra) + criação
export async function GET() {
  try {
    await requireUser();
    const rows = await db
      .select({
        id: projectCosts.id,
        projectId: projectCosts.projectId,
        projectTitle: projects.title,
        clientName: clients.name,
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
      .innerJoin(projects, eq(projects.id, projectCosts.projectId))
      .innerJoin(clients, eq(clients.id, projects.clientId))
      .leftJoin(categories, eq(categories.id, projectCosts.categoryId))
      .where(isNull(projectCosts.deletedAt))
      .orderBy(desc(projectCosts.id));
    return jsonOk(rows.map((r) => ({ ...r, amountCents: Number(r.amountCents) })));
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    throw e;
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const projectId = Number(body.projectId);
    if (!projectId) return jsonError("Projeto é obrigatório.");
    const description = String(body.description || "").trim();
    if (!description) return jsonError("Descrição é obrigatória.");
    const amountCents = Math.round(Number(body.amountCents) || 0);
    if (!Number.isFinite(amountCents) || amountCents <= 0)
      return jsonError("Valor deve ser maior que zero.");
    const status = String(body.status || "pending"); // pending | paid
    const paidAt = body.paidAt ? String(body.paidAt).slice(0, 10) : status === "paid" ? String(body.dueDate || new Date().toISOString()).slice(0, 10) : null;

    const { cashTransactions } = await import("@/db/schema");
    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(projectCosts)
        .values({
          projectId,
          description,
          categoryId: body.categoryId ? Number(body.categoryId) : null,
          amountCents,
          status: status === "paid" ? "paid" : "pending",
          dueDate: body.dueDate ? String(body.dueDate).slice(0, 10) : null,
          paidAt,
          paymentMethod: body.paymentMethod ? String(body.paymentMethod) : null,
          notes: body.notes ? String(body.notes) : null,
          createdBy: user.id,
        })
        .returning();
      if (status === "paid") {
        const proj = await tx.select().from(projects).where(eq(projects.id, projectId)).limit(1);
        await tx
          .insert(cashTransactions)
          .values({
            type: "exit",
            amountCents,
            occurredAt: paidAt!,
            description: `${description} — ${proj[0]?.title || ""}`.trim(),
            categoryId: body.categoryId ? Number(body.categoryId) : null,
            projectId,
            clientId: proj[0]?.clientId ?? null,
            sourceType: "project_cost",
            sourceId: row.id,
            idempotencyKey: `cash:cost:${row.id}`,
            method: body.paymentMethod ? String(body.paymentMethod) : null,
            createdBy: user.id,
          })
          .onConflictDoNothing({ target: cashTransactions.idempotencyKey });
      }
      return row;
    });
    await audit(user.id, "create", "project_cost", created.id, { projectId, amountCents, status });
    return jsonOk(created, 201);
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    console.error(e);
    return jsonError("Erro ao criar custo.", 500);
  }
}
