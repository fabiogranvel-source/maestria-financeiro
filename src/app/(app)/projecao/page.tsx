import { getProjecao, getSaldoCaixa } from "@/lib/finance";
import { ensureRecurringUpTo } from "@/lib/actions";
import { todayISO, MONTHS_PT } from "@/lib/dates";
import { formatBRL, formatBRLCompact } from "@/lib/money";
import { Card, Chip, Empty, Label, PageHeader } from "@/components/ui";
import { TrendingUp } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ProjecaoPage() {
  await ensureRecurringUpTo(todayISO());
  const meses = await getProjecao(6);
  const saldoAtual = await getSaldoCaixa();
  const max = Math.max(1, ...meses.map((m) => m.totalSaidas));

  // Saldo projetado acumulado
  let acumulado = saldoAtual;
  const comAcumulado = meses.map((m) => {
    acumulado = acumulado + m.saldoPrevisto;
    return { ...m, acumulado };
  });

  return (
    <div>
      <PageHeader
        title="Projeção"
        sub="Compromissos futuros: recorrências ativas, parcelas e contas cadastradas"
      />

      {/* Visão geral em barras */}
      <Card className="anim-fade-up mb-5 p-5 md:p-6">
        <div className="mb-5 flex items-center gap-2">
          <TrendingUp size={15} className="text-brand" />
          <Label>Despesas já comprometidas por mês</Label>
        </div>
        <div className="flex items-end gap-2 md:gap-3" style={{ height: 130 }}>
          {comAcumulado.map((m) => (
            <div key={`${m.year}-${m.month}`} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5 self-stretch">
              <span className="num text-[10px] font-semibold text-muted opacity-0 transition-opacity group-hover:opacity-100">
                {formatBRLCompact(m.totalSaidas)}
              </span>
              <div
                className="w-full max-w-[44px] rounded-t-[6px] bg-gold/85 transition-all group-hover:bg-gold"
                style={{ height: `${Math.max(3, (m.totalSaidas / max) * 78)}%` }}
              />
              <span className="text-[10px] font-semibold uppercase text-muted">{MONTHS_PT[m.month - 1].slice(0, 3)}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[11.5px] text-muted">
          Quando um parcelamento termina, ele desaparece automaticamente dos meses seguintes.
        </p>
      </Card>

      {/* Mês a mês */}
      <div className="space-y-4">
        {comAcumulado.map((m, i) => (
          <Card key={`${m.year}-${m.month}`} className={`anim-fade-up p-5 md:p-6 anim-d${Math.min(i + 1, 4)}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-display text-[17px] font-semibold">
                  {MONTHS_PT[m.month - 1]} {m.year}
                </div>
                <div className="num mt-1 text-[12.5px] text-muted">
                  Recorrentes {formatBRL(m.recorrentes)} · Parcelas {formatBRL(m.parcelas)} · Outras {formatBRL(m.unicas)}
                </div>
              </div>
              <div className="text-right">
                <div className="num text-[19px] font-semibold text-danger">− {formatBRL(m.totalSaidas)}</div>
                <div className="num mt-0.5 text-[11.5px] text-muted">
                  a receber previsto: <span className="text-ok">+ {formatBRL(m.aReceberPrevisto)}</span>
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-4 rounded-2xl bg-paper px-4 py-3 text-[12.5px]">
              <span className="font-semibold text-ink-soft">
                Resultado previsto:{" "}
                <strong className={`num ${m.saldoPrevisto >= 0 ? "text-ok" : "text-danger"}`}>{formatBRL(m.saldoPrevisto)}</strong>
              </span>
              <span className="font-semibold text-ink-soft">
                Caixa acumulado:{" "}
                <strong className={`num ${m.acumulado >= 0 ? "text-ok" : "text-danger"}`}>{formatBRL(m.acumulado)}</strong>
              </span>
            </div>

            {m.itens.length > 0 ? (
              <div className="mt-3 divide-y divide-line">
                {m.itens.slice(0, 8).map((it, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                    <div className="min-w-0">
                      <span className="font-medium text-ink">{it.descricao}</span>
                      <span className="ml-2 text-[11.5px] text-muted">
                        {it.detalhe ? `${it.detalhe} · ` : ""}{it.tipo}
                      </span>
                    </div>
                    <span className="num shrink-0 font-semibold">{formatBRL(it.valor)}</span>
                  </div>
                ))}
                {m.itens.length > 8 ? (
                  <p className="pt-2 text-[11.5px] text-muted">+ {m.itens.length - 8} outros itens</p>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-[12.5px] text-muted">Nenhum compromisso cadastrado para este mês.</p>
            )}
          </Card>
        ))}
      </div>

      {meses.every((m) => m.totalSaidas === 0) ? (
        <Card className="mt-4"><Empty title="Nenhuma despesa comprometida." sub="Cadastre recorrências e parcelamentos para projetar os próximos meses." /></Card>
      ) : null}
    </div>
  );
}
