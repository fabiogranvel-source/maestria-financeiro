import { db } from "@/db";
import { receivables, projects, clients } from "@/db/schema";
import { requireUser, jsonOk, jsonError, AuthError, audit } from "@/lib/auth";
import { eq, desc, isNull } from "drizzle-orm";

// Lista geral (contas a receber) + criação avulsa de cobrança
export async function GET() {
  try {
    await requireUser();
    const rows = await db
      .select({
        id: receivables.id,
        projectId: receivables.projectId,
        projectTitle: projects.title,
        clientId: receivables.clientId,
        clientName: clients.name,
        description: receivables.description,
        amountCents: receivables.amountCents,
        receivedCents: receivables.receivedCents,
        dueDate: receivables.dueDate,
        condition: receivables.condition,
        status: receivables.status,
        notes: receivables.notes,
        createdAt: receivables.createdAt,
      })
      .from(receivables)
      .innerJoin(projects, eq(projects.id, receivables.projectId))
      .innerJoin(clients, eq(clients.id, receivables.clientId))
      // Projetos arquivados não aparecem como cobrança operacional ativa.
      .where(isNull(projects.deletedAt))
      .orderBy(desc(receivables.id));
    return jsonOk(
      rows.map((r) => ({
        ...r,
        amountCents: Number(r.amountCents),
        receivedCents: Number(r.receivedCents),
        openCents: Number(r.amountCents) - Number(r.receivedCents),
      }))
    );
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
    const amountCents = Math.round(Number(body.amountCents) || 0);
    if (!Number.isFinite(amountCents) || amountCents <= 0)
      return jsonError("Valor deve ser maior que zero.");
    const proj = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (proj.length === 0) return jsonError("Projeto não encontrado.", 404);
    const [row] = await db
      .insert(receivables)
      .values({
        projectId,
        clientId: proj[0].clientId,
        description: String(body.description || "Cobrança"),
        amountCents,
        receivedCents: 0,
        dueDate: body.dueDate ? String(body.dueDate).slice(0, 10) : null,
        condition: String(body.condition || "fixed"),
        status: "pending",
        notes: body.notes ? String(body.notes) : null,
        createdBy: user.id,
      })
      .returning();
    await audit(user.id, "create", "receivable", row.id, { projectId, amountCents });
    return jsonOk(row, 201);
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    throw e;
  }
}
