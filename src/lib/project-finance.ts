// Regras financeiras compartilhadas do módulo de projetos (PUT/DELETE).
// Objetivo: nunca permitir que uma edicao/arquivamento quebre a consistencia
// entre a venda (projects) e suas cobrancas (receivables), pagamentos
// (payments_received) e caixa (cash_transactions).

import { db } from "@/db";
import { receivables, paymentsReceived, projectCosts } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

export const BLOCKED_HAS_PAYMENTS_MESSAGE =
  "Existem pagamentos recebidos neste projeto. Os valores financeiros da venda não podem mais ser alterados diretamente. Se necessário, estorne o pagamento e tente novamente.";

export const BLOCKED_OPEN_CHARGES_MESSAGE =
  "Este projeto possui cobranças em aberto. Cancele ou quite as cobranças antes de excluir o projeto.";

export const BLOCKED_HAS_PAYMENTS_DELETE_MESSAGE =
  "Este projeto possui pagamentos recebidos registrados e não pode ser excluído. Estorne os pagamentos ou mantenha o projeto para preservar o histórico financeiro.";

export type ProjectFinanceInventory = {
  /** Total de cobranças vinculadas (todas, inclusive canceladas). */
  receivablesTotal: number;
  /** Cobranças com saldo em aberto (pending ou partial). */
  receivablesOpen: number;
  /** Cobranças com algum valor recebido (received ou partial). */
  receivablesWithReceipts: number;
  /** Pagamentos recebidos não estornados. */
  activePayments: number;
  /** Pagamentos estornados (histórico, não impedem edição). */
  reversedPayments: number;
  /** Custos vinculados (ativos, não cancelados/arquivados). */
  activeCosts: number;
  /** Soma das cobranças ativas em centavos. */
  receivablesAmountCents: number;
  /** Soma já recebida nas cobranças, em centavos. */
  receivablesReceivedCents: number;
};

/** Levanta todo o estado financeiro relevante de um projeto. */
export async function getProjectFinanceInventory(projectId: number): Promise<ProjectFinanceInventory> {
  const recv = await db.select().from(receivables).where(eq(receivables.projectId, projectId));
  const pays = await db.select().from(paymentsReceived).where(eq(paymentsReceived.projectId, projectId));
  const [costRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(projectCosts)
    .where(and(eq(projectCosts.projectId, projectId), isNull(projectCosts.deletedAt), sql`${projectCosts.status} <> 'cancelled'`));

  const active = recv.filter((r) => r.status !== "cancelled");
  return {
    receivablesTotal: recv.length,
    receivablesOpen: active.filter((r) => Number(r.amountCents) - Number(r.receivedCents) > 0).length,
    receivablesWithReceipts: active.filter((r) => Number(r.receivedCents) > 0).length,
    activePayments: pays.filter((p) => !p.reversedAt).length,
    reversedPayments: pays.filter((p) => !!p.reversedAt).length,
    activeCosts: Number(costRow?.n || 0),
    receivablesAmountCents: active.reduce((s, r) => s + Number(r.amountCents), 0),
    receivablesReceivedCents: active.reduce((s, r) => s + Number(r.receivedCents), 0),
  };
}

/**
 * Valida se os novos valores financeiros (total e entrada) podem ser aplicados.
 * Retorna mensagem de erro quando a alteração deve ser bloqueada.
 */
export function validateFinancialChange(
  inv: ProjectFinanceInventory,
  newTotalCents: number,
  newDownCents: number
): string | null {
  if (inv.activePayments > 0 || inv.receivablesWithReceipts > 0) {
    return BLOCKED_HAS_PAYMENTS_MESSAGE;
  }
  if (newDownCents < 0) return "Valor da entrada não pode ser negativo.";
  if (newTotalCents <= 0) return "Valor da venda deve ser maior que zero.";
  if (newDownCents > newTotalCents) return "Entrada não pode ser maior que o valor da venda.";
  return null;
}

/**
 * Recalcula as cobranças automáticas ("Entrada" e "Saldo") de um projeto.
 * Só pode ser usada quando não há nenhum pagamento recebido; cobranças
 * manuais (criadas fora do cadastro) são preservadas.
 */
export function buildAutoReceivablesPlan(
  projectId: number,
  clientId: number,
  saleDate: string,
  totalCents: number,
  downCents: number,
  balanceMode: string,
  balanceDueDate: string | null
) {
  const rows: {
    description: string;
    amountCents: number;
    dueDate: string | null;
    condition: string;
  }[] = [];

  if (downCents > 0) {
    rows.push({
      description: "Entrada",
      amountCents: downCents,
      dueDate: saleDate,
      condition: "fixed",
    });
  }
  const balance = totalCents - downCents;
  if (balance > 0) {
    rows.push({
      description: balanceMode === "on_delivery" ? "Saldo na entrega" : "Saldo",
      amountCents: balance,
      dueDate: balanceMode === "fixed_date" && balanceDueDate ? balanceDueDate : null,
      condition:
        balanceMode === "on_delivery" ? "on_delivery" : balanceMode === "fixed_date" ? "fixed" : "undefined",
    });
  }
  return rows;
}

/** Marcadores das cobranças geradas automaticamente pelo cadastro. */
export const AUTO_RECEIVABLE_DESCRIPTIONS = ["Entrada", "Saldo", "Saldo na entrega"];

export function isAutoReceivable(description: string): boolean {
  return AUTO_RECEIVABLE_DESCRIPTIONS.includes(description);
}
