import { redirect } from "next/navigation";
import { hasAnyUser, getSessionUser } from "@/lib/auth";
import { LoginForm } from "../auth-forms";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!(await hasAnyUser())) redirect("/setup");
  const user = await getSessionUser();
  if (user) redirect("/");

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-sidebar px-5 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full opacity-[0.14]"
        style={{ background: "radial-gradient(closest-side, #b98c45, transparent)" }}
      />
      <div className="anim-fade-up relative w-full max-w-[400px]">
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold font-display text-[24px] font-bold text-ink shadow-pop">
            M
          </div>
          <h1 className="mt-5 font-display text-[19px] font-bold tracking-[0.22em] text-white">MAESTRIA</h1>
          <p className="mt-1.5 text-[11px] font-semibold tracking-[0.34em] text-white/45">FINANCEIRO</p>
          <p className="mt-6 max-w-[280px] text-[13px] leading-relaxed text-white/40">
            Gestão financeira interna de móveis planejados. Acesse sua conta para continuar.
          </p>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-6 backdrop-blur">
          <LoginForm />
        </div>
        <p className="mt-8 text-center text-[11px] text-white/25">
          Dados protegidos por autenticação. Acesso restrito à empresa.
        </p>
      </div>
    </div>
  );
}
