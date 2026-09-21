import Link from "next/link";
import { parsePeriod, monthLabel } from "@/lib/dates";
import { getFechamento } from "@/lib/finance";
import { ensureRecurringUpTo } from "@/lib/actions";
import { todayISO } from "@/lib/dates";
import { formatBRL, formatPercent } from "@/lib/money";
import { Card, Chip, Label, PageHeader, ProjectStatusChip } from "@/components/ui";
import { MonthNav } from "@/components/client";
import { FileDown } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function FechamentoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  await ensureRecurringUpTo(todayISO());
  const { year, month } = parsePeriod(sp.periodo);
  const d = await getFechamento(year, month);
  const period = `${year}-${String(month).padStart(2, "0")}`;

  const maxCat = Math.max(1, ...d.porCategoria.map((c) => c.total));

  return (
    <div>
      <PageHeader
        title="Fechamento mensal"
        sub="Resumo gerencial — consulte meses anteriores e corrija lançamentos esquecidos a qualquer momento"
        actions={
          <div className="flex items-center gap-2">
            <MonthNav period={period} />
            <Link href={`/imprimir?periodo=${period}`} target="_blank" className="btn btn-ghost">
              <FileDown size={15} /> Exportar PDF
            </Link>
          </div>
        }
      />

      {/* GRADE DO FECHAMENTO */}
      <Card className="anim-fade-up mb-5 overflow-hidden">
        <div className="bg-sidebar px-6 py-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">{monthLabel(year, month)}</div>
        </div>
        <div className="grid grid-cols-2 divide-line md:grid-cols-3 md:divide-x">
          {[
            { label: "Vendido", value: d.vendas },
            { label: "Recebido", value: d.recebido, cls: "text-ok" },
            { label: "A receber", value: d.aReceber, cls: "text-warn" },
            { label: "Custos dos projetos", value: d.custosProjetos },
            { label: "Despesas gerais", value: d.despesasGerais },
            { label: "Resultado gerencial", value: d.resultadoGerencial, cls: d.resultadoGerencial >= 0 ? "text-ok" : "text-danger", strong: true },
            { label: "Entradas (caixa)", value: d.caixaMes.entradas, cls: "text-ok" },
            { label: "Saídas (caixa)", value: d.caixaMes.saidas, cls: "text-danger" },
            { label: "Saldo final de caixa", value: d.saldoFinalMes, strong: true },
          ].map((item, i) => (
            <div key={item.label} className={`px-5 py-4 ${i >= 3 ? "border-t border-line" : ""} ${i % 2 === 1 ? "max-md:border-l max-md:border-line" : ""} ${i === 2 ? "max-md:border-l-0" : ""}`}>
              <Label>{item.label}</Label>
              <div className={`num mt-1.5 font-semibold ${item.strong ? "text-[20px]" : "text-[17px]"} ${item.cls ?? ""}`}>
                {formatBRL(item.value)}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* PROJETOS DO MÊS */}
        <Card className="anim-fade-up anim-d1 p-5 md:p-6">
          <Label>Projetos vendidos no mês</Label>
          {d.projetos.length === 0 ? (
            <p className="mt-3 text-[13px] text-muted">Nenhum projeto vendido neste período.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {d.projetos.map((p) => (
                <Link key={p.id} href={`/projetos/${p.id}`} className="block rounded-2xl border border-line p-4 transition-colors hover:bg-paper/60">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[14px] font-semibold">{p.clientName.toUpperCase()}</span>
                      <span className="ml-2 text-[12px] text-muted">{p.name}</span>
                    </div>
                    <ProjectStatusChip status={p.status} />
                  </div>
                  <div className="num mt-2.5 grid grid-cols-4 gap-2 text-[12px]">
                    <div><span className="block text-[10px] font-semibold uppercase text-muted">Venda</span>{formatBRL(p.sale)}</div>
                    <div><span className="block text-[10px] font-semibold uppercase text-muted">Custos</span>{formatBRL(p.custos)}</div>
                    <div><span className="block text-[10px] font-semibold uppercase text-muted">Lucro</span><span className="text-ok">{formatBRL(p.lucro)}</span></div>
                    <div><span className="block text-[10px] font-semibold uppercase text-muted">Margem</span><span className="text-brand-deep">{formatPercent(p.margem)}</span></div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* ONDE GASTAMOS DINHEIRO */}
        <Card className="anim-fade-up anim-d2 p-5 md:p-6">
          <Label>Onde gastamos dinheiro?</Label>
          {d.porCategoria.length === 0 ? (
            <p className="mt-3 text-[13px] text-muted">Nenhum custo ou despesa no período.</p>
          ) : (
            <div className="mt-4 space-y-3.5">
              {d.porCategoria.map((c) => (
                <div key={c.name}>
                  <div className="mb-1 flex items-center justify-between text-[12.5px]">
                    <span className="font-semibold text-ink-soft">{c.name}</span>
                    <span className="num font-semibold">{formatBRL(c.total)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-paper">
                    <div className="h-full rounded-full bg-gold/80" style={{ width: `${Math.max(2, (c.total / maxCat) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Chip tone="neutral">Resultado gerencial ≠ saldo de caixa</Chip>
        <Chip tone="neutral">Meses nunca ficam bloqueados</Chip>
        <Chip tone="neutral">Correções recalculam tudo automaticamente</Chip>
      </div>
    </div>
  );
}
