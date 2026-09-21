import { db } from "@/db";
import { cashTransactions } from "@/db/schema";
import { desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { parsePeriod, monthStartISO, monthEndISO, monthLabel, formatDateBR } from "@/lib/dates";
import { getCaixaPeriodo } from "@/lib/finance";
import { formatBRL } from "@/lib/money";
import { Card, Chip, Empty, PageHeader, Label } from "@/components/ui";
import { MonthNav } from "@/components/client";
import { AdjustBalanceModal } from "@/components/modals";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

export const dynamic = "force-dynamic";

const ORIGIN_LABELS: Record<string, string> = {
  recebimento: "Recebimento",
  custo: "Custo de projeto",
  despesa: "Despesa",
  saldo_inicial: "Saldo inicial",
  ajuste: "Ajuste",
  estorno: "Estorno",
};

export default async function FluxoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const { year, month } = parsePeriod(sp.periodo);
  const start = monthStartISO(year, month);
  const end = monthEndISO(year, month);
  const caixa = await getCaixaPeriodo(start, end);

  const movs = await db.select().from(cashTransactions)
    .where(sql`${cashTransactions.date} >= ${start} AND ${cashTransactions.date} <= ${end}`)
    .orderBy(desc(cashTransactions.date), desc(cashTransactions.id))
    .limit(300);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-semibold tracking-tight md:text-[28px]">Fluxo de Caixa</h1>
          <p className="mt-0.5 text-[13px] text-muted">{monthLabel(year, month)} · somente o que realmente aconteceu</p>
        </div>
        <div className="flex items-center gap-2">
          <AdjustBalanceModal />
          <MonthNav period={`${year}-${String(month).padStart(2, "0")}`} />
        </div>
      </div>

      <Card className="anim-fade-up mb-4 bg-sidebar p-6 text-white" >
        <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-white/40">Saldo anterior</div>
            <div className="num mt-1.5 text-[19px] font-semibold">{formatBRL(caixa.saldoAnterior)}</div>
          </div>
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-white/40">Entradas</div>
            <div className="num mt-1.5 text-[19px] font-semibold text-emerald-300">+ {formatBRL(caixa.entradas)}</div>
          </div>
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-white/40">Saídas</div>
            <div className="num mt-1.5 text-[19px] font-semibold text-red-300">− {formatBRL(caixa.saidas)}</div>
          </div>
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-white/40">Saldo atual</div>
            <div className={`num mt-1.5 text-[19px] font-bold ${caixa.saldoAtual >= 0 ? "text-white" : "text-red-300"}`}>{formatBRL(caixa.saldoAtual)}</div>
          </div>
        </div>
        <p className="mt-4 border-t border-white/10 pt-3 text-[11.5px] text-white/40">
          Saldo atual = saldo inicial + entradas realizadas − saídas realizadas
        </p>
      </Card>

      {movs.length === 0 ? (
        <Card><Empty title="Nenhuma movimentação neste mês." sub="Recebimentos confirmados e contas pagas aparecem aqui automaticamente." /></Card>
      ) : (
        <Card className="anim-fade-up p-2 md:p-3">
          <div className="divide-y divide-line">
            {movs.map((m) => {
              const entrada = m.type === "entrada";
              return (
                <div key={m.id} className="flex items-center gap-3 px-3 py-3.5 md:px-4">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${entrada ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger"}`}>
                    {entrada ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-semibold text-ink">{m.description}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted">
                      <span>{formatDateBR(m.date)}</span>
                      {m.refLabel ? <><span aria-hidden>·</span><span className="truncate">{m.refLabel}</span></> : null}
                      <Chip tone={m.origin === "estorno" ? "danger" : "neutral"}>{ORIGIN_LABELS[m.origin] ?? m.origin}</Chip>
                    </div>
                  </div>
                  <div className={`num shrink-0 text-[14.5px] font-semibold ${entrada ? "text-ok" : "text-danger"}`}>
                    {entrada ? "+" : "−"} {formatBRL(m.amountCents)}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <div className="mt-4">
        <Label>Regra do caixa</Label>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
          Nenhuma conta futura entra aqui antes do pagamento. Nenhum recebimento futuro entra antes do recebimento.
          Cada movimentação possui origem identificável e não pode ser duplicada.
        </p>
      </div>
    </div>
  );
}
