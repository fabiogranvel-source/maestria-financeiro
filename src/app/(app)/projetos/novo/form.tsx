"use client";

import { useState } from "react";
import { createProjectAction } from "@/lib/actions";
import { Submit, MoneyInput, Field } from "@/components/client";
import { todayISO } from "@/lib/dates";

export function NewProjectForm() {
  const [mode, setMode] = useState("na_entrega");
  const [entryReceived, setEntryReceived] = useState("1");

  return (
    <form action={async (fd) => { await createProjectAction(fd); }} className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Cliente">
          <input className="input" name="clientName" placeholder="Ex.: Carlinhos" required autoFocus autoComplete="off" />
        </Field>
        <Field label="Descrição / nome do projeto">
          <input className="input" name="name" placeholder="Ex.: Cozinha planejada" required />
        </Field>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Data da venda">
          <input className="input" type="date" name="saleDate" defaultValue={todayISO()} required />
        </Field>
        <Field label="Previsão de entrega (opcional)">
          <input className="input" type="date" name="expectedDelivery" />
        </Field>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Valor total da venda">
          <MoneyInput name="saleAmount" required />
        </Field>
        <Field label="Valor da entrada">
          <MoneyInput name="entryAmount" placeholder="0,00" />
        </Field>
      </div>

      <Field label="Entrada já recebida?">
        <div className="grid grid-cols-2 gap-2">
          {[["1", "Sim, já recebi"], ["0", "Não, a receber"]].map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setEntryReceived(v)}
              className={`rounded-xl border px-3 py-3 text-[13.5px] font-semibold transition-colors ${
                entryReceived === v ? "border-brand bg-brand-soft text-brand-deep" : "border-line text-ink-soft hover:bg-paper"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <input type="hidden" name="entryReceived" value={entryReceived} />
      </Field>

      <Field label="Forma de recebimento do saldo">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {[
            ["na_entrega", "Na entrega"],
            ["data_definida", "Data definida"],
            ["parcelado", "Parcelado"],
            ["a_definir", "A definir"],
          ].map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setMode(v)}
              className={`rounded-xl border px-3 py-3 text-[13px] font-semibold transition-colors ${
                mode === v ? "border-ink bg-ink text-white" : "border-line text-ink-soft hover:bg-paper"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <input type="hidden" name="balanceMode" value={mode} />
      </Field>

      {mode === "data_definida" ? (
        <Field label="Data prevista para o saldo">
          <input className="input" type="date" name="balanceDueDate" />
        </Field>
      ) : null}

      {mode === "parcelado" ? (
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Quantidade de parcelas">
            <input className="input num" name="balanceInstallments" inputMode="numeric" placeholder="3" />
          </Field>
          <Field label="Primeira parcela em">
            <input className="input" type="date" name="balanceFirstDate" />
          </Field>
        </div>
      ) : null}

      <Field label="Observações (opcional)">
        <textarea className="input min-h-[84px] resize-none" name="notes" placeholder="Detalhes da negociação, condições especiais…" />
      </Field>

      {mode === "na_entrega" ? (
        <p className="rounded-2xl bg-brand-soft px-4 py-3.5 text-[12.5px] leading-relaxed text-brand-deep">
          O saldo ficará registrado como obrigação <strong>&ldquo;na entrega&rdquo;</strong>: entra no &ldquo;a receber&rdquo;, mas
          <strong> nunca aparece como atrasado</strong> enquanto não houver uma data vencida.
        </p>
      ) : null}

      <div className="pt-2">
        <Submit className="btn btn-primary w-full !py-3.5 text-[15px]">Criar projeto</Submit>
        <p className="mt-3 text-center text-[12px] text-muted">
          Recebíveis de entrada e saldo são gerados automaticamente.
        </p>
      </div>
    </form>
  );
}
