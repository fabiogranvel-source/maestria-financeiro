import { db } from "@/db";
import { attachments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return new Response("Não autorizado", { status: 401 });

  const { id } = await params;
  const [file] = await db.select().from(attachments).where(eq(attachments.id, Number(id))).limit(1);
  if (!file) return new Response("Não encontrado", { status: 404 });

  const buf = Buffer.from(file.data, "base64");
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
