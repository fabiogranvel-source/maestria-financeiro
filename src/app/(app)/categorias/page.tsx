import { db } from "@/db";
import { categories } from "@/db/schema";
import { isNull, asc } from "drizzle-orm";
import { createCategoryAction, archiveCategoryAction } from "@/lib/actions";
import { Card, Chip, Label, PageHeader, Empty } from "@/components/ui";
import { ConfirmForm, Submit } from "@/components/client";
import { Tags, Ban } from "lucide-react";

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = {
  custo: "Custo de projeto",
  despesa: "Despesa geral",
  ambos: "Custo + despesa",
};

export default async function CategoriasPage() {
  const cats = await db.select().from(categories)
    .where(isNull(categories.archivedAt))
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  const groups: Record<string, typeof cats> = { custo: [], despesa: [], ambos: [] };
  for (const c of cats) {
    (groups[c.kind] ?? groups.ambos).push(c);
  }

  return (
    <div className="max-w-[820px]">
      <PageHeader title="Categorias" sub="Centros de custo para saber onde o dinheiro está indo" />

      <Card className="anim-fade-up mb-6 p-5 md:p-6">
        <Label>Nova categoria</Label>
        <form
          action={async (fd: FormData) => {
            "use server";
            await createCategoryAction(fd);
          }}
          className="mt-3 flex flex-wrap items-end gap-3"
        >
          <div className="min-w-[200px] flex-1">
            <input className="input" name="name" placeholder="Ex.: Puxadores premium" required />
          </div>
          <select className="input !w-auto" name="kind" defaultValue="custo">
            <option value="custo">Custo de projeto</option>
            <option value="despesa">Despesa geral</option>
            <option value="ambos">Custo + despesa</option>
          </select>
          <Submit className="btn btn-primary">
            <span className="inline-flex items-center gap-1.5"><Tags size={14} /> Adicionar</span>
          </Submit>
        </form>
      </Card>

      <div className="space-y-5">
        {(["custo", "despesa", "ambos"] as const).map((kind) => (
          <div key={kind}>
            <Label>{KIND_LABELS[kind]}</Label>
            <div className="mt-2.5">
              {groups[kind].length === 0 ? (
                <Card><Empty title="Nenhuma categoria." /></Card>
              ) : (
                <Card className="divide-y divide-line px-5">
                  {groups[kind].map((c) => (
                    <div key={c.id} className="flex items-center justify-between py-3.5">
                      <span className="text-[14px] font-semibold">{c.name}</span>
                      <div className="flex items-center gap-2">
                        <Chip tone="neutral">{KIND_LABELS[c.kind] ?? c.kind}</Chip>
                        <ConfirmForm action={archiveCategoryAction} message={`Arquivar a categoria "${c.name}"? O histórico é preservado.`}>
                          <input type="hidden" name="id" value={c.id} />
                          <button className="rounded-lg p-2 text-muted transition-colors hover:bg-danger-soft hover:text-danger">
                            <Ban size={13} />
                          </button>
                        </ConfirmForm>
                      </div>
                    </div>
                  ))}
                </Card>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
