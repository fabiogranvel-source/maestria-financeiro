// ============================================================
// CAMADA CENTRAL DE CÁLCULOS FINANCEIROS — MAESTRIA FINANCEIRO
// Todas as telas/APIs devem usar estas funções. Não duplicar fórmulas.
// Valores em CENTAVOS (inteiros).
// ============================================================

export type ProjectFinance = {
  totalCents: number;
  receivedCents: number;
  pendingCents: number;
  costCents: number;
  profitCents: number;
  marginPct: number;
};

export function projectPending(totalCents: number, receivedCents: number): number {
  return Math.max(0, totalCents - receivedCents);
}

export function projectProfit(totalCents: number, costCents: number): number {
  return totalCents - costCents;
}

export function projectMargin(totalCents: number, costCents: number): number {
  if (!totalCents || totalCents <= 0) return 0;
  return ((totalCents - costCents) / totalCents) * 100;
}

export function summarizeProject(
  totalCents: number,
  receivedCents: number,
  costCents: number
): ProjectFinance {
  const pending = projectPending(totalCents, receivedCents);
  const profit = projectProfit(totalCents, costCents);
  const margin = projectMargin(totalCents, costCents);
  return {
    totalCents,
    receivedCents,
    pendingCents: pending,
    costCents,
    profitCents: profit,
    marginPct: Math.round(margin * 10) / 10,
  };
}

export type CashSummary = {
  openingCents: number;
  entriesCents: number;
  exitsCents: number;
  balanceCents: number;
};

export function cashBalance(openingCents: number, entriesCents: number, exitsCents: number): number {
  return openingCents + entriesCents - exitsCents;
}

/** Resultado gerencial do mês (não é caixa) */
export type MonthlyResult = {
  soldCents: number; // vendas cadastradas no período (sale_date)
  receivedCents: number; // recebimentos efetivos no período
  pendingTotalCents: number; // a receber total em aberto (não só do mês)
  projectCostsCents: number; // custos de projeto (previsto? pago?) -> usamos custos cadastrados pagos+pendentes vinculados a vendas? Para resultado mensal usamos custos pagos no período + despesas pagas? Definimos abaixo.
  generalExpensesCents: number;
  cashInCents: number;
  cashOutCents: number;
  managerialResultCents: number; // recebido - (custos pagos + despesas pagas) no período? Ou vendido - custos - despesas?
  cashBalanceCents: number;
};

/**
 * Definição oficial V1:
 * - Resultado gerencial do mês = Recebimentos do período − (Custos de projeto PAGOS no período + Despesas gerais PAGAS no período)
 *   Separado do caixa total porque o caixa inclui saldo inicial e ajustes.
 * - "Custos dos projetos" no dashboard = soma dos custos (pendentes+pagos, não cancelados) dos projetos com venda no período? NÃO — mais útil: custos com vencimento/pagamento no período.
 *   Para clareza V1: Dashboard "Custos dos projetos" = custos de projeto com pago OU vencimento dentro do mês (competência de caixa/previsto).
 *   "Despesas gerais" = despesas gerais com pago OU vencimento no mês.
 */
export function managerialResult(
  receivedCents: number,
  projectCostsPaidCents: number,
  generalExpensesPaidCents: number
): number {
  return receivedCents - projectCostsPaidCents - generalExpensesPaidCents;
}

export function validateMoney(cents: number, opts?: { allowZero?: boolean; field?: string }): string | null {
  const field = opts?.field || "Valor";
  if (!Number.isFinite(cents) || !Number.isInteger(cents)) return `${field} inválido.`;
  if (cents < 0) return `${field} não pode ser negativo.`;
  if (!opts?.allowZero && cents <= 0) return `${field} deve ser maior que zero.`;
  return null;
}

export function validateInstallments(n: number): string | null {
  if (!Number.isInteger(n) || n < 1) return "Quantidade de parcelas deve ser no mínimo 1.";
  if (n > 120) return "Quantidade de parcelas inválida (máx. 120).";
  return null;
}

/** Status de vencimento: overdue | today | soon(7d) | future | nodate */
export function dueTone(dueDate: string | null | undefined, todayISO: string): string {
  if (!dueDate) return "nodate";
  const d = dueDate.slice(0, 10);
  if (d < todayISO) return "overdue";
  if (d === todayISO) return "today";
  const diff =
    (new Date(d + "T12:00:00Z").getTime() - new Date(todayISO + "T12:00:00Z").getTime()) / 86400000;
  if (diff <= 7) return "soon";
  return "future";
}
