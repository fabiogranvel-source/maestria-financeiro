"use client";
import { ReactNode, useState } from "react";
import { centsToBRL } from "@/lib/format";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-stone-200/80 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-stone-500">{subtitle}</p>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}

export function Btn({
  children, onClick, variant = "primary", disabled, type = "button", className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  const styles: Record<string, string> = {
    primary: "bg-emerald-950 text-white hover:bg-emerald-900 active:scale-[0.98]",
    secondary: "bg-stone-100 text-stone-900 hover:bg-stone-200 active:scale-[0.98] border border-stone-200",
    ghost: "text-stone-600 hover:bg-stone-100",
    danger: "bg-red-600 text-white hover:bg-red-700 active:scale-[0.98]",
    success: "bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.98]",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-stone-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-stone-400">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full min-h-[44px] rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-[15px] text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-emerald-800 focus:ring-2 focus:ring-emerald-900/10";

export function Modal({
  open, onClose, title, children, wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-stone-950/50 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={`relative max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 pb-8 shadow-2xl sm:rounded-3xl sm:p-6 ${
          wide ? "sm:max-w-2xl" : "sm:max-w-lg"
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-stone-900">{title}</h2>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 text-xl leading-none text-stone-500 hover:bg-stone-200"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-100 text-2xl">◌</div>
      <p className="font-bold text-stone-900">{title}</p>
      {subtitle && <p className="mt-1 max-w-xs text-sm text-stone-500">{subtitle}</p>}
      {action && <div className="mt-4">{action}</div>}
    </Card>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-stone-200/70 ${className}`} />;
}

export function Money({ cents, className = "", signed = false }: { cents: number; className?: string; signed?: boolean }) {
  const neg = cents < 0;
  return (
    <span className={`${neg ? "text-red-600" : ""} ${className}`}>
      {signed && cents > 0 ? "+" : ""}
      {centsToBRL(cents)}
    </span>
  );
}

export function StatusPill({ tone, children }: { tone: "red" | "orange" | "yellow" | "green" | "gray" | "blue"; children: ReactNode }) {
  const map: Record<string, string> = {
    red: "bg-red-50 text-red-700 border-red-200",
    orange: "bg-orange-50 text-orange-700 border-orange-200",
    yellow: "bg-amber-50 text-amber-700 border-amber-200",
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    gray: "bg-stone-100 text-stone-600 border-stone-200",
    blue: "bg-sky-50 text-sky-700 border-sky-200",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${map[tone]}`}>
      {children}
    </span>
  );
}

export function ConfirmModal({
  open, onClose, onConfirm, title, message, confirmLabel = "Confirmar", danger, busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-[15px] leading-relaxed text-stone-600">{message}</p>
      <div className="mt-5 flex gap-2">
        <Btn variant="secondary" onClick={onClose} className="flex-1">
          Cancelar
        </Btn>
        <Btn variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={busy} className="flex-1">
          {busy ? "Aguarde…" : confirmLabel}
        </Btn>
      </div>
    </Modal>
  );
}

export function useToast() {
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  function show(msg: string, kind: "ok" | "err" = "ok") {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3200);
  }
  const el = toast ? (
    <div className="fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4 sm:bottom-8">
      <div
        className={`max-w-md rounded-2xl px-5 py-3 text-sm font-semibold shadow-2xl ${
          toast.kind === "ok" ? "bg-emerald-950 text-white" : "bg-red-600 text-white"
        }`}
      >
        {toast.msg}
      </div>
    </div>
  ) : null;
  return { show, el };
}

export function Tabs<T extends string>({
  tabs, value, onChange,
}: {
  tabs: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-2xl bg-stone-100 p-1">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={`flex min-h-[40px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-sm font-semibold transition ${
            value === t.value ? "bg-white text-stone-900 shadow" : "text-stone-500 hover:text-stone-700"
          }`}
        >
          {t.label}
          {t.count !== undefined && t.count > 0 && (
            <span
              className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                value === t.value ? "bg-emerald-950 text-white" : "bg-stone-200 text-stone-600"
              }`}
            >
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function MonthNav({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  function shift(delta: number) {
    const n = new Date(Date.UTC(y, m - 1 + delta, 1));
    onChange(`${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const months = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  return (
    <div className="flex items-center justify-between rounded-2xl border border-stone-200/80 bg-white px-2 py-1.5">
      <button onClick={() => shift(-1)} className="flex h-10 w-10 items-center justify-center rounded-xl text-xl text-stone-600 hover:bg-stone-100" aria-label="Mês anterior">‹</button>
      <button
        onClick={() => {
          const now = new Date();
          onChange(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
        }}
        className="text-[15px] font-bold text-stone-900"
      >
        {months[m - 1]} {y}
      </button>
      <button onClick={() => shift(1)} className="flex h-10 w-10 items-center justify-center rounded-xl text-xl text-stone-600 hover:bg-stone-100" aria-label="Próximo mês">›</button>
    </div>
  );
}
