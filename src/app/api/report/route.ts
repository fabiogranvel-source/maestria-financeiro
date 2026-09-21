import { db } from "@/db";
import { projects, clients, paymentsReceived, projectCosts, expenses, cashTransactions, settings } from "@/db/schema";
import { requireUser, jsonOk, jsonError, AuthError } from "@/lib/auth";
import { and, gte, lte, eq, isNull, sql } from "drizzle-orm";
import { competenceRange, todayISO } from "@/lib/format";

export async function GET(req: Request) {
  try {
    await requireUser();
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month") || todayISO().slice(0, 7);
    const { start, end } = competenceRange(month);

    const s = await db.select().from(settings).limit(1);

    const sold = await db
      .select({ total: sql<number>`coalesce(sum(${projects.totalValueCents}),0)`, n: sql<number>`count(*)` })
      .from(projects)
      .where(and(gte(projects.saleDate, start), lte(projects.saleDate, end), isNull(projects.deletedAt)));

    const projs = await db
      .select({
        id: projects.id,
        title: projects.title,
        clientName: clients.name,
        saleDate: projects.saleDate,
        totalValueCents: projects.totalValueCents,
        status: projects.status,
      })
      .from(projects)
      .innerJoin(clients, eq(clients.id, projects.clientId))
      .where(and(gte(projects.saleDate, start), lte(projects.saleDate, end), isNull(projects.deletedAt)));

    const recvd = await db
      .select({ total: sql<number>`coalesce(sum(${paymentsReceived.amountCents}),0)` })
      .from(paymentsReceived)
      .where(and(gte(paymentsReceived.paidAt, start), lte(paymentsReceived.paidAt, end), sql`${paymentsReceived.reversedAt} is null`));

    const costsPaid = await db
      .select({ total: sql<number>`coalesce(sum(${projectCosts.amountCents}),0)` })
      .from(projectCosts)
      .where(and(eq(projectCosts.status, "paid"), gte(projectCosts.paidAt, start), lte(projectCosts.paidAt, end), isNull(projectCosts.deletedAt)));

    const expPaid = await db
      .select({ total: sql<number>`coalesce(sum(${expenses.amountCents}),0)` })
      .from(expenses)
      .where(and(eq(expenses.status, "paid"), gte(expenses.paidAt, start), lte(expenses.paidAt, end), isNull(expenses.deletedAt)));

    const cashM = await db
      .select({
        inCents: sql<number>`coalesce(sum(case when ${cashTransactions.type}='entry' and ${cashTransactions.reversed}=false then ${cashTransactions.amountCents} else 0 end),0)`,
        outCents: sql<number>`coalesce(sum(case when ${cashTransactions.type}='exit' and ${cashTransactions.reversed}=false then ${cashTransactions.amountCents} else 0 end),0)`,
      })
      .from(cashTransactions)
      .where(and(gte(cashTransactions.occurredAt, start), lte(cashTransactions.occurredAt, end)));

    const cashAll = await db.select({
      inCents: sql<number>`coalesce(sum(case when ${cashTransactions.type}='entry' and ${cashTransactions.reversed}=false then ${cashTransactions.amountCents} else 0 end),0)`,
      outCents: sql<number>`coalesce(sum(case when ${cashTransactions.type}='exit' and ${cashTransactions.reversed}=false then ${cashTransactions.amountCents} else 0 end),0)`,
    }).from(cashTransactions);

    const recvdC = Number(recvd[0]?.total || 0);
    const costsC = Number(costsPaid[0]?.total || 0);
    const expC = Number(expPaid[0]?.total || 0);

    return jsonOk({
      month,
      company: s[0]?.companyName || "Maestria",
      soldCents: Number(sold[0]?.total || 0),
      soldCount: Number(sold[0]?.n || 0),
      receivedCents: recvdC,
      costsPaidCents: costsC,
      expensesPaidCents: expC,
      resultCents: recvdC - costsC - expC,
      cashInCents: Number(cashM[0]?.inCents || 0),
      cashOutCents: Number(cashM[0]?.outCents || 0),
      balanceCents: Number(cashAll[0]?.inCents || 0) - Number(cashAll[0]?.outCents || 0),
      projects: projs.map((p) => ({ ...p, totalValueCents: Number(p.totalValueCents) })),
    });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    throw e;
  }
}
