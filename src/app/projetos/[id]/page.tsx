"use client";
import { use, useEffect, useState } from "react";
import { api, moneyToCentsInput, newIdem } from "@/lib/api";
import { centsToBRL, formatDateBR, projectStatusLabel, paymentMethodLabel, balanceModeLabel } from "@/lib/format";
import { Card, Btn, Empty, Field, inputCls, Modal, Money, Skeleton, StatusPill, Tabs, ConfirmModal, useToast } from "@/components/ui";

type Detail = {
  project: {
    id: number; clientId: number; archived?: string | null; clientName: string; clientPhone: string | null; title: string;
    description: string | null; saleDate: string; totalValueCents: number; downPaymentCents: number;
    balanceMode: string; balanceDueDate: string | null; deliveryForecast: string | null;
    notes: string | null; status: string;
  };
  finance: { totalCents: number; receivedCents: number; pendingCents: number; costCents: number; profitCents: number; marginPct: number };
  receivables: { id: number; description: string; amountCents: number; receivedCents: number; dueDate: string | null; condition: string; status: string; notes: string | null }[];
  payments: { id: number; receivableId: number | null; amountCents: number; paidAt: string; method: string; notes: string | null; reversedAt: string | null; createdAt: string }[];
  costs: { id: number; description: string; categoryId: number | null; categoryName: string | null; amountCents: number; status: string; dueDate: string | null; paidAt: string | null; paymentMethod: string | null; notes: string | null }[];
  files: { id: number; fileName: string; mimeType: string | null; sizeBytes: number | null; createdAt: string }[];
};

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const [data, setData] = useState<Detail | null>(null);
  const [tab, setTab] = useState("resumo");
  const [cats, setCats] = useState<{ id: number; name: string }[]>([]);
  const [showRecv, setShowRecv] = useState(false);
  const [showCost, setShowCost] = useState(false);
  const [showCharge, setShowCharge] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteBlocked, setDeleteBlocked] = useState<string | null>(null);
  const [clients, setClients] = useState<{ id: number; name: string }[]>([]);
  const [editForm, setEditForm] = useState({
    clientId: "", title: "", description: "", saleDate: "",
    totalValue: "", downPayment: "", balanceMode: "on_delivery", balanceDueDate: "",
    deliveryForecast: "", notes: "", status: "approved",
  });
  const [payTarget, setPayTarget] = useState<{ id: number; open: number; desc: string } | null>(null);
  const [costPayTarget, setCostPayTarget] = useState<number | null>(null);
  const [reverseTarget, setReverseTarget] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const [recvForm, setRecvForm] = useState({ amount: "", date: new Date().toISOString().slice(0, 10), method: "pix", notes: "" });
  const [costForm, setCostForm] = useState({ description: "", categoryId: "", amount: "", status: "pending", dueDate: "", paidAt: new Date().toISOString().slice(0, 10), method: "pix", notes: "" });
  const [chargeForm, setChargeForm] = useState({ description: "", amount: "", dueDate: "", condition: "fixed", notes: "" });

  function load() {
    api<Detail>(`/api/projects/${id}`).then(setData).catch((e) => toast.show(e.message, "err"));
  }

  useEffect(() => {
    load();
    api<{ categories: { id: number; name: string }[] }>("/api/meta").then((m) => setCats(m.categories)).catch(() => {});
    api<{ id: number; name: string }[]>("/api/clients").then(setClients).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function doReceive(receivableId: number | null, openCents?: number) {
    const cents = moneyToCentsInput(recvForm.amount);
    if (!cents || cents <= 0) return toast.show("Informe um valor válido.", "err");
    if (openCents !== undefined && cents > openCents) {
      const ok = confirm(
        `O saldo desta cobrança é ${centsToBRL(openCents)} e você está registrando ${centsToBRL(cents)}. Deseja continuar?`
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      if (receivableId) {
        await api(`/api/receivables/${receivableId}/receive`, {
          method: "POST",
          body: JSON.stringify({
            amountCents: cents, paidAt: recvForm.date, method: recvForm.method,
            notes: recvForm.notes, idempotencyKey: newIdem(), confirmedOverpay: true,
          }),
        });
      } else {
        await api("/api/payments", {
          method: "POST",
          body: JSON.stringify({
            projectId: Number(id), amountCents: cents, paidAt: recvForm.date,
            method: recvForm.method, notes: recvForm.notes, idempotencyKey: newIdem(),
          }),
        });
      }
      toast.show("Recebimento registrado!");
      setShowRecv(false);
      setPayTarget(null);
      setRecvForm({ amount: "", date: new Date().toISOString().slice(0, 10), method: "pix", notes: "" });
      load();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro.", "err");
    } finally {
      setBusy(false);
    }
  }

  async function doCreateCost() {
    const cents = moneyToCentsInput(costForm.amount);
    if (!costForm.description.trim()) return toast.show("Descreva o custo.", "err");
    if (!cents || cents <= 0) return toast.show("Informe um valor válido.", "err");
    setBusy(true);
    try {
      await api("/api/costs", {
        method: "POST",
        body: JSON.stringify({
          projectId: Number(id),
          description: costForm.description,
          categoryId: costForm.categoryId ? Number(costForm.categoryId) : null,
          amountCents: cents,
          status: costForm.status,
          dueDate: costForm.dueDate || null,
          paidAt: costForm.status === "paid" ? costForm.paidAt : null,
          paymentMethod: costForm.method,
          notes: costForm.notes,
        }),
      });
      toast.show("Custo adicionado!");
      setShowCost(false);
      setCostForm({ description: "", categoryId: "", amount: "", status: "pending", dueDate: "", paidAt: new Date().toISOString().slice(0, 10), method: "pix", notes: "" });
      load();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro.", "err");
    } finally {
      setBusy(false);
    }
  }

  async function doPayCost(cid: number) {
    setBusy(true);
    try {
      await api(`/api/costs/${cid}/pay`, { method: "POST", body: JSON.stringify({}) });
      toast.show("Custo marcado como pago!");
      setCostPayTarget(null);
      load();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro.", "err");
    } finally {
      setBusy(false);
    }
  }

  async function doCreateCharge() {
    const cents = moneyToCentsInput(chargeForm.amount);
    if (!cents || cents <= 0) return toast.show("Informe um valor válido.", "err");
    setBusy(true);
    try {
      await api("/api/receivables", {
        method: "POST",
        body: JSON.stringify({
          projectId: Number(id),
          description: chargeForm.description || "Cobrança",
          amountCents: cents,
          dueDate: chargeForm.dueDate || null,
          condition: chargeForm.condition,
          notes: chargeForm.notes,
        }),
      });
      toast.show("Cobrança criada!");
      setShowCharge(false);
      setChargeForm({ description: "", amount: "", dueDate: "", condition: "fixed", notes: "" });
      load();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro.", "err");
    } finally {
      setBusy(false);
    }
  }

  async function doReverse(pid: number) {
    const reason = prompt("Motivo do estorno:", "Lançamento incorreto");
    if (!reason) return;
    setBusy(true);
    try {
      await api(`/api/payments/${pid}/reverse`, { method: "POST", body: JSON.stringify({ reason }) });
      toast.show("Recebimento estornado.");
      setReverseTarget(null);
      load();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro.", "err");
    } finally {
      setBusy(false);
    }
  }

  async function doStatus(s: string) {
    try {
      await api(`/api/projects/${id}`, { method: "PUT", body: JSON.stringify({ status: s }) });
      toast.show("Status atualizado!");
      load();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro.", "err");
    }
  }

  const financialsLocked =
    data !== null &&
    (data.finance.receivedCents > 0 || data.payments.some((x) => !x.reversedAt));

  function openEdit() {
    if (!data) return;
    setEditForm({
      clientId: String(data.project.clientId ?? ""),
      title: data.project.title || "",
      description: data.project.description || "",
      saleDate: data.project.saleDate || "",
      totalValue: (data.finance.totalCents / 100).toFixed(2).replace(".", ","),
      downPayment: (Number(data.project.downPaymentCents || 0) / 100).toFixed(2).replace(".", ","),
      balanceMode: data.project.balanceMode || "on_delivery",
      balanceDueDate: data.project.balanceDueDate || "",
      deliveryForecast: data.project.deliveryForecast || "",
      notes: data.project.notes || "",
      status: data.project.status || "approved",
    });
    setShowEdit(true);
  }

  async function saveEdit() {
    if (!editForm.title.trim()) return toast.show("Informe o nome do projeto.", "err");
    setBusy(true);
    try {
      await api(`/api/projects/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          clientId: editForm.clientId ? Number(editForm.clientId) : undefined,
          title: editForm.title.trim(),
          description: editForm.description,
          saleDate: editForm.saleDate,
          totalValueCents: moneyToCentsInput(editForm.totalValue),
          downPaymentCents: moneyToCentsInput(editForm.downPayment),
          balanceMode: editForm.balanceMode,
          balanceDueDate: editForm.balanceDueDate || null,
          deliveryForecast: editForm.deliveryForecast || null,
          notes: editForm.notes,
          status: editForm.status,
        }),
      });
      toast.show("Projeto atualizado com sucesso.");
      setShowEdit(false);
      load();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro ao salvar.", "err");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    setBusy(true);
    try {
      await api(`/api/projects/${id}`, { method: "DELETE" });
      toast.show("Projeto excluído com sucesso.");
      window.location.href = "/projetos";
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao excluir.";
      setDeleteBlocked(msg);
      setShowDelete(false);
      toast.show(msg, "err");
    } finally {
      setBusy(false);
    }
  }

  function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await api("/api/attachments", {
          method: "POST",
          body: JSON.stringify({
            relatedType: "project", relatedId: Number(id),
            fileName: file.name, mimeType: file.type, dataUrl: reader.result,
          }),
        });
        toast.show("Arquivo anexado!");
        load();
      } catch (err) {
        toast.show(err instanceof Error ? err.message : "Erro no upload.", "err");
      }
    };
    reader.readAsDataURL(file);
  }

  if (!data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const { project: p, finance: fn } = data;
  const archived = !!p.archived;

  return (
    <div>
      <a href="/projetos" className="mb-2 inline-block text-sm font-bold text-stone-500 hover:text-stone-800">‹ Voltar para projetos</a>
      {archived && (
        <div className="mb-3 rounded-2xl border border-stone-200 bg-stone-50 p-4">
          <p className="text-sm font-bold text-stone-700">Projeto arquivado</p>
          <p className="mt-0.5 text-[13px] text-stone-500">
            Este projeto foi excluído das listas operacionais, mas todo o histórico financeiro
            (cobranças, pagamentos, custos e caixa) permanece preservado para consulta.
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight">{p.clientName}</h1>
          <p className="text-sm text-stone-500">{p.title} · Venda em {formatDateBR(p.saleDate)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {archived ? (
            <StatusPill tone="gray">Arquivado</StatusPill>
          ) : (
            <StatusPill tone="blue">{projectStatusLabel(p.status)}</StatusPill>
          )}
          {!archived && (
            <>
              <Btn variant="secondary" onClick={openEdit} className="!min-h-[40px]">Editar projeto</Btn>
              <Btn variant="danger" onClick={() => setShowDelete(true)} className="!min-h-[40px]">Excluir projeto</Btn>
            </>
          )}
        </div>
      </div>

      {/* Resumo financeiro */}
      <Card className="mt-3 grid grid-cols-3 gap-px overflow-hidden !p-0 sm:grid-cols-6">
        <Stat label="Venda" cents={fn.totalCents} />
        <Stat label="Recebido" cents={fn.receivedCents} tone="text-emerald-700" />
        <Stat label="A receber" cents={fn.pendingCents} tone={fn.pendingCents > 0 ? "text-amber-700" : ""} />
        <Stat label="Custos" cents={fn.costCents} />
        <Stat label="Lucro previsto" cents={fn.profitCents} tone={fn.profitCents >= 0 ? "text-emerald-700" : "text-red-600"} />
        <div className="bg-white p-4 text-center">
          <p className="text-[11px] font-bold uppercase text-stone-400">Margem</p>
          <p className="mt-1 text-xl font-black">{fn.marginPct.toLocaleString("pt-BR")}%</p>
        </div>
      </Card>

      {/* Status operacional */}
      <Card className="mt-3 p-4">
        <p className="mb-2 text-[13px] font-bold text-stone-600">Status operacional <span className="font-normal text-stone-400">(independente do financeiro)</span></p>
        <div className="flex flex-wrap gap-2">
          {[
            ["approved", "Aprovado"], ["measuring", "Aguard. medição"], ["production", "Em produção"],
            ["ready", "Pronto p/ instalação"], ["installing", "Instalando"], ["delivered", "Entregue"], ["finished", "Finalizado"],
          ].map(([v, l]) => (
            <button
              key={v}
              onClick={() => doStatus(v)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                p.status === v ? "bg-emerald-950 text-white" : "bg-stone-100 text-stone-500 hover:bg-stone-200"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-4">
          <Info label="Saldo" value={balanceModeLabel(p.balanceMode)} />
          <Info label="Venc. saldo" value={formatDateBR(p.balanceDueDate)} />
          <Info label="Previsão entrega" value={formatDateBR(p.deliveryForecast)} />
          <Info label="Telefone" value={p.clientPhone || "—"} />
        </div>
        {p.notes && <p className="mt-2 rounded-xl bg-stone-50 p-3 text-sm text-stone-600">{p.notes}</p>}
      </Card>

      <div className="mt-3 flex gap-2">
        <Btn onClick={() => { setPayTarget(null); setRecvForm((f) => ({ ...f, amount: "" })); setShowRecv(true); }} className="flex-1">+ Recebimento</Btn>
        <Btn variant="secondary" onClick={() => setShowCost(true)} className="flex-1">+ Custo</Btn>
      </div>

      <div className="mt-3">
        <Tabs
          tabs={[
            { value: "resumo", label: "Resumo" },
            { value: "receb", label: "Recebimentos", count: data.receivables.filter((r) => r.status !== "received").length || undefined },
            { value: "custos", label: "Custos", count: data.costs.filter((c) => c.status === "pending").length || undefined },
            { value: "arquivos", label: "Arquivos", count: data.files.length || undefined },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {tab === "resumo" && (
        <div className="mt-3 space-y-3">
          <Card className="p-4">
            <h3 className="mb-2 text-sm font-bold">Cobranças</h3>
            {data.receivables.length === 0 ? (
              <p className="text-sm text-stone-400">Nenhuma cobrança cadastrada.</p>
            ) : (
              <div className="space-y-2">
                {data.receivables.map((r) => {
                  const open = r.amountCents - r.receivedCents;
                  return (
                    <div key={r.id} className="flex items-center justify-between gap-2 rounded-xl border border-stone-100 bg-stone-50/60 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">{r.description}</p>
                        <p className="text-xs text-stone-500">
                          {r.dueDate ? `Vence ${formatDateBR(r.dueDate)}` : r.condition === "on_delivery" ? "Na entrega" : "Sem data"} ·{" "}
                          {r.status === "received" ? "Recebido" : r.status === "partial" ? `Parcial (${centsToBRL(r.receivedCents)} de ${centsToBRL(r.amountCents)})` : `Aberto — ${centsToBRL(open)}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Money cents={r.amountCents} className="text-sm font-black" />
                        {r.status !== "received" && r.status !== "cancelled" && (
                          <Btn
                            variant="success"
                            className="!min-h-[38px] !px-3 !py-1.5 !text-xs"
                            onClick={() => {
                              setPayTarget({ id: r.id, open, desc: r.description });
                              setRecvForm((f) => ({ ...f, amount: (open / 100).toFixed(2).replace(".", ",") }));
                              setShowRecv(true);
                            }}
                          >
                            Receber
                          </Btn>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <button onClick={() => setShowCharge(true)} className="mt-2 text-sm font-bold text-emerald-900 hover:underline">
              + Nova cobrança / parcela
            </button>
          </Card>

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-bold">Histórico de recebimentos</h3>
            {data.payments.length === 0 ? (
              <p className="text-sm text-stone-400">Nenhum recebimento ainda.</p>
            ) : (
              <div className="space-y-2">
                {data.payments.map((pay) => (
                  <div key={pay.id} className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 ${pay.reversedAt ? "bg-red-50/60" : "bg-emerald-50/60"}`}>
                    <div>
                      <p className="text-sm font-black text-emerald-800">{pay.reversedAt ? "Estornado — " : ""}{centsToBRL(pay.amountCents)}</p>
                      <p className="text-xs text-stone-500">{formatDateBR(pay.paidAt)} · {paymentMethodLabel(pay.method)}{pay.notes ? ` · ${pay.notes}` : ""}</p>
                    </div>
                    {!pay.reversedAt && (
                      <button onClick={() => setReverseTarget(pay.id)} className="text-xs font-bold text-stone-400 hover:text-red-600">
                        Estornar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "receb" && (
        <div className="mt-3 space-y-2">
          {data.receivables.length === 0 && <Empty title="Nenhuma cobrança" action={<Btn onClick={() => setShowCharge(true)}>+ Nova cobrança</Btn>} />}
          {data.receivables.map((r) => {
            const open = r.amountCents - r.receivedCents;
            return (
              <Card key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">{r.description}</p>
                    <p className="text-[13px] text-stone-500">{r.dueDate ? `Vencimento ${formatDateBR(r.dueDate)}` : r.condition === "on_delivery" ? "Condição: na entrega" : "Sem vencimento"}</p>
                  </div>
                  <StatusPill tone={r.status === "received" ? "green" : r.status === "partial" ? "yellow" : "gray"}>
                    {r.status === "received" ? "Recebido" : r.status === "partial" ? "Parcial" : r.status === "cancelled" ? "Cancelado" : "A receber"}
                  </StatusPill>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="text-sm">
                    <span className="font-black">{centsToBRL(r.amountCents)}</span>
                    {r.receivedCents > 0 && <span className="text-stone-500"> · recebido {centsToBRL(r.receivedCents)}</span>}
                    {open > 0 && r.status !== "cancelled" && <span className="font-bold text-amber-700"> · faltam {centsToBRL(open)}</span>}
                  </div>
                  {r.status !== "received" && r.status !== "cancelled" && (
                    <Btn
                      variant="success"
                      className="!min-h-[40px]"
                      onClick={() => {
                        setPayTarget({ id: r.id, open, desc: r.description });
                        setRecvForm((f) => ({ ...f, amount: (open / 100).toFixed(2).replace(".", ",") }));
                        setShowRecv(true);
                      }}
                    >
                      Receber
                    </Btn>
                  )}
                </div>
              </Card>
            );
          })}
          <Btn variant="secondary" onClick={() => setShowCharge(true)} className="w-full">+ Nova cobrança / parcela</Btn>
        </div>
      )}

      {tab === "custos" && (
        <div className="mt-3 space-y-2">
          {data.costs.length === 0 && (
            <Empty title="Nenhum custo lançado" subtitle="MDF, ferragens, montagem…" action={<Btn onClick={() => setShowCost(true)}>+ Adicionar custo</Btn>} />
          )}
          {data.costs.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold">{c.description}</p>
                  <p className="text-[13px] text-stone-500">
                    {c.categoryName || "Sem categoria"}
                    {c.dueDate ? ` · Vence ${formatDateBR(c.dueDate)}` : ""}
                    {c.status === "paid" && c.paidAt ? ` · Pago em ${formatDateBR(c.paidAt)}` : ""}
                  </p>
                </div>
                <StatusPill tone={c.status === "paid" ? "green" : c.status === "cancelled" ? "gray" : "yellow"}>
                  {c.status === "paid" ? "Pago" : c.status === "cancelled" ? "Cancelado" : "A pagar"}
                </StatusPill>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <Money cents={c.amountCents} className="text-base font-black" />
                {c.status === "pending" && (
                  <Btn className="!min-h-[40px]" onClick={() => setCostPayTarget(c.id)}>Marcar como pago</Btn>
                )}
              </div>
            </Card>
          ))}
          {data.costs.length > 0 && (
            <Btn variant="secondary" onClick={() => setShowCost(true)} className="w-full">+ Adicionar custo</Btn>
          )}
        </div>
      )}

      {tab === "arquivos" && (
        <div className="mt-3">
          <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-stone-200 bg-white p-6 text-center transition hover:border-emerald-800">
            <input type="file" className="hidden" accept="image/*,.pdf" onChange={uploadFile} />
            <p className="text-sm font-bold">+ Anexar comprovante, nota ou foto</p>
            <p className="mt-1 text-xs text-stone-400">Imagem ou PDF · máx. ~3MB</p>
          </label>
          <div className="mt-3 space-y-2">
            {data.files.length === 0 && <p className="py-4 text-center text-sm text-stone-400">Nenhum arquivo anexado.</p>}
            {data.files.map((f) => (
              <Card key={f.id} className="flex items-center justify-between p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{f.fileName}</p>
                  <p className="text-xs text-stone-400">{formatDateBR(f.createdAt.slice(0, 10))}</p>
                </div>
                <FileActions fileId={f.id} onDone={load} toastShow={toast.show} />
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Modal recebimento */}
      <Modal open={showRecv} onClose={() => { setShowRecv(false); setPayTarget(null); }} title={payTarget ? `Receber — ${payTarget.desc}` : "Novo recebimento"}>
        {payTarget && (
          <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
            Em aberto: {centsToBRL(payTarget.open)} — aceita valor parcial.
          </p>
        )}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor recebido (R$)">
              <input value={recvForm.amount} onChange={(e) => setRecvForm({ ...recvForm, amount: e.target.value })} inputMode="decimal" placeholder="0,00" className={inputCls} autoFocus />
            </Field>
            <Field label="Data">
              <input type="date" value={recvForm.date} onChange={(e) => setRecvForm({ ...recvForm, date: e.target.value })} className={inputCls} />
            </Field>
          </div>
          <Field label="Forma de pagamento">
            <select value={recvForm.method} onChange={(e) => setRecvForm({ ...recvForm, method: e.target.value })} className={inputCls}>
              <option value="pix">PIX</option><option value="cash">Dinheiro</option>
              <option value="transfer">Transferência</option><option value="card">Cartão</option>
              <option value="boleto">Boleto</option><option value="other">Outro</option>
            </select>
          </Field>
          <Field label="Observação">
            <input value={recvForm.notes} onChange={(e) => setRecvForm({ ...recvForm, notes: e.target.value })} placeholder="Opcional" className={inputCls} />
          </Field>
          <Btn onClick={() => doReceive(payTarget?.id ?? null, payTarget?.open)} disabled={busy} className="w-full">
            {busy ? "Registrando…" : `Confirmar recebimento`}
          </Btn>
        </div>
      </Modal>

      {/* Modal custo */}
      <Modal open={showCost} onClose={() => setShowCost(false)} title="Adicionar custo">
        <div className="space-y-3">
          <Field label="Descrição">
            <input value={costForm.description} onChange={(e) => setCostForm({ ...costForm, description: e.target.value })} placeholder="Ex: MDF 18mm" className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Categoria">
              <select value={costForm.categoryId} onChange={(e) => setCostForm({ ...costForm, categoryId: e.target.value })} className={inputCls}>
                <option value="">Selecione…</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Valor (R$)">
              <input value={costForm.amount} onChange={(e) => setCostForm({ ...costForm, amount: e.target.value })} inputMode="decimal" placeholder="0,00" className={inputCls} />
            </Field>
          </div>
          <Field label="Status">
            <select value={costForm.status} onChange={(e) => setCostForm({ ...costForm, status: e.target.value })} className={inputCls}>
              <option value="pending">A pagar</option>
              <option value="paid">Já pago</option>
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Vencimento">
              <input type="date" value={costForm.dueDate} onChange={(e) => setCostForm({ ...costForm, dueDate: e.target.value })} className={inputCls} />
            </Field>
            {costForm.status === "paid" && (
              <Field label="Data pagamento">
                <input type="date" value={costForm.paidAt} onChange={(e) => setCostForm({ ...costForm, paidAt: e.target.value })} className={inputCls} />
              </Field>
            )}
          </div>
          <Field label="Observação">
            <input value={costForm.notes} onChange={(e) => setCostForm({ ...costForm, notes: e.target.value })} className={inputCls} />
          </Field>
          <Btn onClick={doCreateCost} disabled={busy} className="w-full">{busy ? "Salvando…" : "Adicionar custo"}</Btn>
        </div>
      </Modal>

      {/* Modal cobrança */}
      <Modal open={showCharge} onClose={() => setShowCharge(false)} title="Nova cobrança / parcela">
        <div className="space-y-3">
          <Field label="Descrição">
            <input value={chargeForm.description} onChange={(e) => setChargeForm({ ...chargeForm, description: e.target.value })} placeholder="Ex: Parcela 2/3" className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor (R$)">
              <input value={chargeForm.amount} onChange={(e) => setChargeForm({ ...chargeForm, amount: e.target.value })} inputMode="decimal" placeholder="0,00" className={inputCls} />
            </Field>
            <Field label="Vencimento">
              <input type="date" value={chargeForm.dueDate} onChange={(e) => setChargeForm({ ...chargeForm, dueDate: e.target.value })} className={inputCls} />
            </Field>
          </div>
          <Field label="Condição">
            <select value={chargeForm.condition} onChange={(e) => setChargeForm({ ...chargeForm, condition: e.target.value })} className={inputCls}>
              <option value="fixed">Data definida</option>
              <option value="on_delivery">Na entrega</option>
              <option value="installment">Parcelado</option>
              <option value="undefined">A definir</option>
            </select>
          </Field>
          <Btn onClick={doCreateCharge} disabled={busy} className="w-full">{busy ? "Salvando…" : "Criar cobrança"}</Btn>
        </div>
      </Modal>

      <ConfirmModal
        open={costPayTarget !== null}
        onClose={() => setCostPayTarget(null)}
        onConfirm={() => costPayTarget !== null && doPayCost(costPayTarget)}
        title="Marcar como pago?"
        message="O valor sairá do caixa e o custo será marcado como pago. A movimentação ficará registrada no fluxo de caixa."
        confirmLabel="Confirmar pagamento"
        busy={busy}
      />
      <ConfirmModal
        open={reverseTarget !== null}
        onClose={() => setReverseTarget(null)}
        onConfirm={() => reverseTarget !== null && doReverse(reverseTarget)}
        title="Estornar recebimento?"
        message="O recebimento será estornado, a cobrança reaberta e uma saída compensatória será lançada no caixa. O histórico será preservado."
        confirmLabel="Estornar"
        danger
        busy={busy}
      />

      {/* ===== Editar projeto ===== */}
      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Editar projeto" wide>
        <div className="space-y-3">
          {financialsLocked && (
            <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-[13px] font-semibold leading-relaxed text-amber-800">
              Existem pagamentos recebidos neste projeto. Os valores financeiros da venda não podem
              mais ser alterados diretamente. Se necessário, estorne o pagamento e tente novamente.
              Os demais campos continuam editáveis.
            </p>
          )}

          <Field label="Cliente">
            <select
              value={editForm.clientId}
              onChange={(e) => setEditForm({ ...editForm, clientId: e.target.value })}
              className={inputCls}
            >
              <option value="">Selecione o cliente</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>

          <Field label="Nome do projeto">
            <input
              value={editForm.title}
              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              placeholder="Ex: Cozinha planejada"
              className={inputCls}
            />
          </Field>

          <Field label="Descrição">
            <textarea
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              rows={2}
              className={`${inputCls} min-h-[70px] resize-y`}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Data da venda">
              <input
                type="date"
                value={editForm.saleDate}
                onChange={(e) => setEditForm({ ...editForm, saleDate: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Status">
              <select
                value={editForm.status}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                className={inputCls}
              >
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

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Valor total da venda">
              <input
                value={editForm.totalValue}
                onChange={(e) => setEditForm({ ...editForm, totalValue: e.target.value })}
                inputMode="decimal"
                placeholder="0,00"
                disabled={financialsLocked}
                className={`${inputCls} ${financialsLocked ? "cursor-not-allowed bg-stone-100 text-stone-400" : ""}`}
              />
            </Field>
            <Field label="Valor da entrada">
              <input
                value={editForm.downPayment}
                onChange={(e) => setEditForm({ ...editForm, downPayment: e.target.value })}
                inputMode="decimal"
                placeholder="0,00"
                disabled={financialsLocked}
                className={`${inputCls} ${financialsLocked ? "cursor-not-allowed bg-stone-100 text-stone-400" : ""}`}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Condição do saldo">
              <select
                value={editForm.balanceMode}
                onChange={(e) => setEditForm({ ...editForm, balanceMode: e.target.value })}
                className={inputCls}
                disabled={financialsLocked}
              >
                <option value="on_delivery">Na entrega</option>
                <option value="fixed_date">Data definida</option>
                <option value="installments">Parcelado</option>
                <option value="undefined">A definir</option>
              </select>
            </Field>
            <Field label="Vencimento do saldo">
              <input
                type="date"
                value={editForm.balanceDueDate}
                onChange={(e) => setEditForm({ ...editForm, balanceDueDate: e.target.value })}
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Previsão de entrega">
            <input
              type="date"
              value={editForm.deliveryForecast}
              onChange={(e) => setEditForm({ ...editForm, deliveryForecast: e.target.value })}
              className={inputCls}
            />
          </Field>

          <Field label="Observações">
            <textarea
              value={editForm.notes}
              onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
              rows={3}
              className={`${inputCls} min-h-[88px] resize-y`}
            />
          </Field>

          <div className="flex gap-2 pt-1">
            <Btn variant="secondary" className="flex-1" onClick={() => setShowEdit(false)}>Cancelar</Btn>
            <Btn className="flex-1" onClick={saveEdit} disabled={busy}>
              {busy ? "Salvando…" : "Salvar alterações"}
            </Btn>
          </div>
        </div>
      </Modal>

      {/* ===== Excluir projeto ===== */}
      <ConfirmModal
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={confirmDelete}
        title="Excluir projeto"
        message="Tem certeza que deseja excluir este projeto?"
        confirmLabel="Excluir projeto"
        danger
        busy={busy}
      />

      {deleteBlocked && (
        <Modal open={!!deleteBlocked} onClose={() => setDeleteBlocked(null)} title="Exclusão bloqueada">
          <p className="text-[15px] leading-relaxed text-stone-600">{deleteBlocked}</p>
          <p className="mt-2 rounded-xl bg-stone-50 px-3 py-2 text-[13px] text-stone-500">
            Nenhum registro financeiro foi apagado. O projeto e todo o seu histórico permanecem preservados.
          </p>
          <Btn className="mt-4 w-full" onClick={() => setDeleteBlocked(null)}>Entendi</Btn>
        </Modal>
      )}

      {toast.el}
    </div>
  );
}

function Stat({ label, cents, tone = "" }: { label: string; cents: number; tone?: string }) {
  return (
    <div className="bg-white p-4 text-center">
      <p className="text-[11px] font-bold uppercase text-stone-400">{label}</p>
      <p className={`mt-1 truncate text-lg font-black sm:text-xl ${tone}`}>{centsToBRL(cents)}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-stone-50 px-3 py-2">
      <p className="text-[11px] font-bold uppercase text-stone-400">{label}</p>
      <p className="text-[13px] font-bold">{value}</p>
    </div>
  );
}

function FileActions({ fileId, onDone, toastShow }: { fileId: number; onDone: () => void; toastShow: (m: string, k?: "ok" | "err") => void }) {
  async function open() {
    try {
      const row = await api<{ dataUrl: string; fileName: string }>(`/api/attachments?id=${fileId}`);
      if (row.dataUrl) window.open(row.dataUrl, "_blank");
      else toastShow("Arquivo sem conteúdo.", "err");
    } catch {
      toastShow("Erro ao abrir anexo.", "err");
    }
  }
  async function del() {
    if (!confirm("Excluir este anexo?")) return;
    try {
      await fetch(`/api/attachments?id=${fileId}`, { method: "DELETE" });
      toastShow("Anexo excluído.");
      onDone();
    } catch {
      toastShow("Erro ao excluir.", "err");
    }
  }
  return (
    <div className="flex shrink-0 gap-3">
      <button onClick={open} className="text-xs font-bold text-emerald-800 hover:underline">Abrir</button>
      <button onClick={del} className="text-xs font-bold text-red-500 hover:underline">Excluir</button>
    </div>
  );
}
