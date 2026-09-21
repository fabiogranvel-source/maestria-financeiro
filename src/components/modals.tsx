"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownLeft, ArrowUpRight, Plus, Undo2, Edit3, Ban, UploadCloud, Paperclip,
} from "lucide-react";
import { Modal, ModalButton, ActionForm, Submit, MoneyInput, Field, ConfirmForm } from "./client";
import {
  registerPaymentAction, payCostAction, payExpenseAction, revertPaymentAction,
  revertCostPaymentAction, revertExpensePaymentAction, createCostAction, updateCostAction,
  cancelCostAction, createReceivableAction, cancelReceivableAction, createExpenseAction,
  createRecurringAction, updateRecurringAmountAction, closeRecurringAction,
  createInstallmentPlanAction, cancelExpenseAction, updateExpenseAction,
  adjustBalanceAction, uploadAttachmentAction, seedDemoAction, updateProjectStatusAction,
} from "@/lib/actions";
import { centsToInput } from "@/lib/money";
import { todayISO } from "@/lib/dates";
import { PROJECT_STATUS } from "./ui";

type ProjectOpt = { id: number; name: string; clientName: string };
type CategoryOpt = { id: number; name: string; kind: string };

/* ====================== RECEBIMENTO ====================== */

export function ReceiveModal({
  receivableId, title, saldo, className = "btn btn-brand",
  label = "Receber", icon = true,
}: {
  receivableId: number; title: string; saldo: number;
  className?: string; label?: string; icon?: boolean;
}) {
  return (
    <ModalButton
      label={<span className="inline-flex items-center gap-1.5">{icon ? <ArrowDownLeft size={15} /> : null}{label}</span>}
      title="Registrar recebimento"
      className={className}
    >
      {(close) => (
        <ActionForm action={registerPaymentAction} onSuccess={close}>
          <input type="hidden" name="receivableId" value={receivableId} />
          <input type="hidden" name="confirmed" value="" />
          <div className="mb-4 rounded-2xl bg-paper px-4 py-3.5">
            <div className="text-[12px] font-semibold text-muted">{title}</div>
            <div className="mt-0.5 text-[13px] text-ink-soft">
              Saldo em aberto:{" "}
              <strong className="num">{(saldo / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong>
            </div>
          </div>
          <div className="space-y-4">
            <Field label="Valor recebido" hint="Permite recebimento parcial">
              <MoneyInput name="amount" defaultValue={centsToInput(saldo)} required autoFocus />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Data">
                <input className="input" type="date" name="date" defaultValue={todayISO()} />
              </Field>
              <Field label="Forma de pagamento">
                <select className="input" name="method" defaultValue="pix">
                  <option value="pix">PIX</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="transferencia">Transferência</option>
                  <option value="cartao">Cartão</option>
                  <option value="boleto">Boleto</option>
                  <option value="outro">Outro</option>
                </select>
              </Field>
            </div>
            <Field label="Observação (opcional)">
              <input className="input" name="notes" placeholder="Ex.: pagou metade do saldo" />
            </Field>
          </div>
          <div className="mt-6">
            <Submit className="btn btn-brand w-full">Confirmar recebimento</Submit>
          </div>
        </ActionForm>
      )}
    </ModalButton>
  );
}

/* ====================== PAGAR CONTA (custo/despesa) ====================== */

export function PayItemModal({
  kind, id, title, amount, className = "btn btn-ghost", label = "Marcar como pago",
}: {
  kind: "custo" | "despesa"; id: number; title: string; amount: number;
  className?: string; label?: string;
}) {
  return (
    <ModalButton
      label={<span className="inline-flex items-center gap-1.5"><ArrowUpRight size={14} />{label}</span>}
      title="Baixar pagamento"
      className={className}
    >
      {(close) => (
        <ActionForm action={kind === "custo" ? payCostAction : payExpenseAction} onSuccess={close}>
          <input type="hidden" name="id" value={id} />
          <div className="mb-4 rounded-2xl bg-paper px-4 py-3.5">
            <div className="text-[12px] font-semibold text-muted">{title}</div>
            <div className="num mt-0.5 font-display text-[20px] font-semibold">
              {(amount / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data do pagamento">
              <input className="input" type="date" name="date" defaultValue={todayISO()} />
            </Field>
            <Field label="Forma de pagamento">
              <select className="input" name="method" defaultValue="pix">
                <option value="pix">PIX</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="transferencia">Transferência</option>
                <option value="cartao">Cartão</option>
                <option value="boleto">Boleto</option>
                <option value="outro">Outro</option>
              </select>
            </Field>
          </div>
          <p className="mt-4 text-[12px] leading-relaxed text-muted">
            Ao confirmar, uma única saída será registrada no caixa e o saldo será atualizado.
          </p>
          <div className="mt-6">
            <Submit className="btn btn-primary w-full">Confirmar pagamento</Submit>
          </div>
        </ActionForm>
      )}
    </ModalButton>
  );
}

/* ====================== ESTORNO ====================== */

export function RevertModal({
  kind, id, title, amount,
}: {
  kind: "pagamento" | "custo" | "despesa"; id: number; title: string; amount: number;
}) {
  const action = kind === "pagamento" ? revertPaymentAction : kind === "custo" ? revertCostPaymentAction : revertExpensePaymentAction;
  const key = kind === "pagamento" ? "paymentId" : "id";
  return (
    <ModalButton
      label={<span className="inline-flex items-center gap-1.5"><Undo2 size={13} />Estornar</span>}
      title="Estornar lançamento"
      className="btn btn-ghost !px-3 !py-2 !text-[12px]"
    >
      {(close) => (
        <ActionForm action={action} onSuccess={close}>
          <input type="hidden" name={key} value={id} />
          <div className="mb-4 rounded-2xl bg-warn-soft px-4 py-3.5 text-[13px] text-ink-soft">
            <strong>{title}</strong> — {(amount / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            <p className="mt-1.5 text-[12px]">
              O estorno preserva o histórico original e cria uma movimentação contrária no caixa. Nada é apagado.
            </p>
          </div>
          <Field label="Motivo do estorno">
            <input className="input" name="reason" placeholder="Ex.: valor lançado a maior" required />
          </Field>
          <div className="mt-6">
            <Submit className="btn btn-primary w-full">Confirmar estorno</Submit>
          </div>
        </ActionForm>
      )}
    </ModalButton>
  );
}

/* ====================== CUSTO (criar/editar) ====================== */

export function CostModal({
  projects, categories, defaultProjectId, className = "btn btn-ghost", label = "Custo",
  title = "Adicionar custo", defaultOpen,
}: {
  projects: ProjectOpt[]; categories: CategoryOpt[]; defaultProjectId?: number;
  className?: string; label?: React.ReactNode; title?: string; defaultOpen?: boolean;
}) {
  return (
    <ModalButton
      label={<span className="inline-flex items-center gap-1.5"><Plus size={15} />{label}</span>}
      title={title}
      className={className}
      defaultOpen={defaultOpen}
    >
      {(close) => (
        <ActionForm action={createCostAction} onSuccess={close}>
          <div className="space-y-4">
            <Field label="Projeto / obra">
              <select className="input" name="projectId" defaultValue={defaultProjectId ?? ""} required>
                <option value="" disabled>Selecione o projeto</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.clientName} — {p.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Descrição">
              <input className="input" name="description" placeholder="Ex.: MDF 15mm branco" required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Categoria">
                <select className="input" name="categoryId">
                  <option value="">Sem categoria</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Valor">
                <MoneyInput name="amount" required />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Status">
                <select className="input" name="status" defaultValue="pendente">
                  <option value="pendente">A pagar</option>
                  <option value="pago">Já pago</option>
                </select>
              </Field>
              <Field label="Vencimento (opcional)">
                <input className="input" type="date" name="dueDate" />
              </Field>
            </div>
            <p className="text-[12px] leading-relaxed text-muted">
              Custos &ldquo;a pagar&rdquo; entram no custo do projeto e reduzem o lucro previsto, mas não saem do caixa até serem pagos.
            </p>
          </div>
          <div className="mt-6 flex gap-2">
            <Submit className="btn btn-primary flex-1">Salvar custo</Submit>
          </div>
        </ActionForm>
      )}
    </ModalButton>
  );
}

export function EditCostModal({
  cost, categories,
}: {
  cost: { id: number; description: string; categoryId: number | null; amountCents: number; dueDate: string | null; paid: boolean };
  categories: CategoryOpt[];
}) {
  return (
    <ModalButton
      label={<span className="inline-flex items-center gap-1.5"><Edit3 size={13} />Editar</span>}
      title="Editar custo"
      className="btn btn-ghost !px-3 !py-2 !text-[12px]"
    >
      {(close) => (
        <ActionForm action={updateCostAction} onSuccess={close}>
          <input type="hidden" name="id" value={cost.id} />
          <div className="space-y-4">
            <Field label="Descrição">
              <input className="input" name="description" defaultValue={cost.description} required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Categoria">
                <select className="input" name="categoryId" defaultValue={cost.categoryId ?? ""}>
                  <option value="">Sem categoria</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Valor">
                <MoneyInput name="amount" defaultValue={centsToInput(cost.amountCents)} required />
              </Field>
            </div>
            <Field label="Vencimento">
              <input className="input" type="date" name="dueDate" defaultValue={cost.dueDate ?? ""} />
            </Field>
            {cost.paid ? (
              <p className="rounded-xl bg-warn-soft px-3.5 py-3 text-[12px] text-ink-soft">
                Este custo já movimentou o caixa. A movimentação existente será <strong>atualizada</strong>, nunca duplicada.
              </p>
            ) : null}
          </div>
          <div className="mt-6"><Submit className="btn btn-primary w-full">Salvar alterações</Submit></div>
        </ActionForm>
      )}
    </ModalButton>
  );
}

/* ====================== RECEBÍVEL AVULSO ====================== */

export function ReceivableModal({ projects, defaultProjectId }: { projects: ProjectOpt[]; defaultProjectId?: number }) {
  return (
    <ModalButton label={<span className="inline-flex items-center gap-1.5"><Plus size={15} />Recebível</span>} title="Novo valor a receber" className="btn btn-primary">
      {(close) => (
        <ActionForm action={createReceivableAction} onSuccess={close}>
          <div className="space-y-4">
            <Field label="Projeto (opcional)">
              <select className="input" name="projectId" defaultValue={defaultProjectId ?? ""}>
                <option value="">Sem projeto vinculado</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.clientName} — {p.name}</option>)}
              </select>
            </Field>
            <Field label="Cliente (se sem projeto)">
              <input className="input" name="clientName" placeholder="Nome do cliente" />
            </Field>
            <Field label="Descrição">
              <input className="input" name="description" placeholder="Ex.: Saldo da entrega" required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Valor">
                <MoneyInput name="amount" required />
              </Field>
              <Field label="Condição">
                <select className="input" name="condition" defaultValue="data">
                  <option value="data">Data definida</option>
                  <option value="na_entrega">Na entrega</option>
                </select>
              </Field>
            </div>
            <Field label="Vencimento (se data definida)">
              <input className="input" type="date" name="dueDate" />
            </Field>
          </div>
          <div className="mt-6"><Submit className="btn btn-primary w-full">Salvar recebível</Submit></div>
        </ActionForm>
      )}
    </ModalButton>
  );
}

/* ====================== DESPESAS ====================== */

export function ExpenseModal({ categories, defaultOpen }: { categories: CategoryOpt[]; defaultOpen?: boolean }) {
  const [type, setType] = useState<"unica" | "recorrente" | "parcelada">("unica");
  const createAction = type === "unica" ? createExpenseAction : type === "recorrente" ? createRecurringAction : createInstallmentPlanAction;
  return (
    <ModalButton label={<span className="inline-flex items-center gap-1.5"><Plus size={15} />Despesa</span>} title="Nova despesa" className="btn btn-primary" defaultOpen={defaultOpen}>
      {(close) => (
        <div>
          <div className="mb-5 grid grid-cols-3 gap-1 rounded-2xl bg-paper p-1">
            {(["unica", "recorrente", "parcelada"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`rounded-xl py-2 text-[12.5px] font-semibold capitalize transition-colors ${
                  type === t ? "bg-ink text-white" : "text-ink-soft"
                }`}
              >
                {t === "unica" ? "Única" : t === "recorrente" ? "Recorrente" : "Parcelada"}
              </button>
            ))}
          </div>

          <ActionForm key={type} action={createAction} onSuccess={close}>
            <div className="space-y-4">
              <Field label="Descrição">
                <input className="input" name="description" placeholder={type === "parcelada" ? "Ex.: Máquina seccionadora" : type === "recorrente" ? "Ex.: Aluguel do galpão" : "Ex.: Manutenção extraordinária"} required />
              </Field>
              <Field label="Categoria">
                <select className="input" name="categoryId">
                  <option value="">Sem categoria</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>

              {type === "unica" ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Valor"><MoneyInput name="amount" required /></Field>
                    <Field label="Vencimento"><input className="input" type="date" name="dueDate" defaultValue={todayISO()} required /></Field>
                  </div>
                  <Field label="Status">
                    <select className="input" name="status" defaultValue="pendente">
                      <option value="pendente">A pagar</option>
                      <option value="paga">Já paga</option>
                    </select>
                  </Field>
                </>
              ) : null}

              {type === "recorrente" ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Valor mensal"><MoneyInput name="amount" required /></Field>
                    <Field label="Dia do vencimento"><input className="input num" name="dueDay" inputMode="numeric" placeholder="10" min={1} max={31} required /></Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Início"><input className="input" type="date" name="startDate" defaultValue={todayISO()} required /></Field>
                    <Field label="Fim (opcional)"><input className="input" type="date" name="endDate" /></Field>
                  </div>
                  <p className="text-[12px] text-muted">Enquanto ativa, a competência de cada mês é gerada automaticamente e aparece em contas a pagar e na projeção.</p>
                </>
              ) : null}

              {type === "parcelada" ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Valor da parcela"><MoneyInput name="installmentAmount" required /></Field>
                    <Field label="Nº de parcelas"><input className="input num" name="totalInstallments" inputMode="numeric" placeholder="12" required /></Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="1ª parcela em"><input className="input" type="date" name="firstDate" defaultValue={todayISO()} required /></Field>
                    <Field label="Já pagas (opcional)"><input className="input num" name="markPaidUntil" inputMode="numeric" placeholder="0" /></Field>
                  </div>
                  <p className="text-[12px] text-muted">O sistema gera exatamente o número de parcelas informado — nunca uma a mais. Ao quitar a última, o parcelamento é encerrado.</p>
                </>
              ) : null}
            </div>
            <div className="mt-6"><Submit className="btn btn-primary w-full">Salvar despesa</Submit></div>
          </ActionForm>
        </div>
      )}
    </ModalButton>
  );
}

export function EditExpenseModal({
  expense, categories,
}: {
  expense: { id: number; description: string; categoryId: number | null; amountCents: number; dueDate: string; paid: boolean };
  categories: CategoryOpt[];
}) {
  return (
    <ModalButton label={<span className="inline-flex items-center gap-1.5"><Edit3 size={13} />Editar</span>} title="Editar despesa" className="btn btn-ghost !px-3 !py-2 !text-[12px]">
      {(close) => (
        <ActionForm action={updateExpenseAction} onSuccess={close}>
          <input type="hidden" name="id" value={expense.id} />
          <div className="space-y-4">
            <Field label="Descrição"><input className="input" name="description" defaultValue={expense.description} required /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Categoria">
                <select className="input" name="categoryId" defaultValue={expense.categoryId ?? ""}>
                  <option value="">Sem categoria</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Valor"><MoneyInput name="amount" defaultValue={centsToInput(expense.amountCents)} required /></Field>
            </div>
            <Field label="Vencimento"><input className="input" type="date" name="dueDate" defaultValue={expense.dueDate} /></Field>
            {expense.paid ? (
              <p className="rounded-xl bg-warn-soft px-3.5 py-3 text-[12px] text-ink-soft">
                Esta despesa já movimentou o caixa. A movimentação será <strong>atualizada</strong>, nunca duplicada.
              </p>
            ) : null}
          </div>
          <div className="mt-6"><Submit className="btn btn-primary w-full">Salvar alterações</Submit></div>
        </ActionForm>
      )}
    </ModalButton>
  );
}

/** Alterar valor de competência recorrente: esta vs desta em diante */
export function RecurringAmountModal({ expenseId, currentAmount, description }: {
  expenseId: number; currentAmount: number; description: string;
}) {
  return (
    <ModalButton label={<span className="inline-flex items-center gap-1.5"><Edit3 size={13} />Alterar valor</span>} title="Alterar valor da recorrência" className="btn btn-ghost !px-3 !py-2 !text-[12px]">
      {(close) => (
        <ActionForm action={updateRecurringAmountAction} onSuccess={close}>
          <input type="hidden" name="expenseId" value={expenseId} />
          <p className="mb-4 text-[13px] text-ink-soft"><strong>{description}</strong></p>
          <div className="space-y-4">
            <Field label="Novo valor"><MoneyInput name="amount" defaultValue={centsToInput(currentAmount)} required /></Field>
            <Field label="Aplicar alteração">
              <div className="space-y-2">
                <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-line px-3.5 py-3 text-[13.5px] font-medium">
                  <input type="radio" name="scope" value="single" defaultChecked /> Somente esta competência
                </label>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-line px-3.5 py-3 text-[13.5px] font-medium">
                  <input type="radio" name="scope" value="forward" /> Desta competência em diante
                </label>
              </div>
            </Field>
            <p className="text-[12px] text-muted">Meses anteriores nunca são alterados automaticamente.</p>
          </div>
          <div className="mt-6"><Submit className="btn btn-primary w-full">Confirmar alteração</Submit></div>
        </ActionForm>
      )}
    </ModalButton>
  );
}

/* ====================== GENÉRICOS ====================== */

export function CancelButton({ kind, id, label = "Cancelar" }: { kind: "recebivel" | "custo" | "despesa"; id: number; label?: string }) {
  const action = kind === "recebivel" ? cancelReceivableAction : kind === "custo" ? cancelCostAction : cancelExpenseAction;
  return (
    <ConfirmForm action={action} message="Cancelar este lançamento? Registros financeiros não são apagados, ficam marcados como cancelados.">
      <input type="hidden" name="id" value={id} />
      <button className="btn btn-ghost !px-3 !py-2 !text-[12px] text-danger">
        <Ban size={13} />{label}
      </button>
    </ConfirmForm>
  );
}

export function CloseRecurringButton({ id }: { id: number }) {
  return (
    <ConfirmForm action={closeRecurringAction} message="Encerrar esta recorrência? Ela deixará de gerar competências futuras.">
      <input type="hidden" name="id" value={id} />
      <button className="btn btn-ghost !px-3 !py-2 !text-[12px]">Encerrar</button>
    </ConfirmForm>
  );
}

export function AdjustBalanceModal() {
  return (
    <ModalButton label={<span className="inline-flex items-center gap-1.5"><Plus size={15} />Ajustar saldo</span>} title="Ajuste de saldo" className="btn btn-ghost">
      {(close) => (
        <ActionForm action={adjustBalanceAction} onSuccess={close}>
          <div className="space-y-4">
            <Field label="Valor do ajuste" hint="Use valor negativo para reduzir o caixa. Ex.: -350,00">
              <input className="input num text-[16px] font-semibold" name="amount" placeholder="-0,00" inputMode="decimal" autoComplete="off" required />
            </Field>
            <Field label="Motivo (obrigatório)">
              <input className="input" name="reason" placeholder="Ex.: conferência do cheque especial" required />
            </Field>
            <p className="text-[12px] text-muted">O ajuste fica registrado no fluxo de caixa com motivo e data, mantendo o histórico auditável.</p>
          </div>
          <div className="mt-6"><Submit className="btn btn-primary w-full">Registrar ajuste</Submit></div>
        </ActionForm>
      )}
    </ModalButton>
  );
}

export function UploadButton({ sourceType, sourceId }: { sourceType: string; sourceId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <label className={`btn btn-ghost cursor-pointer ${busy ? "opacity-60" : ""}`}>
      {busy ? <UploadCloud size={15} className="animate-pulse" /> : <Paperclip size={15} />}
      {busy ? "Enviando…" : "Anexar arquivo"}
      <input
        type="file"
        className="hidden"
        accept="image/*,application/pdf"
        disabled={busy}
        onChange={async (e) => {
          const file = e.currentTarget.files?.[0];
          if (!file) return;
          setBusy(true);
          const fd = new FormData();
          fd.set("file", file);
          fd.set("sourceType", sourceType);
          fd.set("sourceId", String(sourceId));
          const res = await uploadAttachmentAction(fd);
          if (!res.ok && res.error) window.alert(res.error);
          setBusy(false);
          e.currentTarget.value = "";
          router.refresh();
        }}
      />
    </label>
  );
}

export function DemoSeedButton() {
  return (
    <ConfirmForm action={seedDemoAction} message="Carregar dados de demonstração (projeto Carlinhos + despesas base)?">
      <button className="btn btn-ghost w-full justify-start">
        <span className="text-brand-deep">Carregar dados de demonstração</span>
      </button>
    </ConfirmForm>
  );
}

export function StatusSelect({ id, current }: { id: number; current: string }) {
  const router = useRouter();
  return (
    <select
      className="input !w-auto !py-2.5 text-[13px] font-semibold"
      value={current}
      onChange={async (e) => {
        const fd = new FormData();
        fd.set("id", String(id));
        fd.set("status", e.currentTarget.value);
        await updateProjectStatusAction(fd);
        router.refresh();
      }}
    >
      {Object.entries(PROJECT_STATUS).map(([k, v]) => (
        <option key={k} value={k}>{v}</option>
      ))}
    </select>
  );
}
