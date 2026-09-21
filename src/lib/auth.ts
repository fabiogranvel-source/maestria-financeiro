import { cookies } from "next/headers";
import { db } from "@/db";
import { sessions, users, auditLogs } from "@/db/schema";
import { eq, and, gt } from "drizzle-orm";
import crypto from "crypto";

export const SESSION_COOKIE = "maestria_session";
export const SESSION_DAYS = 30;

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function newToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function getSessionUser(): Promise<{ id: number; name: string; email: string; role: string } | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const tokenHash = hashToken(token);
  const now = new Date();
  const rows = await db
    .select({
      userId: sessions.userId,
      expiresAt: sessions.expiresAt,
      name: users.name,
      email: users.email,
      role: users.role,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
    .limit(1);
  if (rows.length === 0) return null;
  const r = rows[0];
  return { id: r.userId, name: r.name, email: r.email, role: r.role || "admin" };
}

export async function requireUser() {
  const u = await getSessionUser();
  if (!u) throw new AuthError("Não autenticado", 401);
  return u;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export async function audit(
  userId: number | null,
  action: string,
  entityType: string,
  entityId?: number | null,
  details?: unknown
) {
  try {
    await db.insert(auditLogs).values({
      userId: userId ?? undefined,
      action,
      entityType,
      entityId: entityId ?? undefined,
      details: (details as object) ?? undefined,
    });
  } catch {
    // nunca quebrar operação por falha de auditoria
  }
}

export function jsonError(message: string, status = 400, extra?: Record<string, unknown>) {
  return Response.json({ ok: false, error: message, ...extra }, { status });
}

export function jsonOk<T>(data: T, status = 200) {
  return Response.json({ ok: true, data }, { status });
}
