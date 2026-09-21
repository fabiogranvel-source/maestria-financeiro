import { db } from "@/db";
import { users, sessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { newToken, hashToken, SESSION_COOKIE, SESSION_DAYS, jsonError, audit } from "@/lib/auth";
import { ensureSeed } from "@/lib/ensure";

export async function POST(req: Request) {
  await ensureSeed();
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!email || !password) return jsonError("Informe e-mail e senha.", 400);
  const found = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (found.length === 0) return jsonError("Credenciais inválidas.", 401);
  const u = found[0];
  const ok = await bcrypt.compare(password, u.passwordHash);
  if (!ok) return jsonError("Credenciais inválidas.", 401);
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  await db.insert(sessions).values({ userId: u.id, tokenHash: hashToken(token), expiresAt: expires });
  await audit(u.id, "login", "user", u.id);
  const res = Response.json({ ok: true, data: { id: u.id, name: u.name, email: u.email, role: u.role } });
  res.headers.set(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`
  );
  return res;
}
