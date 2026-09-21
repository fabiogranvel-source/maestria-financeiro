"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { centsToBRL, currentCompetence, monthLabel } from "@/lib/format";
import { Card, Money, MonthNav, PageHeader, Skeleton, Btn } from "@/components/ui";

type Dash = {
  month: string;
  cards: {
    balanceCents: number; soldCents: number; receivedCents: number; pendingCents: number;
    projectCostsCents: number; projectCostsPaidCents: number;
    generalExpensesCents: number; generalExpensesPaidCents: number;
    resultCents: number; cashInCents: number; cashOutCents: number;
  };
};

export default function ResultadoPage() {
  const [month, setMonth] = useState(currentCompetence());
  const [data, setData] = useState<Dash | null>(null);

  useEffect(() => {
    setData(null);
    api<Dash>(`/api/dashboard?month=${month}`).then(setData).catch(() => {});
  }, [month]);

  const c = data?.cards;

  return (
    <div>
      <PageHeader
        title="Resultado mensal"
        subtitle="Camada gerencial — não confundir com caixa"
        right={
          <a href={`/relatorio?month=${month}`}>
            <Btn variant="secondary">Exportar PDF</Btn>
          </a>
        }
      />
      <MonthNav month={month} onChange={setMonth} />

      {!data || !c ? (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-64" />
        </div>
      ) : (
        <>
          <Card className="mt-3 overflow-hidden !p-0">
            <div className="bg-emerald-950 px-5 py-4 text-white">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-200/70">{monthLabel(month)}</p>
              <p className="mt-0.5 text-sm text-emerald-100/80">Fechamento gerencial do período</p>
            </div>
            <div className="divide-y divide-stone-100">
              <Row label="Vendido" hint="projetos cadastrados no período" cents={c.soldCents} />
              <Row label="Recebido" hint="pagamentos efetivos no período" cents={c.receivedCents} tone="text-emerald-700" />
              <Row label="A receber" hint="saldo total em aberto (todos os períodos)" cents={c.pendingCents} tone="text-amber-700" />
              <Row label="Custos das obras (vencimento no mês)" hint={`pagos no mês: ${centsToBRL(c.projectCostsPaidCents)}`} cents={c.projectCostsCents} negative />
              <Row label="Despesas gerais (vencimento no mês)" hint={`pagas no mês: ${centsToBRL(c.generalExpensesPaidCents)}`} cents={c.generalExpensesCents} negative />
              <Row label="Entradas de caixa" hint="movimentado no período" cents={c.cashInCents} tone="text-emerald-700" />
              <Row label="Saídas de caixa" hint="movimentado no período" cents={c.cashOutCents} negative />
              <div className="flex items-center justify-between bg-stone-50 px-5 py-4">
                <div>
                  <p className="font-black">Resultado gerencial</p>
                  <p className="text-xs text-stone-400">recebido − custos pagos − despesas pagas</p>
                </div>
                <Money cents={c.resultCents} className={`text-xl font-black ${c.resultCents >= 0 ? "text-emerald-700" : "text-red-600"}`} />
              </div>
              <div className="flex items-center justify-between bg-emerald-950 px-5 py-4 text-white">
                <div>
                  <p className="font-black">Saldo final de caixa</p>
                  <p className="text-xs text-emerald-200/70">posição real disponível</p>
                </div>
                <p className="text-xl font-black">{centsToBRL(c.balanceCents)}</p>
              </div>
            </div>
          </Card>
          <p className="mt-3 text-xs leading-relaxed text-stone-400">
            Lançamentos esquecidos podem ser corrigidos a qualquer momento — todos os indicadores são recalculados automaticamente. Nenhum mês é bloqueado permanentemente.
          </p>
        </>
      )}
    </div>
  );
}

function Row({ label, hint, cents, tone = "", negative }: { label: string; hint?: string; cents: number; tone?: string; negative?: boolean }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5">
      <div>
        <p className="text-[15px] font-semibold">{label}</p>
        {hint && <p className="text-xs text-stone-400">{hint}</p>}
      </div>
      <Money cents={negative ? -Math.abs(cents) : cents} className={`text-[15px] font-black ${tone}`} />
    </div>
  );
}
