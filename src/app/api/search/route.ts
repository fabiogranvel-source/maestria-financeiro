import { db } from "@/db";
import { projects, clients, projectCosts, expenses, receivables } from "@/db/schema";
import { requireUser, jsonOk, jsonError, AuthError } from "@/lib/auth";
import { eq, ilike, or, desc, and, isNull } from "drizzle-orm";

export async function GET(req: Request) {
  try {
    await requireUser();
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    if (q.length < 2) return jsonOk({ projects: [], costs: [], expenses: [], receivables: [] });
    const like = `%${q}%`;

    const projs = await db
      .select({ id: projects.id, title: projects.title, clientName: clients.name, status: projects.status, totalValueCents: projects.totalValueCents })
      .from(projects)
      .innerJoin(clients, eq(clients.id, projects.clientId))
      .where(
        and(
          isNull(projects.deletedAt),
          or(ilike(projects.title, like), ilike(clients.name, like), ilike(projects.description, like))
        )
      )
      .orderBy(desc(projects.id))
      .limit(10);

    const costs = await db
      .select({ id: projectCosts.id, description: projectCosts.description, amountCents: projectCosts.amountCents, status: projectCosts.status, projectId: projectCosts.projectId })
      .from(projectCosts)
      .where(ilike(projectCosts.description, like))
      .orderBy(desc(projectCosts.id))
      .limit(10);

    const exps = await db
      .select({ id: expenses.id, description: expenses.description, amountCents: expenses.amountCents, status: expenses.status, dueDate: expenses.dueDate })
      .from(expenses)
      .where(ilike(expenses.description, like))
      .orderBy(desc(expenses.id))
      .limit(10);

    const recs = await db
      .select({ id: receivables.id, description: receivables.description, amountCents: receivables.amountCents, status: receivables.status, projectId: receivables.projectId })
      .from(receivables)
      .innerJoin(projects, eq(projects.id, receivables.projectId))
      .where(and(isNull(projects.deletedAt), ilike(receivables.description, like)))
      .orderBy(desc(receivables.id))
      .limit(10);

    return jsonOk({
      projects: projs.map((p) => ({ ...p, totalValueCents: Number(p.totalValueCents) })),
      costs: costs.map((c) => ({ ...c, amountCents: Number(c.amountCents) })),
      expenses: exps.map((e) => ({ ...e, amountCents: Number(e.amountCents) })),
      receivables: recs.map((r) => ({ ...r, amountCents: Number(r.amountCents) })),
    });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    throw e;
  }
}
