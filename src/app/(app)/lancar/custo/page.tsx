import { db } from "@/db";
import { projects, clients, categories } from "@/db/schema";
import { eq, isNull, desc } from "drizzle-orm";
import { Card, Empty, PageHeader } from "@/components/ui";
import { CostModal } from "@/components/modals";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function LancarCustoPage() {
  const projectRows = await db
    .select({ id: projects.id, name: projects.name, clientName: clients.name })
    .from(projects)
    .leftJoin(clients, eq(clients.id, projects.clientId))
    .where(isNull(projects.archivedAt))
    .orderBy(desc(projects.id))
    .limit(50);

  const projectOpts = projectRows.map((p) => ({ id: p.id, name: p.name, clientName: p.clientName ?? "Cliente" }));

  const cats = await db.select({ id: categories.id, name: categories.name, kind: categories.kind })
    .from(categories).where(isNull(categories.archivedAt)).orderBy(categories.sortOrder);

  return (
    <div className="max-w-[640px]">
      <PageHeader title="Adicionar custo à obra" sub="Lançamento rápido — escolha o projeto e informe o custo" />
      {projectOpts.length === 0 ? (
        <Card>
          <Empty
            title="Nenhum projeto cadastrado."
            sub="Crie um projeto antes de lançar custos."
            action={<Link href="/projetos/novo" className="btn btn-primary">Criar primeiro projeto</Link>}
          />
        </Card>
      ) : (
        <Card className="anim-fade-up p-5">
          <CostModal
            projects={projectOpts}
            categories={cats}
            defaultOpen
            label="Abrir lançamento de custo"
            className="btn btn-primary w-full"
          />
          <p className="mt-4 text-[12.5px] leading-relaxed text-muted">
            Dica: custos marcados como &ldquo;a pagar&rdquo; entram imediatamente no custo do projeto (reduzindo o lucro
            previsto), mas <strong>não saem do caixa</strong> até serem pagos em Contas.
          </p>
        </Card>
      )}
    </div>
  );
}
