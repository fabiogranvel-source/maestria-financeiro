import { getSessionUser, jsonOk, jsonError } from "@/lib/auth";
import { ensureSeed } from "@/lib/ensure";

export async function GET() {
  await ensureSeed();
  const u = await getSessionUser();
  if (!u) return jsonError("Não autenticado", 401);
  return jsonOk(u);
}
