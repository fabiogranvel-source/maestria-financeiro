// Formatação centralizada BRL + datas (America/Sao_Paulo)
export function centsToBRL(cents: number): string {
  const v = (cents || 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function brlToCents(input: string | number): number {
  if (typeof input === "number") return Math.round(input * 100);
  if (!input) return 0;
  let s = String(input).trim();
  // aceita "1.234,56" ou "1234.56" ou "1234,56"
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function parseCents(v: unknown): number {
  if (typeof v === "number") return Math.round(v);
  if (typeof v === "string") {
    // se já vier como centavos em string numérica sem separador decimal? assumimos valor em reais
    if (/^\d+$/.test(v.trim())) {
      // ambíguo: tratamos como reais se pequeno? Na API sempre enviamos centavos como number.
      return Number(v);
    }
    return brlToCents(v);
  }
  return 0;
}

export function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = String(iso).slice(0, 10);
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}

export function todayISO(tz = "America/Sao_Paulo"): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

export function monthLabel(competence: string): string {
  // competence YYYY-MM
  const [y, m] = competence.split("-").map(Number);
  const months = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  return `${months[(m || 1) - 1]} ${y}`;
}

export function monthLabelShort(competence: string): string {
  const [y, m] = competence.split("-").map(Number);
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${months[(m || 1) - 1]}/${String(y).slice(2)}`;
}

export function currentCompetence(tz = "America/Sao_Paulo"): string {
  return todayISO(tz).slice(0, 7);
}

export function shiftMonth(competence: string, delta: number): string {
  const [y, m] = competence.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function competenceRange(competence: string): { start: string; end: string } {
  const [y, m] = competence.split("-").map(Number);
  const start = `${competence}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${competence}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export function projectStatusLabel(s: string): string {
  const map: Record<string, string> = {
    approved: "Aprovado",
    measuring: "Aguard. medição",
    production: "Em produção",
    ready: "Pronto p/ instalação",
    installing: "Instalando",
    delivered: "Entregue",
    finished: "Finalizado",
  };
  return map[s] || s;
}

export function paymentMethodLabel(m: string | null | undefined): string {
  const map: Record<string, string> = {
    pix: "PIX",
    cash: "Dinheiro",
    transfer: "Transferência",
    card: "Cartão",
    boleto: "Boleto",
    other: "Outro",
  };
  return map[m || ""] || (m as string) || "—";
}

export function balanceModeLabel(m: string | null | undefined): string {
  const map: Record<string, string> = {
    on_delivery: "Na entrega",
    fixed_date: "Data definida",
    installments: "Parcelado",
    undefined: "A definir",
  };
  return map[m || ""] || "A definir";
}

export function classStatusTone(status: string): string {
  if (status === "overdue") return "text-red-600 bg-red-50 border-red-200";
  if (status === "today") return "text-orange-600 bg-orange-50 border-orange-200";
  if (status === "soon") return "text-amber-700 bg-amber-50 border-amber-200";
  if (status === "paid" || status === "received" || status === "ok") return "text-emerald-600 bg-emerald-50 border-emerald-200";
  return "text-slate-600 bg-slate-50 border-slate-200";
}
