"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, moneyToCentsInput } from "@/lib/api";
import { centsToBRL, todayISO } from "@/lib/format";
import { Card, Btn, Field, inputCls, Modal, Money, PageHeader, Skeleton, useToast } from "@/components/ui";

type Settings = { id: number; companyName: string; openingBalanceCents: number; openingBalanceDate: string | null };
type Adj = { id: number; amountCents: number; reason: string; occurredAt: string };

export default function MaisPage() {
  const router = useRouter();
  const toast = useToast();
  const [cats, setCats] = useState<{ id: number; name: string }[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [adjs, setAdjs] = useState<Adj[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCat, setNewCat] = useState("");
  const [showOpening, setShowOpening] = useState(false);
  const [showAdj, setShowAdj] = useState(false);
  const [opening, setOpening] = useState({ amount: "", date: todayISO() });
  const [adj, setAdj] = useState({ amount: "", reason: "", date: todayISO(), sign: "plus" });
  const [busy, setBusy] = useState(false);

  function load() {
    setLoading(true);
    Promise.all([
      api<{ id: number; name: string }[]>("/api/categories"),
      api<{ settings: Settings; adjustments: Adj[] }>("/api/settings"),
    ])
      .then(([c, s]) => {
        setCats(c);
        setSettings({ ...s.settings, openingBalanceCents: Number(s.settings.openingBalanceCents) });
        setAdjs(s.adjustments.map((a) => ({ ...a, amountCents: Number(a.amountCents) })));
      })
      .catch((e) => toast.show(e.message, "err"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addCat() {
    if (!newCat.trim()) return;
    try {
      await api("/api/categories", { method: "POST", body: JSON.stringify({ name: newCat.trim() }) });
      setNewCat("");
      toast.show("Categoria criada!");
      load();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro.", "err");
    }
  }

  async function saveOpening() {
    const cents = moneyToCentsInput(opening.amount);
    setBusy(true);
    try {
      await api("/api/settings", { method: "PUT", body: JSON.stringify({ openingBalanceCents: cents, openingBalanceDate: opening.date }) });
      toast.show("Saldo inicial registrado!");
      setShowOpening(false);
      load();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro.", "err");
    } finally {
      setBusy(false);
    }
  }

  async function saveAdj() {
    let cents = moneyToCentsInput(adj.amount);
    if (!cents) return toast.show("Informe um valor.", "err");
    if (!adj.reason.trim()) return toast.show("Informe o motivo.", "err");
    if (adj.sign === "minus") cents = -cents;
    setBusy(true);
    try {
      await api("/api/settings", { method: "POST", body: JSON.stringify({ amountCents: cents, reason: adj.reason, occurredAt: adj.date }) });
      toast.show("Ajuste registrado!");
      setShowAdj(false);
      setAdj({ amount: "", reason: "", date: todayISO(), sign: "plus" });
      load();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro.", "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Mais" subtitle="Configurações e cadastros" />

      <div className="grid gap-3 sm:grid-cols-2">
        <a href="/fluxo"><Card className="p-4 transition hover:border-emerald-900"><p className="text-xl">≋</p><p className="mt-1 font-bold">Fluxo de caixa</p></Card></a>
        <a href="/resultado"><Card className="p-4 transition hover:border-emerald-900"><p className="text-xl">◍</p><p className="mt-1 font-bold">Resultado mensal</p></Card></a>
        <a href="/projecao"><Card className="p-4 transition hover:border-emerald-900"><p className="text-xl">↗</p><p className="mt-1 font-bold">Projeções</p></Card></a>
        <a href="/relatorio"><Card className="p-4 transition hover:border-emerald-900"><p className="text-xl">⎙</p><p className="mt-1 font-bold">Relatório mensal</p></Card></a>
      </div>

      <Card className="mt-3 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Saldo inicial da empresa</h2>
          {!settings?.openingBalanceDate && <Btn onClick={() => setShowOpening(true)} className="!min-h-[40px]">Definir</Btn>}
        </div>
        {loading ? <Skeleton className="mt-2 h-10" /> : (
          <div className="mt-2">
            <Money cents={settings?.openingBalanceCents || 0} className="text-2xl font-black" />
            <p className="text-xs text-stone-400">
              {settings?.openingBalanceDate ? `Lançado em ${settings.openingBalanceDate.split("-").reverse().join("/")} — correções via ajuste de saldo.` : "Ainda não definido."}
            </p>
          </div>
        )}
        <div className="mt-3 border-t border-stone-100 pt-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">Ajustes de saldo</h3>
            <button onClick={() => setShowAdj(true)} className="text-sm font-bold text-emerald-900 hover:underline">+ Novo ajuste</button>
          </div>
          {adjs.length === 0 ? (
            <p className="mt-1 text-sm text-stone-400">Nenhum ajuste registrado.</p>
          ) : (
            <div className="mt-2 space-y-1.5">
              {adjs.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2 text-sm">
                  <span className="font-semibold">{a.reason} <span className="font-normal text-stone-400">· {a.occurredAt.split("-").reverse().join("/")}</span></span>
                  <Money cents={a.amountCents} signed className={`font-black ${a.amountCents >= 0 ? "text-emerald-700" : ""}`} />
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card className="mt-3 p-5">
        <h2 className="font-bold">Categorias</h2>
        <p className="text-xs text-stone-400">Centro de custos — usadas em custos e despesas</p>
        {loading ? <Skeleton className="mt-2 h-24" /> : (
          <div className="mt-3 flex flex-wrap gap-2">
            {cats.map((c) => (
              <span key={c.id} className="rounded-full bg-stone-100 px-3 py-1.5 text-[13px] font-bold text-stone-600">{c.name}</span>
            ))}
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Nova categoria…" className={inputCls} />
          <Btn onClick={addCat} className="shrink-0">Adicionar</Btn>
        </div>
      </Card>

      <Card className="mt-3 p-5">
        <h2 className="font-bold">Sessão</h2>
        <button
          onClick={() => { fetch("/api/auth/logout", { method: "POST" }).then(() => router.replace("/login")); }}
          className="mt-2 font-bold text-red-600 hover:underline"
        >
          Sair do sistema
        </button>
      </Card>

      <p className="mt-4 text-center text-xs text-stone-400">Maestria Financeiro V1 · Venda ≠ Recebimento ≠ Lucro ≠ Caixa</p>

      <Modal open={showOpening} onClose={() => setShowOpening(false)} title="Saldo inicial">
        <div className="space-y-3">
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-[13px] font-semibold text-amber-800">
            Informe uma única vez. Depois, use ajustes de saldo (com histórico).
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor (R$)">
              <input value={opening.amount} onChange={(e) => setOpening({ ...opening, amount: e.target.value })} inputMode="decimal" placeholder="0,00" className={inputCls} />
            </Field>
            <Field label="Data base">
              <input type="date" value={opening.date} onChange={(e) => setOpening({ ...opening, date: e.target.value })} className={inputCls} />
            </Field>
          </div>
          <Btn onClick={saveOpening} disabled={busy} className="w-full">{busy ? "Salvando…" : "Registrar saldo inicial"}</Btn>
        </div>
      </Modal>

      <Modal open={showAdj} onClose={() => setShowAdj(false)} title="Ajuste de saldo">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo">
              <select value={adj.sign} onChange={(e) => setAdj({ ...adj, sign: e.target.value })} className={inputCls}>
                <option value="plus">Entrada (soma)</option>
                <option value="minus">Saída (subtrai)</option>
              </select>
            </Field>
            <Field label="Valor (R$)">
              <input value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} inputMode="decimal" placeholder="0,00" className={inputCls} />
            </Field>
          </div>
          <Field label="Data">
            <input type="date" value={adj.date} onChange={(e) => setAdj({ ...adj, date: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Motivo (obrigatório)">
            <input value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} placeholder="Ex: correção de saldo bancário" className={inputCls} />
          </Field>
          <Btn onClick={saveAdj} disabled={busy} className="w-full">{busy ? "Salvando…" : "Registrar ajuste"}</Btn>
        </div>
      </Modal>
      {toast.el}
    </div>
  );
}
