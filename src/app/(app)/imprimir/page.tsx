import { parsePeriod, monthLabel, formatDateBR, todayISO } from "@/lib/dates";
import { getFechamento } from "@/lib/finance";
import { ensureRecurringUpTo } from "@/lib/actions";
import { formatBRL, formatPercent } from "@/lib/money";
import { AutoPrint } from "@/components/client";
import { PROJECT_STATUS } from "@/components/ui";
import { Printer } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ImprimirPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  await ensureRecurringUpTo(todayISO());
  const { year, month } = parsePeriod(sp.periodo);
  const d = await getFechamento(year, month);

  const rows = [
    ["Vendas", d.vendas],
    ["Recebimentos", d.recebido],
    ["A receber (clientes)", d.aReceber],
    ["Custos dos projetos", d.custosProjetos],
    ["Despesas gerais", d.despesasGerais],
    ["Resultado gerencial", d.resultadoGerencial],
    ["Entradas de caixa", d.caixaMes.entradas],
    ["Saídas de caixa", d.caixaMes.saidas],
    ["Saldo final de caixa", d.saldoFinalMes],
  ] as const;

  return (
    <div className="mx-auto max-w-[760px] bg-white">
      <AutoPrint />

      <div className="print-hidden mb-4 flex items-center justify-between rounded-2xl bg-sidebar px-5 py-3.5 text-white">
        <span className="text-[13px] font-semibold">Use o diálogo de impressão e escolha &ldquo;Salvar como PDF&rdquo;.</span>
        <a href="javascript:window.print()" className="btn bg-gold !py-2 text-[12.5px] font-bold text-ink">
          <Printer size={14} /> Imprimir / PDF
        </a>
      </div>

      {/* DOCUMENTO */}
      <div className="card overflow-hidden">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between bg-sidebar px-7 py-6 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold font-display text-[17px] font-bold text-ink">M</div>
            <div>
              <div className="font-display text-[15px] font-bold tracking-[0.18em]">MAESTRIA FINANCEIRO</div>
              <div className="text-[10px] tracking-[0.24em] text-white/50">RELATÓRIO MENSAL</div>
            </div>
          </div>
          <div className="text-right">
            <div className="font-display text-[17px] font-semibold">{monthLabel(year, month)}</div>
            <div className="text-[10.5px] text-white/50">emitido em {formatDateBR(todayISO())}</div>
          </div>
        </div>

        {/* Resumo */}
        <div className="px-7 py-6">
          <table className="w-full text-[13.5px]">
            <tbody>
              {rows.map(([label, value], i) => {
                const strong = label === "Resultado gerencial" || label === "Saldo final de caixa";
                return (
                  <tr key={label} className={i % 2 === 0 ? "bg-paper/70" : ""}>
                    <td className={`rounded-l-lg px-4 py-3 ${strong ? "font-bold" : "text-ink-soft"}`}>{label}</td>
                    <td className={`num rounded-r-lg px-4 py-3 text-right ${strong ? "font-display text-[15px] font-bold" : "font-semibold"}`}>
                      {formatBRL(value)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 text-[10.5px] text-muted">
            Resultado gerencial = vendas − custos dos projetos − despesas gerais (competência do mês). Independente do saldo de caixa.
          </p>
        </div>

        {/* Projetos */}
        <div className="border-t border-line px-7 py-6">
          <h2 className="label-caps !text-ink">Resumo dos projetos do mês</h2>
          {d.projetos.length === 0 ? (
            <p className="mt-3 text-[12.5px] text-muted">Nenhum projeto vendido no período.</p>
          ) : (
            <table className="mt-3 w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[0.08em] text-muted">
                  <th className="pb-2 pr-2 font-semibold">Projeto</th>
                  <th className="pb-2 pr-2 font-semibold">Status</th>
                  <th className="num pb-2 pr-2 text-right font-semibold">Venda</th>
                  <th className="num pb-2 pr-2 text-right font-semibold">Recebido</th>
                  <th className="num pb-2 pr-2 text-right font-semibold">Custos</th>
                  <th className="num pb-2 pr-2 text-right font-semibold">Lucro</th>
                  <th className="num pb-2 text-right font-semibold">Margem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {d.projetos.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2.5 pr-2">
                      <div className="font-semibold">{p.clientName}</div>
                      <div className="text-[11px] text-muted">{p.name}</div>
                    </td>
                    <td className="py-2.5 pr-2 text-[11px] text-ink-soft">{PROJECT_STATUS[p.status] ?? p.status}</td>
                    <td className="num py-2.5 pr-2 text-right">{formatBRL(p.sale)}</td>
                    <td className="num py-2.5 pr-2 text-right">{formatBRL(p.recebido)}</td>
                    <td className="num py-2.5 pr-2 text-right">{formatBRL(p.custos)}</td>
                    <td className="num py-2.5 pr-2 text-right font-semibold">{formatBRL(p.lucro)}</td>
                    <td className="num py-2.5 text-right font-semibold">{formatPercent(p.margem)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Rodapé */}
        <div className="border-t border-line px-7 py-4 text-center text-[10px] text-muted">
          Maestria Financeiro · documento gerencial interno · venda ≠ recebimento ≠ lucro ≠ caixa
        </div>
      </div>
    </div>
  );
}
