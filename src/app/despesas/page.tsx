"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { api, moneyToCentsInput } from "@/lib/api";
import { centsToBRL, formatDateBR, todayISO } from "@/lib/format";
import { Card, Btn, Empty, Field, inputCls, Modal, Money, PageHeader, Skeleton, StatusPill, Tabs, ConfirmModal, useToast } from "@/components/ui";

type Expense = {
  id: number; description: string; categoryName: string | null; kind: string;
  amountCents: number; status: string; dueDate: string | null; paidAt: string | null;
  recurringRuleId: number | null; installmentPlanId: number | null; installmentNumber: number | null;
  competence: string | null;
};

type Rule = {
  id: number; description: string; categoryName: string | null; amountCents: number;
  dueDay: number; startDate: string; endDate: string | null; status: string;
  openInfo: { ruleId: number; count: string; nextDue: string | null } | null;
};

type Plan = {
  id: number; description: string; categoryName: string | null; installmentAmountCents: number;
  totalInstallments: number; firstDueDate: string; status: string;
  paidCount: number; remainingCount: number; remainingCents: number; nextDue: string | null;
};

function DespesasInner() {
  const params = useSearchParams();
  const toast = useToast();
  const [tab, setTab] = useState("lista");
  const [list, setList] = useState<Expense[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [cats, setCats] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(params.get("nova") === "1");
  const [kind, setKind] = useState("unique");
  const [payTarget, setPayTarget] = useState<Expense | null>(null);
  const [editRule, setEditRule] = useState<Rule | null>(null);
  const [ruleScope, setRuleScope] = useState("forward");
  const [busy, setBusy] = useState(false);
  const [filterKind, setFilterKind] = useState("all");

  const [f, setF] = useState({
    description: "", categoryId: "", amount: "", dueDate: todayISO(), notes: "",
    dueDay: "10", startDate: todayISO().slice(0, 7) + "-01", endDate: "",
    totalInstallments: "12", firstDueDate: todayISO(),
  });
  const [ruleForm, setRuleForm] = useState({ amount: "", dueDay: "", description: "" });

  function load() {
    setLoading(true);
    Promise.all([
      api<Expense[]>("/api/expenses"),
      api<Rule[]>("/api/recurring"),
      api<Plan[]>("/api/installment-plans"),
      api<{ categories: { id: number; name: string }[] }>("/api/meta"),
    ])
      .then(([e, r, p, m]) => {
        setList(e);
        setRules(r);
        setPlans(p);
        setCats(m.categories);
      })
      .catch((e) => toast.show(e.message, "err"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set(k: string, v: string) {
    setF((s) => ({ ...s, [k]: v }));
  }

  async function create() {
    const cents = moneyToCentsInput(f.amount);
    if (!f.description.trim()) return toast.show("Descreva a despesa.", "err");
    if (!cents || cents <= 0) return toast.show("Informe um valor válido.", "err");
    setBusy(true);
    try {
      const payload: Record<string, unknown> =
        kind === "unique"
          ? { kind, description: f.description, amountCents: cents, categoryId: f.categoryId ? Number(f.categoryId) : null, dueDate: f.dueDate, notes: f.notes }
          : kind === "recurring"
            ? { kind, description: f.description, amountCents: cents, categoryId: f.categoryId ? Number(f.categoryId) : null, dueDay: Number(f.dueDay), startDate: f.startDate, endDate: f.endDate || null, notes: f.notes }
            : { kind, description: f.description, installmentAmountCents: cents, categoryId: f.categoryId ? Number(f.categoryId) : null, totalInstallments: Number(f.totalInstallments), firstDueDate: f.firstDueDate, notes: f.notes };
      await api("/api/expenses", { method: "POST", body: JSON.stringify(payload) });
      toast.show(kind === "installment" ? `Parcelamento criado: ${f.totalInstallments} parcelas.` : "Despesa criada!");
      setShowNew(false);
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
      await api(`/api/expenses/${payTarget.id}/pay`, { method: "POST", body: JSON.stringify({}) });
      toast.show("Despesa paga!");
      setPayTarget(null);
      load();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro.", "err");
    } finally {
      setBusy(false);
    }
  }

  async function updateRule() {
    if (!editRule) return;
    const cents = ruleForm.amount ? moneyToCentsInput(ruleForm.amount) : undefined;
    setBusy(true);
    try {
      await api(`/api/recurring/${editRule.id}`, {
        method: "PUT",
        body: JSON.stringify({
          scope: ruleScope,
          fromCompetence: todayISO().slice(0, 7),
          ...(cents ? { amountCents: cents } : {}),
          ...(ruleForm.description ? { description: ruleForm.description } : {}),
          ...(ruleForm.dueDay ? { dueDay: Number(ruleForm.dueDay) } : {}),
        }),
      });
      toast.show("Regra atualizada. Meses anteriores preservados.");
      setEditRule(null);
      load();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro.", "err");
    } finally {
      setBusy(false);
    }
  }

  async function closeRule(r: Rule) {
    if (!confirm(`Encerrar "${r.description}"? Competências futuras pendentes serão removidas; o histórico pago será mantido.`)) return;
    try {
      await api(`/api/recurring/${r.id}`, { method: "DELETE", body: JSON.stringify({ deleteFuture: true }) });
      toast.show("Despesa recorrente encerrada.");
      load();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro.", "err");
    }
  }

  const today = todayISO();
  const filtered = list.filter((e) => filterKind === "all" || e.kind === filterKind);
  const openTotal = filtered.filter((e) => e.status === "pending").reduce((s, e) => s + e.amountCents, 0);

  return (
    <div>
      <PageHeader
        title="Despesas"
        subtitle="Únicas, recorrentes e parceladas"
        right={<Btn onClick={() => setShowNew(true)}>+ Nova despesa</Btn>}
      />
      <Tabs
        tabs={[
          { value: "lista", label: "Lançamentos" },
          { value: "recorrentes", label: "Recorrentes", count: rules.filter((r) => r.status === "active").length || undefined },
          { value: "parceladas", label: "Parceladas", count: plans.filter((p) => p.status === "active").length || undefined },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "lista" && (
        <>
          <div className="mt-3">
            <Tabs
              tabs={[
                { value: "all", label: "Todas" },
                { value: "unique", label: "Únicas" },
                { value: "recurring", label: "Recorrentes" },
                { value: "installment", label: "Parceladas" },
              ]}
              value={filterKind}
              onChange={setFilterKind}
            />
          </div>
          {!loading && (
            <Card className="mt-3 p-4 text-center">
              <p className="text-[11px] font-bold uppercase text-stone-400">Em aberto (filtro atual)</p>
              <Money cents={openTotal} className="text-xl font-black text-red-600" />
            </Card>
          )}
          <div className="mt-3 space-y-2">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)
            ) : filtered.length === 0 ? (
              <Empty title="Nenhuma despesa" subtitle="Cadastre aluguel, pró-labore, parcelas…" action={<Btn onClick={() => setShowNew(true)}>+ Nova despesa</Btn>} />
            ) : (
              filtered.map((e) => (
                <Card key={e.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-bold">{e.description}</p>
                      <p className="text-[13px] text-stone-500">
                        {e.categoryName || "Sem categoria"} · {e.kind === "unique" ? "única" : e.kind === "recurring" ? "recorrente" : "parcelada"}
                        {e.dueDate ? ` · Vence ${formatDateBR(e.dueDate)}` : ""}
                        {e.status === "paid" && e.paidAt ? ` · Pago em ${formatDateBR(e.paidAt)}` : ""}
                      </p>
                    </div>
                    <StatusPill tone={e.status === "paid" ? "green" : !e.dueDate ? "gray" : e.dueDate < today ? "red" : e.dueDate === today ? "orange" : "yellow"}>
                      {e.status === "paid" ? "Pago" : !e.dueDate ? "A pagar" : e.dueDate < today ? "Vencido" : e.dueDate === today ? "Vence hoje" : "A pagar"}
                    </StatusPill>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <Money cents={e.amountCents} className="text-base font-black" />
                    {e.status === "pending" && (
                      <Btn className="!min-h-[40px]" onClick={() => setPayTarget(e)}>Marcar como pago</Btn>
                    )}
                  </div>
                </Card>
              ))
            )}
          </div>
        </>
      )}

      {tab === "recorrentes" && (
        <div className="mt-3 space-y-2">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28" />)
          ) : rules.length === 0 ? (
            <Empty title="Nenhuma recorrência" subtitle="Ex: aluguel, contador, pró-labore…" action={<Btn onClick={() => { setKind("recurring"); setShowNew(true); }}>+ Nova recorrente</Btn>} />
          ) : (
            rules.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">{r.description}</p>
                    <p className="text-[13px] text-stone-500">
                      {r.categoryName || "Sem categoria"} · vence dia {r.dueDay} · desde {formatDateBR(r.startDate)}
                      {r.openInfo?.nextDue ? ` · próx. ${formatDateBR(r.openInfo.nextDue)}` : ""}
                    </p>
                  </div>
                  <StatusPill tone={r.status === "active" ? "green" : "gray"}>{r.status === "active" ? "Ativa" : "Encerrada"}</StatusPill>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <Money cents={r.amountCents} className="text-base font-black" />
                  {r.status === "active" && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setEditRule(r); setRuleForm({ amount: (r.amountCents / 100).toFixed(2).replace(".", ","), dueDay: String(r.dueDay), description: r.description }); }}
                        className="rounded-xl bg-stone-100 px-3 py-2 text-xs font-bold hover:bg-stone-200"
                      >
                        Editar
                      </button>
                      <button onClick={() => closeRule(r)} className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-100">
                        Encerrar
                      </button>
                    </div>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === "parceladas" && (
        <div className="mt-3 space-y-2">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28" />)
          ) : plans.length === 0 ? (
            <Empty title="Nenhum parcelamento" subtitle="Ex: máquina em 12×…" action={<Btn onClick={() => { setKind("installment"); setShowNew(true); }}>+ Novo parcelamento</Btn>} />
          ) : (
            plans.map((p) => (
              <Card key={p.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">{p.description}</p>
                    <p className="text-[13px] text-stone-500">
                      {p.paidCount}/{p.totalInstallments} pagas ·
                      restam {p.remainingCount} · saldo futuro {centsToBRL(p.remainingCents)}
                      {p.nextDue ? ` · próx. ${formatDateBR(p.nextDue)}` : ""}
                    </p>
                  </div>
                  <StatusPill tone={p.status === "finished" ? "green" : "yellow"}>
                    {p.status === "finished" ? "Encerrado" : "Ativo"}
                  </StatusPill>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100">
                  <div className="h-full rounded-full bg-emerald-700" style={{ width: `${(p.paidCount / p.totalInstallments) * 100}%` }} />
                </div>
                <p className="mt-1.5 text-sm font-bold">{centsToBRL(p.installmentAmountCents)} <span className="font-normal text-stone-400">/parcela</span></p>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Nova despesa */}
      <Modal open={showNew} onClose={() => setShowNew(false)} title="Nova despesa">
        <Tabs
          tabs={[
            { value: "unique", label: "Única" },
            { value: "recurring", label: "Recorrente" },
            { value: "installment", label: "Parcelada" },
          ]}
          value={kind}
          onChange={setKind}
        />
        <div className="mt-3 space-y-3">
          <Field label="Descrição">
            <input value={f.description} onChange={(e) => set("description", e.target.value)} placeholder={kind === "recurring" ? "Ex: Aluguel" : kind === "installment" ? "Ex: Máquina" : "Ex: Manutenção"} className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={kind === "installment" ? "Valor da parcela (R$)" : "Valor (R$)"}>
              <input value={f.amount} onChange={(e) => set("amount", e.target.value)} inputMode="decimal" placeholder="0,00" className={inputCls} />
            </Field>
            <Field label="Categoria">
              <select value={f.categoryId} onChange={(e) => set("categoryId", e.target.value)} className={inputCls}>
                <option value="">Selecione…</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          </div>
          {kind === "unique" && (
            <Field label="Vencimento">
              <input type="date" value={f.dueDate} onChange={(e) => set("dueDate", e.target.value)} className={inputCls} />
            </Field>
          )}
          {kind === "recurring" && (
            <div className="grid grid-cols-3 gap-3">
              <Field label="Dia venc.">
                <input type="number" min={1} max={31} value={f.dueDay} onChange={(e) => set("dueDay", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Início">
                <input type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Fim (opcional)">
                <input type="date" value={f.endDate} onChange={(e) => set("endDate", e.target.value)} className={inputCls} />
              </Field>
            </div>
          )}
          {kind === "installment" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nº de parcelas">
                <input type="number" min={1} max={120} value={f.totalInstallments} onChange={(e) => set("totalInstallments", e.target.value)} className={inputCls} />
              </Field>
              <Field label="1ª parcela">
                <input type="date" value={f.firstDueDate} onChange={(e) => set("firstDueDate", e.target.value)} className={inputCls} />
              </Field>
            </div>
          )}
          <Field label="Observações">
            <input value={f.notes} onChange={(e) => set("notes", e.target.value)} className={inputCls} />
          </Field>
          <Btn onClick={create} disabled={busy} className="w-full">{busy ? "Salvando…" : kind === "installment" ? `Gerar ${f.totalInstallments} parcelas` : "Criar despesa"}</Btn>
        </div>
      </Modal>

      {/* Editar recorrente */}
      <Modal open={!!editRule} onClose={() => setEditRule(null)} title={`Editar — ${editRule?.description || ""}`}>
        <div className="space-y-3">
          <p className="rounded-xl bg-sky-50 px-3 py-2 text-[13px] font-semibold text-sky-800">
            Meses anteriores nunca são alterados retroativamente.
          </p>
          <Field label="Alterar valor para (R$) — opcional">
            <input value={ruleForm.amount} onChange={(e) => setRuleForm({ ...ruleForm, amount: e.target.value })} inputMode="decimal" className={inputCls} />
          </Field>
          <Field label="Aplicar">
            <select value={ruleScope} onChange={(e) => setRuleScope(e.target.value)} className={inputCls}>
              <option value="forward">Desta competência em diante</option>
              <option value="rule">Somente regra (próximas gerações)</option>
            </select>
          </Field>
          <Btn onClick={updateRule} disabled={busy} className="w-full">{busy ? "Salvando…" : "Salvar"}</Btn>
        </div>
      </Modal>

      <ConfirmModal
        open={!!payTarget}
        onClose={() => setPayTarget(null)}
        onConfirm={doPay}
        title="Confirmar pagamento?"
        message={payTarget ? `Marcar "${payTarget.description}" (${centsToBRL(payTarget.amountCents)}) como pago?` : ""}
        confirmLabel="Confirmar pagamento"
        busy={busy}
      />
      {toast.el}
    </div>
  );
}

export default function DespesasPage() {
  return (
    <Suspense>
      <DespesasInner />
    </Suspense>
  );
}
