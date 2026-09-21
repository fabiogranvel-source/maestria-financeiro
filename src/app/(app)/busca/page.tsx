import Link from "next/link";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { formatBRL } from "@/lib/money";
import { formatDateBR } from "@/lib/dates";
import { Card, Chip, Empty, Label, PageHeader } from "@/components/ui";
import { Search } from "lucide-react";

export const dynamic = "force-dynamic";

const num = (v: unknown): number => Number(v ?? 0);

type Hit = { href: string; title: string; sub: string; right?: string; chip?: string };

export default async function BuscaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const like = `%${q.replace(/[%_]/g, "")}%`;

  let projetos: Hit[] = [], recebiveis: Hit[] = [], custos: Hit[] = [], despesas: Hit[] = [], caixa: Hit[] = [];

  if (q.length >= 2) {
    const pr = await db.execute(sql`
      SELECT p.id, p.name, p.status, c.name AS client, p.sale_amount_cents::bigint AS sale
      FROM projects p LEFT JOIN clients c ON c.id = p.client_id
      WHERE p.archived_at IS NULL AND (p.name ILIKE ${like} OR p.description ILIKE ${like} OR c.name ILIKE ${like})
      ORDER BY p.sale_date DESC LIMIT 10
    `);
    projetos = (pr.rows as Record<string, unknown>[]).map((r) => ({
      href: `/projetos/${r.id}`,
      title: String(r.client ?? "Cliente").toUpperCase(),
      sub: String(r.name),
      right: formatBRL(num(r.sale)),
      chip: "Projeto",
    }));

    const rc = await db.execute(sql`
      SELECT r.id, r.description, (r.amount_cents - r.received_amount_cents)::bigint AS saldo,
             r.status, r.due_date, c.name AS client, p.name AS proj, p.id AS pid
      FROM receivables r
      LEFT JOIN clients c ON c.id = r.client_id
      LEFT JOIN projects p ON p.id = r.project_id
      WHERE r.status <> 'cancelado' AND (r.description ILIKE ${like} OR c.name ILIKE ${like})
      ORDER BY r.due_date NULLS LAST LIMIT 10
    `);
    recebiveis = (rc.rows as Record<string, unknown>[]).map((r) => ({
      href: r.pid ? `/projetos/${r.pid}?tab=recebimentos` : "/contas?aba=receber",
      title: String(r.client ?? "Sem cliente"),
      sub: `${r.description}${r.due_date ? " · " + formatDateBR(String(r.due_date).slice(0, 10)) : ""}`,
      right: formatBRL(num(r.saldo)),
      chip: r.status === "recebido" ? "Recebido" : "A receber",
    }));

    const ct = await db.execute(sql`
      SELECT pc.id, pc.description, pc.amount_cents::bigint AS amount, pc.status,
             cat.name AS cat, p.name AS proj, c.name AS client, p.id AS pid
      FROM project_costs pc
      LEFT JOIN categories cat ON cat.id = pc.category_id
      LEFT JOIN projects p ON p.id = pc.project_id
      LEFT JOIN clients c ON c.id = p.client_id
      WHERE pc.status <> 'cancelado' AND (pc.description ILIKE ${like} OR cat.name ILIKE ${like} OR c.name ILIKE ${like})
      ORDER BY pc.id DESC LIMIT 10
    `);
    custos = (ct.rows as Record<string, unknown>[]).map((r) => ({
      href: r.pid ? `/projetos/${r.pid}?tab=custos` : "#",
      title: String(r.description),
      sub: [r.cat, r.client, r.proj].filter(Boolean).join(" · "),
      right: formatBRL(num(r.amount)),
      chip: r.status === "pago" ? "Pago" : "A pagar",
    }));

    const ex = await db.execute(sql`
      SELECT e.id, e.description, e.amount_cents::bigint AS amount, e.status, e.type, e.due_date, cat.name AS cat
      FROM expenses e LEFT JOIN categories cat ON cat.id = e.category_id
      WHERE e.status <> 'cancelada' AND (e.description ILIKE ${like} OR cat.name ILIKE ${like})
      ORDER BY e.due_date DESC LIMIT 10
    `);
    despesas = (ex.rows as Record<string, unknown>[]).map((r) => ({
      href: "/despesas",
      title: String(r.description),
      sub: [r.cat, r.type, r.due_date ? formatDateBR(String(r.due_date).slice(0, 10)) : null].filter(Boolean).join(" · "),
      right: formatBRL(num(r.amount)),
      chip: r.status === "paga" ? "Paga" : "Pendente",
    }));

    const cx = await db.execute(sql`
      SELECT ct.id, ct.description, ct.amount_cents::bigint AS amount, ct.type, ct.date, ct.origin, ct.ref_label
      FROM cash_transactions ct
      WHERE ct.description ILIKE ${like} OR ct.ref_label ILIKE ${like}
      ORDER BY ct.date DESC, ct.id DESC LIMIT 10
    `);
    caixa = (cx.rows as Record<string, unknown>[]).map((r) => ({
      href: "/fluxo",
      title: String(r.description),
      sub: [r.ref_label, r.date ? formatDateBR(String(r.date).slice(0, 10)) : null].filter(Boolean).join(" · "),
      right: `${r.type === "entrada" ? "+" : "−"} ${formatBRL(num(r.amount))}`,
      chip: "Caixa",
    }));
  }

  const total = projetos.length + recebiveis.length + custos.length + despesas.length + caixa.length;

  return (
    <div className="max-w-[820px]">
      <PageHeader title="Busca" sub="Clientes, projetos, custos, despesas e lançamentos" />

      <form method="get" action="/busca" className="anim-fade-up mb-6">
        <div className="relative">
          <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="input !py-4 !pl-11 text-[16px]"
            name="q"
            defaultValue={q}
            placeholder="Buscar por cliente, projeto, MDF, aluguel…"
            autoFocus
            autoComplete="off"
          />
        </div>
      </form>

      {q.length < 2 ? (
        <Card><Empty title="Digite ao menos 2 letras." sub="Ex.: Carlinhos, MDF, aluguel, máquina…" /></Card>
      ) : total === 0 ? (
        <Card><Empty title={`Nenhum resultado para "${q}".`} sub="Tente outro termo — cliente, descrição ou categoria." /></Card>
      ) : (
        <div className="space-y-6">
          <Section title="Projetos" items={projetos} />
          <Section title="A receber" items={recebiveis} />
          <Section title="Custos de projetos" items={custos} />
          <Section title="Despesas" items={despesas} />
          <Section title="Movimentações de caixa" items={caixa} />
        </div>
      )}
    </div>
  );
}

function Section({ title, items }: { title: string; items: Hit[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <Label>{title}</Label>
      <Card className="mt-2.5 divide-y divide-line px-5">
        {items.map((h, i) => (
          <Link key={i} href={h.href} className="block py-3.5 transition-opacity hover:opacity-70">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-[14px] font-semibold">{h.title}</div>
                <div className="mt-0.5 truncate text-[12px] text-muted">{h.sub}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {h.right ? <span className="num text-[13.5px] font-semibold">{h.right}</span> : null}
                {h.chip ? <Chip tone="neutral">{h.chip}</Chip> : null}
              </div>
            </div>
          </Link>
        ))}
      </Card>
    </section>
  );
}
