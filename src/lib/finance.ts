import "server-only";
/*
 * MOTOR FINANCEIRO CENTRALIZADO — Maestria Financeiro
 *
 * REGRA FUNDAMENTAL: VENDA ≠ RECEBIMENTO ≠ LUCRO ≠ CAIXA.
 * - Caixa: somente movimentações REALIZADAS (cash_transactions).
 * - Resultado gerencial: vendas do mês − custos dos projetos − despesas do mês (competência).
 * - A receber: saldo devedor dos recebíveis (nunca entra no caixa antes de receber).
 */
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { monthStartISO, monthEndISO, todayISO } from "./dates";

const num = (v: unknown): number => Number(v ?? 0);

async function scalar(q: ReturnType<typeof sql>): Promise<number> {
  const r = await db.execute(q);
  const first = (r.rows[0] ?? {}) as Record<string, unknown>;
  return num(Object.values(first)[0]);
}

/* ============================ CAIXA ============================ */

export async function getSaldoCaixa(untilISO?: string): Promise<number> {
  const filter = untilISO ? sql`AND ct.date <= ${untilISO}` : sql``;
  const r = await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN ct.type = 'entrada' THEN ct.amount_cents ELSE 0 END), 0)::bigint
      - COALESCE(SUM(CASE WHEN ct.type = 'saida' THEN ct.amount_cents ELSE 0 END), 0)::bigint AS saldo
    FROM cash_transactions ct
    WHERE 1 = 1 ${filter}
  `);
  return num((r.rows[0] as Record<string, unknown>)?.saldo);
}

export async function getCaixaPeriodo(startISO: string, endISO: string) {
  const r = await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN ct.type = 'entrada' THEN ct.amount_cents ELSE 0 END), 0)::bigint AS entradas,
      COALESCE(SUM(CASE WHEN ct.type = 'saida' THEN ct.amount_cents ELSE 0 END), 0)::bigint AS saidas
    FROM cash_transactions ct
    WHERE ct.date >= ${startISO} AND ct.date <= ${endISO}
  `);
  const row = (r.rows[0] ?? {}) as Record<string, unknown>;
  const entradas = num(row.entradas);
  const saidas = num(row.saidas);
  const saldoAnterior = await getSaldoCaixaAnterior(startISO);
  return { entradas, saidas, saldoAnterior, saldoAtual: saldoAnterior + entradas - saidas };
}

async function getSaldoCaixaAnterior(startISO: string): Promise<number> {
  const r = await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN ct.type = 'entrada' THEN ct.amount_cents ELSE 0 END), 0)::bigint
      - COALESCE(SUM(CASE WHEN ct.type = 'saida' THEN ct.amount_cents ELSE 0 END), 0)::bigint AS saldo
    FROM cash_transactions ct
    WHERE ct.date < ${startISO}
  `);
  return num((r.rows[0] as Record<string, unknown>)?.saldo);
}

/* ====================== PROJETOS (derivados) ====================== */

export async function getProjectTotals(projectId: number) {
  const r = await db.execute(sql`
    SELECT
      p.sale_amount_cents::bigint AS sale,
      (SELECT COALESCE(SUM(pay.amount_cents), 0)::bigint FROM payments pay
        WHERE pay.project_id = p.id AND pay.reverted_at IS NULL) AS recebido,
      (SELECT COALESCE(SUM(c.amount_cents), 0)::bigint FROM project_costs c
        WHERE c.project_id = p.id AND c.status <> 'cancelado') AS custos
    FROM projects p WHERE p.id = ${projectId}
  `);
  const row = (r.rows[0] ?? {}) as Record<string, unknown>;
  const sale = num(row.sale);
  const recebido = num(row.recebido);
  const custos = num(row.custos);
  const aReceber = sale - recebido;
  const lucro = sale - custos;
  return { sale, recebido, aReceber, custos, lucro, margem: sale > 0 ? (lucro / sale) * 100 : null };
}

export type ProjectTotals = Awaited<ReturnType<typeof getProjectTotals>>;

export async function getProjectsTotalsBatch(projectIds: number[]): Promise<Map<number, Omit<ProjectTotals, "sale">>> {
  const map = new Map<number, Omit<ProjectTotals, "sale">>();
  if (projectIds.length === 0) return map;
  const idList = sql.join(projectIds.map((id) => sql`${id}`), sql`, `);
  const r = await db.execute(sql`
    SELECT
      p.id,
      (SELECT COALESCE(SUM(pay.amount_cents), 0)::bigint FROM payments pay
        WHERE pay.project_id = p.id AND pay.reverted_at IS NULL) AS recebido,
      (SELECT COALESCE(SUM(c.amount_cents), 0)::bigint FROM project_costs c
        WHERE c.project_id = p.id AND c.status <> 'cancelado') AS custos,
      p.sale_amount_cents::bigint AS sale
    FROM projects p
    WHERE p.id IN (${idList})
  `);
  for (const row of r.rows as Record<string, unknown>[]) {
    map.set(num(row.id), {
      recebido: num(row.recebido),
      custos: num(row.custos),
      aReceber: num(row.sale) - num(row.recebido),
      lucro: num(row.sale) - num(row.custos),
      margem: num(row.sale) > 0 ? ((num(row.sale) - num(row.custos)) / num(row.sale)) * 100 : null,
    });
  }
  return map;
}

/* ============================ DASHBOARD ============================ */

export async function getDashboard(year: number, month: number) {
  const start = monthStartISO(year, month);
  const end = monthEndISO(year, month);
  const today = todayISO();

  const vendas = await scalar(sql`
    SELECT COALESCE(SUM(sale_amount_cents), 0)::bigint FROM projects
    WHERE sale_date >= ${start} AND sale_date <= ${end} AND archived_at IS NULL
  `);

  const recebido = await scalar(sql`
    SELECT COALESCE(SUM(amount_cents), 0)::bigint FROM payments
    WHERE date >= ${start} AND date <= ${end} AND reverted_at IS NULL
  `);

  const aReceber = await scalar(sql`
    SELECT COALESCE(SUM(amount_cents - received_amount_cents), 0)::bigint FROM receivables
    WHERE status = 'pendente'
  `);

  // Custos associados aos projetos vendidos no período (visão gerencial)
  const custosProjetos = await scalar(sql`
    SELECT COALESCE(SUM(c.amount_cents), 0)::bigint
    FROM project_costs c
    INNER JOIN projects p ON p.id = c.project_id
    WHERE c.status <> 'cancelado'
      AND p.sale_date >= ${start} AND p.sale_date <= ${end} AND p.archived_at IS NULL
  `);

  // Despesas gerais por competência (vencimento no mês), exceto canceladas
  const despesasGerais = await scalar(sql`
    SELECT COALESCE(SUM(amount_cents), 0)::bigint FROM expenses
    WHERE status <> 'cancelada' AND due_date >= ${start} AND due_date <= ${end}
  `);

  const caixa = await getCaixaPeriodo(start, end);
  const saldoCaixa = await getSaldoCaixa();

  const resultadoGerencial = vendas - custosProjetos - despesasGerais;

  // ---- Séries: últimos 6 meses ----
  const meses: {
    year: number; month: number; label: string; short: string;
    entradas: number; saidas: number; resultado: number;
  }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const s = monthStartISO(y, m);
    const e = monthEndISO(y, m);
    const cx = await getCaixaPeriodo(s, e);
    const v = await scalar(sql`
      SELECT COALESCE(SUM(sale_amount_cents), 0)::bigint FROM projects
      WHERE sale_date >= ${s} AND sale_date <= ${e} AND archived_at IS NULL
    `);
    const cp = await scalar(sql`
      SELECT COALESCE(SUM(c.amount_cents), 0)::bigint
      FROM project_costs c INNER JOIN projects p ON p.id = c.project_id
      WHERE c.status <> 'cancelado' AND p.sale_date >= ${s} AND p.sale_date <= ${e} AND p.archived_at IS NULL
    `);
    const dg = await scalar(sql`
      SELECT COALESCE(SUM(amount_cents), 0)::bigint FROM expenses
      WHERE status <> 'cancelada' AND due_date >= ${s} AND due_date <= ${e}
    `);
    meses.push({
      year: y, month: m,
      label: `${String(m).padStart(2, "0")}/${y}`,
      short: ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"][m - 1],
      entradas: cx.entradas,
      saidas: cx.saidas,
      resultado: v - cp - dg,
    });
  }

  return {
    vendas,
    recebido,
    aReceber,
    custosProjetos,
    despesasGerais,
    resultadoGerencial,
    saldoCaixa,
    caixaMes: caixa,
    meses,
    today,
  };
}

/* ====================== ALERTAS (Atenção necessária) ====================== */

export type AlertItem = {
  id: string;
  kind: "recebivel" | "custo" | "despesa";
  refId: number;
  title: string;
  subtitle: string;
  amountCents: number;
  dueDate: string | null;
  severity: "vencido" | "hoje" | "proximo";
  href: string;
};

function severityFor(dueDate: string | null, today: string): AlertItem["severity"] | null {
  if (!dueDate) return null; // "na entrega" sem data não é atraso
  if (dueDate < today) return "vencido";
  if (dueDate === today) return "hoje";
  const in7 = new Date(Date.parse(today + "T00:00:00Z") + 7 * 86400000).toISOString().slice(0, 10);
  if (dueDate <= in7) return "proximo";
  return null;
}

export async function getAlerts(today: string): Promise<AlertItem[]> {
  const alerts: AlertItem[] = [];

  const rec = await db.execute(sql`
    SELECT r.id, r.description, r.due_date,
           (r.amount_cents - r.received_amount_cents)::bigint AS saldo,
           c.name AS client_name, p.name AS project_name, r.project_id
    FROM receivables r
    LEFT JOIN clients c ON c.id = r.client_id
    LEFT JOIN projects p ON p.id = r.project_id
    WHERE r.status = 'pendente' AND r.due_date IS NOT NULL
      AND r.due_date <= ${today}::date + interval '7 days'
    ORDER BY r.due_date ASC
    LIMIT 40
  `);
  for (const row of rec.rows as Record<string, unknown>[]) {
    const due = row.due_date ? String(row.due_date).slice(0, 10) : null;
    const sev = severityFor(due, today);
    if (!sev) continue;
    alerts.push({
      id: `rec-${row.id}`,
      kind: "recebivel",
      refId: num(row.id),
      title: String(row.client_name ?? "Cliente"),
      subtitle: `${row.project_name ?? ""} · ${row.description ?? "Recebimento"}`,
      amountCents: num(row.saldo),
      dueDate: due,
      severity: sev,
      href: `/contas?aba=receber`,
    });
  }

  const costs = await db.execute(sql`
    SELECT c.id, c.description, c.due_date, c.amount_cents::bigint AS amount,
           p.name AS project_name, cl.name AS client_name
    FROM project_costs c
    JOIN projects p ON p.id = c.project_id
    LEFT JOIN clients cl ON cl.id = p.client_id
    WHERE c.status = 'pendente' AND c.due_date IS NOT NULL
      AND c.due_date <= ${today}::date + interval '7 days'
    ORDER BY c.due_date ASC
    LIMIT 40
  `);
  for (const row of costs.rows as Record<string, unknown>[]) {
    const due = row.due_date ? String(row.due_date).slice(0, 10) : null;
    const sev = severityFor(due, today);
    if (!sev) continue;
    alerts.push({
      id: `cost-${row.id}`,
      kind: "custo",
      refId: num(row.id),
      title: String(row.description),
      subtitle: `Custo · ${row.client_name ?? ""} ${row.project_name ? "· " + row.project_name : ""}`,
      amountCents: num(row.amount),
      dueDate: due,
      severity: sev,
      href: `/contas?aba=pagar`,
    });
  }

  const exps = await db.execute(sql`
    SELECT e.id, e.description, e.due_date, e.amount_cents::bigint AS amount, e.type,
           e.installment_number, e.installment_total
    FROM expenses e
    WHERE e.status = 'pendente' AND e.due_date IS NOT NULL
      AND e.due_date <= ${today}::date + interval '7 days'
    ORDER BY e.due_date ASC
    LIMIT 40
  `);
  for (const row of exps.rows as Record<string, unknown>[]) {
    const due = row.due_date ? String(row.due_date).slice(0, 10) : null;
    const sev = severityFor(due, today);
    if (!sev) continue;
    const parcela = row.installment_number ? ` · parcela ${row.installment_number}/${row.installment_total}` : "";
    alerts.push({
      id: `exp-${row.id}`,
      kind: "despesa",
      refId: num(row.id),
      title: String(row.description),
      subtitle: `Despesa${parcela}`,
      amountCents: num(row.amount),
      dueDate: due,
      severity: sev,
      href: `/contas?aba=pagar`,
    });
  }

  const order = { vencido: 0, hoje: 1, proximo: 2 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}

/* ====================== FECHAMENTO MENSAL ====================== */

export async function getFechamento(year: number, month: number) {
  const dash = await getDashboard(year, month);
  const start = monthStartISO(year, month);
  const end = monthEndISO(year, month);

  const projetos = await db.execute(sql`
    SELECT p.id, p.name, c.name AS client_name, p.sale_amount_cents::bigint AS sale, p.status,
      (SELECT COALESCE(SUM(pay.amount_cents), 0)::bigint FROM payments pay
        WHERE pay.project_id = p.id AND pay.reverted_at IS NULL) AS recebido,
      (SELECT COALESCE(SUM(pc.amount_cents), 0)::bigint FROM project_costs pc
        WHERE pc.project_id = p.id AND pc.status <> 'cancelado') AS custos
    FROM projects p
    LEFT JOIN clients c ON c.id = p.client_id
    WHERE p.sale_date >= ${start} AND p.sale_date <= ${end} AND p.archived_at IS NULL
    ORDER BY p.sale_date DESC
  `);

  const porCategoria = await db.execute(sql`
    SELECT cat.name,
      COALESCE((
        SELECT SUM(c.amount_cents) FROM project_costs c
        JOIN projects p2 ON p2.id = c.project_id
        WHERE c.category_id = cat.id AND c.status <> 'cancelado'
          AND p2.sale_date >= ${start} AND p2.sale_date <= ${end}
      ), 0)::bigint
      +
      COALESCE((
        SELECT SUM(e.amount_cents) FROM expenses e
        WHERE e.category_id = cat.id AND e.status <> 'cancelada'
          AND e.due_date >= ${start} AND e.due_date <= ${end}
      ), 0)::bigint AS total
    FROM categories cat
    WHERE cat.archived_at IS NULL
    ORDER BY total DESC
  `);

  const carlsItems = (porCategoria.rows as Record<string, unknown>[])
    .map((r) => ({ name: String(r.name), total: num(r.total) }))
    .filter((r) => r.total > 0);

  return {
    ...dash,
    start,
    end,
    saldoFinalMes: dash.caixaMes.saldoAtual,
    projetos: (projetos.rows as Record<string, unknown>[]).map((r) => {
      const sale = num(r.sale);
      const custos = num(r.custos);
      const recebido = num(r.recebido);
      return {
        id: num(r.id),
        name: String(r.name),
        clientName: String(r.client_name ?? ""),
        status: String(r.status),
        sale,
        recebido,
        aReceber: sale - recebido,
        custos,
        lucro: sale - custos,
        margem: sale > 0 ? ((sale - custos) / sale) * 100 : null,
      };
    }),
    porCategoria: carlsItems,
  };
}

/* ====================== PROJEÇÃO FUTURA ====================== */

export async function getProjecao(monthsAhead: number) {
  const today = todayISO();
  const [cy, cm] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  const result: {
    year: number; month: number; label: string;
    recorrentes: number; parcelas: number; unicas: number;
    totalSaidas: number; aReceberPrevisto: number; saldoPrevisto: number;
    itens: { descricao: string; categoria: string | null; valor: number; tipo: string; detalhe?: string }[];
  }[] = [];

  for (let i = 1; i <= monthsAhead; i++) {
    const d = new Date(Date.UTC(cy, cm - 1 + i, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const s = monthStartISO(y, m);
    const e = monthEndISO(y, m);

    // Despesas recorrentes ativas: calculadas virtualmente (valor vigente)
    const rec = await db.execute(sql`
      SELECT r.description, r.amount_cents::bigint AS amount, r.due_day, c.name AS cat
      FROM recurring_rules r
      LEFT JOIN categories c ON c.id = r.category_id
      WHERE r.status = 'ativa'
        AND r.start_date <= ${e}
        AND (r.end_date IS NULL OR r.end_date >= ${s})
    `);
    const itens: { descricao: string; categoria: string | null; valor: number; tipo: string; detalhe?: string }[] = [];
    let recorrentes = 0;
    for (const row of rec.rows as Record<string, unknown>[]) {
      recorrentes += num(row.amount);
      itens.push({ descricao: String(row.description), categoria: row.cat ? String(row.cat) : null, valor: num(row.amount), tipo: "recorrente" });
    }

    // Parcelas pendentes (linhas reais — terminam sozinhas após a última)
    const parc = await db.execute(sql`
      SELECT e.description, e.amount_cents::bigint AS amount, e.installment_number, e.installment_total, c.name AS cat
      FROM expenses e
      LEFT JOIN categories c ON c.id = e.category_id
      WHERE e.status = 'pendente' AND e.type = 'parcelada'
        AND e.due_date >= ${s} AND e.due_date <= ${e}
      ORDER BY e.due_date
    `);
    let parcelas = 0;
    for (const row of parc.rows as Record<string, unknown>[]) {
      parcelas += num(row.amount);
      itens.push({
        descricao: String(row.description),
        categoria: row.cat ? String(row.cat) : null,
        valor: num(row.amount),
        tipo: "parcela",
        detalhe: `parcela ${row.installment_number}/${row.installment_total}`,
      });
    }

    // Despesas únicas + recorrentes já materializadas pendentes no mês
    const uni = await db.execute(sql`
      SELECT e.description, e.amount_cents::bigint AS amount, c.name AS cat, e.type
      FROM expenses e
      LEFT JOIN categories c ON c.id = e.category_id
      WHERE e.status = 'pendente' AND e.type <> 'parcelada'
        AND e.due_date >= ${s} AND e.due_date <= ${e}
      ORDER BY e.due_date
    `);
    let unicas = 0;
    for (const row of uni.rows as Record<string, unknown>[]) {
      if (row.type === "recorrente") continue; // já contada virtualmente
      unicas += num(row.amount);
      itens.push({ descricao: String(row.description), categoria: row.cat ? String(row.cat) : null, valor: num(row.amount), tipo: "única" });
    }

    // Custos de projetos pendentes com vencimento no mês
    const custosPend = await db.execute(sql`
      SELECT c2.description, c2.amount_cents::bigint AS amount, cat.name AS cat, p.name AS proj
      FROM project_costs c2
      LEFT JOIN categories cat ON cat.id = c2.category_id
      LEFT JOIN projects p ON p.id = c2.project_id
      WHERE c2.status = 'pendente' AND c2.due_date >= ${s} AND c2.due_date <= ${e}
      ORDER BY c2.due_date
    `);
    for (const row of custosPend.rows as Record<string, unknown>[]) {
      unicas += num(row.amount);
      itens.push({ descricao: String(row.description), categoria: row.cat ? String(row.cat) : null, valor: num(row.amount), tipo: "custo", detalhe: row.proj ? String(row.proj) : undefined });
    }

    // Recebimentos previstos COM DATA no mês
    const aReceberPrevisto = await scalar(sql`
      SELECT COALESCE(SUM(amount_cents - received_amount_cents), 0)::bigint FROM receivables
      WHERE status = 'pendente' AND due_date >= ${s} AND due_date <= ${e}
    `);

    const totalSaidas = recorrentes + parcelas + unicas;
    result.push({
      year: y, month: m,
      label: `${String(m).padStart(2, "0")}/${y}`,
      recorrentes, parcelas, unicas,
      totalSaidas,
      aReceberPrevisto,
      saldoPrevisto: aReceberPrevisto - totalSaidas,
      itens,
    });
  }
  return result;
}
