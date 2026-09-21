/* Utilitários financeiros — valores SEMPRE em centavos inteiros. */

export function formatBRL(cents: number | null | undefined): string {
  const v = typeof cents === "number" && Number.isFinite(cents) ? cents : 0;
  return (v / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatBRLCompact(cents: number): string {
  const v = cents / 100;
  if (Math.abs(v) >= 1000) {
    return "R$ " + v.toLocaleString("pt-BR", { maximumFractionDigits: 1, notation: "compact" });
  }
  return formatBRL(cents);
}

/** Converte texto digitado ("1.234,56" | "1234.56" | "1234") em centavos. */
export function parseBRLToCents(input: string): number {
  if (!input) return 0;
  let s = String(input).trim().replace(/[R$\s]/g, "");
  if (!s) return 0;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // formato pt-BR: 1.234,56
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function centsToInput(cents: number | null | undefined): string {
  const v = typeof cents === "number" && Number.isFinite(cents) ? cents : 0;
  return (v / 100).toFixed(2).replace(".", ",");
}

export function marginPercent(profit: number, sale: number): number | null {
  if (!sale || sale <= 0) return null; // evita divisão por zero
  return (profit / sale) * 100;
}

export function formatPercent(p: number | null): string {
  if (p === null || !Number.isFinite(p)) return "—";
  return p.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + "%";
}
