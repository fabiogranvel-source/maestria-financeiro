import Link from "next/link";
import { Card, PageHeader, Label } from "@/components/ui";
import { AdjustBalanceModal, DemoSeedButton } from "@/components/modals";
import { logoutAction } from "@/lib/actions";
import {
  Landmark, TrendingUp, CalendarCheck2, Tags, Search, LogOut, ChevronRight, FileDown,
} from "lucide-react";

export const dynamic = "force-dynamic";

const ITEMS = [
  { href: "/fluxo", label: "Fluxo de Caixa", desc: "Entradas e saídas realizadas", icon: Landmark },
  { href: "/projecao", label: "Projeção", desc: "Compromissos dos próximos meses", icon: TrendingUp },
  { href: "/fechamento", label: "Fechamento mensal", desc: "Resumo gerencial do mês", icon: CalendarCheck2 },
  { href: "/imprimir", label: "Relatório mensal (PDF)", desc: "Exportar resumo profissional", icon: FileDown },
  { href: "/categorias", label: "Categorias", desc: "Centros de custo editáveis", icon: Tags },
  { href: "/busca", label: "Busca global", desc: "Encontrar qualquer lançamento", icon: Search },
];

export default function MaisPage() {
  return (
    <div className="max-w-[640px]">
      <PageHeader title="Mais" sub="Ferramentas e configurações" />

      <Card className="anim-fade-up divide-y divide-line">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className="flex items-center gap-3.5 px-5 py-4 transition-colors hover:bg-paper/60">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand-deep">
                <Icon size={17} strokeWidth={2} />
              </span>
              <span className="flex-1">
                <span className="block text-[14.5px] font-semibold">{item.label}</span>
                <span className="block text-[12px] text-muted">{item.desc}</span>
              </span>
              <ChevronRight size={15} className="text-line-strong" />
            </Link>
          );
        })}
      </Card>

      <div className="mt-5 space-y-2">
        <Label>Ajustes e dados</Label>
        <Card className="space-y-2 p-4">
          <AdjustBalanceModal />
          <DemoSeedButton />
        </Card>
      </div>

      <form action={logoutAction} className="mt-5">
        <button className="btn btn-ghost w-full justify-start text-danger">
          <LogOut size={15} /> Sair da conta
        </button>
      </form>
    </div>
  );
}
