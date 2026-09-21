import { db } from "@/db";
import { expenses, recurringRules, installmentPlans, categories } from "@/db/schema";
import { eq, and, isNull, ne, desc, sql } from "drizzle-orm";
import { todayISO, monthStartISO, monthEndISO, formatDateBR, monthLabel, parsePeriod } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { ensureRecurringUpTo } from "@/lib/actions";
import { Card, Chip, Empty, Label, PageHeader } from "@/components/ui";
import {
  ExpenseModal, PayItemModal, EditExpenseModal, RevertModal, CancelButton,
  RecurringAmountModal, CloseRecurringButton,
} from "@/components/modals";
import { Repeat, CreditCard, CalendarDays } from "lucide-react";

export const dynamic = "force-dynamic";

const num = (v: unknown): number => Number(v ?? 0);

export default async function DespesasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const today = todayISO();
  await ensureRecurringUpTo(today);
  const { year, month } = parsePeriod(sp.periodo);
  const start = monthStartISO(year, month);
  const end = monthEndISO(year, month);
  const nova = sp.nova === "1";

  const cats = await db.select({ id: categories.id, name: categories.name, kind: categories.kind })
    .from(categories).where(isNull(categories.archivedAt)).orderBy(categories.sortOrder);

  const rules = await db
    .select({
      id: recurringRules.id, description: recurringRules.description, amountCents: recurringRules.amountCents,
      dueDay: recurringRules.dueDay, startDate: recurringRules.startDate, endDate: recurringRules.endDate,
      status: recurringRules.status, categoryName: categories.name,
    })
    .from(recurringRules)
    .leftJoin(categories, eq(categories.id, recurringRules.categoryId))
    .orderBy(desc(recurringRules.status), recurringRules.dueDay);

  // Parcelamentos com agregados
  const planAgg = await db.execute(sql`
    SELECT p.id, p.description, p.installment_amount_cents::bigint AS valor, p.total_installments,
           p.first_date, p.status, c.name AS category,
           (SELECT COUNT(*) FROM expenses e WHERE e.installment_plan_id = p.id AND e.status = 'paga')::int AS pagas,
           (SELECT COALESCE(SUM(e2.amount_cents), 0)::bigint FROM expenses e2 WHERE e2.installment_plan_id = p.id AND e2.status = 'pendente') AS restante,
           (SELECT MIN(e3.due_date) FROM expenses e3 WHERE e3.installment_plan_id = p.id AND e3.status = 'pendente') AS prox_venc
    FROM installment_plans p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.status <> 'cancelado'
    ORDER BY p.status ASC, p.id DESC
  `);

  // Competências do mês (todas as despesas com vencimento no mês, não canceladas)
  const mes = await db
    .select({
      id: expenses.id, description: expenses.description, amountCents: expenses.amountCents,
      dueDate: expenses.dueDate, status: expenses.status, paidDate: expenses.paidDate,
      method: expenses.paymentMethod, type: expenses.type,
      installmentNumber: expenses.installmentNumber, installmentTotal: expenses.installmentTotal,
      recurringRuleId: expenses.recurringRuleId, categoryId: expenses.categoryId,
      categoryName: categories.name,
    })
    .from(expenses)
    .leftJoin(categories, eq(categories.id, expenses.categoryId))
    .where(and(ne(expenses.status, "cancelada"), sql`${expenses.dueDate} >= ${start}`, sql`${expenses.dueDate} <= ${end}`))
    .orderBy(expenses.dueDate);

  const totalMes = mes.reduce((s, e) => s + e.amountCents, 0);
  const totalPagoMes = mes.filter((e) => e.status === "paga").reduce((s, e) => s + e.amountCents, 0);

  return (
    <div>
      <PageHeader
        title="Despesas"
        sub={`${monthLabel(year, month)} · ${formatBRL(totalMes)} em despesas`}
        actions={<ExpenseModal categories={cats} defaultOpen={nova} />}
      />

      {/* RESUMO DO MÊS */}
      <div className="anim-fade-up mb-5 grid grid-cols-3 gap-3">
        <Card className="p-4">
          <Label>Total do mês</Label>
          <div className="num mt-1.5 text-[18px] font-semibold">{formatBRL(totalMes)}</div>
        </Card>
        <Card className="p-4">
          <Label>Pago</Label>
          <div className="num mt-1.5 text-[18px] font-semibold text-ok">{formatBRL(totalPagoMes)}</div>
        </Card>
        <Card className="p-4">
          <Label>Pendente</Label>
          <div className="num mt-1.5 text-[18px] font-semibold text-warn">{formatBRL(totalMes - totalPagoMes)}</div>
        </Card>
      </div>

      {/* PARCELAMENTOS */}
      <div className="mb-3 flex items-center gap-2">
        <CreditCard size={15} className="text-muted" />
        <Label>Parcelamentos</Label>
      </div>
      {planAgg.rows.length === 0 ? (
        <Card className="mb-6"><Empty title="Nenhum parcelamento ativo." sub="Compras parceladas, como máquinas, aparecem aqui com o progresso de pagamento." /></Card>
      ) : (
        <div className="mb-6 grid gap-3 md:grid-cols-2">
          {(planAgg.rows as Record<string, unknown>[]).map((p) => {
            const total = num(p.total_installments);
            const pagas = num(p.pagas);
            const restantes = total - pagas;
            const pct = total > 0 ? Math.round((pagas / total) * 100) : 0;
            const encerrado = p.status === "encerrado";
            return (
              <Card key={num(p.id)} className="anim-fade-up p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[15px] font-semibold">{String(p.description)}</div>
                    <div className="mt-0.5 text-[12px] text-muted">
                      {p.category ? `${String(p.category)} · ` : ""}{formatBRL(num(p.valor))}/mês desde {formatDateBR(String(p.first_date).slice(0, 10))}
                    </div>
                  </div>
                  {encerrado ? <Chip tone="neutral">Encerrado</Chip> : <Chip tone="brand">Ativo</Chip>}
                </div>
                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-[12px]">
                    <span className="font-semibold text-ink-soft">{pagas}/{total} pagas</span>
                    <span className="text-muted">{encerrado ? "concluído" : `restam ${restantes}`}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-paper">
                    <div className={`h-full rounded-full ${encerrado ? "bg-ok" : "bg-brand"}`} style={{ width: `${pct}%` }} />
                  </div>
                  {!encerrado ? (
                    <div className="num mt-2.5 flex items-center justify-between text-[12px] text-muted">
                      <span>Saldo futuro: <strong className="text-ink">{formatBRL(num(p.restante))}</strong></span>
                      {p.prox_venc ? <span>Próximo: {formatDateBR(String(p.prox_venc).slice(0, 10))}</span> : null}
                    </div>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* RECORRENTES */}
      <div className="mb-3 flex items-center gap-2">
        <Repeat size={15} className="text-muted" />
        <Label>Despesas recorrentes</Label>
      </div>
      {rules.length === 0 ? (
        <Card className="mb-6"><Empty title="Nenhuma recorrência." sub="Aluguel, contador, pró-labore e outras despesas mensais fixas." /></Card>
      ) : (
        <div className="mb-6 grid gap-3 md:grid-cols-2">
          {rules.map((r) => (
            <Card key={r.id} className="anim-fade-up p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold">{r.description}</div>
                  <div className="mt-0.5 text-[12px] text-muted">
                    {r.categoryName ? `${r.categoryName} · ` : ""}todo dia {r.dueDay} · desde {formatDateBR(r.startDate)}
                  </div>
                </div>
                <div className="num text-[16px] font-semibold">{formatBRL(r.amountCents)}</div>
              </div>
              <div className="mt-3 flex items-center justify-between">
                {r.status === "ativa" ? <Chip tone="brand">Ativa</Chip> : <Chip tone="neutral">Encerrada</Chip>}
                {r.status === "ativa" ? <CloseRecurringButton id={r.id} /> : null}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* COMPETÊNCIAS DO MÊS */}
      <div className="mb-3 flex items-center gap-2">
        <CalendarDays size={15} className="text-muted" />
        <Label>Competências de {monthLabel(year, month)}</Label>
      </div>
      {mes.length === 0 ? (
        <Card><Empty title="Nenhuma despesa neste mês." sub="Use o botão + Despesa para cadastrar." /></Card>
      ) : (
        <div className="space-y-2.5">
          {mes.map((e) => {
            const pago = e.status === "paga";
            const vencida = !pago && e.dueDate < today;
            return (
              <Card key={e.id} className="anim-fade-up p-4">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold">
                      {e.description}
                      {e.installmentNumber ? <span className="text-muted"> · {e.installmentNumber}/{e.installmentTotal}</span> : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-muted">
                      {e.categoryName ? <Chip tone="neutral">{e.categoryName}</Chip> : null}
                      {e.type === "recorrente" ? <Chip tone="brand">Recorrente</Chip> : null}
                      {e.type === "parcelada" ? <Chip tone="brand">Parcelada</Chip> : null}
                      {pago ? (
                        <Chip tone="ok">Paga em {formatDateBR(e.paidDate)}</Chip>
                      ) : vencida ? (
                        <Chip tone="danger">Vencida</Chip>
                      ) : (
                        <Chip tone="caution">Vence {formatDateBR(e.dueDate)}</Chip>
                      )}
                    </div>
                  </div>
                  <div className="num shrink-0 text-[15px] font-semibold">{formatBRL(e.amountCents)}</div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {!pago ? (
                    <>
                      <PayItemModal kind="despesa" id={e.id} title={e.description} amount={e.amountCents} className="btn btn-primary !py-2 text-[12.5px]" label="Pagar" />
                      {e.type === "recorrente" && e.recurringRuleId ? (
                        <RecurringAmountModal expenseId={e.id} currentAmount={e.amountCents} description={e.description} />
                      ) : null}
                      <EditExpenseModal expense={{ id: e.id, description: e.description, categoryId: e.categoryId, amountCents: e.amountCents, dueDate: e.dueDate, paid: false }} categories={cats} />
                      <CancelButton kind="despesa" id={e.id} />
                    </>
                  ) : (
                    <>
                      <EditExpenseModal expense={{ id: e.id, description: e.description, categoryId: e.categoryId, amountCents: e.amountCents, dueDate: e.dueDate, paid: true }} categories={cats} />
                      <RevertModal kind="despesa" id={e.id} title={e.description} amount={e.amountCents} />
                    </>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
