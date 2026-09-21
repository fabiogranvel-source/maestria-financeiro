import { db } from "@/db";
import { attachments } from "@/db/schema";
import { requireUser, jsonOk, jsonError, AuthError, audit } from "@/lib/auth";
import { eq, and, desc } from "drizzle-orm";

export async function GET(req: Request) {
  try {
    await requireUser();
    const { searchParams } = new URL(req.url);
    const singleId = Number(searchParams.get("id") || 0);
    if (singleId) {
      const rows = await db.select().from(attachments).where(eq(attachments.id, singleId)).limit(1);
      if (rows.length === 0) return jsonError("Anexo não encontrado.", 404);
      return jsonOk(rows[0]);
    }
    const type = searchParams.get("type") || "project";
    const relatedId = Number(searchParams.get("relatedId"));
    if (!relatedId) return jsonError("relatedId obrigatório.");
    const rows = await db
      .select()
      .from(attachments)
      .where(and(eq(attachments.relatedType, type), eq(attachments.relatedId, relatedId)))
      .orderBy(desc(attachments.id));
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
    const relatedType = String(body.relatedType || "project");
    const relatedId = Number(body.relatedId);
    const fileName = String(body.fileName || "arquivo");
    const dataUrl = String(body.dataUrl || "");
    if (!relatedId || !dataUrl) return jsonError("Arquivo inválido.");
    if (dataUrl.length > 4_000_000) return jsonError("Arquivo muito grande (máx. ~3MB).");
    const [row] = await db
      .insert(attachments)
      .values({
        relatedType,
        relatedId,
        fileName,
        mimeType: body.mimeType ? String(body.mimeType) : null,
        dataUrl,
        sizeBytes: dataUrl.length,
        createdBy: user.id,
      })
      .returning();
    await audit(user.id, "upload", "attachment", row.id, { relatedType, relatedId, fileName });
    return jsonOk({ id: row.id, fileName: row.fileName }, 201);
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    throw e;
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("id"));
    if (!id) return jsonError("id obrigatório.");
    await db.delete(attachments).where(eq(attachments.id, id));
    await audit(user.id, "delete", "attachment", id);
    return jsonOk({ id });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    throw e;
  }
}
