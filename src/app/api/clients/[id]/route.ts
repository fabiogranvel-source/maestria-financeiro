import { db } from "@/db";
import { clients, projects, receivables, cashTransactions } from "@/db/schema";
import { requireUser, jsonOk, jsonError, AuthError, audit } from "@/lib/auth";
import { eq, sql } from "drizzle-orm";
import { normalizeDoc, isValidDoc, BLOCKED_DELETE_MESSAGE } from "@/lib/clients";

type Params = { params: Promise<{ id: string }> };

async function findClient(id: number) {
  const rows = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Conta todos os vínculos diretos do cliente (inclusive projetos arquivados). */
async function countLinks(id: number) {
  const [p] = await db
    .select({ n: sql<number>`count(*)` })
    .from(projects)
    .where(eq(projects.clientId, id));
  const [r] = await db
    .select({ n: sql<number>`count(*)` })
    .from(receivables)
    .where(eq(receivables.clientId, id));
  const [c] = await db
    .select({ n: sql<number>`count(*)` })
    .from(cashTransactions)
    .where(eq(cashTransactions.clientId, id));
  return {
    projects: Number(p?.n || 0),
    receivables: Number(r?.n || 0),
    cashTransactions: Number(c?.n || 0),
  };
}

export async function GET(_: Request, { params }: Params) {
  try {
    await requireUser();
    const { id } = await params;
    const cid = Number(id);
    if (!Number.isFinite(cid)) return jsonError("Cliente inválido.", 400);
    const client = await findClient(cid);
    if (!client) return jsonError("Cliente não encontrado.", 404);
    const links = await countLinks(cid);
    return jsonOk({ ...client, links });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    throw e;
  }
}

export async function PUT(req: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const cid = Number(id);
    if (!Number.isFinite(cid)) return jsonError("Cliente inválido.", 400);
    const existing = await findClient(cid);
    if (!existing) return jsonError("Cliente não encontrado.", 404);

    const body = await req.json().catch(() => ({}));
    const name = String(body.name ?? existing.name ?? "").trim();
    if (!name) return jsonError("Nome do cliente é obrigatório.");
    if (!isValidDoc(body.cpfCnpj ?? existing.cpfCnpj)) {
      return jsonError("CPF/CNPJ inválido — informe 11 (CPF) ou 14 (CNPJ) dígitos.");
    }
    const cpfCnpj = normalizeDoc(body.cpfCnpj ?? existing.cpfCnpj);

    const [row] = await db
      .update(clients)
      .set({
        name,
        cpfCnpj: cpfCnpj || null,
        phone: body.phone !== undefined ? (body.phone ? String(body.phone) : null) : existing.phone,
        email: body.email !== undefined ? (body.email ? String(body.email) : null) : existing.email,
        address: body.address !== undefined ? (body.address ? String(body.address) : null) : existing.address,
        notes: body.notes !== undefined ? (body.notes ? String(body.notes) : null) : existing.notes,
        updatedAt: new Date(),
      })
      .where(eq(clients.id, cid))
      .returning();

    await audit(user.id, "update", "client", cid, { name, before: existing.name });
    return jsonOk(row);
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    throw e;
  }
}

export async function PATCH(req: Request, ctx: Params) {
  // PATCH se comporta como PUT (aceita atualização total ou parcial).
  return PUT(req, ctx);
}

export async function DELETE(_: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const cid = Number(id);
    if (!Number.isFinite(cid)) return jsonError("Cliente inválido.", 400);
    const existing = await findClient(cid);
    if (!existing) return jsonError("Cliente não encontrado.", 404);

    // NUNCA excluir em cascata: qualquer vínculo bloqueia a exclusão.
    const links = await countLinks(cid);
    const total = links.projects + links.receivables + links.cashTransactions;
    if (total > 0) {
      await audit(user.id, "delete_blocked", "client", cid, { ...links });
      return jsonError(BLOCKED_DELETE_MESSAGE, 409, { links });
    }

    await db.delete(clients).where(eq(clients.id, cid));
    await audit(user.id, "delete", "client", cid, { name: existing.name });
    return jsonOk({ id: cid, deleted: true });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    throw e;
  }
}
