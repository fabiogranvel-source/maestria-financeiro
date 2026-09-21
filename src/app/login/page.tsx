"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Falha no login");
      router.replace("/");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha no login");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-emerald-950 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-3xl font-black tracking-tight text-white">MAESTRIA</p>
          <p className="mt-1 text-xs font-bold uppercase tracking-[0.4em] text-amber-400">Financeiro</p>
          <p className="mt-3 text-sm text-emerald-100/70">Gestão financeira da marcenaria</p>
        </div>
        <form onSubmit={submit} className="rounded-3xl bg-white p-6 shadow-2xl">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-stone-700">E-mail</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@empresa.com"
              autoComplete="username"
              className="min-h-[48px] w-full rounded-xl border border-stone-200 px-4 py-3 text-[15px] outline-none focus:border-emerald-800 focus:ring-2 focus:ring-emerald-900/10"
            />
          </label>
          <label className="mt-4 block">
            <span className="mb-1.5 block text-[13px] font-semibold text-stone-700">Senha</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="min-h-[48px] w-full rounded-xl border border-stone-200 px-4 py-3 text-[15px] outline-none focus:border-emerald-800 focus:ring-2 focus:ring-emerald-900/10"
            />
          </label>
          {err && (
            <p className="mt-3 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700">{err}</p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="mt-5 min-h-[50px] w-full rounded-xl bg-emerald-950 text-[15px] font-bold text-white transition hover:bg-emerald-900 active:scale-[0.99] disabled:opacity-60"
          >
            {busy ? "Entrando…" : "Entrar"}
          </button>
          <p className="mt-4 text-center text-xs leading-relaxed text-stone-400">
            Acesso inicial: admin@maestria.local
            <br />
            Senha inicial: maestria123
          </p>
        </form>
        <p className="mt-6 text-center text-xs text-emerald-100/50">
          Venda ≠ Recebimento ≠ Lucro ≠ Caixa
        </p>
      </div>
    </div>
  );
}
