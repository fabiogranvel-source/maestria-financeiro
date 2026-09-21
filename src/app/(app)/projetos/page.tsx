import Link from "next/link";
import { db } from "@/db";
import { projects, clients } from "@/db/schema";
import { desc, isNull, eq } from "drizzle-orm";
import { getProjectsTotalsBatch } from "@/lib/finance";
import { formatBRL, formatPercent } from "@/lib/money";
import { formatDateBR } from "@/lib/dates";
import { Card, Empty, ProjectStatusChip, PageHeader, Label } from "@/components/ui";
import { FolderPlus, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ProjetosPage() {
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      saleDate: projects.saleDate,
      saleAmountCents: projects.saleAmountCents,
      status: projects.status,
      clientName: clients.name,
    })
    .from(projects)
    .leftJoin(clients, eq(clients.id, projects.clientId))
    .where(isNull(projects.archivedAt))
    .orderBy(desc(projects.saleDate), desc(projects.id));

  const totals = await getProjectsTotalsBatch(rows.map((r) => r.id));

  return (
    <div>
      <PageHeader
        title="Projetos"
        sub="Obras e vendas de móveis planejados"
        actions={
          <Link href="/projetos/novo" className="btn btn-primary">
            <FolderPlus size={16} /> Novo Projeto
          </Link>
        }
      />

      {rows.length === 0 ? (
        <Card>
          <Empty
            title="Nenhum projeto cadastrado ainda."
            sub="Cadastre a primeira venda com valor, entrada e forma de recebimento do saldo."
            action={
              <Link href="/projetos/novo" className="btn btn-primary">
                <FolderPlus size={15} /> Criar primeiro projeto
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((p, i) => {
            const t = totals.get(p.id);
            const aReceber = p.saleAmountCents - (t?.recebido ?? 0);
            return (
              <Link key={p.id} href={`/projetos/${p.id}`} className="block">
                <Card className={`anim-fade-up p-5 transition-all hover:-translate-y-0.5 hover:shadow-pop anim-d${Math.min(i + 1, 4)}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-display text-[16.5px] font-semibold tracking-tight text-ink">
                        {(p.clientName ?? "Cliente").toUpperCase()}
                      </div>
                      <div className="mt-0.5 truncate text-[13px] text-muted">{p.name}</div>
                    </div>
                    <ProjectStatusChip status={p.status} />
                  </div>

                  <div className="mt-4 grid grid-cols-4 gap-2 md:gap-4">
                    <div>
                      <Label>Venda</Label>
                      <div className="num mt-1 text-[14px] font-semibold md:text-[15px]">{formatBRL(p.saleAmountCents)}</div>
                    </div>
                    <div>
                      <Label>Recebido</Label>
                      <div className="num mt-1 text-[14px] font-semibold text-ok md:text-[15px]">{formatBRL(t?.recebido ?? 0)}</div>
                    </div>
                    <div>
                      <Label>A receber</Label>
                      <div className={`num mt-1 text-[14px] font-semibold md:text-[15px] ${aReceber > 0 ? "text-warn" : "text-ok"}`}>
                        {formatBRL(aReceber)}
                      </div>
                    </div>
                    <div className="text-right">
                      <Label>Margem</Label>
                      <div className="num mt-1 text-[14px] font-semibold text-brand-deep md:text-[15px]">
                        {formatPercent(p.saleAmountCents > 0 ? ((p.saleAmountCents - (t?.custos ?? 0)) / p.saleAmountCents) * 100 : null)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-[11.5px] text-muted">
                    <span>Venda em {formatDateBR(p.saleDate)}</span>
                    <ChevronRight size={14} />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
