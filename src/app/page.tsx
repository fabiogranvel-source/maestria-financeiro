"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { centsToBRL, monthLabel, currentCompetence } from "@/lib/format";
import { Card, Money, MonthNav, Skeleton, StatusPill } from "@/components/ui";

type Dash = {
  month: string;
  cards: {
    balanceCents: number;
    soldCents: number;
    receivedCents: number;
    pendingCents: number;
    projectCostsCents: number;
    projectCostsPaidCents: number;
    generalExpensesCents: number;
    generalExpensesPaidCents: number;
    resultCents: number;
    cashInCents: number;
    cashOutCents: number;
  };
  history: { month: string; inCents: number; outCents: number; resultCents: number }[];
  alerts: {
    overdueRecv: { count: number; totalCents: number };
    todayRecv: number;
    soonRecv: number;
    overduePay: number;
    todayPay: number;
    soonPay: number;
  };
  spendingByCategory: { category: string; totalCents: number }[];
};

export default function DashboardPage() {
  const [month, setMonth] = useState(currentCompetence());
  const [data, setData] = useState<Dash | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    setData(null);
    setErr("");
    api<Dash>(`/api/dashboard?month=${month}`)
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "Erro ao carregar"));
  }, [month]);

  const maxHist = data ? Math.max(1, ...data.history.flatMap((h) => [h.inCents, h.outCents])) : 1;
  const maxCat = data?.spendingByCategory[0]?.totalCents || 1;

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-black tracking-tight text-emerald-950 sm:text-2xl">MAESTRIA FINANCEIRO</h1>
        <p className="text-sm text-stone-500">{data ? monthLabel(data.month) : "…"}</p>
      </div>
      <MonthNav month={month} onChange={setMonth} />

      {err && <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700">{err}</p>}

      {!data ? (
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <>
          {/* Saldo em destaque */}
          <Card className="mt-4 overflow-hidden !border-emerald-950 bg-emerald-950 p-5 text-white">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-200/80">Saldo em caixa</p>
            <p className="mt-1 text-4xl font-black tracking-tight">{centsToBRL(data.cards.balanceCents)}</p>
            <div className="mt-3 flex gap-4 text-sm">
              <span className="font-semibold text-emerald-200">
                ↑ {centsToBRL(data.cards.cashInCents)} <span className="font-normal opacity-70">entradas</span>
              </span>
              <span className="font-semibold text-red-200">
                ↓ {centsToBRL(data.cards.cashOutCents)} <span className="font-normal opacity-70">saídas</span>
              </span>
            </div>
          </Card>

          {/* Cards */}
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Vendas do mês" value={data.cards.soldCents} hint="projetos vendidos" />
            <Kpi label="Recebido" value={data.cards.receivedCents} hint="efetivamente recebido" tone="green" />
            <Kpi label="A receber" value={data.cards.pendingCents} hint="saldo de clientes" tone={data.cards.pendingCents > 0 ? "amber" : undefined} />
            <Kpi
              label="Resultado"
              value={data.cards.resultCents}
              hint="recebido − pago"
              tone={data.cards.resultCents >= 0 ? "green" : "red"}
            />
            <Kpi label="Custos das obras" value={data.cards.projectCostsCents} hint={`pago ${centsToBRL(data.cards.projectCostsPaidCents)}`} />
            <Kpi label="Despesas gerais" value={data.cards.generalExpensesCents} hint={`pago ${centsToBRL(data.cards.generalExpensesPaidCents)}`} />
            <Kpi label="Entradas (caixa)" value={data.cards.cashInCents} hint="movimentado no mês" tone="green" />
            <Kpi label="Saídas (caixa)" value={data.cards.cashOutCents} hint="movimentado no mês" tone="red" />
          </div>

          {/* Atenção necessária */}
          <Attention alerts={data.alerts} />

          {/* Entradas x Saídas */}
          <Card className="mt-4 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[15px] font-bold">Entradas × Saídas</h2>
              <span className="text-xs font-semibold text-stone-400">últimos 6 meses</span>
            </div>
            <div className="flex h-44 items-end gap-3 sm:gap-4">
              {data.history.map((h) => (
                <div key={h.month} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-32 w-full items-end justify-center gap-1">
                    <div
                      className="w-full max-w-[22px] rounded-t-md bg-emerald-700"
                      style={{ height: `${Math.max(3, (h.inCents / maxHist) * 100)}%` }}
                      title={`Entradas ${centsToBRL(h.inCents)}`}
                    />
                    <div
                      className="w-full max-w-[22px] rounded-t-md bg-stone-300"
                      style={{ height: `${Math.max(3, (h.outCents / maxHist) * 100)}%` }}
                      title={`Saídas ${centsToBRL(h.outCents)}`}
                    />
                  </div>
                  <span className="text-[11px] font-bold text-stone-500">{h.month.slice(5)}/{h.month.slice(2, 4)}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-4 text-xs font-semibold text-stone-500">
              <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-emerald-700" /> Entradas</span>
              <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-stone-300" /> Saídas</span>
            </div>
          </Card>

          {/* Resultado 6 meses */}
          <Card className="mt-3 p-5">
            <h2 className="mb-3 text-[15px] font-bold">Resultado dos últimos 6 meses</h2>
            <div className="space-y-2">
              {data.history.map((h) => {
                const max = Math.max(1, ...data.history.map((x) => Math.abs(x.resultCents)));
                const w = Math.max(4, (Math.abs(h.resultCents) / max) * 100);
                const pos = h.resultCents >= 0;
                return (
                  <div key={h.month} className="flex items-center gap-3">
                    <span className="w-12 text-xs font-bold text-stone-500">{h.month.slice(5)}/{h.month.slice(2, 4)}</span>
                    <div className="h-7 flex-1 overflow-hidden rounded-lg bg-stone-100">
                      <div
                        className={`flex h-full items-center justify-end rounded-lg px-2 text-xs font-bold text-white ${pos ? "bg-emerald-700" : "bg-red-500"}`}
                        style={{ width: `${w}%`, minWidth: "fit-content" }}
                      >
                        {centsToBRL(h.resultCents)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Onde gastamos */}
          <Card className="mt-3 p-5">
            <h2 className="mb-1 text-[15px] font-bold">Onde gastamos dinheiro?</h2>
            <p className="mb-3 text-xs text-stone-500">Saídas de caixa do mês por categoria</p>
            {data.spendingByCategory.length === 0 ? (
              <p className="py-4 text-center text-sm text-stone-400">Nenhuma saída no mês.</p>
            ) : (
              <div className="space-y-2.5">
                {data.spendingByCategory.slice(0, 8).map((c) => (
                  <div key={c.category}>
                    <div className="mb-1 flex justify-between text-[13px]">
                      <span className="font-semibold">{c.category}</span>
                      <Money cents={c.totalCents} className="font-bold" />
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-stone-100">
                      <div className="h-full rounded-full bg-amber-600" style={{ width: `${(c.totalCents / maxCat) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Atalhos */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { href: "/fluxo", label: "Fluxo de caixa", icon: "≋" },
              { href: "/resultado", label: "Resultado mensal", icon: "◍" },
              { href: "/projecao", label: "Projeções", icon: "↗" },
              { href: "/contas", label: "Contas", icon: "⇄" },
            ].map((a) => (
              <a key={a.href} href={a.href} className="rounded-2xl border border-stone-200/80 bg-white p-4 text-center shadow-sm transition hover:border-emerald-900">
                <span className="text-2xl">{a.icon}</span>
                <p className="mt-1 text-[13px] font-bold">{a.label}</p>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: "green" | "red" | "amber" }) {
  const color = tone === "green" ? "text-emerald-700" : tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-700" : "text-stone-900";
  return (
    <Card className="p-4">
      <p className="text-[11px] font-bold uppercase tracking-wide text-stone-400">{label}</p>
      <p className={`mt-1 truncate text-xl font-black tracking-tight sm:text-2xl ${color}`}>{centsToBRL(value)}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-stone-400">{hint}</p>}
    </Card>
  );
}

function Attention({ alerts }: { alerts: Dash["alerts"] }) {
  const items: { label: string; count: number; tone: "red" | "orange" | "yellow" | "green"; href: string }[] = [];
  if (alerts.overdueRecv.count > 0)
    items.push({ label: `${alerts.overdueRecv.count} recebimento(s) vencido(s) — ${centsToBRL(alerts.overdueRecv.totalCents)}`, count: alerts.overdueRecv.count, tone: "red", href: "/contas?tab=receber&f=vencidas" });
  if (alerts.overduePay > 0)
    items.push({ label: `${alerts.overduePay} conta(s) a pagar vencida(s)`, count: alerts.overduePay, tone: "red", href: "/contas?tab=pagar" });
  if (alerts.todayRecv > 0)
    items.push({ label: `${alerts.todayRecv} recebimento(s) vencendo hoje`, count: alerts.todayRecv, tone: "orange", href: "/contas?tab=receber&f=hoje" });
  if (alerts.todayPay > 0)
    items.push({ label: `${alerts.todayPay} conta(s) vencendo hoje`, count: alerts.todayPay, tone: "orange", href: "/contas?tab=pagar" });
  if (alerts.soonRecv > 0)
    items.push({ label: `${alerts.soonRecv} recebimento(s) nos próximos 7 dias`, count: alerts.soonRecv, tone: "yellow", href: "/contas?tab=receber&f=prox7" });
  if (alerts.soonPay > 0)
    items.push({ label: `${alerts.soonPay} conta(s) nos próximos 7 dias`, count: alerts.soonPay, tone: "yellow", href: "/contas?tab=pagar" });

  return (
    <Card className="mt-4 p-5">
      <h2 className="mb-3 text-[15px] font-bold">Atenção necessária</h2>
      {items.length === 0 ? (
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
          <StatusPill tone="green">Tudo em dia</StatusPill>
          <span className="text-stone-500">Nenhuma pendência crítica.</span>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((it, i) => (
            <a
              key={i}
              href={it.href}
              className="flex items-center justify-between gap-2 rounded-xl border border-stone-100 bg-stone-50 px-3 py-2.5 text-sm font-semibold transition hover:border-stone-200"
            >
              <span className="flex items-center gap-2">
                <StatusPill tone={it.tone}>{it.count}</StatusPill>
                <span className="text-stone-700">{it.label}</span>
              </span>
              <span className="text-stone-300">›</span>
            </a>
          ))}
        </div>
      )}
    </Card>
  );
}
