import { db } from "@/db";
import {
  projects, receivables, paymentsReceived, projectCosts, expenses,
  cashTransactions, categories, recurringRules,
} from "@/db/schema";
import { requireUser, jsonOk, jsonError, AuthError } from "@/lib/auth";
import { and, gte, lte, eq, isNull, sql, ne } from "drizzle-orm";
import { competenceRange, todayISO, shiftMonth } from "@/lib/format";
import { managerialResult } from "@/lib/finance";
import { ensureRecurringCompetences } from "@/lib/ensure";

export async function GET(req: Request) {
  try {
    await requireUser();
    await ensureRecurringCompetences(3);
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month") || todayISO().slice(0, 7);
    const { start, end } = competenceRange(month);
    const today = todayISO();
    const in7 = new Date(new Date(today + "T12:00:00Z").getTime() + 7 * 86400000)
      .toISOString()
      .slice(0, 10);

    // Vendas do mês (sale_date no mês)
    const sold = await db
      .select({ total: sql<number>`coalesce(sum(${projects.totalValueCents}),0)` })
      .from(projects)
      .where(and(gte(projects.saleDate, start), lte(projects.saleDate, end), isNull(projects.deletedAt)));

    // Recebido no mês (payments pago no mês, não estornado)
    const recvd = await db
      .select({ total: sql<number>`coalesce(sum(${paymentsReceived.amountCents}),0)` })
      .from(paymentsReceived)
      .where(
        and(
          gte(paymentsReceived.paidAt, start),
          lte(paymentsReceived.paidAt, end),
          sql`${paymentsReceived.reversedAt} is null`
        )
      );

    // A receber total (aberto)
    const open = await db
      .select({ total: sql<number>`coalesce(sum(${receivables.amountCents} - ${receivables.receivedCents}),0)` })
      .from(receivables)
      .where(ne(receivables.status, "cancelled"));

    // Custos: pagos no mês + previstos com vencimento no mês
    const costsPaid = await db
      .select({ total: sql<number>`coalesce(sum(${projectCosts.amountCents}),0)` })
      .from(projectCosts)
      .where(
        and(
          eq(projectCosts.status, "paid"),
          gte(projectCosts.paidAt, start),
          lte(projectCosts.paidAt, end),
          isNull(projectCosts.deletedAt)
        )
      );
    const costsDue = await db
      .select({ total: sql<number>`coalesce(sum(${projectCosts.amountCents}),0)` })
      .from(projectCosts)
      .where(
        and(
          ne(projectCosts.status, "cancelled"),
          gte(projectCosts.dueDate, start),
          lte(projectCosts.dueDate, end),
          isNull(projectCosts.deletedAt)
        )
      );

    // Despesas gerais: pagas no mês + vencimento no mês
    const expPaid = await db
      .select({ total: sql<number>`coalesce(sum(${expenses.amountCents}),0)` })
      .from(expenses)
      .where(
        and(
          eq(expenses.status, "paid"),
          gte(expenses.paidAt, start),
          lte(expenses.paidAt, end),
          isNull(expenses.deletedAt)
        )
      );
    const expDue = await db
      .select({ total: sql<number>`coalesce(sum(${expenses.amountCents}),0)` })
      .from(expenses)
      .where(
        and(
          ne(expenses.status, "cancelled"),
          gte(expenses.dueDate, start),
          lte(expenses.dueDate, end),
          isNull(expenses.deletedAt)
        )
      );

    // Caixa: entradas/saídas no mês + saldo total
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

    // Últimos 6 meses: recebido x pago
    const history: { month: string; inCents: number; outCents: number; resultCents: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const m = shiftMonth(month, -i);
      const r = competenceRange(m);
      const h = await db
        .select({
          inCents: sql<number>`coalesce(sum(case when ${cashTransactions.type}='entry' and ${cashTransactions.reversed}=false then ${cashTransactions.amountCents} else 0 end),0)`,
          outCents: sql<number>`coalesce(sum(case when ${cashTransactions.type}='exit' and ${cashTransactions.reversed}=false then ${cashTransactions.amountCents} else 0 end),0)`,
        })
        .from(cashTransactions)
        .where(and(gte(cashTransactions.occurredAt, r.start), lte(cashTransactions.occurredAt, r.end)));
      const hi = Number(h[0]?.inCents || 0);
      const ho = Number(h[0]?.outCents || 0);
      history.push({ month: m, inCents: hi, outCents: ho, resultCents: hi - ho });
    }

    // Atenção necessária
    const overdueRecv = await db
      .select({ n: sql<number>`count(*)`, total: sql<number>`coalesce(sum(${receivables.amountCents}-${receivables.receivedCents}),0)` })
      .from(receivables)
      .where(
        and(
          ne(receivables.status, "received"),
          ne(receivables.status, "cancelled"),
          sql`${receivables.dueDate} is not null`,
          sql`${receivables.dueDate} < ${today}`
        )
      );
    const todayRecv = await db
      .select({ n: sql<number>`count(*)` })
      .from(receivables)
      .where(
        and(
          ne(receivables.status, "received"),
          ne(receivables.status, "cancelled"),
          eq(receivables.dueDate, today)
        )
      );
    const soonRecv = await db
      .select({ n: sql<number>`count(*)` })
      .from(receivables)
      .where(
        and(
          ne(receivables.status, "received"),
          ne(receivables.status, "cancelled"),
          sql`${receivables.dueDate} > ${today}`,
          sql`${receivables.dueDate} <= ${in7}`
        )
      );
    const overduePayCosts = await db
      .select({ n: sql<number>`count(*)` })
      .from(projectCosts)
      .where(
        and(
          eq(projectCosts.status, "pending"),
          sql`${projectCosts.dueDate} is not null`,
          sql`${projectCosts.dueDate} < ${today}`,
          isNull(projectCosts.deletedAt)
        )
      );
    const overduePayExp = await db
      .select({ n: sql<number>`count(*)` })
      .from(expenses)
      .where(
        and(
          eq(expenses.status, "pending"),
          sql`${expenses.dueDate} is not null`,
          sql`${expenses.dueDate} < ${today}`,
          isNull(expenses.deletedAt)
        )
      );
    const todayPay = await db
      .select({ n: sql<number>`count(*)` })
      .from(expenses)
      .where(and(eq(expenses.status, "pending"), eq(expenses.dueDate, today), isNull(expenses.deletedAt)));
    const todayPayCosts = await db
      .select({ n: sql<number>`count(*)` })
      .from(projectCosts)
      .where(and(eq(projectCosts.status, "pending"), eq(projectCosts.dueDate, today), isNull(projectCosts.deletedAt)));
    const soonPay = await db
      .select({ n: sql<number>`count(*)` })
      .from(expenses)
      .where(
        and(
          eq(expenses.status, "pending"),
          sql`${expenses.dueDate} > ${today}`,
          sql`${expenses.dueDate} <= ${in7}`,
          isNull(expenses.deletedAt)
        )
      );
    const soonPayCosts = await db
      .select({ n: sql<number>`count(*)` })
      .from(projectCosts)
      .where(
        and(
          eq(projectCosts.status, "pending"),
          sql`${projectCosts.dueDate} > ${today}`,
          sql`${projectCosts.dueDate} <= ${in7}`,
          isNull(projectCosts.deletedAt)
        )
      );

    // Onde gastamos (saídas do mês por categoria)
    const byCat = await db
      .select({
        category: categories.name,
        total: sql<number>`coalesce(sum(${cashTransactions.amountCents}),0)`,
      })
      .from(cashTransactions)
      .leftJoin(categories, eq(categories.id, cashTransactions.categoryId))
      .where(
        and(
          eq(cashTransactions.type, "exit"),
          eq(cashTransactions.reversed, false),
          gte(cashTransactions.occurredAt, start),
          lte(cashTransactions.occurredAt, end)
        )
      )
      .groupBy(categories.name)
      .orderBy(sql`coalesce(sum(${cashTransactions.amountCents}),0) desc`);

    const soldC = Number(sold[0]?.total || 0);
    const recvdC = Number(recvd[0]?.total || 0);
    const costsPaidC = Number(costsPaid[0]?.total || 0);
    const expPaidC = Number(expPaid[0]?.total || 0);
    const cashIn = Number(cashM[0]?.inCents || 0);
    const cashOut = Number(cashM[0]?.outCents || 0);
    const balance = Number(cashAll[0]?.inCents || 0) - Number(cashAll[0]?.outCents || 0);

    return jsonOk({
      month,
      cards: {
        balanceCents: balance,
        soldCents: soldC,
        receivedCents: recvdC,
        pendingCents: Math.max(0, Number(open[0]?.total || 0)),
        projectCostsCents: Number(costsDue[0]?.total || 0),
        projectCostsPaidCents: costsPaidC,
        generalExpensesCents: Number(expDue[0]?.total || 0),
        generalExpensesPaidCents: expPaidC,
        resultCents: managerialResult(recvdC, costsPaidC, expPaidC),
        cashInCents: cashIn,
        cashOutCents: cashOut,
      },
      history,
      alerts: {
        overdueRecv: { count: Number(overdueRecv[0]?.n || 0), totalCents: Number(overdueRecv[0]?.total || 0) },
        todayRecv: Number(todayRecv[0]?.n || 0),
        soonRecv: Number(soonRecv[0]?.n || 0),
        overduePay: Number(overduePayCosts[0]?.n || 0) + Number(overduePayExp[0]?.n || 0),
        todayPay: Number(todayPay[0]?.n || 0) + Number(todayPayCosts[0]?.n || 0),
        soonPay: Number(soonPay[0]?.n || 0) + Number(soonPayCosts[0]?.n || 0),
      },
      spendingByCategory: byCat.map((b) => ({ category: b.category || "Sem categoria", totalCents: Number(b.total) })),
    });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    console.error(e);
    throw e;
  }
}
