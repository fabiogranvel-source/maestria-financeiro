"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { api, moneyToCentsInput } from "@/lib/api";
import { centsToBRL, formatDateBR, projectStatusLabel } from "@/lib/format";
import { Card, Btn, Empty, Field, inputCls, Modal, Money, PageHeader, Skeleton, StatusPill, Tabs, useToast } from "@/components/ui";

type Project = {
  id: number;
  clientName: string;
  title: string;
  saleDate: string;
  totalValueCents: number;
  receivedCents: number;
  pendingCents: number;
  costCents: number;
  profitCents: number;
  marginPct: number;
  status: string;
  balanceMode: string;
};

const STATUS_FILTERS = [
  { value: "all", label: "Todos" },
  { value: "approved", label: "Aprovado" },
  { value: "measuring", label: "Medição" },
  { value: "production", label: "Produção" },
  { value: "ready", label: "Pronto" },
  { value: "installing", label: "Instalando" },
  { value: "delivered", label: "Entregue" },
  { value: "finished", label: "Finalizado" },
];

function ProjetosInner() {
  const params = useSearchParams();
  const toast = useToast();
  const [list, setList] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [showNew, setShowNew] = useState(params.get("novo") === "1");
  const [clients, setClients] = useState<{ id: number; name: string }[]>([]);

  const [f, setF] = useState({
    clientId: "", clientName: "", title: "", description: "",
    saleDate: new Date().toISOString().slice(0, 10),
    totalValue: "", downPayment: "", downReceived: false, downMethod: "pix",
    balanceMode: "on_delivery", balanceDueDate: "", deliveryForecast: "", notes: "", status: "approved",
  });
  const [busy, setBusy] = useState(false);

  function load() {
    setLoading(true);
    api<Project[]>("/api/projects")
      .then(setList)
      .catch((e) => toast.show(e.message, "err"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    api<{ id: number; name: string }[]>("/api/clients").then(setClients).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set(k: string, v: string | boolean) {
    setF((s) => ({ ...s, [k]: v }));
  }

  async function create() {
    const total = moneyToCentsInput(f.totalValue);
    const down = f.downPayment ? moneyToCentsInput(f.downPayment) : 0;
    if (!f.clientId && !f.clientName.trim()) return toast.show("Informe o cliente.", "err");
    if (!total || total <= 0) return toast.show("Valor da venda deve ser maior que zero.", "err");
    if (down > total) return toast.show("Entrada não pode ser maior que a venda.", "err");
    setBusy(true);
    try {
      const r = await api<{ id: number }>("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          clientId: f.clientId ? Number(f.clientId) : null,
          clientName: f.clientName,
          title: f.title || "Projeto",
          description: f.description,
          saleDate: f.saleDate,
          totalValueCents: total,
          downPaymentCents: down,
          downPaymentReceived: f.downReceived,
          downPaymentMethod: f.downMethod,
          balanceMode: f.balanceMode,
          balanceDueDate: f.balanceDueDate || null,
          deliveryForecast: f.deliveryForecast || null,
          notes: f.notes,
          status: f.status,
        }),
      });
      toast.show("Projeto criado!");
      setShowNew(false);
      window.location.href = `/projetos/${r.id}`;
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro ao criar.", "err");
    } finally {
      setBusy(false);
    }
  }

  const filtered = list.filter(
    (p) =>
      (filter === "all" || p.status === filter) &&
      (!q || p.clientName.toLowerCase().includes(q.toLowerCase()) || p.title.toLowerCase().includes(q.toLowerCase()))
  );

  const totals = filtered.reduce(
    (s, p) => ({
      sold: s.sold + p.totalValueCents,
      received: s.received + p.receivedCents,
      pending: s.pending + p.pendingCents,
    }),
    { sold: 0, received: 0, pending: 0 }
  );

  return (
    <div>
      <PageHeader
        title="Projetos"
        subtitle={`${filtered.length} projeto(s)`}
        right={<Btn onClick={() => setShowNew(true)}>+ Novo Projeto</Btn>}
      />

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar cliente ou projeto…"
        className={`${inputCls} mb-3`}
      />
      <Tabs tabs={STATUS_FILTERS} value={filter} onChange={setFilter} />

      {!loading && filtered.length > 0 && (
        <Card className="mt-3 grid grid-cols-3 divide-x divide-stone-100 p-4 text-center">
          <div><p className="text-[11px] font-bold uppercase text-stone-400">Vendido</p><Money cents={totals.sold} className="text-[15px] font-black" /></div>
          <div><p className="text-[11px] font-bold uppercase text-stone-400">Recebido</p><Money cents={totals.received} className="text-[15px] font-black text-emerald-700" /></div>
          <div><p className="text-[11px] font-bold uppercase text-stone-400">A receber</p><Money cents={totals.pending} className="text-[15px] font-black text-amber-700" /></div>
        </Card>
      )}

      <div className="mt-3 space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)
        ) : filtered.length === 0 ? (
          <Empty
            title="Nenhum projeto encontrado"
            subtitle={list.length === 0 ? "Cadastre a primeira venda da empresa." : "Ajuste os filtros de busca."}
            action={list.length === 0 ? <Btn onClick={() => setShowNew(true)}>+ Criar primeiro projeto</Btn> : undefined}
          />
        ) : (
          filtered.map((p) => (
            <a key={p.id} href={`/projetos/${p.id}`} className="block">
              <Card className="p-4 transition hover:border-emerald-900/40 hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-base font-black uppercase tracking-tight">{p.clientName}</p>
                    <p className="truncate text-sm text-stone-500">{p.title} · {formatDateBR(p.saleDate)}</p>
                  </div>
                  <StatusPill tone={p.pendingCents > 0 ? "yellow" : "green"}>
                    {p.pendingCents > 0 ? "A receber" : "Quitado"}
                  </StatusPill>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                  <Mini label="Venda" cents={p.totalValueCents} />
                  <Mini label="Recebido" cents={p.receivedCents} tone="text-emerald-700" />
                  <Mini label="A receber" cents={p.pendingCents} tone={p.pendingCents > 0 ? "text-amber-700" : ""} />
                  <Mini label="Lucro prev." cents={p.profitCents} tone={p.profitCents >= 0 ? "text-emerald-700" : "text-red-600"} />
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-stone-100 pt-2.5 text-xs">
                  <span className="truncate font-bold text-stone-500">{projectStatusLabel(p.status)} · Margem {p.marginPct.toLocaleString("pt-BR")}%</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.location.href = `/projetos/${p.id}`; }}
                      className="rounded-lg bg-stone-100 px-2.5 py-1.5 font-bold text-emerald-900 transition hover:bg-emerald-50"
                      aria-label={`Editar projeto ${p.title}`}
                    >
                      Editar
                    </button>
                    <span className="font-bold text-stone-300">›</span>
                  </span>
                </div>
              </Card>
            </a>
          ))
        )}
      </div>

      <Modal open={showNew} onClose={() => setShowNew(false)} title="Novo Projeto" wide>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Cliente existente">
              <select value={f.clientId} onChange={(e) => set("clientId", e.target.value)} className={inputCls}>
                <option value="">— ou digite novo ao lado —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Novo cliente">
              <input value={f.clientName} onChange={(e) => set("clientName", e.target.value)} placeholder="Ex: Carlinhos" className={inputCls} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome do projeto">
              <input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Ex: Cozinha planejada" className={inputCls} />
            </Field>
            <Field label="Data da venda">
              <input type="date" value={f.saleDate} onChange={(e) => set("saleDate", e.target.value)} className={inputCls} />
            </Field>
          </div>
          <Field label="Descrição">
            <input value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="Detalhes do projeto…" className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor total da venda (R$)">
              <input value={f.totalValue} onChange={(e) => set("totalValue", e.target.value)} inputMode="decimal" placeholder="5.800,00" className={inputCls} />
            </Field>
            <Field label="Valor da entrada (R$)">
              <input value={f.downPayment} onChange={(e) => set("downPayment", e.target.value)} inputMode="decimal" placeholder="1.800,00" className={inputCls} />
            </Field>
          </div>
          <label className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border border-stone-200 px-4">
            <input type="checkbox" checked={f.downReceived} onChange={(e) => set("downReceived", e.target.checked)} className="h-5 w-5 accent-emerald-900" />
            <span className="text-[15px] font-semibold">Entrada já recebida?</span>
          </label>
          {f.downReceived && (
            <Field label="Forma da entrada">
              <select value={f.downMethod} onChange={(e) => set("downMethod", e.target.value)} className={inputCls}>
                <option value="pix">PIX</option><option value="cash">Dinheiro</option>
                <option value="transfer">Transferência</option><option value="card">Cartão</option>
                <option value="boleto">Boleto</option><option value="other">Outro</option>
              </select>
            </Field>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Recebimento do saldo">
              <select value={f.balanceMode} onChange={(e) => set("balanceMode", e.target.value)} className={inputCls}>
                <option value="on_delivery">Na entrega</option>
                <option value="fixed_date">Data definida</option>
                <option value="installments">Parcelado</option>
                <option value="undefined">A definir</option>
              </select>
            </Field>
            <Field label="Vencimento do saldo (se data definida)">
              <input type="date" value={f.balanceDueDate} onChange={(e) => set("balanceDueDate", e.target.value)} className={inputCls} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Previsão de entrega (opcional)">
              <input type="date" value={f.deliveryForecast} onChange={(e) => set("deliveryForecast", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Status">
              <select value={f.status} onChange={(e) => set("status", e.target.value)} className={inputCls}>
                <option value="approved">Aprovado</option>
                <option value="measuring">Aguardando medição</option>
                <option value="production">Em produção</option>
                <option value="ready">Pronto para instalação</option>
                <option value="installing">Instalando</option>
                <option value="delivered">Entregue</option>
                <option value="finished">Finalizado</option>
              </select>
            </Field>
          </div>
          <Field label="Observações">
            <textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} rows={2} className={inputCls} />
          </Field>
          <div className="flex gap-2 pt-1">
            <Btn variant="secondary" onClick={() => setShowNew(false)} className="flex-1">Cancelar</Btn>
            <Btn onClick={create} disabled={busy} className="flex-1">{busy ? "Salvando…" : "Criar projeto"}</Btn>
          </div>
        </div>
      </Modal>
      {toast.el}
    </div>
  );
}

function Mini({ label, cents, tone = "" }: { label: string; cents: number; tone?: string }) {
  return (
    <div className="rounded-xl bg-stone-50 px-1 py-2">
      <p className="text-[10px] font-bold uppercase text-stone-400">{label}</p>
      <p className={`truncate text-[13px] font-black sm:text-sm ${tone}`}>{centsToBRL(cents)}</p>
    </div>
  );
}

export default function ProjetosPage() {
  return (
    <Suspense>
      <ProjetosInner />
    </Suspense>
  );
}
