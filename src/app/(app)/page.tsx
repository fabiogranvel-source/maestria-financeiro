import Link from "next/link";
import { parsePeriod, monthLabel, formatDateShort } from "@/lib/dates";
import { getDashboard, getAlerts } from "@/lib/finance";
import { ensureRecurringUpTo } from "@/lib/actions";
import { formatBRL } from "@/lib/money";
import { Stat, Card, Label, Chip, Empty } from "@/components/ui";
import { MonthNav } from "@/components/client";
import { CashChart, ResultChart } from "@/components/charts";
import { AlertTriangle, ArrowRight, CircleCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  await ensureRecurringUpTo(new Date().toISOString().slice(0, 10));
  const { year, month } = parsePeriod(sp.periodo);
  const d = await getDashboard(year, month);
  const alerts = await getAlerts(d.today);

  const sevLabel = { vencido: "Vencido", hoje: "Vence hoje", proximo: "Próximos 7 dias" } as const;
  const sevTone = { vencido: "danger", hoje: "warn", proximo: "caution" } as const;

  return (
    <div>
      {/* Cabeçalho */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-semibold tracking-tight md:text-[28px]">Dashboard</h1>
          <p className="mt-0.5 text-[13px] text-muted">{monthLabel(year, month)}</p>
        </div>
        <MonthNav period={`${year}-${String(month).padStart(2, "0")}`} />
      </div>

      {/* Saldo em caixa — destaque principal */}
      <Card className="anim-fade-up mb-4 overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-4 bg-sidebar px-6 py-6 text-white md:px-7">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/45">Saldo em caixa</div>
            <div className="num font-display mt-2 text-[36px] font-semibold leading-none tracking-tight md:text-[42px]">
              {formatBRL(d.saldoCaixa)}
            </div>
            <div className="mt-2.5 text-[12px] text-white/45">
              Somente movimentações efetivamente realizadas
            </div>
          </div>
          <div className="flex gap-6 pb-1 text-right">
            <div>
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-white/40">Entradas no mês</div>
              <div className="num mt-1 text-[16px] font-semibold text-emerald-300">+ {formatBRL(d.caixaMes.entradas)}</div>
            </div>
            <div>
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-white/40">Saídas no mês</div>
              <div className="num mt-1 text-[16px] font-semibold text-red-300">− {formatBRL(d.caixaMes.saidas)}</div>
            </div>
          </div>
        </div>
      </Card>

      {/* Cards gerenciais do mês */}
      <div className="anim-fade-up anim-d1 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
        <Stat label="Vendas do mês" cents={d.vendas} href="/projetos" />
        <Stat label="Recebido no mês" cents={d.recebido} href="/fluxo" tone="pos" />
        <Stat label="A receber (clientes)" cents={d.aReceber} href="/contas?aba=receber" />
        <Stat label="Custos dos projetos" cents={d.custosProjetos} href="/projetos" />
        <Stat label="Despesas gerais" cents={d.despesasGerais} href="/despesas" />
        <Stat
          label="Resultado gerencial"
          cents={d.resultadoGerencial}
          tone={d.resultadoGerencial >= 0 ? "pos" : "neg"}
          href="/fechamento"
          sub="Vendas − custos − despesas. Não é saldo de caixa."
        />
      </div>

      {/* Gráficos */}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card className="anim-fade-up anim-d2 p-5 md:p-6">
          <div className="mb-5 flex items-center justify-between">
            <Label>Entradas × Saídas</Label>
            <span className="text-[11px] text-muted">últimos 6 meses</span>
          </div>
          <CashChart data={d.meses} />
        </Card>
        <Card className="anim-fade-up anim-d3 p-5 md:p-6">
          <div className="mb-5 flex items-center justify-between">
            <Label>Resultado dos últimos 6 meses</Label>
            <Link href="/fechamento" className="text-[11.5px] font-semibold text-brand-deep">Ver fechamento</Link>
          </div>
          <ResultChart data={d.meses} />
        </Card>
      </div>

      {/* Atenção necessária */}
      <Card className="anim-fade-up anim-d4 mt-4 p-5 md:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-warn" />
            <Label>Atenção necessária</Label>
          </div>
          <Link href="/contas" className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand-deep">
            Ir para contas <ArrowRight size={12} />
          </Link>
        </div>
        {alerts.length === 0 ? (
          <div className="flex items-center gap-2.5 rounded-2xl bg-ok-soft px-4 py-4 text-[13px] font-semibold text-ok">
            <CircleCheck size={16} /> Nada pendente. Tudo sob controle.
          </div>
        ) : (
          <div className="divide-y divide-line">
            {alerts.slice(0, 10).map((a) => (
              <Link key={a.id} href={a.href} className="flex items-center gap-3 py-3 transition-opacity hover:opacity-70">
                <Chip tone={sevTone[a.severity]}>{sevLabel[a.severity]}</Chip>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-semibold text-ink">{a.title}</div>
                  <div className="truncate text-[12px] text-muted">{a.subtitle}</div>
                </div>
                <div className="text-right">
                  <div className="num text-[14px] font-semibold">{formatBRL(a.amountCents)}</div>
                  {a.dueDate ? <div className="text-[11px] text-muted">{formatDateShort(a.dueDate)}</div> : null}
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
