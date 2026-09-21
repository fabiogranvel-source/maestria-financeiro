import { db } from "@/db";
import { categories } from "@/db/schema";
import { requireUser, jsonOk, jsonError, AuthError, audit } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    await requireUser();
    const rows = await db.select().from(categories);
    rows.sort((a, b) => a.name.localeCompare(b.name));
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
    if (!name) return jsonError("Nome da categoria é obrigatório.");
    const [row] = await db
      .insert(categories)
      .values({ name, kind: String(body.kind || "both") })
      .returning()
      .catch(() => [] as never[]);
    if (!row) return jsonError("Categoria já existe.");
    await audit(user.id, "create", "category", (row as { id: number }).id, { name });
    return jsonOk(row, 201);
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    return jsonError("Erro ao criar categoria.", 500);
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const id = Number(body.id);
    const name = String(body.name || "").trim();
    if (!id || !name) return jsonError("Dados inválidos.");
    await db.update(categories).set({ name }).where(eq(categories.id, id));
    await audit(user.id, "update", "category", id, { name });
    return jsonOk({ id, name });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    throw e;
  }
}
