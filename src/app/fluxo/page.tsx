"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { centsToBRL, formatDateBR, currentCompetence, paymentMethodLabel } from "@/lib/format";
import { Card, Money, MonthNav, PageHeader, Skeleton, Empty } from "@/components/ui";

type Cash = {
  month: string;
  openingCents: number;
  entriesCents: number;
  exitsCents: number;
  balanceCents: number;
  items: {
    id: number; type: string; amountCents: number; occurredAt: string;
    description: string; categoryName: string | null; projectId: number | null;
    sourceType: string; method: string | null;
  }[];
};

export default function FluxoPage() {
  const [month, setMonth] = useState(currentCompetence());
  const [data, setData] = useState<Cash | null>(null);

  useEffect(() => {
    setData(null);
    api<Cash>(`/api/cash?month=${month}`).then(setData).catch(() => {});
  }, [month]);

  return (
    <div>
      <PageHeader title="Fluxo de caixa" subtitle="Somente valores efetivamente movimentados" />
      <MonthNav month={month} onChange={setMonth} />

      {!data ? (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-32" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <>
          <Card className="mt-3 grid grid-cols-2 gap-px overflow-hidden !p-0 sm:grid-cols-4">
            <Box label="Saldo anterior" cents={data.openingCents} />
            <Box label="Entradas" cents={data.entriesCents} tone="text-emerald-700" prefix="+" />
            <Box label="Saídas" cents={data.exitsCents} tone="text-red-600" prefix="−" />
            <Box label="Saldo atual" cents={data.balanceCents} bold />
          </Card>

          <div className="mt-3 space-y-2">
            {data.items.length === 0 ? (
              <Empty title="Sem movimentações no mês" subtitle="Recebimentos e pagamentos efetivados aparecem aqui." />
            ) : (
              data.items.map((it) => (
                <Card key={it.id} className="flex items-center gap-3 p-3.5">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg font-bold ${
                      it.type === "entry" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                    }`}
                  >
                    {it.type === "entry" ? "↓" : "↑"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{it.description}</p>
                    <p className="text-xs text-stone-400">
                      {formatDateBR(it.occurredAt)}
                      {it.categoryName ? ` · ${it.categoryName}` : ""}
                      {it.method ? ` · ${paymentMethodLabel(it.method)}` : ""}
                    </p>
                  </div>
                  <Money
                    cents={it.type === "entry" ? it.amountCents : -it.amountCents}
                    signed
                    className={`shrink-0 text-[15px] font-black ${it.type === "entry" ? "text-emerald-700" : ""}`}
                  />
                </Card>
              ))
            )}
          </div>

          <Card className="mt-4 p-4">
            <p className="text-xs leading-relaxed text-stone-500">
              <span className="font-bold text-stone-700">Fórmula:</span> Saldo atual = saldo anterior + entradas realizadas − saídas realizadas.
              Contas futuras (a receber/a pagar) não entram aqui antes da efetivação.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}

function Box({ label, cents, tone = "", prefix = "", bold }: { label: string; cents: number; tone?: string; prefix?: string; bold?: boolean }) {
  return (
    <div className={`bg-white p-4 text-center ${bold ? "!bg-emerald-950" : ""}`}>
      <p className={`text-[11px] font-bold uppercase ${bold ? "text-emerald-200/70" : "text-stone-400"}`}>{label}</p>
      <p className={`mt-1 text-lg font-black sm:text-xl ${bold ? "text-white" : tone}`}>
        {prefix}
        {centsToBRL(cents)}
      </p>
    </div>
  );
}
