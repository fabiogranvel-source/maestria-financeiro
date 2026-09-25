"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { formatDoc, type Client } from "@/lib/clients";
import {
  Btn, Card, ConfirmModal, Empty, Field, inputCls, Modal, PageHeader, Skeleton, StatusPill, useToast,
} from "@/components/ui";

type Links = { projects: number; receivables: number; cashTransactions: number };
type ClientWithLinks = Client & { links?: Links };

const emptyForm = { name: "", cpfCnpj: "", phone: "", email: "", address: "", notes: "" };

export default function ClientesPage() {
  const toast = useToast();
  const [list, setList] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<Client | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [viewing, setViewing] = useState<ClientWithLinks | null>(null);
  const [deleting, setDeleting] = useState<Client | null>(null);
  const [blocked, setBlocked] = useState<{ name: string; links: Links } | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    setLoading(true);
    api<Client[]>("/api/clients")
      .then((rows) => setList(rows.map((r) => ({ ...r, projectCount: Number(r.projectCount || 0) }))))
      .catch((e) => toast.show(e instanceof Error ? e.message : "Erro ao carregar.", "err"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return list;
    return list.filter((c) =>
      [c.name, c.cpfCnpj, c.phone, c.email, c.address, c.notes]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term))
    );
  }, [list, q]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(c: Client) {
    setEditing(c);
    setForm({
      name: c.name || "",
      cpfCnpj: formatDoc(c.cpfCnpj),
      phone: c.phone || "",
      email: c.email || "",
      address: c.address || "",
      notes: c.notes || "",
    });
    setShowForm(true);
  }

  function openView(c: Client) {
    setViewing(c);
    api<ClientWithLinks>(`/api/clients/${c.id}`)
      .then((full) => setViewing(full))
      .catch(() => {});
  }

  async function save() {
    if (!form.name.trim()) {
      toast.show("Informe o nome do cliente.", "err");
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        await api(`/api/clients/${editing.id}`, { method: "PUT", body: JSON.stringify(form) });
        toast.show("Cliente atualizado com sucesso.");
      } else {
        await api("/api/clients", { method: "POST", body: JSON.stringify(form) });
        toast.show("Cliente criado com sucesso.");
      }
      setShowForm(false);
      load();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro ao salvar.", "err");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    const target = deleting;
    setBusy(true);
    try {
      await api(`/api/clients/${target.id}`, { method: "DELETE" });
      setDeleting(null);
      setBlocked(null);
      toast.show("Cliente excluído com sucesso.");
      load();
    } catch (e) {
      setDeleting(null);
      const message = e instanceof Error ? e.message : "Erro ao excluir.";
      toast.show(message, "err");
      // Mantém o aviso na tela: exclusão bloqueada por vínculos.
      try {
        const full = await api<ClientWithLinks>(`/api/clients/${target.id}`);
        setBlocked({
          name: full.name,
          links: full.links ?? { projects: Number(target.projectCount || 0), receivables: 0, cashTransactions: 0 },
        });
      } catch {
        setBlocked({ name: target.name, links: { projects: Number(target.projectCount || 0), receivables: 0, cashTransactions: 0 } });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Clientes"
        subtitle="Cadastro de clientes — dados de contato e documentos"
        right={<Btn onClick={openCreate}>+ Novo cliente</Btn>}
      />

      {/* Busca */}
      <div className="relative">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nome, CPF/CNPJ, telefone, e-mail ou endereço…"
          className={`${inputCls} pl-10`}
        />
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400">⌕</span>
      </div>

      {/* Exclusão bloqueada por vínculos */}
      {blocked && (
        <div className="mt-3 flex items-start justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div>
            <p className="text-sm font-bold text-amber-900">
              Este cliente possui projetos ou movimentações vinculadas e não pode ser excluído.
            </p>
            <p className="mt-1 text-[13px] text-amber-800">
              <span className="font-semibold">{blocked.name}</span> · {blocked.links.projects} projeto(s) ·{" "}
              {blocked.links.receivables} conta(s) a receber · {blocked.links.cashTransactions} movimentação(ões) de caixa.
            </p>
            <p className="mt-1 text-xs text-amber-700">
              Nenhum registro foi apagado. Os dados do cliente foram preservados.
            </p>
          </div>
          <button
            onClick={() => setBlocked(null)}
            className="shrink-0 rounded-full bg-amber-200/70 px-2 text-lg leading-none text-amber-900 hover:bg-amber-200"
            aria-label="Fechar aviso"
          >
            ×
          </button>
        </div>
      )}

      {/* Lista */}
      <div className="mt-3 space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28" />)
        ) : filtered.length === 0 ? (
          <Empty
            title={q ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}
            subtitle={q ? "Tente outro termo de busca." : "Cadastre o primeiro cliente para começar a vincular projetos."}
            action={<Btn onClick={openCreate}>+ Novo cliente</Btn>}
          />
        ) : (
          filtered.map((c) => (
            <Card key={c.id} className="p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-base font-black uppercase tracking-tight text-emerald-950 sm:text-lg">
                      {c.name}
                    </p>
                    {Number(c.projectCount) > 0 ? (
                      <StatusPill tone="green">{Number(c.projectCount)} projeto(s)</StatusPill>
                    ) : (
                      <StatusPill tone="gray">sem vínculos</StatusPill>
                    )}
                  </div>

                  <div className="mt-2 grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2">
                    <Row label="CPF/CNPJ" value={formatDoc(c.cpfCnpj)} />
                    <Row label="Telefone" value={c.phone} />
                    <Row label="E-mail" value={c.email} />
                    <Row label="Endereço" value={c.address} />
                  </div>

                  {c.notes && <p className="mt-2 line-clamp-2 text-[13px] text-stone-500">📝 {c.notes}</p>}
                </div>

                <div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto sm:flex-col">
                  <Btn variant="secondary" onClick={() => openView(c)} className="flex-1">
                    Visualizar
                  </Btn>
                  <Btn variant="primary" onClick={() => openEdit(c)} className="flex-1">
                    Editar
                  </Btn>
                  <Btn variant="danger" onClick={() => { setBlocked(null); setDeleting(c); }} className="flex-1">
                    Excluir
                  </Btn>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {toast.el}

      {/* Modal de visualização */}
      <Modal open={!!viewing} onClose={() => setViewing(null)} title="Dados do cliente">
        {viewing && (
          <div className="space-y-3">
            <p className="text-lg font-black uppercase tracking-tight text-emerald-950">{viewing.name}</p>
            <div className="space-y-2 rounded-2xl bg-stone-50 p-4 text-[14px]">
              <Row label="CPF/CNPJ" value={formatDoc(viewing.cpfCnpj)} block />
              <Row label="Telefone" value={viewing.phone} block />
              <Row label="E-mail" value={viewing.email} block />
              <Row label="Endereço" value={viewing.address} block />
              <Row label="Observações" value={viewing.notes} block />
            </div>
            {viewing.links && (
              <div className="rounded-2xl border border-stone-200 p-4 text-[13px]">
                <p className="mb-1 font-bold text-stone-700">Vínculos</p>
                <p className="text-stone-500">
                  {viewing.links.projects} projeto(s) · {viewing.links.receivables} conta(s) a receber ·{" "}
                  {viewing.links.cashTransactions} movimentação(ões) de caixa
                </p>
              </div>
            )}
            <div className="flex gap-2">
              <Btn
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  const c = viewing;
                  setViewing(null);
                  openEdit(c);
                }}
              >
                Editar
              </Btn>
              <Btn className="flex-1" onClick={() => setViewing(null)}>
                Fechar
              </Btn>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de criação/edição */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? "Editar cliente" : "Novo cliente"}
        wide
      >
        <div className="space-y-3">
          <Field label="Nome / Razão Social">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex: Marcenaria São José Ltda"
              className={inputCls}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="CPF/CNPJ" hint="11 dígitos (CPF) ou 14 (CNPJ)">
              <input
                value={form.cpfCnpj}
                onChange={(e) => setForm({ ...form, cpfCnpj: e.target.value })}
                inputMode="numeric"
                placeholder="000.000.000-00"
                className={inputCls}
              />
            </Field>
            <Field label="Telefone">
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                inputMode="tel"
                placeholder="(00) 00000-0000"
                className={inputCls}
              />
            </Field>
          </div>
          <Field label="E-mail">
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="cliente@email.com"
              className={inputCls}
            />
          </Field>
          <Field label="Endereço">
            <input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Rua, número, bairro, cidade/UF"
              className={inputCls}
            />
          </Field>
          <Field label="Observações">
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Anotações internas sobre o cliente…"
              rows={3}
              className={`${inputCls} min-h-[88px] resize-y`}
            />
          </Field>
          <div className="flex gap-2 pt-1">
            <Btn variant="secondary" className="flex-1" onClick={() => setShowForm(false)}>
              Cancelar
            </Btn>
            <Btn className="flex-1" onClick={save} disabled={busy}>
              {busy ? "Salvando…" : editing ? "Salvar alterações" : "Cadastrar cliente"}
            </Btn>
          </div>
        </div>
      </Modal>

      {/* Confirmação de exclusão */}
      <ConfirmModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Excluir cliente"
        message="Tem certeza que deseja excluir este cliente?"
        confirmLabel="Excluir"
        danger
        busy={busy}
      />
    </div>
  );
}

function Row({ label, value, block }: { label: string; value?: string | null; block?: boolean }) {
  if (!value) return null;
  return (
    <p className={block ? "flex gap-2" : ""}>
      <span className="shrink-0 font-semibold text-stone-400">{label}:</span>
      <span className={block ? "break-words text-stone-700" : "break-words text-stone-600"}>{value}</span>
    </p>
  );
}
