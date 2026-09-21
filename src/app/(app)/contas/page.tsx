import { db } from "@/db";
import {
  receivables, clients, projects, projectCosts, expenses, categories,
} from "@/db/schema";
import { eq, desc, and, ne, isNull } from "drizzle-orm";
import { todayISO, diffDays, formatDateBR } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { ensureRecurringUpTo } from "@/lib/actions";
import { Card, Chip, Empty, Label, PageHeader, DueChip, METHOD_LABELS } from "@/components/ui";
import { ReceiveModal, PayItemModal, RevertModal, ReceivableModal, CancelButton } from "@/components/modals";
import { TabsLinks } from "./tabs";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

export default async function ContasPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  await ensureRecurringUpTo(todayISO());
  const aba = sp.aba === "pagar" ? "pagar" : "receber";
  const f = sp.f ?? "pendentes";
  const today = todayISO();
  const in7 = new Date(Date.parse(today + "T00:00:00Z") + 7 * 86400000).toISOString().slice(0, 10);

  const cats = await db.select({ id: categories.id, name: categories.name, kind: categories.kind })
    .from(categories).where(isNull(categories.archivedAt)).orderBy(categories.sortOrder);
  const projectOpts = (await db
    .select({ id: projects.id, name: projects.name, clientName: clients.name })
    .from(projects).leftJoin(clients, eq(clients.id, projects.clientId))
    .where(isNull(projects.archivedAt)).orderBy(desc(projects.id)))
    .map((p) => ({ id: p.id, name: p.name, clientName: p.clientName ?? "Cliente" }));

  return (
    <div>
      <PageHeader
        title="Contas"
        sub="Obrigações financeiras — nada entra no caixa antes de acontecer"
        actions={aba === "receber" ? <ReceivableModal projects={projectOpts} /> : undefined}
      />

      <TabsLinks aba={aba} />

      {aba === "receber" ? (
        <ReceberTab f={f} today={today} in7={in7} aba={aba} />
      ) : (
        <PagarTab f={f} today={today} in7={in7} aba={aba} />
      )}
    </div>
  );
}

/* ============================ A RECEBER ============================ */

async function ReceberTab({ f, today, in7, aba }: { f: string; today: string; in7: string; aba: string }) {
  const rows = await db
    .select({
      id: receivables.id, description: receivables.description,
      amountCents: receivables.amountCents, receivedAmountCents: receivables.receivedAmountCents,
      dueDate: receivables.dueDate, condition: receivables.condition, status: receivables.status,
      installmentNumber: receivables.installmentNumber, installmentTotal: receivables.installmentTotal,
      clientName: clients.name, projectName: projects.name, projectId: projects.id,
    })
    .from(receivables)
    .leftJoin(clients, eq(clients.id, receivables.clientId))
    .leftJoin(projects, eq(projects.id, receivables.projectId))
    .where(ne(receivables.status, "cancelado"))
    .orderBy(receivables.dueDate, receivables.id)
    .limit(200);

  const pendentes = rows.filter((r) => r.status === "pendente");
  const recebidas = rows.filter((r) => r.status === "recebido");

  function match(r: (typeof rows)[number]): boolean {
    if (f === "recebidas") return r.status === "recebido";
    if (r.status !== "pendente") return false;
    const due = r.dueDate;
    if (f === "vencidas") return !!due && due < today!
    if (f === "hoje") return due === today;
    if (f === "7dias") return !!due && due > today! && due <= in7!;
    return true; // pendentes
  }

  const list = rows.filter(match).sort((a, b) => (a.dueDate ?? "9999") < (b.dueDate ?? "9999") ? -1 : 1);

  const totalAberto = pendentes.reduce((s, r) => s + (r.amountCents - r.receivedAmountCents), 0);
  const totalVencido = pendentes.filter((r) => r.dueDate && r.dueDate < today!).reduce((s, r) => s + (r.amountCents - r.receivedAmountCents), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard label="Em aberto" value={totalAberto} tone="warn" />
        <SummaryCard label="Vencido" value={totalVencido} tone="danger" />
      </div>

      <FilterChips aba={aba} active={f} options={[
        ["pendentes", "A receber"], ["vencidas", "Vencidas"], ["hoje", "Hoje"], ["7dias", "Próximos 7 dias"], ["recebidas", "Recebidas"],
      ]} />

      {list.length === 0 ? (
        <Card><Empty title="Nenhuma conta nesta visão." sub="Quando houver valores a receber, eles aparecem aqui." /></Card>
      ) : (
        <div className="space-y-3">
          {list.map((r) => {
            const saldo = r.amountCents - r.receivedAmountCents;
            const done = r.status === "recebido";
            return (
              <Card key={r.id} className="anim-fade-up p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold text-ink">{r.clientName ?? "Cliente"}</div>
                    <div className="mt-0.5 truncate text-[12.5px] text-muted">
                      {r.projectName ? `${r.projectName} · ` : ""}{r.description}
                      {r.installmentNumber ? ` · parcela ${r.installmentNumber}/${r.installmentTotal}` : ""}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {done ? <Chip tone="ok">Recebido</Chip> : <DueChip dueDate={r.dueDate} condition={r.condition} />}
                      {r.receivedAmountCents > 0 && !done ? <Chip tone="caution">Parcial — recebido {formatBRL(r.receivedAmountCents)}</Chip> : null}
                    </div>
                  </div>
                  <div className="num text-right text-[16px] font-semibold">{formatBRL(done ? r.amountCents : saldo)}</div>
                </div>
                {!done ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <ReceiveModal receivableId={r.id} title={`${r.clientName ?? "Cliente"} — ${r.description}`} saldo={saldo} className="btn btn-brand !py-2.5 text-[13px]" label="Receber" />
                    {r.projectId ? (
                      <a href={`/projetos/${r.projectId}?tab=recebimentos`} className="btn btn-ghost !py-2.5 text-[13px]">Ver projeto</a>
                    ) : null}
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================ A PAGAR ============================ */

type PayableItem = {
  key: string;
  kind: "custo" | "despesa";
  id: number;
  description: string;
  categoryName: string | null;
  projectLabel: string | null;
  amountCents: number;
  dueDate: string | null;
  status: string;
  paidDate: string | null;
  method: string | null;
  installment: string | null;
};

async function PagarTab({ f, today, in7, aba }: { f: string; today: string; in7: string; aba: string }) {
  const costRows = await db
    .select({
      id: projectCosts.id, description: projectCosts.description, amountCents: projectCosts.amountCents,
      dueDate: projectCosts.dueDate, status: projectCosts.status, paidDate: projectCosts.paidDate,
      method: projectCosts.paymentMethod, categoryName: categories.name,
      projectName: projects.name, clientName: clients.name,
    })
    .from(projectCosts)
    .leftJoin(categories, eq(categories.id, projectCosts.categoryId))
    .leftJoin(projects, eq(projects.id, projectCosts.projectId))
    .leftJoin(clients, eq(clients.id, projects.clientId))
    .where(ne(projectCosts.status, "cancelado"))
    .limit(200);

  const expRows = await db
    .select({
      id: expenses.id, description: expenses.description, amountCents: expenses.amountCents,
      dueDate: expenses.dueDate, status: expenses.status, paidDate: expenses.paidDate,
      method: expenses.paymentMethod, categoryName: categories.name,
      installmentNumber: expenses.installmentNumber, installmentTotal: expenses.installmentTotal,
    })
    .from(expenses)
    .leftJoin(categories, eq(categories.id, expenses.categoryId))
    .where(ne(expenses.status, "cancelada"))
    .limit(300);

  const items: PayableItem[] = [
    ...costRows.map((c) => ({
      key: `c-${c.id}`, kind: "custo" as const, id: c.id,
      description: c.description, categoryName: c.categoryName,
      projectLabel: [c.clientName, c.projectName].filter(Boolean).join(" · ") || null,
      amountCents: c.amountCents, dueDate: c.dueDate, status: c.status === "pago" ? "paga" : "pendente",
      paidDate: c.paidDate, method: c.method, installment: null,
    })),
    ...expRows.map((e) => ({
      key: `e-${e.id}`, kind: "despesa" as const, id: e.id,
      description: e.description, categoryName: e.categoryName,
      projectLabel: null,
      amountCents: e.amountCents, dueDate: e.dueDate, status: e.status,
      paidDate: e.paidDate, method: e.method,
      installment: e.installmentNumber ? `parcela ${e.installmentNumber}/${e.installmentTotal}` : null,
    })),
  ];

  function match(i: PayableItem): boolean {
    if (f === "pagas") return i.status === "paga";
    if (i.status !== "pendente") return false;
    if (f === "vencidas") return !!i.dueDate && i.dueDate < today!;
    if (f === "hoje") return i.dueDate === today;
    if (f === "7dias") return !!i.dueDate && i.dueDate > today! && i.dueDate <= in7!;
    return true;
  }

  const list = items.filter(match).sort((a, b) => (a.dueDate ?? "9999") < (b.dueDate ?? "9999") ? -1 : 1).slice(0, 80);

  const pend = items.filter((i) => i.status === "pendente");
  const totalAPagar = pend.reduce((s, i) => s + i.amountCents, 0);
  const totalVencido = pend.filter((i) => i.dueDate && i.dueDate < today!).reduce((s, i) => s + i.amountCents, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard label="A pagar" value={totalAPagar} tone="warn" />
        <SummaryCard label="Vencido" value={totalVencido} tone="danger" />
      </div>

      <FilterChips aba={aba} active={f} options={[
        ["pendentes", "A pagar"], ["vencidas", "Vencidas"], ["hoje", "Hoje"], ["7dias", "Próximos 7 dias"], ["pagas", "Pagas"],
      ]} />

      {list.length === 0 ? (
        <Card><Empty title="Nenhuma conta nesta visão." sub="Custos de projetos e despesas pendentes aparecem aqui." /></Card>
      ) : (
        <div className="space-y-3">
          {list.map((i) => (
            <Card key={i.key} className="anim-fade-up p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold text-ink">{i.description}</div>
                  <div className="mt-0.5 truncate text-[12.5px] text-muted">
                    {i.kind === "custo" ? `Custo de projeto${i.projectLabel ? " · " + i.projectLabel : ""}` : `Despesa${i.installment ? " · " + i.installment : ""}`}
                    {i.categoryName ? ` · ${i.categoryName}` : ""}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {i.status === "paga" ? (
                      <Chip tone="ok">Paga em {formatDateBR(i.paidDate)}{i.method ? ` · ${METHOD_LABELS[i.method]}` : ""}</Chip>
                    ) : i.dueDate ? (
                      <DueChip dueDate={i.dueDate} />
                    ) : (
                      <Chip tone="neutral">Sem vencimento</Chip>
                    )}
                  </div>
                </div>
                <div className="num text-right text-[16px] font-semibold">{formatBRL(i.amountCents)}</div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {i.status === "paga" ? (
                  <RevertModal kind={i.kind} id={i.id} title={i.description} amount={i.amountCents} />
                ) : (
                  <PayItemModal kind={i.kind} id={i.id} title={i.description} amount={i.amountCents} className="btn btn-primary !py-2.5 text-[13px]" />
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: "warn" | "danger" }) {
  return (
    <Card className="p-4">
      <Label>{label}</Label>
      <div className={`num mt-1.5 text-[20px] font-semibold ${tone === "danger" ? "text-danger" : "text-warn"}`}>
        {formatBRL(value)}
      </div>
    </Card>
  );
}

function FilterChips({ aba, active, options }: { aba: string; active: string; options: [string, string][] }) {
  return (
    <div className="print-hidden flex gap-1.5 overflow-x-auto pb-1">
      {options.map(([key, label]) => (
        <a
          key={key}
          href={`/contas?aba=${aba}&f=${key}`}
          className={`whitespace-nowrap rounded-full border px-3.5 py-2 text-[12.5px] font-semibold transition-colors ${
            active === key ? "border-ink bg-ink text-white" : "border-line bg-card text-ink-soft hover:bg-paper"
          }`}
        >
          {label}
        </a>
      ))}
    </div>
  );
}
