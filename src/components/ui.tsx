import type { ReactNode } from "react";
import { formatDateBR, formatDateShort, diffDays, todayISO } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { Inbox } from "lucide-react";

/* ============================ RÓTULOS ============================ */

export const PROJECT_STATUS: Record<string, string> = {
  aprovado: "Aprovado",
  aguardando_medicao: "Aguardando medição",
  em_producao: "Em produção",
  pronto_para_instalacao: "Pronto p/ instalação",
  instalando: "Instalando",
  entregue: "Entregue",
  finalizado: "Finalizado",
};

export const METHOD_LABELS: Record<string, string> = {
  pix: "PIX",
  dinheiro: "Dinheiro",
  transferencia: "Transferência",
  cartao: "Cartão",
  boleto: "Boleto",
  outro: "Outro",
};

export const CONDITION_LABELS: Record<string, string> = {
  na_entrega: "Na entrega",
  data: "",
  a_definir: "A definir",
};

/* ============================ PRIMITIVOS ============================ */

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function Label({ children }: { children: ReactNode }) {
  return <div className="label-caps">{children}</div>;
}

export function Money({ cents, className = "", tone }: { cents: number; className?: string; tone?: "pos" | "neg" }) {
  const color = tone === "pos" ? "text-ok" : tone === "neg" ? "text-danger" : "";
  return <span className={`num font-semibold ${color} ${className}`}>{formatBRL(cents)}</span>;
}

export function Empty({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
      <div className="mb-1 rounded-2xl bg-paper p-4 text-muted">
        <Inbox size={26} strokeWidth={1.6} />
      </div>
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {sub ? <p className="max-w-xs text-[13px] text-muted">{sub}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

/* ============================ CHIPS ============================ */

type Tone = "danger" | "warn" | "caution" | "ok" | "neutral" | "brand";

const toneClasses: Record<Tone, string> = {
  danger: "bg-danger-soft text-danger",
  warn: "bg-warn-soft text-warn",
  caution: "bg-caution-soft text-caution",
  ok: "bg-ok-soft text-ok",
  neutral: "bg-paper text-ink-soft",
  brand: "bg-brand-soft text-brand-deep",
};

export function Chip({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`chip ${toneClasses[tone]}`}>{children}</span>;
}

const statusTone: Record<string, Tone> = {
  aprovado: "brand",
  aguardando_medicao: "caution",
  em_producao: "brand",
  pronto_para_instalacao: "ok",
  instalando: "brand",
  entregue: "ok",
  finalizado: "neutral",
};

export function ProjectStatusChip({ status }: { status: string }) {
  return <Chip tone={statusTone[status] ?? "neutral"}>{PROJECT_STATUS[status] ?? status}</Chip>;
}

export function DueChip({ dueDate, condition }: { dueDate: string | null; condition?: string | null }) {
  if (!dueDate) {
    const label = condition === "na_entrega" ? "Na entrega" : condition === "a_definir" ? "A definir" : "Sem data";
    return <Chip tone="neutral">{label}</Chip>;
  }
  const today = todayISO();
  const d = diffDays(today, dueDate);
  if (d < 0) return <Chip tone="danger">Vencida há {Math.abs(d)} {Math.abs(d) === 1 ? "dia" : "dias"}</Chip>;
  if (d === 0) return <Chip tone="warn">Vence hoje</Chip>;
  if (d <= 7) return <Chip tone="caution">Em {d} {d === 1 ? "dia" : "dias"}</Chip>;
  return <Chip tone="neutral">{formatDateShort(dueDate)}</Chip>;
}

export function DueDateText({ dueDate, condition }: { dueDate: string | null; condition?: string | null }) {
  if (!dueDate) {
    return <span className="text-muted">{condition === "na_entrega" ? "Na entrega" : "A definir"}</span>;
  }
  return <span>{formatDateBR(dueDate)}</span>;
}

/* ============================ STAT CARD ============================ */

export function Stat({
  label, cents, prefix, sub, tone, href,
}: {
  label: string;
  cents: number;
  prefix?: string;
  sub?: ReactNode;
  tone?: "pos" | "neg";
  href?: string;
}) {
  const inner = (
    <>
      <Label>{label}</Label>
      <div className="mt-2.5 flex items-baseline gap-1">
        <Money cents={cents} tone={tone} className="text-[26px] leading-none tracking-tight md:text-[28px]" />
      </div>
      {sub ? <div className="mt-2 text-[12px] text-muted">{sub}</div> : null}
    </>
  );
  const cls = "card p-5 transition-transform";
  if (href) {
    return <a href={href} className={`${cls} block hover:-translate-y-0.5`}>{inner}</a>;
  }
  return <div className={cls}>{inner}</div>;
}

export function PageHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-[24px] font-semibold tracking-tight text-ink md:text-[28px]">{title}</h1>
        {sub ? <p className="mt-1 text-[13.5px] text-muted">{sub}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function TabLinks({ tabs, active, base }: { tabs: { key: string; label: string }[]; active: string; base: string }) {
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto rounded-2xl border border-line bg-card p-1">
      {tabs.map((t) => (
        <a
          key={t.key}
          href={`${base}${base.includes("?") ? "&" : "?"}tab=${t.key}`}
          className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-[13.5px] font-semibold transition-colors ${
            active === t.key ? "bg-ink text-white" : "text-ink-soft hover:bg-paper"
          }`}
        >
          {t.label}
        </a>
      ))}
    </div>
  );
}
