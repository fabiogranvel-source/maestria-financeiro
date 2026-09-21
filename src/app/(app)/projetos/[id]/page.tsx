import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { projects, clients, receivables, payments, projectCosts, categories, attachments } from "@/db/schema";
import { eq, desc, and, isNull, ne } from "drizzle-orm";
import { getProjectTotals } from "@/lib/finance";
import { formatBRL, formatPercent } from "@/lib/money";
import { formatDateBR } from "@/lib/dates";
import { Card, Chip, Empty, Label, TabLinks, ProjectStatusChip, DueChip, METHOD_LABELS } from "@/components/ui";
import {
  ReceiveModal, PayItemModal, CostModal, EditCostModal, CancelButton,
  RevertModal, ReceivableModal, StatusSelect, UploadButton,
} from "@/components/modals";
import { deleteAttachmentAction } from "@/lib/actions";
import { ConfirmForm } from "@/components/client";
import { ChevronLeft, FileText, Trash2, TrendingUp } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ProjetoDetalhePage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const projectId = Number(id);
  const tab = sp.tab ?? "resumo";

  const [project] = await db
    .select({
      id: projects.id, name: projects.name, description: projects.description,
      saleDate: projects.saleDate, saleAmountCents: projects.saleAmountCents,
      balanceMode: projects.balanceMode, expectedDelivery: projects.expectedDelivery,
      status: projects.status, notes: projects.notes, clientName: clients.name,
      clientId: projects.clientId,
    })
    .from(projects)
    .leftJoin(clients, eq(clients.id, projects.clientId))
    .where(and(eq(projects.id, projectId), isNull(projects.archivedAt)))
    .limit(1);

  if (!project) notFound();
  const t = await getProjectTotals(projectId);

  const recs = await db.select().from(receivables)
    .where(and(eq(receivables.projectId, projectId), ne(receivables.status, "cancelado")))
    .orderBy(receivables.dueDate, receivables.id);

  const pays = await db.select().from(payments)
    .where(eq(payments.projectId, projectId))
    .orderBy(desc(payments.date), desc(payments.id));

  const costs = await db
    .select({
      id: projectCosts.id, description: projectCosts.description,
      amountCents: projectCosts.amountCents, status: projectCosts.status,
      dueDate: projectCosts.dueDate, paidDate: projectCosts.paidDate,
      paymentMethod: projectCosts.paymentMethod, categoryId: projectCosts.categoryId,
      categoryName: categories.name,
    })
    .from(projectCosts)
    .leftJoin(categories, eq(categories.id, projectCosts.categoryId))
    .where(and(eq(projectCosts.projectId, projectId), ne(projectCosts.status, "cancelado")))
    .orderBy(desc(projectCosts.id));

  const files = await db.select().from(attachments)
    .where(and(eq(attachments.sourceType, "projeto"), eq(attachments.sourceId, projectId)))
    .orderBy(desc(attachments.id));

  const cats = await db.select({ id: categories.id, name: categories.name, kind: categories.kind })
    .from(categories).where(isNull(categories.archivedAt)).orderBy(categories.sortOrder);

  const projectOpts = [{ id: project.id, name: project.name, clientName: project.clientName ?? "Cliente" }];

  const balanceModeLabel: Record<string, string> = {
    na_entrega: "Na entrega", data_definida: "Data definida", parcelado: "Parcelado", a_definir: "A definir",
  };

  return (
    <div>
      {/* Voltar + cabeçalho */}
      <Link href="/projetos" className="print-hidden mb-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-muted transition-colors hover:text-ink">
        <ChevronLeft size={14} /> Projetos
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-semibold tracking-tight md:text-[28px]">
            {(project.clientName ?? "Cliente").toUpperCase()}
          </h1>
          <p className="mt-0.5 text-[13.5px] text-muted">{project.name}{project.description ? ` · ${project.description}` : ""}</p>
        </div>
        <StatusSelect id={project.id} current={project.status} />
      </div>

      {/* Números-chave */}
      <Card className="anim-fade-up mb-5 p-5 md:p-6">
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 md:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Valor da venda", value: formatBRL(t.sale) },
            { label: "Recebido", value: formatBRL(t.recebido), cls: "text-ok" },
            { label: "A receber", value: formatBRL(t.aReceber), cls: t.aReceber > 0 ? "text-warn" : "text-ok" },
            { label: "Custos", value: formatBRL(t.custos) },
            { label: "Lucro previsto", value: formatBRL(t.lucro), cls: t.lucro >= 0 ? "text-ok" : "text-danger" },
            { label: "Margem", value: formatPercent(t.margem), cls: "text-brand-deep" },
          ].map((s) => (
            <div key={s.label}>
              <Label>{s.label}</Label>
              <div className={`num mt-1.5 text-[17px] font-semibold md:text-[19px] ${s.cls ?? ""}`}>{s.value}</div>
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4 text-[12px] text-muted">
          <span>Venda: {formatDateBR(project.saleDate)}</span>
          <span aria-hidden>·</span>
          <span>Saldo: {balanceModeLabel[project.balanceMode] ?? project.balanceMode}</span>
          {project.expectedDelivery ? (<><span aria-hidden>·</span><span>Entrega: {formatDateBR(project.expectedDelivery)}</span></>) : null}
          {t.aReceber > 0 ? (
            <Chip tone="caution">Status financeiro independente do operacional</Chip>
          ) : (
            <Chip tone="ok">Quitado</Chip>
          )}
        </div>
      </Card>

      {/* Ações */}
      <div className="print-hidden mb-5 flex flex-wrap gap-2">
        <ReceivableModal projects={projectOpts} defaultProjectId={project.id} />
        <CostModal projects={projectOpts} categories={cats} defaultProjectId={project.id} />
      </div>

      <TabLinks
        base={`/projetos/${project.id}`}
        active={tab}
        tabs={[
          { key: "resumo", label: "Resumo" },
          { key: "recebimentos", label: "Recebimentos" },
          { key: "custos", label: "Custos" },
          { key: "arquivos", label: "Arquivos" },
        ]}
      />

      {/* ============ RESUMO ============ */}
      {tab === "resumo" ? (
        <div className="space-y-4">
          <Card className="anim-fade-up p-5 md:p-6">
            <Label>Composição financeira</Label>
            <div className="mt-4 space-y-3">
              <ProgressBar label="Recebido do cliente" part={t.recebido} total={t.sale} color="var(--color-brand)" />
              <ProgressBar label="Custos comprometidos" part={t.custos} total={t.sale} color="var(--color-gold)" />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 md:grid-cols-3">
              <div className="rounded-2xl bg-paper px-4 py-3.5">
                <div className="label-caps">Lucro bruto previsto</div>
                <div className="num mt-1 font-display text-[19px] font-semibold text-ok">{formatBRL(t.lucro)}</div>
              </div>
              <div className="rounded-2xl bg-paper px-4 py-3.5">
                <div className="label-caps">Margem</div>
                <div className="num mt-1 font-display text-[19px] font-semibold text-brand-deep">{formatPercent(t.margem)}</div>
              </div>
              <div className="rounded-2xl bg-paper px-4 py-3.5 max-md:col-span-2">
                <div className="label-caps">Saldo a receber</div>
                <div className={`num mt-1 font-display text-[19px] font-semibold ${t.aReceber > 0 ? "text-warn" : "text-ok"}`}>{formatBRL(t.aReceber)}</div>
              </div>
            </div>
          </Card>

          {project.notes ? (
            <Card className="p-5">
              <Label>Observações</Label>
              <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-soft">{project.notes}</p>
            </Card>
          ) : null}

          <Card className="p-5">
            <div className="flex items-center gap-2">
              <TrendingUp size={15} className="text-brand" />
              <Label>Regra financeira desta tela</Label>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              O status operacional ({ProjectStatusChipInline(project.status)}) é independente do financeiro. Mesmo com a obra
              entregue ou finalizada, o saldo de {formatBRL(t.aReceber)} permanece em &ldquo;a receber&rdquo; até o cliente pagar.
            </p>
          </Card>
        </div>
      ) : null}

      {/* ============ RECEBIMENTOS ============ */}
      {tab === "recebimentos" ? (
        <div className="space-y-4">
          <Card className="anim-fade-up p-5 md:p-6">
            <div className="mb-3 flex items-center justify-between">
              <Label>Obrigações do cliente</Label>
              <span className="num text-[13px] font-semibold text-warn">{formatBRL(t.aReceber)} em aberto</span>
            </div>
            {recs.length === 0 ? (
              <Empty title="Nenhum recebível neste projeto." sub="Cadastre com o botão + Recebível acima." />
            ) : (
              <div className="space-y-3">
                {recs.map((r) => {
                  const saldo = r.amountCents - r.receivedAmountCents;
                  const done = r.status === "recebido";
                  return (
                    <div key={r.id} className="rounded-2xl border border-line p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[14px] font-semibold text-ink">{r.description}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted">
                            {done ? <Chip tone="ok">Recebido</Chip> : <DueChip dueDate={r.dueDate} condition={r.condition} />}
                            {r.installmentNumber ? <Chip tone="neutral">Parcela {r.installmentNumber}/{r.installmentTotal}</Chip> : null}
                            {r.receivedAmountCents > 0 && !done ? <Chip tone="caution">Parcial</Chip> : null}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="num text-[15px] font-semibold">{formatBRL(r.amountCents)}</div>
                          {r.receivedAmountCents > 0 ? (
                            <div className="num text-[11.5px] text-ok">recebido {formatBRL(r.receivedAmountCents)}</div>
                          ) : null}
                        </div>
                      </div>
                      {!done ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <ReceiveModal receivableId={r.id} title={r.description} saldo={saldo} className="btn btn-brand !py-2.5 text-[13px]" />
                          {r.receivedAmountCents === 0 ? <CancelButton kind="recebivel" id={r.id} /> : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="p-5 md:p-6">
            <Label>Histórico de pagamentos</Label>
            {pays.length === 0 ? (
              <p className="mt-3 text-[13px] text-muted">Nenhum pagamento registrado ainda.</p>
            ) : (
              <div className="mt-3 divide-y divide-line">
                {pays.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="num text-[14px] font-semibold text-ok">+ {formatBRL(p.amountCents)}</div>
                      <div className="mt-0.5 text-[12px] text-muted">
                        {formatDateBR(p.date)} · {METHOD_LABELS[p.method] ?? p.method}
                        {p.notes ? ` · ${p.notes}` : ""}
                      </div>
                    </div>
                    {p.revertedAt ? (
                      <Chip tone="danger">Estornado</Chip>
                    ) : (
                      <RevertModal kind="pagamento" id={p.id} title="Recebimento" amount={p.amountCents} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      ) : null}

      {/* ============ CUSTOS ============ */}
      {tab === "custos" ? (
        <Card className="anim-fade-up p-5 md:p-6">
          <div className="mb-3 flex items-center justify-between">
            <Label>Custos do projeto</Label>
            <span className="num text-[13px] font-semibold">{formatBRL(t.custos)}</span>
          </div>
          {costs.length === 0 ? (
            <Empty title="Nenhum custo lançado." sub="Custos 'a pagar' já reduzem o lucro previsto, mas só saem do caixa quando pagos." />
          ) : (
            <div className="space-y-3">
              {costs.map((c) => (
                <div key={c.id} className="rounded-2xl border border-line p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[14px] font-semibold text-ink">{c.description}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted">
                        {c.categoryName ? <Chip tone="neutral">{c.categoryName}</Chip> : null}
                        {c.status === "pago" ? (
                          <Chip tone="ok">Pago em {formatDateBR(c.paidDate)} {c.paymentMethod ? `· ${METHOD_LABELS[c.paymentMethod]}` : ""}</Chip>
                        ) : (
                          <Chip tone="caution">A pagar{c.dueDate ? ` · ${formatDateBR(c.dueDate)}` : ""}</Chip>
                        )}
                      </div>
                    </div>
                    <div className="num text-right text-[15px] font-semibold">{formatBRL(c.amountCents)}</div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {c.status === "pago" ? (
                      <>
                        <EditCostModal cost={{ id: c.id, description: c.description, categoryId: c.categoryId, amountCents: c.amountCents, dueDate: c.dueDate, paid: true }} categories={cats} />
                        <RevertModal kind="custo" id={c.id} title={c.description} amount={c.amountCents} />
                      </>
                    ) : (
                      <>
                        <PayItemModal kind="custo" id={c.id} title={c.description} amount={c.amountCents} className="btn btn-primary !py-2.5 text-[13px]" label="Pagar" />
                        <EditCostModal cost={{ id: c.id, description: c.description, categoryId: c.categoryId, amountCents: c.amountCents, dueDate: c.dueDate, paid: false }} categories={cats} />
                        <CancelButton kind="custo" id={c.id} />
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : null}

      {/* ============ ARQUIVOS ============ */}
      {tab === "arquivos" ? (
        <Card className="anim-fade-up p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between">
            <Label>Documentos e comprovantes</Label>
            <UploadButton sourceType="projeto" sourceId={project.id} />
          </div>
          {files.length === 0 ? (
            <Empty title="Nenhum arquivo anexado." sub="Imagens, PDFs, comprovantes e notas fiscais (opcional, até 4MB)." />
          ) : (
            <div className="space-y-2">
              {files.map((f) => (
                <div key={f.id} className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3">
                  <FileText size={16} className="shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <a href={`/api/anexos/${f.id}`} target="_blank" className="block truncate text-[13.5px] font-semibold text-brand-deep hover:underline">
                      {f.fileName}
                    </a>
                    <div className="text-[11.5px] text-muted">{(f.size / 1024).toFixed(0)} KB · {formatDateBR(f.createdAt.toISOString().slice(0, 10))}</div>
                  </div>
                  <ConfirmForm action={deleteAttachmentAction} message="Remover este anexo?">
                    <input type="hidden" name="id" value={f.id} />
                    <button className="rounded-lg p-2 text-muted transition-colors hover:bg-danger-soft hover:text-danger"><Trash2 size={14} /></button>
                  </ConfirmForm>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
}

function ProgressBar({ label, part, total, color }: { label: string; part: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((part / total) * 100)) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[12px]">
        <span className="font-semibold text-ink-soft">{label}</span>
        <span className="num text-muted">{formatBRL(part)} · {pct}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-paper">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function ProjectStatusChipInline(status: string): string {
  const map: Record<string, string> = {
    aprovado: "aprovado",
    aguardando_medicao: "aguardando medição",
    em_producao: "em produção",
    pronto_para_instalacao: "pronto para instalação",
    instalando: "instalando",
    entregue: "entregue",
    finalizado: "finalizado",
  };
  return map[status] ?? status;
}
