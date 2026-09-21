"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { centsToBRL, monthLabel, formatDateBR } from "@/lib/format";
import { Card, Money, PageHeader, Skeleton, Empty } from "@/components/ui";

type Proj = {
  month: string;
  expensesCents: number;
  costsCents: number;
  totalOutCents: number;
  receivableCents: number;
  netCents: number;
  items: { kind: string; description: string; amountCents: number; dueDate: string | null }[];
};

export default function ProjecaoPage() {
  const [data, setData] = useState<Proj[] | null>(null);

  useEffect(() => {
    api<Proj[]>("/api/projection?months=6").then(setData).catch(() => {});
  }, []);

  const totalOut = (data || []).reduce((s, m) => s + m.totalOutCents, 0);

  return (
    <div>
      <PageHeader title="Projeções futuras" subtitle="Compromissos já assumidos — próximos 6 meses" />
      {!data ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : (
        <>
          <Card className="bg-emerald-950 !border-emerald-950 p-5 text-white">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-200/70">Total comprometido (6 meses)</p>
            <p className="mt-1 text-3xl font-black">{centsToBRL(totalOut)}</p>
            <p className="mt-1 text-xs text-emerald-200/70">Recorrentes ativas + parcelas futuras + contas com vencimento</p>
          </Card>
          <div className="mt-3 space-y-3">
            {data.map((m) => (
              <Card key={m.month} className="p-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-black">{monthLabel(m.month)}</h2>
                  <Money cents={m.totalOutCents} className="font-black text-red-600" />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-stone-50 p-2">
                    <p className="text-[10px] font-bold uppercase text-stone-400">Despesas</p>
                    <p className="text-sm font-black">{centsToBRL(m.expensesCents)}</p>
                  </div>
                  <div className="rounded-xl bg-stone-50 p-2">
                    <p className="text-[10px] font-bold uppercase text-stone-400">Custos obra</p>
                    <p className="text-sm font-black">{centsToBRL(m.costsCents)}</p>
                  </div>
                  <div className="rounded-xl bg-stone-50 p-2">
                    <p className="text-[10px] font-bold uppercase text-stone-400">A receber*</p>
                    <p className="text-sm font-black text-emerald-700">{centsToBRL(m.receivableCents)}</p>
                  </div>
                </div>
                {m.items.length > 0 ? (
                  <div className="mt-2 space-y-1 border-t border-stone-100 pt-2">
                    {m.items.slice(0, 12).map((it, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 text-[13px]">
                        <span className="min-w-0 truncate text-stone-600">
                          <span className="font-semibold text-stone-800">{it.description}</span>{" "}
                          <span className="text-stone-400">· {it.kind}{it.dueDate ? ` · ${formatDateBR(it.dueDate)}` : ""}</span>
                        </span>
                        <span className="shrink-0 font-bold">{centsToBRL(it.amountCents)}</span>
                      </div>
                    ))}
                    {m.items.length > 12 && <p className="text-xs text-stone-400">+ {m.items.length - 12} item(ns)…</p>}
                  </div>
                ) : (
                  <p className="mt-2 text-[13px] text-stone-400">Nenhum compromisso com vencimento neste mês.</p>
                )}
              </Card>
            ))}
          </div>
          <p className="mt-3 text-xs text-stone-400">* A receber com vencimento no mês. Valores “na entrega” ou “a definir” sem data aparecem em Contas, não aqui.</p>
        </>
      )}
    </div>
  );
}
