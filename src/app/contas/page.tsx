"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { api, moneyToCentsInput, newIdem } from "@/lib/api";
import { centsToBRL, formatDateBR, paymentMethodLabel, todayISO } from "@/lib/format";
import { Card, Btn, Empty, Field, inputCls, Modal, Money, PageHeader, Skeleton, StatusPill, Tabs, ConfirmModal, useToast } from "@/components/ui";

type Recv = {
  id: number; projectId: number; projectTitle: string; clientName: string;
  description: string; amountCents: number; receivedCents: number; openCents: number;
  dueDate: string | null; condition: string; status: string;
};

type PayCost = {
  id: number; projectId: number; projectTitle: string; clientName: string;
  description: string; categoryName: string | null; amountCents: number;
  status: string; dueDate: string | null; kind: "cost";
};

type PayExp = {
  id: number; description: string; categoryName: string | null; amountCents: number;
  status: string; dueDate: string | null; kind: string;
};

function ContasInner() {
  const params = useSearchParams();
  const toast = useToast();
  const [tab, setTab] = useState(params.get("tab") === "pagar" ? "pagar" : "receber");
  const [filter, setFilter] = useState(params.get("f") || "abertas");
  const [recvs, setRecvs] = useState<Recv[]>([]);
  const [costs, setCosts] = useState<PayCost[]>([]);
  const [exps, setExps] = useState<PayExp[]>([]);
  const [loading, setLoading] = useState(true);
  const [recvTarget, setRecvTarget] = useState<Recv | null>(null);
  const [payTarget, setPayTarget] = useState<{ kind: "cost" | "expense"; id: number; desc: string; cents: number } | null>(null);
  const [form, setForm] = useState({ amount: "", date: todayISO(), method: "pix", notes: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    setLoading(true);
    Promise.all([
      api<Recv[]>("/api/receivables"),
      api<PayCost[]>("/api/costs"),
      api<PayExp[]>("/api/expenses"),
    ])
      .then(([r, c, e]) => {
        setRecvs(r);
        setCosts(c);
        setExps(e);
      })
      .catch((e) => toast.show(e.message, "err"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const today = todayISO();
  const in7 = new Date(new Date(today + "T12:00:00Z").getTime() + 7 * 86400000).toISOString().slice(0, 10);

  function toneRecv(r: Recv): "red" | "orange" | "yellow" | "green" | "gray" {
    if (r.status === "received") return "green";
    if (!r.dueDate) return r.condition === "on_delivery" ? "gray" : "gray";
    if (r.dueDate < today) return "red";
    if (r.dueDate === today) return "orange";
    if (r.dueDate <= in7) return "yellow";
    return "gray";
  }

  function tonePay(due: string | null, status: string): "red" | "orange" | "yellow" | "green" | "gray" {
    if (status === "paid") return "green";
    if (!due) return "gray";
    if (due < today) return "red";
    if (due === today) return "orange";
    if (due <= in7) return "yellow";
    return "gray";
  }

  const filteredRecv = recvs.filter((r) => {
    switch (filter) {
      case "vencidas": return r.status !== "received" && r.status !== "cancelled" && r.dueDate && r.dueDate < today;
      case "hoje": return r.status !== "received" && r.status !== "cancelled" && r.dueDate === today;
      case "prox7": return r.status !== "received" && r.status !== "cancelled" && r.dueDate && r.dueDate > today && r.dueDate <= in7;
      case "abertas": return r.status === "pending" || r.status === "partial";
      case "recebidas": return r.status === "received";
      default: return true;
    }
  });

  const allPay: { kind: "cost" | "expense"; id: number; desc: string; sub: string; cents: number; due: string | null; status: string }[] = [
    ...costs.filter((c) => c.status !== "cancelled").map((c) => ({
      kind: "cost" as const, id: c.id, desc: c.description,
      sub: `${c.clientName} · ${c.projectTitle}${c.categoryName ? ` · ${c.categoryName}` : ""}`,
      cents: c.amountCents, due: c.dueDate, status: c.status,
    })),
    ...exps.filter((e) => e.status !== "cancelled").map((e) => ({
      kind: "expense" as const, id: e.id, desc: e.description,
      sub: `${e.categoryName || "Despesa"}${e.kind !== "unique" ? ` · ${e.kind === "recurring" ? "recorrente" : "parcelada"}` : ""}`,
      cents: e.amountCents, due: e.dueDate, status: e.status,
    })),
  ].sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));

  const filteredPay = allPay.filter((p) => {
    switch (filter) {
      case "vencidas": return p.status === "pending" && p.due && p.due < today;
      case "hoje": return p.status === "pending" && p.due === today;
      case "prox7": return p.status === "pending" && p.due && p.due > today && p.due <= in7;
      case "abertas": return p.status === "pending";
      case "pagas": return p.status === "paid";
      default: return true;
    }
  });

  async function doReceive() {
    if (!recvTarget) return;
    const cents = moneyToCentsInput(form.amount);
    if (!cents || cents <= 0) return toast.show("Informe um valor válido.", "err");
    if (cents > recvTarget.openCents) {
      const ok = confirm(
        `O saldo desta cobrança é ${centsToBRL(recvTarget.openCents)} e você está registrando ${centsToBRL(cents)}. Deseja continuar?`
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      await api(`/api/receivables/${recvTarget.id}/receive`, {
        method: "POST",
        body: JSON.stringify({
          amountCents: cents, paidAt: form.date, method: form.method,
          notes: form.notes, idempotencyKey: newIdem(), confirmedOverpay: true,
        }),
      });
      toast.show("Recebimento registrado!");
      setRecvTarget(null);
      load();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro.", "err");
    } finally {
      setBusy(false);
    }
  }

  async function doPay() {
    if (!payTarget) return;
    setBusy(true);
    try {
      const url = payTarget.kind === "cost" ? `/api/costs/${payTarget.id}/pay` : `/api/expenses/${payTarget.id}/pay`;
      await api(url, { method: "POST", body: JSON.stringify({ paidAt: form.date, method: form.method }) });
      toast.show("Conta marcada como paga!");
      setPayTarget(null);
      load();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro.", "err");
    } finally {
      setBusy(false);
    }
  }

  const totalOpenRecv = recvs.filter((r) => r.status !== "received" && r.status !== "cancelled").reduce((s, r) => s + r.openCents, 0);
  const totalOpenPay = allPay.filter((p) => p.status === "pending").reduce((s, p) => s + p.cents, 0);

  return (
    <div>
      <PageHeader title="Contas" subtitle="Recebimentos e pagamentos" />
      <Tabs
        tabs={[
          { value: "receber", label: "A receber" },
          { value: "pagar", label: "A pagar" },
        ]}
        value={tab}
        onChange={(v) => { setTab(v); setFilter("abertas"); }}
      />

      <div className="mt-3">
        <Tabs
          tabs={
            tab === "receber"
              ? [
                { value: "todas", label: "Todas" },
                { value: "abertas", label: "A receber" },
                { value: "vencidas", label: "Vencidas" },
                { value: "hoje", label: "Hoje" },
                { value: "prox7", label: "Próx. 7 dias" },
                { value: "recebidas", label: "Recebidas" },
              ]
              : [
                { value: "todas", label: "Todas" },
                { value: "abertas", label: "A pagar" },
                { value: "vencidas", label: "Vencidas" },
                { value: "hoje", label: "Hoje" },
                { value: "prox7", label: "Próx. 7 dias" },
                { value: "pagas", label: "Pagas" },
              ]
          }
          value={filter}
          onChange={setFilter}
        />
      </div>

      {!loading && (
        <Card className="mt-3 grid grid-cols-2 p-4 text-center">
          <div>
            <p className="text-[11px] font-bold uppercase text-stone-400">Total a receber</p>
            <Money cents={totalOpenRecv} className="text-lg font-black text-emerald-700" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase text-stone-400">Total a pagar</p>
            <Money cents={totalOpenPay} className="text-lg font-black text-red-600" />
          </div>
        </Card>
      )}

      <div className="mt-3 space-y-2">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : tab === "receber" ? (
          filteredRecv.length === 0 ? (
            <Empty title="Nenhuma conta encontrada" subtitle="Ajuste o filtro ou cadastre um projeto." />
          ) : (
            filteredRecv.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-black">{r.clientName}</p>
                    <p className="truncate text-[13px] text-stone-500">{r.projectTitle} · {r.description}</p>
                    <p className="mt-0.5 text-xs text-stone-400">
                      {r.dueDate ? `Vence ${formatDateBR(r.dueDate)}` : r.condition === "on_delivery" ? "Na entrega" : "Sem vencimento"}
                      {r.receivedCents > 0 ? ` · já recebido ${centsToBRL(r.receivedCents)}` : ""}
                    </p>
                  </div>
                  <StatusPill tone={toneRecv(r)}>
                    {r.status === "received" ? "Recebido" : r.status === "partial" ? "Parcial" : !r.dueDate ? (r.condition === "on_delivery" ? "Na entrega" : "A receber") : r.dueDate < today ? "Vencido" : r.dueDate === today ? "Vence hoje" : "A receber"}
                  </StatusPill>
                </div>
                <div className="mt-2.5 flex items-center justify-between border-t border-stone-100 pt-2.5">
                  <div>
                    <Money cents={r.openCents} className="text-base font-black" />
                    {r.receivedCents > 0 && <span className="ml-2 text-xs text-stone-400">de {centsToBRL(r.amountCents)}</span>}
                  </div>
                  {r.status !== "received" && r.status !== "cancelled" && (
                    <Btn
                      variant="success"
                      className="!min-h-[40px]"
                      onClick={() => {
                        setRecvTarget(r);
                        setForm({ amount: (r.openCents / 100).toFixed(2).replace(".", ","), date: todayISO(), method: "pix", notes: "" });
                      }}
                    >
                      Receber
                    </Btn>
                  )}
                </div>
              </Card>
            ))
          )
        ) : filteredPay.length === 0 ? (
          <Empty title="Nenhuma conta encontrada" subtitle="Ajuste o filtro." />
        ) : (
          filteredPay.map((p) => (
            <Card key={`${p.kind}-${p.id}`} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-bold">{p.desc}</p>
                  <p className="truncate text-[13px] text-stone-500">{p.sub}</p>
                  <p className="mt-0.5 text-xs text-stone-400">
                    {p.kind === "cost" ? "Custo de obra" : "Despesa geral"}
                    {p.due ? ` · Vence ${formatDateBR(p.due)}` : " · Sem vencimento"}
                  </p>
                </div>
                <StatusPill tone={tonePay(p.due, p.status)}>
                  {p.status === "paid" ? "Pago" : !p.due ? "A pagar" : p.due < today ? "Vencido" : p.due === today ? "Vence hoje" : "A pagar"}
                </StatusPill>
              </div>
              <div className="mt-2.5 flex items-center justify-between border-t border-stone-100 pt-2.5">
                <Money cents={p.cents} className="text-base font-black" />
                {p.status === "pending" && (
                  <Btn
                    className="!min-h-[40px]"
                    onClick={() => {
                      setPayTarget({ kind: p.kind, id: p.id, desc: p.desc, cents: p.cents });
                      setForm({ amount: "", date: todayISO(), method: "pix", notes: "" });
                    }}
                  >
                    Marcar como pago
                  </Btn>
                )}
              </div>
            </Card>
          ))
        )}
      </div>

      <Modal open={!!recvTarget} onClose={() => setRecvTarget(null)} title={`Receber — ${recvTarget?.clientName || ""}`}>
        {recvTarget && (
          <div className="space-y-3">
            <p className="rounded-xl bg-stone-50 px-3 py-2 text-sm">
              <span className="font-bold">{recvTarget.description}</span> · em aberto{" "}
              <span className="font-black text-amber-700">{centsToBRL(recvTarget.openCents)}</span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Valor recebido (R$)">
                <input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} inputMode="decimal" className={inputCls} autoFocus />
              </Field>
              <Field label="Data">
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputCls} />
              </Field>
            </div>
            <Field label="Forma de pagamento">
              <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className={inputCls}>
                <option value="pix">PIX</option><option value="cash">Dinheiro</option>
                <option value="transfer">Transferência</option><option value="card">Cartão</option>
                <option value="boleto">Boleto</option><option value="other">Outro</option>
              </select>
            </Field>
            <Field label="Observação">
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputCls} />
            </Field>
            <Btn onClick={doReceive} disabled={busy} className="w-full">{busy ? "Registrando…" : "Confirmar recebimento"}</Btn>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={!!payTarget}
        onClose={() => setPayTarget(null)}
        onConfirm={doPay}
        title="Confirmar pagamento?"
        message={payTarget ? `Marcar "${payTarget.desc}" (${centsToBRL(payTarget.cents)}) como pago? Será criada uma única saída no caixa.` : ""}
        confirmLabel="Confirmar pagamento"
        busy={busy}
      />
      {toast.el}
    </div>
  );
}

export default function ContasPage() {
  return (
    <Suspense>
      <ContasInner />
    </Suspense>
  );
}
