import { db } from "@/db";
import { clients, projects } from "@/db/schema";
import { requireUser, jsonOk, jsonError, AuthError, audit } from "@/lib/auth";
import { eq, desc, sql } from "drizzle-orm";

export async function GET() {
  try {
    await requireUser();
    const rows = await db.select().from(clients).orderBy(desc(clients.id));
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
    const [row] = await db
      .insert(clients)
      .values({
        name,
        phone: body.phone ? String(body.phone) : null,
        email: body.email ? String(body.email) : null,
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
