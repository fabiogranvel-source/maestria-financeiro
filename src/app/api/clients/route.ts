import { db } from "@/db";
import { clients, projects } from "@/db/schema";
import { requireUser, jsonOk, jsonError, AuthError, audit } from "@/lib/auth";
import { desc, sql } from "drizzle-orm";
import { normalizeDoc, isValidDoc } from "@/lib/clients";

// Selecao padrao: todos os campos do cliente + quantidade de projetos vinculados
// (usado pela tela de Clientes para sinalizar registros com movimentacao).
const clientSelection = {
  id: clients.id,
  name: clients.name,
  cpfCnpj: clients.cpfCnpj,
  phone: clients.phone,
  email: clients.email,
  address: clients.address,
  notes: clients.notes,
  createdAt: clients.createdAt,
  updatedAt: clients.updatedAt,
  projectCount: sql<number>`(select count(*) from ${projects} where ${projects.clientId} = ${clients.id})`,
};

export async function GET() {
  try {
    await requireUser();
    const rows = await db
      .select(clientSelection)
      .from(clients)
      .orderBy(desc(clients.id));
    return jsonOk(rows);
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    throw e;
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const name = String(body.name || "").trim();
    if (!name) return jsonError("Nome do cliente é obrigatório.");
    if (!isValidDoc(body.cpfCnpj)) {
      return jsonError("CPF/CNPJ inválido — informe 11 (CPF) ou 14 (CNPJ) dígitos.");
    }
    const cpfCnpj = normalizeDoc(body.cpfCnpj);
    const [row] = await db
      .insert(clients)
      .values({
        name,
        cpfCnpj: cpfCnpj || null,
        phone: body.phone ? String(body.phone) : null,
        email: body.email ? String(body.email) : null,
        address: body.address ? String(body.address) : null,
        notes: body.notes ? String(body.notes) : null,
      })
      .returning();
    await audit(user.id, "create", "client", row.id, { name });
    return jsonOk(row, 201);
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    throw e;
  }
}
