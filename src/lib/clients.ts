// Helpers compartilhados do módulo de clientes (API + UI).

export type Client = {
  id: number;
  name: string;
  cpfCnpj: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  projectCount?: number;
};

/** Mensagem exibida quando o cliente possui vínculos e não pode ser excluído. */
export const BLOCKED_DELETE_MESSAGE =
  "Este cliente possui projetos ou movimentações vinculadas e não pode ser excluído.";

/** Remove a máscara e devolve apenas os dígitos do CPF/CNPJ. */
export function normalizeDoc(raw: unknown): string {
  return String(raw ?? "").replace(/\D/g, "");
}

/** true quando o documento tem 11 (CPF) ou 14 (CNPJ) dígitos. */
export function isValidDoc(raw: unknown): boolean {
  const d = normalizeDoc(raw);
  return d.length === 0 || d.length === 11 || d.length === 14;
}

/** Formata CPF/CNPJ armazenado sem máscara para exibição. */
export function formatDoc(raw: string | null | undefined): string {
  const d = normalizeDoc(raw);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return raw ? String(raw) : "";
}
