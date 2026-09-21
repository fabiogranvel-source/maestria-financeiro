"use client";

import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

export function TabsLinks({ aba }: { aba: string }) {
  const router = useRouter();
  const tabs = [
    { key: "receber", label: "A receber", icon: ArrowDownLeft },
    { key: "pagar", label: "A pagar", icon: ArrowUpRight },
  ];
  return (
    <div className="print-hidden mb-5 grid grid-cols-2 gap-1 rounded-2xl border border-line bg-card p-1 shadow-card">
      {tabs.map((t) => {
        const Icon = t.icon;
        const active = aba === t.key;
        return (
          <button
            key={t.key}
            onClick={() => router.push(`/contas?aba=${t.key}`)}
            className={`flex items-center justify-center gap-2 rounded-xl py-3 text-[13.5px] font-semibold transition-all ${
              active ? "bg-ink text-white" : "text-ink-soft hover:bg-paper"
            }`}
          >
            <Icon size={15} strokeWidth={2.2} />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
