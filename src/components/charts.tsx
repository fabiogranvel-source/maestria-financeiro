/* Gráficos em barras flex — leves, responsivos, sem dependências. */
import { formatBRLCompact } from "@/lib/money";

type MonthPoint = { short: string; label: string; entradas: number; saidas: number; resultado: number };

export function CashChart({ data }: { data: MonthPoint[] }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.entradas, d.saidas)));
  return (
    <div>
      <div className="flex items-end gap-[6px] md:gap-3" style={{ height: 150 }}>
        {data.map((d) => (
          <div key={d.label} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-[3px] self-stretch">
            <div className="flex w-full flex-1 items-end justify-center gap-[3px]">
              <div
                title={`Entradas ${d.label}: ${formatBRLCompact(d.entradas)}`}
                className="w-full max-w-[22px] rounded-t-[5px] bg-brand transition-all group-hover:bg-brand-deep"
                style={{ height: `${Math.max(2, (d.entradas / max) * 100)}%` }}
              />
              <div
                title={`Saídas ${d.label}: ${formatBRLCompact(d.saidas)}`}
                className="w-full max-w-[22px] rounded-t-[5px] bg-line-strong transition-all group-hover:bg-muted"
                style={{ height: `${Math.max(2, (d.saidas / max) * 100)}%` }}
              />
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">{d.short}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-4 text-[11.5px] font-medium text-muted">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[4px] bg-brand" /> Entradas</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[4px] bg-line-strong" /> Saídas</span>
      </div>
    </div>
  );
}

export function ResultChart({ data }: { data: MonthPoint[] }) {
  const max = Math.max(1, ...data.map((d) => Math.abs(d.resultado)));
  return (
    <div>
      <div className="flex gap-[6px] md:gap-3" style={{ height: 150 }}>
        {data.map((d) => {
          const pos = d.resultado >= 0;
          const h = Math.max(2, (Math.abs(d.resultado) / max) * 100);
          return (
            <div key={d.label} className="group flex min-w-0 flex-1 flex-col items-center">
              <div className="flex w-full flex-1 items-end justify-center">
                {pos ? (
                  <div
                    title={`${d.label}: ${formatBRLCompact(d.resultado)}`}
                    className="w-full max-w-[30px] rounded-t-[5px] bg-brand/85 transition-all group-hover:bg-brand-deep"
                    style={{ height: `${h}%` }}
                  />
                ) : null}
              </div>
              <div className="h-px w-full bg-line-strong" />
              <div className="flex w-full flex-1 items-start justify-center">
                {!pos ? (
                  <div
                    title={`${d.label}: ${formatBRLCompact(d.resultado)}`}
                    className="w-full max-w-[30px] rounded-b-[5px] bg-danger/70 transition-all group-hover:bg-danger"
                    style={{ height: `${h}%` }}
                  />
                ) : null}
              </div>
              <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted">{d.short}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 text-[11.5px] font-medium text-muted">Resultado gerencial mensal (vendas − custos de projetos − despesas)</div>
    </div>
  );
}
