import { requireUser, jsonOk, jsonError, AuthError } from "@/lib/auth";
import { db } from "@/db";
import { categories, settings } from "@/db/schema";
import { ensureSeed } from "@/lib/ensure";
import { PROJECT_STATUSES, BALANCE_MODES, PAYMENT_METHODS } from "@/lib/constants";

export async function GET() {
  try {
    await requireUser();
    await ensureSeed();
    const cats = await db.select().from(categories);
    const s = await db.select().from(settings).limit(1);
    return jsonOk({
      categories: cats.sort((a, b) => a.name.localeCompare(b.name)),
      settings: s[0] || null,
      projectStatuses: PROJECT_STATUSES,
      balanceModes: BALANCE_MODES,
      paymentMethods: PAYMENT_METHODS,
    });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    throw e;
  }
}
