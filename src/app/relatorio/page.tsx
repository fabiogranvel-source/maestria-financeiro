"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { centsToBRL, monthLabel, currentCompetence, formatDateBR, projectStatusLabel } from "@/lib/format";
import { MonthNav } from "@/components/ui";

type Report = {
  month: string; company: string;
  soldCents: number; soldCount: number; receivedCents: number;
  costsPaidCents: number; expensesPaidCents: number; resultCents: number;
  cashInCents: number; cashOutCents: number; balanceCents: number;
  projects: { id: number; title: string; clientName: string; saleDate: string; totalValueCents: number; status: string }[];
};

function RelatorioInner() {
  const params = useSearchParams();
  const [month, setMonth] = useState(params.get("month") || currentCompetence());
  const [data, setData] = useState<Report | null>(null);

  useEffect(() => {
    setData(null);
    api<Report>(`/api/report?month=${month}`).then(setData).catch(() => {});
  }, [month]);

  return (
    <div>
      <div className="no-print mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Relatório mensal</h1>
          <p className="text-sm text-stone-500">Use a impressão do navegador para salvar em PDF</p>
        </div>
        <button onClick={() => window.print()} className="min-h-[44px] rounded-xl bg-emerald-950 px-5 text-sm font-bold text-white">
          ⎙ Imprimir / PDF
        </button>
      </div>
      <div className="no-print mb-4">
        <MonthNav month={month} onChange={setMonth} />
      </div>

      {!data ? (
        <p className="text-sm text-stone-500">Carregando…</p>
      ) : (
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-10">
          <div className="border-b-2 border-emerald-950 pb-4">
            <p className="text-2xl font-black tracking-tight text-emerald-950">MAESTRIA FINANCEIRO</p>
            <p className="mt-1 text-sm font-semibold text-stone-500">
              Relatório gerencial — {monthLabel(data.month)} · {data.company}
            </p>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <R label="Vendas" cents={data.soldCents} sub={`${data.soldCount} projeto(s)`} />
            <R label="Recebimentos" cents={data.receivedCents} />
            <R label="Custos das obras (pagos)" cents={data.costsPaidCents} neg />
            <R label="Despesas gerais (pagas)" cents={data.expensesPaidCents} neg />
            <R label="Resultado gerencial" cents={data.resultCents} big />
            <R label="Saldo final de caixa" cents={data.balanceCents} big />
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-stone-50 p-4">
              <p className="text-xs font-bold uppercase text-stone-400">Entradas de caixa</p>
              <p className="mt-1 text-lg font-black text-emerald-700">{centsToBRL(data.cashInCents)}</p>
            </div>
            <div className="rounded-xl bg-stone-50 p-4">
              <p className="text-xs font-bold uppercase text-stone-400">Saídas de caixa</p>
              <p className="mt-1 text-lg font-black text-red-600">{centsToBRL(data.cashOutCents)}</p>
            </div>
          </div>

          <h2 className="mt-8 text-base font-black">Projetos do período</h2>
          {data.projects.length === 0 ? (
            <p className="mt-2 text-sm text-stone-500">Nenhum projeto vendido no período.</p>
          ) : (
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-xs uppercase text-stone-400">
                  <th className="py-2 pr-2">Cliente</th>
                  <th className="py-2 pr-2">Projeto</th>
                  <th className="py-2 pr-2">Data</th>
                  <th className="py-2 pr-2">Status</th>
                  <th className="py-2 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {data.projects.map((p) => (
                  <tr key={p.id} className="border-b border-stone-100">
                    <td className="py-2.5 pr-2 font-bold">{p.clientName}</td>
                    <td className="py-2.5 pr-2">{p.title}</td>
                    <td className="py-2.5 pr-2">{formatDateBR(p.saleDate)}</td>
                    <td className="py-2.5 pr-2">{projectStatusLabel(p.status)}</td>
                    <td className="py-2.5 text-right font-bold">{centsToBRL(p.totalValueCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <p className="mt-8 border-t border-stone-200 pt-4 text-xs text-stone-400">
            Resultado gerencial = recebimentos − custos pagos − despesas pagas. Saldo de caixa = posição real disponível.
            Gerado em {new Date().toLocaleString("pt-BR")}.
          </p>
        </div>
      )}
    </div>
  );
}

function R({ label, cents, sub, neg, big }: { label: string; cents: number; sub?: string; neg?: boolean; big?: boolean }) {
  return (
    <div className={`rounded-xl p-4 ${big ? "bg-emerald-950 text-white" : "bg-stone-50"}`}>
      <p className={`text-xs font-bold uppercase ${big ? "text-emerald-200/70" : "text-stone-400"}`}>{label}</p>
      <p className={`mt-1 font-black ${big ? "text-xl" : "text-lg"} ${!big && neg ? "text-red-600" : ""}`}>
        {neg ? `− ${centsToBRL(cents)}` : centsToBRL(cents)}
      </p>
      {sub && <p className={`mt-0.5 text-xs ${big ? "text-emerald-200/70" : "text-stone-400"}`}>{sub}</p>}
    </div>
  );
}

export default function RelatorioPage() {
  return (
    <Suspense>
      <RelatorioInner />
    </Suspense>
  );
}
