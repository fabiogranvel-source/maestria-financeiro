"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { loginAction, setupAction, type ActionResult } from "@/lib/actions";
import { MoneyInput } from "@/components/client";

function SubmitBtn({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn w-full bg-white text-ink hover:bg-white/90">
      {pending ? <Loader2 size={16} className="animate-spin" /> : null}
      {pending ? "Entrando…" : label}
    </button>
  );
}

function ErrorMsg({ state }: { state: ActionResult | null }) {
  if (!state || state.ok || !state.error) return null;
  return (
    <div className="rounded-xl bg-red-500/15 px-4 py-3 text-[13px] font-semibold text-red-200">
      {state.error}
    </div>
  );
}

export function LoginForm() {
  const [state, action] = useActionState(loginAction, null);
  return (
    <form action={action} className="space-y-4">
      <div>
        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-white/50">E-mail</span>
        <input className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3.5 text-[15px] text-white outline-none transition-colors placeholder:text-white/30 focus:border-gold/70" type="email" name="email" placeholder="voce@maestria.com" required autoFocus />
      </div>
      <div>
        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-white/50">Senha</span>
        <input className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3.5 text-[15px] text-white outline-none transition-colors placeholder:text-white/30 focus:border-gold/70" type="password" name="password" placeholder="••••••••" required />
      </div>
      <ErrorMsg state={state} />
      <SubmitBtn label="Entrar" />
    </form>
  );
}

export function SetupForm() {
  const [state, action] = useActionState(setupAction, null);
  return (
    <form action={action} className="space-y-4">
      <div>
        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-white/50">Seu nome</span>
        <input className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3.5 text-[15px] text-white outline-none transition-colors placeholder:text-white/30 focus:border-gold/70" name="name" placeholder="Proprietário" required />
      </div>
      <div>
        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-white/50">E-mail</span>
        <input className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3.5 text-[15px] text-white outline-none transition-colors placeholder:text-white/30 focus:border-gold/70" type="email" name="email" placeholder="voce@maestria.com" required />
      </div>
      <div>
        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-white/50">Senha</span>
        <input className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3.5 text-[15px] text-white outline-none transition-colors placeholder:text-white/30 focus:border-gold/70" type="password" name="password" placeholder="mínimo 6 caracteres" required />
      </div>
      <div>
        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-white/50">Saldo inicial da empresa</span>
        <div className="[&_.input]:!border-white/15 [&_.input]:!bg-white/5 [&_.input]:!text-white [&_span]:!text-white/40">
          <MoneyInput name="initialBalance" placeholder="0,00" />
        </div>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-white/40">
          Base do fluxo de caixa. Depois só pode ser alterado por ajustes registrados, mantendo o histórico.
        </p>
      </div>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3.5">
        <input type="checkbox" name="demo" value="1" className="mt-0.5" defaultChecked />
        <span className="text-[13px] leading-relaxed text-white/70">
          <strong className="text-white">Carregar dados de demonstração</strong> — projeto Carlinhos (caso de teste oficial) e as despesas base da empresa, para explorar o sistema com números reais.
        </span>
      </label>
      <ErrorMsg state={state} />
      <SubmitBtn label="Criar conta e começar" />
    </form>
  );
}
