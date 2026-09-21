"use client";
import { ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Modal, Btn, Field, inputCls, useToast } from "./ui";
import { moneyToCentsInput, newIdem } from "@/lib/api";

type User = { id: number; name: string; email: string };

const NAV = [
  { href: "/", label: "Dashboard", icon: "◈" },
  { href: "/projetos", label: "Projetos", icon: "▣" },
  { href: "/contas", label: "Contas", icon: "⇄" },
  { href: "/despesas", label: "Despesas", icon: "▤" },
  { href: "/mais", label: "Mais", icon: "☰" },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchRes, setSearchRes] = useState<null | {
    projects: { id: number; title: string; clientName: string }[];
    costs: { id: number; description: string }[];
    expenses: { id: number; description: string }[];
    receivables: { id: number; description: string }[];
  }>(null);

  useEffect(() => {
    if (pathname === "/login") {
      setChecked(true);
      return;
    }
    api<User>("/api/auth/me")
      .then((u) => {
        setUser(u);
        setChecked(true);
      })
      .catch(() => {
        router.replace("/login");
      });
  }, [pathname, router]);

  useEffect(() => {
    if (search.trim().length < 2) {
      setSearchRes(null);
      return;
    }
    const t = setTimeout(() => {
      api<typeof searchRes>(`/api/search?q=${encodeURIComponent(search.trim())}`)
        .then(setSearchRes)
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  if (pathname === "/login") return <>{children}</>;
  if (!checked) {
    return (
      <div className="grid min-h-dvh place-items-center bg-stone-100">
        <div className="text-center">
          <p className="text-lg font-black tracking-tight text-emerald-950">MAESTRIA</p>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-stone-400">Financeiro</p>
          <div className="mx-auto mt-4 h-1.5 w-32 animate-pulse rounded-full bg-stone-200" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-stone-100 text-stone-900">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-stone-200 bg-white lg:flex">
        <div className="px-6 pb-4 pt-6">
          <p className="text-xl font-black tracking-tight text-emerald-950">MAESTRIA</p>
          <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-amber-700">Financeiro</p>
        </div>
        <div className="px-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente, projeto, MDF…"
            className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm outline-none focus:border-emerald-800"
          />
          <SearchResults res={searchRes} onNavigate={() => { setSearch(""); setSearchRes(null); }} />
        </div>
        <nav className="mt-3 flex-1 space-y-1 overflow-y-auto px-3">
          {[
            ...NAV.slice(0, 4),
            { href: "/fluxo", label: "Fluxo de caixa", icon: "≋" },
            { href: "/resultado", label: "Resultado mensal", icon: "◍" },
            { href: "/projecao", label: "Projeções", icon: "↗" },
            { href: "/mais", label: "Mais", icon: "☰" },
          ].map((n) => {
            const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
            return (
              <a
                key={n.href}
                href={n.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-semibold transition ${
                  active ? "bg-emerald-950 text-white" : "text-stone-600 hover:bg-stone-100"
                }`}
              >
                <span className="w-5 text-center">{n.icon}</span>
                {n.label}
              </a>
            );
          })}
        </nav>
        <div className="border-t border-stone-100 p-4">
          <p className="truncate text-sm font-bold">{user?.name}</p>
          <p className="truncate text-xs text-stone-500">{user?.email}</p>
          <button
            onClick={() => {
              fetch("/api/auth/logout", { method: "POST" }).then(() => router.replace("/login"));
            }}
            className="mt-2 text-sm font-semibold text-red-600 hover:underline"
          >
            Sair
          </button>
        </div>
      </aside>

      {/* Mobile topbar */}
      <header className="sticky top-0 z-30 border-b border-stone-200/70 bg-white/95 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-base font-black leading-none tracking-tight text-emerald-950">MAESTRIA</p>
            <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-amber-700">Financeiro</p>
          </div>
          <div className="relative w-48">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar…"
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm outline-none focus:border-emerald-800"
            />
            <SearchResults res={searchRes} floating onNavigate={() => { setSearch(""); setSearchRes(null); }} />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto w-full max-w-6xl px-4 pb-32 pt-4 sm:px-6 lg:pl-[272px] lg:pr-8 lg:pt-8">
        {children}
      </main>

      {/* FAB */}
      <button
        onClick={() => setFabOpen(true)}
        aria-label="Lançamento rápido"
        className="fixed bottom-[92px] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-950 text-3xl font-light text-white shadow-[0_12px_30px_rgba(2,44,34,0.4)] transition active:scale-95 lg:bottom-8 lg:right-8 lg:h-16 lg:w-16"
      >
        +
      </button>

      {/* Bottom nav mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/98 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="grid grid-cols-5">
          {NAV.map((n) => {
            const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
            return (
              <a
                key={n.href}
                href={n.href}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-bold ${
                  active ? "text-emerald-950" : "text-stone-400"
                }`}
              >
                <span className="text-lg leading-none">{n.icon}</span>
                {n.label}
              </a>
            );
          })}
        </div>
      </nav>

      <QuickAdd open={fabOpen} onClose={() => setFabOpen(false)} />
    </div>
  );
}

function SearchResults({
  res, onNavigate, floating,
}: {
  res: { projects: { id: number; title: string; clientName: string }[]; costs: { id: number; description: string }[]; expenses: { id: number; description: string }[]; receivables: { id: number; description: string }[] } | null;
  onNavigate: () => void;
  floating?: boolean;
}) {
  if (!res) return null;
  const empty = res.projects.length + res.costs.length + res.expenses.length === 0;
  return (
    <div className={`${floating ? "absolute right-0 top-full z-50 mt-1 w-64" : "mt-1"} overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl`}>
      {empty ? (
        <p className="px-3 py-3 text-sm text-stone-500">Nenhum resultado.</p>
      ) : (
        <div className="max-h-72 overflow-y-auto py-1">
          {res.projects.map((p) => (
            <a key={`p${p.id}`} href={`/projetos/${p.id}`} onClick={onNavigate} className="block px-3 py-2 hover:bg-stone-50">
              <p className="text-sm font-bold">{p.clientName}</p>
              <p className="text-xs text-stone-500">{p.title}</p>
            </a>
          ))}
          {res.costs.map((c) => (
            <a key={`c${c.id}`} href="/contas?tab=pagar" onClick={onNavigate} className="block px-3 py-2 hover:bg-stone-50">
              <p className="text-sm font-semibold">Custo: {c.description}</p>
            </a>
          ))}
          {res.expenses.map((e) => (
            <a key={`e${e.id}`} href="/despesas" onClick={onNavigate} className="block px-3 py-2 hover:bg-stone-50">
              <p className="text-sm font-semibold">Despesa: {e.description}</p>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function QuickAdd({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<string | null>(null);
  const [projects, setProjects] = useState<{ id: number; title: string; clientName: string; pendingCents: number }[]>([]);
  const [form, setForm] = useState({ projectId: "", amount: "", date: new Date().toISOString().slice(0, 10), method: "pix", description: "", categoryId: "" });
  const [cats, setCats] = useState<{ id: number; name: string }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setMode(null);
      return;
    }
    api<{ categories: { id: number; name: string }[] }>("/api/meta").then((m) => setCats(m.categories)).catch(() => {});
    api<typeof projects>("/api/projects").then(setProjects).catch(() => {});
  }, [open ]);

  function set(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit() {
    const cents = moneyToCentsInput(form.amount);
    if (!form.projectId && mode !== "expense") return toast.show("Selecione o projeto.", "err");
    if (!cents || cents <= 0) return toast.show("Informe um valor válido.", "err");
    setBusy(true);
    try {
      if (mode === "receive") {
        const p = projects.find((x) => x.id === Number(form.projectId));
        if (p && cents > p.pendingCents && !confirm(`O saldo deste projeto é ${(p.pendingCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} e você está registrando ${(cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}. Deseja continuar?`)) {
          setBusy(false);
          return;
        }
        await api("/api/payments", {
          method: "POST",
          body: JSON.stringify({ projectId: Number(form.projectId), amountCents: cents, paidAt: form.date, method: form.method, idempotencyKey: newIdem() }),
        });
        toast.show("Recebimento registrado!");
      } else if (mode === "cost") {
        if (!form.description.trim()) {
          setBusy(false);
          return toast.show("Descreva o custo.", "err");
        }
        await api("/api/costs", {
          method: "POST",
          body: JSON.stringify({
            projectId: Number(form.projectId), description: form.description, amountCents: cents,
            categoryId: form.categoryId ? Number(form.categoryId) : null,
            status: "paid", paidAt: form.date, paymentMethod: form.method,
          }),
        });
        toast.show("Custo pago registrado!");
      } else if (mode === "expense") {
        if (!form.description.trim()) {
          setBusy(false);
          return toast.show("Descreva a despesa.", "err");
        }
        const created = await api<{ id: number }>("/api/expenses", {
          method: "POST",
          body: JSON.stringify({
            kind: "unique", description: form.description, amountCents: cents,
            categoryId: form.categoryId ? Number(form.categoryId) : null, dueDate: form.date,
          }),
        });
        await api(`/api/expenses/${created.id}/pay`, { method: "POST", body: JSON.stringify({ paidAt: form.date, method: form.method }) });
        toast.show("Despesa paga registrada!");
      }
      onClose();
      router.refresh();
      setTimeout(() => window.location.reload(), 400);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro ao salvar.", "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Modal open={open && !mode} onClose={onClose} title="Lançamento rápido">
        <div className="space-y-2">
          {[
            { k: "receive", label: "Recebi de cliente", icon: "↓", desc: "Registrar recebimento" },
            { k: "cost", label: "Adicionar custo à obra", icon: "◧", desc: "Custo pago agora" },
            { k: "expense", label: "Paguei uma conta", icon: "↑", desc: "Despesa paga agora" },
            { k: "project", label: "Novo projeto", icon: "＋", desc: "Cadastrar venda/projeto" },
            { k: "expenseNew", label: "Nova despesa", icon: "▤", desc: "Única, recorrente ou parcelada" },
          ].map((o) => (
            <button
              key={o.k}
              onClick={() => {
                if (o.k === "project") {
                  onClose();
                  router.push("/projetos?novo=1");
                } else if (o.k === "expenseNew") {
                  onClose();
                  router.push("/despesas?nova=1");
                } else setMode(o.k);
              }}
              className="flex w-full items-center gap-3 rounded-2xl border border-stone-200 p-4 text-left transition hover:border-emerald-900 hover:bg-emerald-950/[0.03] active:scale-[0.99]"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-950 text-lg text-white">{o.icon}</span>
              <span>
                <span className="block text-[15px] font-bold">{o.label}</span>
                <span className="block text-xs text-stone-500">{o.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </Modal>

      <Modal
        open={open && !!mode}
        onClose={() => setMode(null)}
        title={mode === "receive" ? "Recebi de cliente" : mode === "cost" ? "Custo da obra" : "Paguei uma conta"}
      >
        <div className="space-y-3">
          {mode !== "expense" && (
            <Field label="Projeto">
              <select value={form.projectId} onChange={(e) => set("projectId", e.target.value)} className={inputCls}>
                <option value="">Selecione…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.clientName} — {p.title}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {(mode === "cost" || mode === "expense") && (
            <>
              <Field label="Descrição">
                <input value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Ex: MDF, aluguel…" className={inputCls} />
              </Field>
              <Field label="Categoria">
                <select value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)} className={inputCls}>
                  <option value="">Selecione…</option>
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>
            </>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor (R$)">
              <input value={form.amount} onChange={(e) => set("amount", e.target.value)} inputMode="decimal" placeholder="0,00" className={inputCls} />
            </Field>
            <Field label="Data">
              <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} className={inputCls} />
            </Field>
          </div>
          <Field label="Forma">
            <select value={form.method} onChange={(e) => set("method", e.target.value)} className={inputCls}>
              <option value="pix">PIX</option>
              <option value="cash">Dinheiro</option>
              <option value="transfer">Transferência</option>
              <option value="card">Cartão</option>
              <option value="boleto">Boleto</option>
              <option value="other">Outro</option>
            </select>
          </Field>
          <div className="flex gap-2 pt-1">
            <Btn variant="secondary" onClick={() => setMode(null)} className="flex-1">Voltar</Btn>
            <Btn onClick={submit} disabled={busy} className="flex-1">{busy ? "Salvando…" : "Confirmar"}</Btn>
          </div>
        </div>
      </Modal>
      {toast.el}
    </>
  );
}
