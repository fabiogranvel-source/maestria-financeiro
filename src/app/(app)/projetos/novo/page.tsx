import { PageHeader, Card } from "@/components/ui";
import { NewProjectForm } from "./form";

export const dynamic = "force-dynamic";

export default function NovoProjetoPage() {
  return (
    <div className="max-w-[720px]">
      <PageHeader title="Novo Projeto" sub="Cadastre a venda, a entrada e como o saldo será recebido" />
      <Card className="anim-fade-up p-5 md:p-7">
        <NewProjectForm />
      </Card>
    </div>
  );
}
