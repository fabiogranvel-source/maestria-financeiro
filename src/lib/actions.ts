"use server";

import { db } from "@/db";
import {
  users, sessions, settings, clients, categories, projects, receivables,
  payments, projectCosts, recurringRules, installmentPlans, expenses,
  cashTransactions, attachments, auditLogs,
} from "@/db/schema";
import { eq, and, desc, asc, isNull, sql as dsql, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createSession, destroySession, getSessionUser, hashPassword,
  verifyPassword, findUserByEmail, hasAnyUser,
} from "./auth";
import { parseBRLToCents } from "./money";
import { todayISO, safeDueDate, monthStartISO, monthEndISO, addMonthsISO } from "./dates";
import { getProjectTotals } from "./finance";
import { randomUUID } from "crypto";

export type ActionResult = { ok: boolean; error?: string; needsConfirm?: string; id?: number };

const ok = (extra?: Partial<ActionResult>): ActionResult => ({ ok: true, ...extra });
const fail = (error: string): ActionResult => ({ ok: false, error });

async function requireUserId(): Promise<number> {
  const s = await getSessionUser();
  if (!s) redirect("/login");
  return s.id;
}

async function audit(userId: number | null, action: string, entity: string, entityId: number | null, details?: string) {
  await db.insert(auditLogs).values({ userId, action, entity, entityId, details: details ?? null });
}

function revalidateAll() {
  revalidatePath("/", "layout");
}

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function money(fd: FormData, key: string): number {
  return parseBRLToCents(String(fd.get(key) ?? ""));
}

const METHODS = ["pix", "dinheiro", "transferencia", "cartao", "boleto", "outro"] as const;
type Method = (typeof METHODS)[number];
function method(fd: FormData, key = "method"): Method {
  const m = str(fd, key);
  return (METHODS as readonly string[]).includes(m) ? (m as Method) : "pix";
}

/* ============================ AUTENTICAÇÃO ============================ */

export async function loginAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const email = str(formData, "email").toLowerCase();
  const password = str(formData, "password");
  if (!email || !password) return fail("Informe e-mail e senha.");
  const user = await findUserByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return fail("E-mail ou senha incorretos.");
  }
  await createSession(user.id);
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

const DEFAULT_CATEGORIES: { name: string; kind: string }[] = [
  { name: "MDF", kind: "custo" },
  { name: "Ferragens", kind: "custo" },
  { name: "Borda", kind: "custo" },
  { name: "Montagem", kind: "custo" },
  { name: "Terceiros", kind: "custo" },
  { name: "Instalação", kind: "custo" },
  { name: "Vidros", kind: "custo" },
  { name: "Pedras", kind: "custo" },
  { name: "Frete", kind: "ambos" },
  { name: "Funcionários", kind: "despesa" },
  { name: "Pró-labore", kind: "despesa" },
  { name: "Aluguel", kind: "despesa" },
  { name: "Impostos/CNPJ", kind: "despesa" },
  { name: "Contabilidade", kind: "despesa" },
  { name: "Máquinas", kind: "despesa" },
  { name: "Ferramentas", kind: "ambos" },
  { name: "Combustível", kind: "despesa" },
  { name: "Outros", kind: "ambos" },
];

export async function setupAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  if (await hasAnyUser()) return fail("O sistema já foi configurado.");
  const name = str(formData, "name");
  const email = str(formData, "email").toLowerCase();
  const password = str(formData, "password");
  const initialBalance = money(formData, "initialBalance");
  const withDemo = str(formData, "demo") === "1";
  if (!name) return fail("Informe seu nome.");
  if (!email.includes("@")) return fail("Informe um e-mail válido.");
  if (password.length < 6) return fail("A senha deve ter ao menos 6 caracteres.");

  const user = await db.transaction(async (tx) => {
    const [u] = await tx.insert(users).values({
      name, email, passwordHash: hashPassword(password), role: "admin",
    }).returning();

    const today = todayISO();
    await tx.insert(cashTransactions).values({
      type: "entrada",
      amountCents: initialBalance,
      date: today,
      description: "Saldo inicial da empresa",
      origin: "saldo_inicial",
      refLabel: "Configuração inicial",
      createdBy: u.id,
    });
    await tx.insert(settings).values([
      { key: "setup_done", value: "1" },
      { key: "initial_balance_cents", value: String(initialBalance) },
      { key: "initial_balance_date", value: today },
    ]);
    for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
      await tx.insert(categories).values({ ...DEFAULT_CATEGORIES[i], sortOrder: i });
    }
    await tx.insert(auditLogs).values({ userId: u.id, action: "setup", entity: "sistema", entityId: null, details: "Configuração inicial concluída" });
    return u;
  });

  await createSession(user.id);
  if (withDemo) {
    await seedDemoData(user.id);
  }
  redirect("/");
}

/* ====================== DADOS DE DEMONSTRAÇÃO ====================== */

async function findCategory(name: string): Promise<number | null> {
  const rows = await db.select({ id: categories.id }).from(categories).where(eq(categories.name, name)).limit(1);
  return rows[0]?.id ?? null;
}

export async function seedDemoAction(): Promise<ActionResult> {
  const userId = await requireUserId();
  await seedDemoData(userId);
  revalidateAll();
  return ok();
}

async function seedDemoData(userId: number) {
  const today = todayISO();
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));

  await db.transaction(async (tx) => {
    // ---- CASO CARLINHOS (teste obrigatório) ----
    const [client] = await tx.insert(clients).values({ name: "Carlinhos", createdBy: userId }).returning();
    const saleDate = safeDueDate(y, m, Math.max(1, Number(today.slice(8, 10)) - 2));
    const [project] = await tx.insert(projects).values({
      clientId: client.id,
      name: "Cozinha planejada",
      description: "Projeto teste",
      saleDate,
      saleAmountCents: 580000,
      balanceMode: "na_entrega",
      status: "em_producao",
      createdBy: userId,
    }).returning();

    // Entrada R$ 1.800 — já recebida
    const [entryRec] = await tx.insert(receivables).values({
      projectId: project.id, clientId: client.id,
      description: "Entrada — Cozinha planejada",
      amountCents: 180000, receivedAmountCents: 180000,
      dueDate: saleDate, condition: "data", status: "recebido",
      isEntry: true, origin: "projeto", createdBy: userId,
    }).returning();
    const [pay] = await tx.insert(payments).values({
      receivableId: entryRec.id, projectId: project.id, clientId: client.id,
      amountCents: 180000, date: saleDate, method: "pix", createdBy: userId,
    }).returning();
    const [cashIn] = await tx.insert(cashTransactions).values({
      type: "entrada", amountCents: 180000, date: saleDate,
      description: "Entrada — Cozinha planejada", origin: "recebimento", sourceId: pay.id,
      refLabel: "Carlinhos · Cozinha planejada", createdBy: userId,
    }).returning();
    await tx.update(payments).set({ cashTransactionId: cashIn.id }).where(eq(payments.id, pay.id));

    // Saldo R$ 4.000 — na entrega (sem data → nunca atrasado)
    await tx.insert(receivables).values({
      projectId: project.id, clientId: client.id,
      description: "Saldo na entrega — Cozinha planejada",
      amountCents: 400000, dueDate: null, condition: "na_entrega",
      status: "pendente", origin: "projeto", createdBy: userId,
    });

    // Custos: MDF e Ferragens pagos; demais a pagar
    const costDefs = [
      { description: "MDF 15mm branco", category: "MDF", value: 123800, paid: true },
      { description: "Ferragens (dobradiças/corrediças)", category: "Ferragens", value: 85000, paid: true },
      { description: "Fita de borda", category: "Borda", value: 12000, paid: false },
      { description: "Montagem", category: "Montagem", value: 20000, paid: false },
      { description: "Extras", category: "Outros", value: 15000, paid: false },
    ];
    for (const cd of costDefs) {
      const catId = await findCategory(cd.category);
      const [cost] = await tx.insert(projectCosts).values({
        projectId: project.id, description: cd.description, categoryId: catId,
        amountCents: cd.value,
        status: cd.paid ? "pago" : "pendente",
        dueDate: cd.paid ? saleDate : addMonthsISO(today, 0),
        paidDate: cd.paid ? saleDate : null,
        paymentMethod: cd.paid ? "pix" : null,
        createdBy: userId,
      }).returning();
      if (cd.paid) {
        const [cashOut] = await tx.insert(cashTransactions).values({
          type: "saida", amountCents: cd.value, date: saleDate,
          description: cd.description, origin: "custo", sourceId: cost.id,
          refLabel: "Carlinhos · Cozinha planejada", createdBy: userId,
        }).returning();
        await tx.update(projectCosts).set({ cashTransactionId: cashOut.id }).where(eq(projectCosts.id, cost.id));
      }
    }

    // ---- DESPESAS DA EMPRESA (V1 exemplos) ----
    const recDefs = [
      { description: "Aluguel do galpão", category: "Aluguel", value: 200000, dueDay: 10 },
      { description: "Contador", category: "Contabilidade", value: 25000, dueDay: 5 },
      { description: "CNPJ / tributos", category: "Impostos/CNPJ", value: 60000, dueDay: 20 },
      { description: "Funcionário", category: "Funcionários", value: 200000, dueDay: 5 },
      { description: "Pró-labore Sócio 1", category: "Pró-labore", value: 200000, dueDay: 5 },
      { description: "Pró-labore Sócio 2", category: "Pró-labore", value: 200000, dueDay: 5 },
    ];
    for (const rd of recDefs) {
      const catId = await findCategory(rd.category);
      const startDate = safeDueDate(y, m, 1);
      const [rule] = await tx.insert(recurringRules).values({
        description: rd.description, categoryId: catId, amountCents: rd.value,
        dueDay: rd.dueDay, startDate, status: "ativa", createdBy: userId,
      }).returning();
      const due = safeDueDate(y, m, rd.dueDay);
      const paid = due <= today;
      const [exp] = await tx.insert(expenses).values({
        description: rd.description, categoryId: catId, amountCents: rd.value,
        type: "recorrente", status: paid ? "paga" : "pendente",
        dueDate: due, paidDate: paid ? due : null, paymentMethod: paid ? "pix" : null,
        recurringRuleId: rule.id, createdBy: userId,
      }).returning();
      if (paid) {
        const [cashE] = await tx.insert(cashTransactions).values({
          type: "saida", amountCents: rd.value, date: due,
          description: rd.description, origin: "despesa", sourceId: exp.id,
          refLabel: "Despesa recorrente", createdBy: userId,
        }).returning();
        await tx.update(expenses).set({ cashTransactionId: cashE.id }).where(eq(expenses.id, exp.id));
      }
    }

    // Máquina — 12 × R$ 580 (primeira parcela paga no mês atual)
    const maqCat = await findCategory("Máquinas");
    const [plan] = await tx.insert(installmentPlans).values({
      description: "Máquina seccionadora", categoryId: maqCat,
      installmentAmountCents: 58000, totalInstallments: 12,
      firstInstallmentNumber: 1, firstDate: safeDueDate(y, m, 15),
      status: "ativo", createdBy: userId,
    }).returning();
    for (let n = 1; n <= 12; n++) {
      const due = addMonthsISO(safeDueDate(y, m, 15), n - 1);
      const paid = due <= today;
      const [exp] = await tx.insert(expenses).values({
        description: "Máquina seccionadora", categoryId: maqCat, amountCents: 58000,
        type: "parcelada", status: paid ? "paga" : "pendente",
        dueDate: due, paidDate: paid ? due : null, paymentMethod: paid ? "pix" : null,
        installmentPlanId: plan.id, installmentNumber: n, installmentTotal: 12,
        createdBy: userId,
      }).returning();
      if (paid) {
        const [cashI] = await tx.insert(cashTransactions).values({
          type: "saida", amountCents: 58000, date: due,
          description: `Máquina seccionadora — parcela ${n}/12`, origin: "despesa", sourceId: exp.id,
          refLabel: "Parcelamento", createdBy: userId,
        }).returning();
        await tx.update(expenses).set({ cashTransactionId: cashI.id }).where(eq(expenses.id, exp.id));
      }
    }

    // Despesa única
    const outrosCat = await findCategory("Outros");
    await tx.insert(expenses).values({
      description: "Materiais de consumo / extras", categoryId: outrosCat,
      amountCents: 80000, type: "unica", status: "pendente",
      dueDate: safeDueDate(y, m, 28), createdBy: userId,
    });

    await tx.insert(auditLogs).values({
      userId, action: "seed_demo", entity: "sistema", entityId: null,
      details: "Dados de demonstração carregados (caso Carlinhos + despesas base)",
    });
  });
}

/* ============================ CATEGORIAS ============================ */

export async function createCategoryAction(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const name = str(formData, "name");
  const kind = str(formData, "kind") || "ambos";
  if (!name) return fail("Informe o nome da categoria.");
  await db.insert(categories).values({ name, kind, createdAt: new Date() });
  await audit(userId, "criar", "categoria", null, name);
  revalidateAll();
  return ok();
}

export async function archiveCategoryAction(formData: FormData): Promise<ActionResult> {
  await requireUserId();
  const id = Number(formData.get("id"));
  await db.update(categories).set({ archivedAt: new Date() }).where(eq(categories.id, id));
  revalidateAll();
  return ok();
}

/* ============================ PROJETOS ============================ */

type DbLike = Pick<typeof db, "select" | "insert">;

export async function getOrCreateClientId(tx: DbLike, name: string, userId: number): Promise<number> {
  const existing = await tx.select({ id: clients.id }).from(clients)
    .where(dsql`lower(${clients.name}) = lower(${name})`).limit(1);
  if (existing.length > 0) return existing[0].id;
  const [c] = await tx.insert(clients).values({ name, createdBy: userId }).returning();
  return c.id;
}

export async function createProjectAction(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const clientName = str(formData, "clientName");
  const name = str(formData, "name");
  const saleDate = str(formData, "saleDate") || todayISO();
  const saleAmount = money(formData, "saleAmount");
  const entryAmount = money(formData, "entryAmount");
  const entryReceived = str(formData, "entryReceived") === "1";
  const balanceMode = str(formData, "balanceMode") || "a_definir";
  const balanceDueDate = str(formData, "balanceDueDate");
  const balanceInstallments = Math.max(1, Number(str(formData, "balanceInstallments") || "1"));
  const balanceFirstDate = str(formData, "balanceFirstDate");
  const expectedDelivery = str(formData, "expectedDelivery");
  const notes = str(formData, "notes");

  if (!clientName) return fail("Informe o cliente.");
  if (!name) return fail("Informe o nome/descrição do projeto.");
  if (saleAmount <= 0) return fail("O valor da venda deve ser maior que zero.");
  if (entryAmount < 0) return fail("A entrada não pode ser negativa.");
  if (entryAmount > saleAmount) return fail("A entrada não pode ser maior que a venda.");
  if (balanceMode === "data_definida" && !balanceDueDate && saleAmount - entryAmount > 0) {
    return fail("Informe a data prevista para o saldo.");
  }

  const balance = saleAmount - entryAmount;

  const projectId = await db.transaction(async (tx) => {
    const clientId = await getOrCreateClientId(tx, clientName, userId);
    const [project] = await tx.insert(projects).values({
      clientId, name, description: str(formData, "description") || null,
      saleDate, saleAmountCents: saleAmount,
      balanceMode: balanceMode as "na_entrega" | "data_definida" | "parcelado" | "a_definir",
      expectedDelivery: expectedDelivery || null,
      notes: notes || null, status: "aprovado", createdBy: userId,
    }).returning();

    // Recebível: entrada
    if (entryAmount > 0) {
      const [rec] = await tx.insert(receivables).values({
        projectId: project.id, clientId,
        description: `Entrada — ${name}`,
        amountCents: entryAmount,
        receivedAmountCents: entryReceived ? entryAmount : 0,
        dueDate: saleDate, condition: "data",
        status: entryReceived ? "recebido" : "pendente",
        isEntry: true, origin: "projeto", createdBy: userId,
      }).returning();

      if (entryReceived) {
        const [pay] = await tx.insert(payments).values({
          receivableId: rec.id, projectId: project.id, clientId,
          amountCents: entryAmount, date: saleDate, method: "pix", createdBy: userId,
        }).returning();
        const [ct] = await tx.insert(cashTransactions).values({
          type: "entrada", amountCents: entryAmount, date: saleDate,
          description: `Entrada — ${name}`, origin: "recebimento", sourceId: pay.id,
          refLabel: `${clientName} · ${name}`, createdBy: userId,
        }).returning();
        await tx.update(payments).set({ cashTransactionId: ct.id }).where(eq(payments.id, pay.id));
      }
    }

    // Recebível: saldo
    if (balance > 0) {
      if (balanceMode === "parcelado") {
        const n = balanceInstallments;
        const each = Math.floor(balance / n);
        let rest = balance;
        for (let i = 0; i < n; i++) {
          const value = i === n - 1 ? rest : each;
          rest -= value;
          await tx.insert(receivables).values({
            projectId: project.id, clientId,
            description: `Parcela ${i + 1}/${n} — ${name}`,
            amountCents: value,
            dueDate: balanceFirstDate ? addMonthsISO(balanceFirstDate, i) : null,
            condition: balanceFirstDate ? "data" : "a_definir",
            status: "pendente", installmentNumber: i + 1, installmentTotal: n,
            origin: "projeto", createdBy: userId,
          });
        }
      } else {
        await tx.insert(receivables).values({
          projectId: project.id, clientId,
          description: balanceMode === "na_entrega" ? `Saldo na entrega — ${name}` : `Saldo — ${name}`,
          amountCents: balance,
          dueDate: balanceMode === "data_definida" ? balanceDueDate : null,
          condition: balanceMode === "na_entrega" ? "na_entrega" : balanceMode === "data_definida" ? "data" : "a_definir",
          status: "pendente", origin: "projeto", createdBy: userId,
        });
      }
    }

    await tx.insert(auditLogs).values({ userId, action: "criar", entity: "projeto", entityId: project.id, details: `${clientName} · ${name}` });
    return project.id;
  });

  revalidateAll();
  redirect(`/projetos/${projectId}`);
}

export async function updateProjectStatusAction(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const id = Number(formData.get("id"));
  const status = str(formData, "status");
  await db.update(projects).set({ status: status as "aprovado", updatedAt: new Date() }).where(eq(projects.id, id));
  await audit(userId, "status", "projeto", id, status);
  revalidateAll();
  return ok();
}

export async function updateProjectAction(formData: FormData): Promise<ActionResult> {
  await requireUserId();
  const id = Number(formData.get("id"));
  const name = str(formData, "name");
  const saleAmount = money(formData, "saleAmount");
  if (!name) return fail("Informe o nome do projeto.");
  if (saleAmount <= 0) return fail("O valor da venda deve ser maior que zero.");
  await db.update(projects).set({
    name,
    description: str(formData, "description") || null,
    saleDate: str(formData, "saleDate") || undefined,
    saleAmountCents: saleAmount,
    expectedDelivery: str(formData, "expectedDelivery") || null,
    notes: str(formData, "notes") || null,
    updatedAt: new Date(),
  }).where(eq(projects.id, id));
  revalidateAll();
  return ok();
}

export async function archiveProjectAction(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const id = Number(formData.get("id"));
  await db.update(projects).set({ archivedAt: new Date(), updatedAt: new Date() }).where(eq(projects.id, id));
  await audit(userId, "arquivar", "projeto", id);
  revalidateAll();
  return ok();
}

/* ====================== RECEBIMENTOS (idempotente) ====================== */

export async function registerPaymentAction(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const receivableId = Number(formData.get("receivableId"));
  const amount = money(formData, "amount");
  const date = str(formData, "date") || todayISO();
  const payMethod = method(formData);
  const notes = str(formData, "notes");
  const confirmed = str(formData, "confirmed") === "1";

  if (amount <= 0) return fail("O valor recebido deve ser maior que zero.");

  const [rec] = await db.select().from(receivables).where(eq(receivables.id, receivableId)).limit(1);
  if (!rec) return fail("Recebível não encontrado.");
  if (rec.status === "cancelado") return fail("Este recebível está cancelado.");
  if (rec.status === "recebido") return fail("Este recebível já foi quitado.");

  let projectSale = 0;
  let projectReceived = 0;
  let projectLabel = "";
  if (rec.projectId) {
    const t = await getProjectTotals(rec.projectId);
    projectSale = t.sale;
    projectReceived = t.recebido;
    const [p] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, rec.projectId)).limit(1);
    projectLabel = p?.name ?? "";
  }
  const openBalance = rec.amountCents - rec.receivedAmountCents;
  const projectBalanceAfter = rec.projectId ? projectSale - projectReceived : openBalance;

  // Proteção: valor acima do saldo do projeto exige confirmação explícita
  if (!confirmed && rec.projectId && amount > projectBalanceAfter) {
    return {
      ok: false,
      needsConfirm: `O saldo deste projeto é ${(projectBalanceAfter / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} e você está registrando ${(amount / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}. Deseja continuar?`,
    };
  }

  try {
    await db.transaction(async (tx) => {
      let clientName = "";
      if (rec.clientId) {
        const [c] = await tx.select({ name: clients.name }).from(clients).where(eq(clients.id, rec.clientId)).limit(1);
        clientName = c?.name ?? "";
      }
      const [pay] = await tx.insert(payments).values({
        receivableId, projectId: rec.projectId, clientId: rec.clientId,
        amountCents: amount, date, method: payMethod, notes: notes || null, createdBy: userId,
      }).returning();

      // Entrada no caixa — índice único (recebimento, paymentId) impede duplicidade
      const [ct] = await tx.insert(cashTransactions).values({
        type: "entrada", amountCents: amount, date,
        description: rec.description, origin: "recebimento", sourceId: pay.id,
        refLabel: [clientName, projectLabel].filter(Boolean).join(" · ") || null,
        notes: notes || null, createdBy: userId,
      }).returning();

      await tx.update(payments).set({ cashTransactionId: ct.id }).where(eq(payments.id, pay.id));

      const newReceived = rec.receivedAmountCents + amount;
      const done = newReceived >= rec.amountCents;
      await tx.update(receivables).set({
        receivedAmountCents: newReceived,
        status: done ? "recebido" : "pendente",
        updatedAt: new Date(),
      }).where(eq(receivables.id, receivableId));

      await tx.insert(auditLogs).values({
        userId, action: "receber", entity: "recebivel", entityId: receivableId,
        details: `R$ ${(amount / 100).toFixed(2)} via ${payMethod}`,
      });
    });
  } catch (e: unknown) {
    // Violação de unicidade => já processado (clique duplo / retry)
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "23505") {
      return ok();
    }
    throw e;
  }

  const file = formData.get("receipt");
  if (file instanceof File && file.size > 0) {
    await saveAttachment(file, "pagamento", receivableId, userId);
  }

  revalidateAll();
  return ok();
}

export async function revertPaymentAction(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const paymentId = Number(formData.get("paymentId"));
  const reason = str(formData, "reason");

  await db.transaction(async (tx) => {
    const [pay] = await tx.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
    if (!pay) throw new Error("Pagamento não encontrado");
    if (pay.revertedAt) return;

    await tx.update(payments).set({
      revertedAt: new Date(), reversalReason: reason || "Estorno",
    }).where(eq(payments.id, paymentId));

    const [rec] = await tx.select().from(receivables).where(eq(receivables.id, pay.receivableId)).limit(1);
    if (rec) {
      const newReceived = Math.max(0, rec.receivedAmountCents - pay.amountCents);
      await tx.update(receivables).set({
        receivedAmountCents: newReceived,
        status: "pendente",
        updatedAt: new Date(),
      }).where(eq(receivables.id, rec.id));
    }

    // Estorno: saída de caixa identificada, preservando o histórico da entrada original
    const [ct] = await tx.insert(cashTransactions).values({
      type: "saida", amountCents: pay.amountCents, date: todayISO(),
      description: `Estorno — ${rec?.description ?? "recebimento"}`,
      origin: "estorno", sourceId: pay.id,
      refLabel: "Estorno de recebimento",
      notes: reason || null, createdBy: userId,
    }).returning();
    void ct;

    await tx.insert(auditLogs).values({
      userId, action: "estornar", entity: "pagamento", entityId: paymentId, details: reason || null,
    });
  });

  revalidateAll();
  return ok();
}

export async function cancelReceivableAction(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const id = Number(formData.get("id"));
  const [rec] = await db.select().from(receivables).where(eq(receivables.id, id)).limit(1);
  if (!rec) return fail("Recebível não encontrado.");
  if (rec.receivedAmountCents > 0) return fail("Recebível com pagamentos não pode ser cancelado — estorne os pagamentos.");
  await db.update(receivables).set({ status: "cancelado", updatedAt: new Date() }).where(eq(receivables.id, id));
  await audit(userId, "cancelar", "recebivel", id);
  revalidateAll();
  return ok();
}

export async function createReceivableAction(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const projectId = Number(formData.get("projectId")) || null;
  const description = str(formData, "description");
  const amount = money(formData, "amount");
  const condition = str(formData, "condition") || "data";
  const dueDate = str(formData, "dueDate");
  if (!description) return fail("Informe a descrição.");
  if (amount <= 0) return fail("O valor deve ser maior que zero.");

  let clientId: number | null = null;
  if (projectId) {
    const [p] = await db.select({ clientId: projects.clientId }).from(projects).where(eq(projects.id, projectId)).limit(1);
    clientId = p?.clientId ?? null;
  } else {
    const clientName = str(formData, "clientName");
    if (clientName) clientId = await getOrCreateClientId(db, clientName, userId);
  }

  await db.insert(receivables).values({
    projectId, clientId, description, amountCents: amount,
    dueDate: condition === "data" && dueDate ? dueDate : null,
    condition: condition === "na_entrega" ? "na_entrega" : dueDate ? "data" : "a_definir",
    status: "pendente", origin: "manual", createdBy: userId,
  });
  revalidateAll();
  return ok();
}

/* ============================ CUSTOS ============================ */

export async function createCostAction(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const projectId = Number(formData.get("projectId"));
  const description = str(formData, "description");
  const categoryId = Number(formData.get("categoryId")) || null;
  const amount = money(formData, "amount");
  const status = str(formData, "status") === "pago" ? "pago" : "pendente";
  const dueDate = str(formData, "dueDate") || null;
  const paidDate = str(formData, "paidDate") || todayISO();
  const payMethod = method(formData);

  if (!projectId) return fail("Selecione o projeto.");
  if (!description) return fail("Informe a descrição do custo.");
  if (amount <= 0) return fail("O valor deve ser maior que zero.");

  await db.transaction(async (tx) => {
    const [cost] = await tx.insert(projectCosts).values({
      projectId, description, categoryId, amountCents: amount,
      status, dueDate,
      paidDate: status === "pago" ? paidDate : null,
      paymentMethod: status === "pago" ? payMethod : null,
      notes: str(formData, "notes") || null,
      createdBy: userId,
    }).returning();

    if (status === "pago") {
      const [p] = await tx.select({ name: projects.name, clientId: projects.clientId }).from(projects).where(eq(projects.id, projectId)).limit(1);
      let clientName = "";
      if (p?.clientId) {
        const [c] = await tx.select({ name: clients.name }).from(clients).where(eq(clients.id, p.clientId)).limit(1);
        clientName = c?.name ?? "";
      }
      const [ct] = await tx.insert(cashTransactions).values({
        type: "saida", amountCents: amount, date: paidDate,
        description, origin: "custo", sourceId: cost.id,
        refLabel: [clientName, p?.name].filter(Boolean).join(" · ") || null,
        createdBy: userId,
      }).returning();
      await tx.update(projectCosts).set({ cashTransactionId: ct.id }).where(eq(projectCosts.id, cost.id));
    }
    await tx.insert(auditLogs).values({ userId, action: "criar", entity: "custo", entityId: cost.id, details: description });
  });

  revalidateAll();
  return ok();
}

export async function payCostAction(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const costId = Number(formData.get("id"));
  const date = str(formData, "date") || todayISO();
  const payMethod = method(formData);

  try {
    await db.transaction(async (tx) => {
      // Transição atômica: só paga se ainda estiver pendente
      const updated = await tx.update(projectCosts).set({
        status: "pago", paidDate: date, paymentMethod: payMethod, updatedAt: new Date(),
      }).where(and(eq(projectCosts.id, costId), eq(projectCosts.status, "pendente"))).returning();

      if (updated.length === 0) return; // já pago — idempotente

      const cost = updated[0];
      const [p] = await tx.select({ name: projects.name, clientId: projects.clientId }).from(projects).where(eq(projects.id, cost.projectId)).limit(1);
      let clientName = "";
      if (p?.clientId) {
        const [c] = await tx.select({ name: clients.name }).from(clients).where(eq(clients.id, p.clientId)).limit(1);
        clientName = c?.name ?? "";
      }
      const [ct] = await tx.insert(cashTransactions).values({
        type: "saida", amountCents: cost.amountCents, date,
        description: cost.description, origin: "custo", sourceId: cost.id,
        refLabel: [clientName, p?.name].filter(Boolean).join(" · ") || null,
        createdBy: userId,
      }).returning();
      await tx.update(projectCosts).set({ cashTransactionId: ct.id }).where(eq(projectCosts.id, costId));
      await tx.insert(auditLogs).values({ userId, action: "pagar", entity: "custo", entityId: costId });
    });
  } catch (e: unknown) {
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "23505") return ok();
    throw e;
  }

  revalidateAll();
  return ok();
}

export async function revertCostPaymentAction(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const costId = Number(formData.get("id"));
  const reason = str(formData, "reason");

  await db.transaction(async (tx) => {
    const [cost] = await tx.select().from(projectCosts).where(eq(projectCosts.id, costId)).limit(1);
    if (!cost || cost.status !== "pago") return;

    await tx.update(projectCosts).set({
      status: "pendente", paidDate: null, paymentMethod: null, updatedAt: new Date(),
    }).where(eq(projectCosts.id, costId));

    await tx.insert(cashTransactions).values({
      type: "entrada", amountCents: cost.amountCents, date: todayISO(),
      description: `Estorno — ${cost.description}`,
      origin: "estorno", sourceId: costId,
      refLabel: "Estorno de custo",
      notes: reason || null, createdBy: userId,
    });
    await tx.insert(auditLogs).values({ userId, action: "estornar", entity: "custo", entityId: costId, details: reason || null });
  });

  revalidateAll();
  return ok();
}

export async function updateCostAction(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const id = Number(formData.get("id"));
  const amount = money(formData, "amount");
  if (amount <= 0) return fail("O valor deve ser maior que zero.");
  const description = str(formData, "description");
  const dueDate = str(formData, "dueDate") || null;

  const [cost] = await db.select().from(projectCosts).where(eq(projectCosts.id, id)).limit(1);
  if (!cost) return fail("Custo não encontrado.");

  await db.transaction(async (tx) => {
    await tx.update(projectCosts).set({
      description: description || cost.description,
      amountCents: amount,
      categoryId: Number(formData.get("categoryId")) || cost.categoryId,
      dueDate,
      updatedAt: new Date(),
    }).where(eq(projectCosts.id, id));

    // Se já movimentou caixa: ATUALIZA a mesma movimentação (nunca cria outra)
    if (cost.cashTransactionId) {
      await tx.update(cashTransactions).set({
        amountCents: amount,
        description: description || cost.description,
      }).where(eq(cashTransactions.id, cost.cashTransactionId));
    }
    await tx.insert(auditLogs).values({ userId, action: "editar", entity: "custo", entityId: id, details: `${cost.amountCents} -> ${amount}` });
  });

  revalidateAll();
  return ok();
}

export async function cancelCostAction(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const id = Number(formData.get("id"));
  const [cost] = await db.select().from(projectCosts).where(eq(projectCosts.id, id)).limit(1);
  if (!cost) return fail("Custo não encontrado.");
  if (cost.status === "pago") return fail("Custo pago não pode ser cancelado — use estorno.");
  await db.update(projectCosts).set({ status: "cancelado", updatedAt: new Date() }).where(eq(projectCosts.id, id));
  await audit(userId, "cancelar", "custo", id);
  revalidateAll();
  return ok();
}

/* ============================ DESPESAS ============================ */

export async function createExpenseAction(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const description = str(formData, "description");
  const categoryId = Number(formData.get("categoryId")) || null;
  const amount = money(formData, "amount");
  const dueDate = str(formData, "dueDate");
  const status = str(formData, "status") === "paga" ? "paga" : "pendente";
  const payMethod = method(formData);

  if (!description) return fail("Informe a descrição.");
  if (amount <= 0) return fail("O valor deve ser maior que zero.");
  if (!dueDate) return fail("Informe o vencimento.");

  await db.transaction(async (tx) => {
    const [exp] = await tx.insert(expenses).values({
      description, categoryId, amountCents: amount, type: "unica",
      status, dueDate,
      paidDate: status === "paga" ? (str(formData, "paidDate") || todayISO()) : null,
      paymentMethod: status === "paga" ? payMethod : null,
      notes: str(formData, "notes") || null,
      createdBy: userId,
    }).returning();

    if (status === "paga") {
      const [ct] = await tx.insert(cashTransactions).values({
        type: "saida", amountCents: amount, date: str(formData, "paidDate") || todayISO(),
        description, origin: "despesa", sourceId: exp.id,
        refLabel: "Despesa", createdBy: userId,
      }).returning();
      await tx.update(expenses).set({ cashTransactionId: ct.id }).where(eq(expenses.id, exp.id));
    }
    await tx.insert(auditLogs).values({ userId, action: "criar", entity: "despesa", entityId: exp.id, details: description });
  });

  revalidateAll();
  return ok();
}

export async function createRecurringAction(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const description = str(formData, "description");
  const categoryId = Number(formData.get("categoryId")) || null;
  const amount = money(formData, "amount");
  const dueDay = Number(str(formData, "dueDay"));
  const startDate = str(formData, "startDate") || todayISO();
  const endDate = str(formData, "endDate") || null;

  if (!description) return fail("Informe a descrição.");
  if (amount <= 0) return fail("O valor deve ser maior que zero.");
  if (!dueDay || dueDay < 1 || dueDay > 31) return fail("Informe o dia de vencimento (1-31).");

  const [rule] = await db.insert(recurringRules).values({
    description, categoryId, amountCents: amount, dueDay,
    startDate, endDate, status: "ativa",
    notes: str(formData, "notes") || null, createdBy: userId,
  }).returning();

  await ensureRecurringUpTo(todayISO());
  revalidateAll();
  return ok({ id: rule.id });
}

/** Materializa competências de recorrências ativas até (e incluindo) o mês da data limite. */
export async function ensureRecurringUpTo(untilISO: string): Promise<void> {
  const rules = await db.select().from(recurringRules).where(eq(recurringRules.status, "ativa"));
  const uy = Number(untilISO.slice(0, 4));
  const um = Number(untilISO.slice(5, 7));

  for (const rule of rules) {
    let cursor = rule.startDate.slice(0, 7); // YYYY-MM
    const limit = `${uy}-${String(um).padStart(2, "0")}`;
    let guard = 0;
    while (cursor <= limit && guard < 120) {
      guard++;
      const [cy, cm] = cursor.split("-").map(Number);
      const due = safeDueDate(cy, cm, rule.dueDay);
      if (rule.endDate && due > rule.endDate) break;

      const existing = await db.select({ id: expenses.id }).from(expenses)
        .where(and(
          eq(expenses.recurringRuleId, rule.id),
          dsql`${expenses.dueDate} >= ${monthStartISO(cy, cm)}`,
          dsql`${expenses.dueDate} <= ${monthEndISO(cy, cm)}`
        )).limit(1);

      if (existing.length === 0) {
        await db.insert(expenses).values({
          description: rule.description, categoryId: rule.categoryId,
          amountCents: rule.amountCents, type: "recorrente", status: "pendente",
          dueDate: due, recurringRuleId: rule.id, notes: rule.notes,
          createdBy: rule.createdBy,
        });
      }

      const next = new Date(Date.UTC(cy, cm, 1));
      cursor = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
    }
  }
}

/** Altera valor de recorrência: scope 'single' (só esta) | 'forward' (desta em diante) */
export async function updateRecurringAmountAction(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const expenseId = Number(formData.get("expenseId"));
  const amount = money(formData, "amount");
  const scope = str(formData, "scope") || "single";
  if (amount <= 0) return fail("O valor deve ser maior que zero.");

  const [exp] = await db.select().from(expenses).where(eq(expenses.id, expenseId)).limit(1);
  if (!exp || !exp.recurringRuleId) return fail("Competência não encontrada.");

  await db.transaction(async (tx) => {
    await tx.update(expenses).set({ amountCents: amount, updatedAt: new Date() }).where(eq(expenses.id, expenseId));
    if (exp.cashTransactionId) {
      await tx.update(cashTransactions).set({ amountCents: amount }).where(eq(cashTransactions.id, exp.cashTransactionId));
    }
    if (scope === "forward") {
      await tx.update(recurringRules).set({ amountCents: amount, updatedAt: new Date() }).where(eq(recurringRules.id, exp.recurringRuleId!));
      await tx.update(expenses).set({ amountCents: amount, updatedAt: new Date() }).where(and(
        eq(expenses.recurringRuleId, exp.recurringRuleId!),
        eq(expenses.status, "pendente"),
        dsql`${expenses.dueDate} > ${exp.dueDate}`
      ));
    }
    await tx.insert(auditLogs).values({
      userId, action: scope === "forward" ? "editar_recorrencia_futura" : "editar_competencia",
      entity: "despesa", entityId: expenseId, details: `novo valor ${amount}`,
    });
  });

  revalidateAll();
  return ok();
}

export async function closeRecurringAction(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const id = Number(formData.get("id"));
  await db.update(recurringRules).set({ status: "encerrada", endDate: todayISO(), updatedAt: new Date() }).where(eq(recurringRules.id, id));
  await audit(userId, "encerrar", "recorrencia", id);
  revalidateAll();
  return ok();
}

export async function createInstallmentPlanAction(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const description = str(formData, "description");
  const categoryId = Number(formData.get("categoryId")) || null;
  const installmentAmount = money(formData, "installmentAmount");
  const total = Number(str(formData, "totalInstallments"));
  const firstDate = str(formData, "firstDate");

  if (!description) return fail("Informe a descrição.");
  if (installmentAmount <= 0) return fail("O valor da parcela deve ser maior que zero.");
  if (!total || total < 1) return fail("A quantidade de parcelas deve ser pelo menos 1.");
  if (total > 120) return fail("Quantidade de parcelas inválida.");
  if (!firstDate) return fail("Informe a data da primeira parcela.");

  await db.transaction(async (tx) => {
    const [plan] = await tx.insert(installmentPlans).values({
      description, categoryId, installmentAmountCents: installmentAmount,
      totalInstallments: total, firstInstallmentNumber: 1, firstDate,
      status: "ativo", notes: str(formData, "notes") || null, createdBy: userId,
    }).returning();

    // Gera EXATAMENTE N parcelas — nunca N+1
    for (let n = 1; n <= total; n++) {
      const due = addMonthsISO(firstDate, n - 1);
      const paid = str(formData, "markPaidUntil") && n <= Number(str(formData, "markPaidUntil"));
      const [exp] = await tx.insert(expenses).values({
        description, categoryId, amountCents: installmentAmount,
        type: "parcelada", status: paid ? "paga" : "pendente",
        dueDate: due, paidDate: paid ? due : null, paymentMethod: paid ? "pix" : null,
        installmentPlanId: plan.id, installmentNumber: n, installmentTotal: total,
        createdBy: userId,
      }).returning();
      if (paid) {
        const [ct] = await tx.insert(cashTransactions).values({
          type: "saida", amountCents: installmentAmount, date: due,
          description: `${description} — parcela ${n}/${total}`,
          origin: "despesa", sourceId: exp.id, refLabel: "Parcelamento", createdBy: userId,
        }).returning();
        await tx.update(expenses).set({ cashTransactionId: ct.id }).where(eq(expenses.id, exp.id));
      }
    }
    await tx.insert(auditLogs).values({ userId, action: "criar", entity: "parcelamento", entityId: plan.id, details: `${description} ${total}x` });
  });

  revalidateAll();
  return ok();
}

export async function payExpenseAction(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const expenseId = Number(formData.get("id"));
  const date = str(formData, "date") || todayISO();
  const payMethod = method(formData);

  try {
    await db.transaction(async (tx) => {
      const updated = await tx.update(expenses).set({
        status: "paga", paidDate: date, paymentMethod: payMethod, updatedAt: new Date(),
      }).where(and(eq(expenses.id, expenseId), eq(expenses.status, "pendente"))).returning();

      if (updated.length === 0) return; // já paga — idempotente
      const exp = updated[0];

      const [ct] = await tx.insert(cashTransactions).values({
        type: "saida", amountCents: exp.amountCents, date,
        description: exp.type === "parcelada"
          ? `${exp.description} — parcela ${exp.installmentNumber}/${exp.installmentTotal}`
          : exp.description,
        origin: "despesa", sourceId: exp.id, refLabel: "Despesa", createdBy: userId,
      }).returning();
      await tx.update(expenses).set({ cashTransactionId: ct.id }).where(eq(expenses.id, expenseId));

      // Encerramento automático do parcelamento após a última parcela
      if (exp.installmentPlanId) {
        const remaining = await tx.select({ id: expenses.id }).from(expenses)
          .where(and(eq(expenses.installmentPlanId, exp.installmentPlanId), eq(expenses.status, "pendente")));
        if (remaining.length === 0) {
          await tx.update(installmentPlans).set({ status: "encerrado" }).where(eq(installmentPlans.id, exp.installmentPlanId));
        }
      }
      await tx.insert(auditLogs).values({ userId, action: "pagar", entity: "despesa", entityId: expenseId });
    });
  } catch (e: unknown) {
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "23505") return ok();
    throw e;
  }

  revalidateAll();
  return ok();
}

export async function revertExpensePaymentAction(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const expenseId = Number(formData.get("id"));
  const reason = str(formData, "reason");

  await db.transaction(async (tx) => {
    const [exp] = await tx.select().from(expenses).where(eq(expenses.id, expenseId)).limit(1);
    if (!exp || exp.status !== "paga") return;

    await tx.update(expenses).set({
      status: "pendente", paidDate: null, paymentMethod: null, updatedAt: new Date(),
    }).where(eq(expenses.id, expenseId));

    if (exp.installmentPlanId) {
      await tx.update(installmentPlans).set({ status: "ativo" }).where(eq(installmentPlans.id, exp.installmentPlanId));
    }

    await tx.insert(cashTransactions).values({
      type: "entrada", amountCents: exp.amountCents, date: todayISO(),
      description: `Estorno — ${exp.description}`,
      origin: "estorno", sourceId: expenseId,
      refLabel: "Estorno de despesa", notes: reason || null, createdBy: userId,
    });
    await tx.insert(auditLogs).values({ userId, action: "estornar", entity: "despesa", entityId: expenseId, details: reason || null });
  });

  revalidateAll();
  return ok();
}

export async function updateExpenseAction(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const id = Number(formData.get("id"));
  const amount = money(formData, "amount");
  if (amount <= 0) return fail("O valor deve ser maior que zero.");

  const [exp] = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
  if (!exp) return fail("Despesa não encontrada.");

  await db.transaction(async (tx) => {
    await tx.update(expenses).set({
      description: str(formData, "description") || exp.description,
      amountCents: amount,
      categoryId: Number(formData.get("categoryId")) || exp.categoryId,
      dueDate: str(formData, "dueDate") || exp.dueDate,
      updatedAt: new Date(),
    }).where(eq(expenses.id, id));

    if (exp.cashTransactionId) {
      await tx.update(cashTransactions).set({
        amountCents: amount,
        description: str(formData, "description") || exp.description,
      }).where(eq(cashTransactions.id, exp.cashTransactionId));
    }
    await tx.insert(auditLogs).values({ userId, action: "editar", entity: "despesa", entityId: id });
  });

  revalidateAll();
  return ok();
}

export async function cancelExpenseAction(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const id = Number(formData.get("id"));
  const [exp] = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
  if (!exp) return fail("Despesa não encontrada.");
  if (exp.status === "paga") return fail("Despesa paga não pode ser cancelada — use estorno.");
  await db.update(expenses).set({ status: "cancelada", updatedAt: new Date() }).where(eq(expenses.id, id));
  await audit(userId, "cancelar", "despesa", id);
  revalidateAll();
  return ok();
}

/* ======================== AJUSTE DE SALDO ======================== */

export async function adjustBalanceAction(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const amount = money(formData, "amount"); // pode ser negativo
  const reason = str(formData, "reason");
  if (amount === 0) return fail("Informe um valor diferente de zero.");
  if (!reason) return fail("Informe o motivo do ajuste.");

  await db.transaction(async (tx) => {
    await tx.insert(cashTransactions).values({
      type: amount > 0 ? "entrada" : "saida",
      amountCents: Math.abs(amount),
      date: todayISO(),
      description: `Ajuste de saldo — ${reason}`,
      origin: "ajuste", refLabel: "Ajuste manual",
      notes: reason, createdBy: userId,
    });
    await tx.insert(auditLogs).values({ userId, action: "ajuste_saldo", entity: "caixa", entityId: null, details: `${amount}: ${reason}` });
  });

  revalidateAll();
  return ok();
}

/* ============================ ANEXOS ============================ */

async function saveAttachment(file: File, sourceType: string, sourceId: number, userId: number) {
  if (file.size > 4 * 1024 * 1024) throw new Error("Arquivo maior que 4MB");
  const buf = Buffer.from(await file.arrayBuffer());
  await db.insert(attachments).values({
    fileName: file.name.slice(0, 180),
    mime: file.type || "application/octet-stream",
    size: file.size,
    data: buf.toString("base64"),
    sourceType, sourceId, createdBy: userId,
  });
}

export async function uploadAttachmentAction(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const file = formData.get("file");
  const sourceType = str(formData, "sourceType");
  const sourceId = Number(formData.get("sourceId"));
  if (!(file instanceof File) || file.size === 0) return fail("Selecione um arquivo.");
  if (!sourceType || !sourceId) return fail("Destino do anexo inválido.");
  try {
    await saveAttachment(file, sourceType, sourceId, userId);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Falha ao enviar anexo.");
  }
  revalidateAll();
  return ok();
}

export async function deleteAttachmentAction(formData: FormData): Promise<ActionResult> {
  await requireUserId();
  const id = Number(formData.get("id"));
  await db.delete(attachments).where(eq(attachments.id, id));
  revalidateAll();
  return ok();
}

/* ============================ UTIL ============================ */

export async function noopAction(): Promise<void> {
  // placeholder para formulários leves
}
