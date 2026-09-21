import { redirect } from "next/navigation";
import { hasAnyUser } from "@/lib/auth";
import { SetupForm } from "../auth-forms";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await hasAnyUser()) redirect("/login");

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-sidebar px-5 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full opacity-[0.14]"
        style={{ background: "radial-gradient(closest-side, #b98c45, transparent)" }}
      />
      <div className="anim-fade-up relative w-full max-w-[420px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold font-display text-[24px] font-bold text-ink shadow-pop">
            M
          </div>
          <h1 className="mt-5 font-display text-[19px] font-bold tracking-[0.22em] text-white">MAESTRIA FINANCEIRO</h1>
          <p className="mt-4 max-w-[300px] text-[13px] leading-relaxed text-white/40">
            Primeira configuração. Crie o usuário administrador e informe o saldo inicial da empresa.
          </p>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-6 backdrop-blur">
          <SetupForm />
        </div>
      </div>
    </div>
  );
}
