"use client";

import {
  useState, useEffect, useActionState, type ReactNode, type FormEvent,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import {
  LayoutDashboard, FolderKanban, ReceiptText, Wallet, Plus, MoreHorizontal,
  Search, Landmark, TrendingUp, CalendarCheck2, Tags, ArrowDownLeft, ArrowUpRight,
  Hammer, FolderPlus, Receipt, X, LogOut, Loader2, ChevronLeft, ChevronRight, Menu,
} from "lucide-react";
import type { ActionResult } from "@/lib/actions";
import { logoutAction } from "@/lib/actions";

/* ============================ APP SHELL ============================ */

const NAV_MAIN = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projetos", label: "Projetos", icon: FolderKanban },
  { href: "/contas", label: "Contas", icon: Wallet },
  { href: "/despesas", label: "Despesas", icon: ReceiptText },
];

const NAV_SECONDARY = [
  { href: "/fluxo", label: "Fluxo de Caixa", icon: Landmark },
  { href: "/projecao", label: "Projeção", icon: TrendingUp },
  { href: "/fechamento", label: "Fechamento", icon: CalendarCheck2 },
  { href: "/categorias", label: "Categorias", icon: Tags },
  { href: "/busca", label: "Busca", icon: Search },
];

const ALL_NAV = [...NAV_MAIN, ...NAV_SECONDARY];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

function BrandMark() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-gold font-display text-[15px] font-bold text-ink">
        M
      </div>
      <div className="leading-none">
        <div className="font-display text-[13px] font-bold tracking-[0.18em] text-white">MAESTRIA</div>
        <div className="mt-1 text-[10px] font-semibold tracking-[0.28em] text-white/50">FINANCEIRO</div>
      </div>
    </div>
  );
}

export function AppShell({ userName, children }: { userName: string; children: ReactNode }) {
  const pathname = usePathname();
  const [quickOpen, setQuickOpen] = useState(false);
  return (
    <div className="min-h-dvh md:pl-[248px]">
      {/* SIDEBAR — desktop */}
      <aside className="print-hidden fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col bg-sidebar md:flex">
        <div className="px-6 pb-8 pt-7">
          <BrandMark />
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3">
          {ALL_NAV.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13.5px] font-medium transition-colors ${
                  active ? "bg-sidebar-soft text-white" : "text-white/55 hover:bg-sidebar-soft/60 hover:text-white"
                }`}
              >
                <Icon size={17} strokeWidth={active ? 2.2 : 1.8} />
                {item.label}
                {active ? <span className="ml-auto h-1.5 w-1.5 rounded-full bg-gold" /> : null}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 font-display text-[12px] font-bold text-white">
              {userName.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-white">{userName}</div>
              <div className="text-[11px] text-white/40">Administrador</div>
            </div>
            <form action={logoutAction}>
              <button className="rounded-lg p-2 text-white/40 transition-colors hover:bg-white/10 hover:text-white" title="Sair">
                <LogOut size={15} />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* TOPBAR — mobile */}
      <header className="print-hidden sticky top-0 z-30 flex items-center justify-between bg-sidebar px-4 py-3.5 md:hidden">
        <BrandMark />
        <Link href="/busca" className="rounded-xl bg-white/10 p-2.5 text-white/80">
          <Search size={17} />
        </Link>
      </header>

      <main className="mx-auto w-full max-w-[1100px] px-4 pb-40 pt-5 md:px-8 md:pb-24 md:pt-9">
        {children}
      </main>

      {/* BOTTOM NAV — mobile */}
      <nav className="print-hidden fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-sidebar/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="grid grid-cols-5">
          {NAV_MAIN.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold ${
                  active ? "text-white" : "text-white/45"
                }`}
              >
                <Icon size={19} strokeWidth={active ? 2.2 : 1.7} />
                {item.label}
              </Link>
            );
          })}
          <Link
            href="/mais"
            className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold ${
              pathname.startsWith("/mais") || NAV_SECONDARY.some((i) => isActive(pathname, i.href))
                ? "text-white"
                : "text-white/45"
            }`}
          >
            <MoreHorizontal size={19} strokeWidth={1.7} />
            Mais
          </Link>
        </div>
      </nav>

      {/* FAB — ação rápida */}
      <button
        onClick={() => setQuickOpen(true)}
        aria-label="Lançamento rápido"
        className="print-hidden fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gold text-ink shadow-pop transition-transform active:scale-90 md:bottom-10 md:right-10"
      >
        <Plus size={26} strokeWidth={2.4} />
      </button>

      {quickOpen ? <QuickSheet onClose={() => setQuickOpen(false)} /> : null}
    </div>
  );
}

const QUICK_ACTIONS = [
  { href: "/contas?aba=receber", label: "Recebi de cliente", desc: "Registrar recebimento", icon: ArrowDownLeft },
  { href: "/contas?aba=pagar", label: "Paguei uma conta", desc: "Baixar conta a pagar", icon: ArrowUpRight },
  { href: "/lancar/custo", label: "Adicionar custo à obra", desc: "Custo de um projeto", icon: Hammer },
  { href: "/projetos/novo", label: "Novo projeto", desc: "Venda / obra planejada", icon: FolderPlus },
  { href: "/despesas?nova=1", label: "Nova despesa", desc: "Única, recorrente ou parcelada", icon: Receipt },
];

function QuickSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  return (
    <div className="print-hidden fixed inset-0 z-50">
      <div className="anim-fade absolute inset-0 bg-ink/45 backdrop-blur-[2px]" onClick={onClose} />
      <div className="anim-sheet absolute inset-x-0 bottom-0 rounded-t-[26px] bg-card px-5 pb-10 pt-4 md:left-1/2 md:right-auto md:bottom-auto md:top-1/2 md:w-[420px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[26px] md:pb-6">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line-strong md:hidden" />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-[17px] font-semibold">Lançamento rápido</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-paper md:hidden"><X size={18} /></button>
        </div>
        <div className="space-y-1.5">
          {QUICK_ACTIONS.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.href}
                onClick={() => { onClose(); router.push(a.href); }}
                className="flex w-full items-center gap-3.5 rounded-2xl px-3.5 py-3.5 text-left transition-colors hover:bg-paper active:bg-paper"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand-deep">
                  <Icon size={18} strokeWidth={2} />
                </span>
                <span>
                  <span className="block text-[14.5px] font-semibold text-ink">{a.label}</span>
                  <span className="block text-[12px] text-muted">{a.desc}</span>
                </span>
                <ChevronRight size={16} className="ml-auto text-line-strong" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ============================ MODAL ============================ */

export function Modal({
  open, onClose, title, children, wide,
}: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="anim-fade absolute inset-0 bg-ink/45 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={`anim-sheet absolute inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto rounded-t-[26px] bg-card p-5 pb-12 md:left-1/2 md:right-auto md:bottom-auto md:top-1/2 md:max-h-[86vh] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[22px] md:p-6 ${
          wide ? "md:w-[560px]" : "md:w-[440px]"
        }`}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line-strong md:hidden" />
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-[17px] font-semibold tracking-tight">{title}</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-muted transition-colors hover:bg-paper"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ModalButton({
  label, icon, title, children, className = "btn btn-ghost", defaultOpen = false, wide,
}: {
  label: ReactNode;
  icon?: ReactNode;
  title: string;
  children: (close: () => void) => ReactNode;
  className?: string;
  defaultOpen?: boolean;
  wide?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {icon}{label}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} wide={wide}>
        {children(() => setOpen(false))}
      </Modal>
    </>
  );
}

/* ============================ FORMULÁRIOS ============================ */

export function ActionForm({
  action, children, onSuccess, className = "",
}: {
  action: (fd: FormData) => Promise<ActionResult | void>;
  children: ReactNode;
  onSuccess?: () => void;
  className?: string;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    async (_prev: ActionResult | null, fd: FormData): Promise<ActionResult | null> => {
      let res = (await action(fd)) as ActionResult | void;
      if (res && res.needsConfirm) {
        if (window.confirm(res.needsConfirm)) {
          fd.set("confirmed", "1");
          res = (await action(fd)) as ActionResult | void;
        } else {
          return { ok: false, error: "Operação cancelada pelo usuário." };
        }
      }
      if (!res || res.ok) {
        onSuccess?.();
        router.refresh();
      }
      return res ?? null;
    },
    null
  );
  return (
    <form action={formAction} className={className}>
      {children}
      {state && !state.ok && state.error ? (
        <div className="mt-4 rounded-xl bg-danger-soft px-4 py-3 text-[13px] font-semibold text-danger">
          {state.error}
        </div>
      ) : null}
      {state && state.ok && !state.needsConfirm ? null : null}
    </form>
  );
}

export function Submit({ children, className = "btn btn-primary w-full", pendingLabel = "Processando…" }: {
  children: ReactNode; className?: string; pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? <Loader2 size={16} className="animate-spin" /> : null}
      {pending ? pendingLabel : children}
    </button>
  );
}

/** Campo monetário pt-BR: digitação de dígitos, vira 1.234,56 */
export function MoneyInput({
  name, defaultValue = "", placeholder = "0,00", required, autoFocus,
}: {
  name: string; defaultValue?: string; placeholder?: string; required?: boolean; autoFocus?: boolean;
}) {
  const [value, setValue] = useState(defaultValue);
  function handle(e: FormEvent<HTMLInputElement>) {
    const raw = e.currentTarget.value.replace(/\D/g, "");
    if (!raw) { setValue(""); return; }
    const n = Number(raw) / 100;
    setValue(n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  }
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[14px] font-semibold text-muted">R$</span>
      <input
        className="input num pl-11 text-[16px] font-semibold"
        name={name}
        value={value}
        onInput={handle}
        placeholder={placeholder}
        inputMode="numeric"
        autoComplete="off"
        required={required}
        autoFocus={autoFocus}
      />
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label-caps mb-1.5 block">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11.5px] text-muted">{hint}</span> : null}
    </label>
  );
}

/** Botão de confirmação simples (window.confirm) para ações diretas */
export function ConfirmForm({
  action, message, children, className = "",
}: {
  action: (fd: FormData) => Promise<ActionResult | void>;
  message: string;
  children: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  return (
    <form
      className={className}
      action={async (fd: FormData) => {
        if (!window.confirm(message)) return;
        const res = await action(fd);
        if (res && !res.ok && res.error) window.alert(res.error);
        router.refresh();
      }}
    >
      {children}
    </form>
  );
}

export function AutoPrint() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, []);
  return null;
}

/* ============================ NAVEGAÇÃO DE MÊS ============================ */

export function MonthNav({ period }: { period: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [y, m] = period.split("-").map(Number);
  function shift(delta: number) {
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    const p = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    params.set("periodo", p);
    router.push(`${pathname}?${params.toString()}`);
  }
  const label = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"][m - 1];
  return (
    <div className="print-hidden flex items-center gap-1 rounded-2xl border border-line bg-card p-1 shadow-card">
      <button onClick={() => shift(-1)} aria-label="Mês anterior" className="rounded-xl p-2.5 text-ink-soft transition-colors hover:bg-paper active:scale-95">
        <ChevronLeft size={17} />
      </button>
      <span className="min-w-[138px] text-center font-display text-[14px] font-semibold tracking-tight">
        {label} {y}
      </span>
      <button onClick={() => shift(1)} aria-label="Próximo mês" className="rounded-xl p-2.5 text-ink-soft transition-colors hover:bg-paper active:scale-95">
        <ChevronRight size={17} />
      </button>
    </div>
  );
}

/* ============================ UPLOAD / MENU ============================ */

export function MobileMenuButton({ userName }: { userName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded-xl p-2 text-muted hover:bg-paper md:hidden">
        <Menu size={18} />
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="anim-fade absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
          <div className="anim-sheet absolute inset-y-0 right-0 w-72 bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-display text-[15px] font-semibold">Menu</span>
              <button onClick={() => setOpen(false)} className="rounded-full p-1.5 text-muted"><X size={18} /></button>
            </div>
            <p className="text-[13px] text-muted">{userName}</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
