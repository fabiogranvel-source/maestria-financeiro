import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  integer,
  bigint,
  text,
  boolean,
  date,
  timestamp,
  uniqueIndex,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";

// Origens que geram vínculo 1:1 com a movimentação de caixa (idempotência)
const cashLinkedOrigins = sql`origin IN ('recebimento','custo','despesa')`;

/* ============================ ENUMS ============================ */

export const projectStatusEnum = pgEnum("project_status", [
  "aprovado",
  "aguardando_medicao",
  "em_producao",
  "pronto_para_instalacao",
  "instalando",
  "entregue",
  "finalizado",
]);

export const balanceModeEnum = pgEnum("balance_mode", [
  "na_entrega",
  "data_definida",
  "parcelado",
  "a_definir",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "pix",
  "dinheiro",
  "transferencia",
  "cartao",
  "boleto",
  "outro",
]);

/* ============================ AUTH ============================ */

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("admin"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)]
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/* ============================ CADASTROS ============================ */

export const clients = pgTable(
  "clients",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    phone: text("phone"),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: integer("created_by"),
  },
  (t) => [index("clients_name_idx").on(t.name)]
);

export const categories = pgTable(
  "categories",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("ambos"), // 'custo' | 'despesa' | 'ambos'
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("categories_name_idx").on(t.name)]
);

/* ============================ PROJETOS ============================ */

export const projects = pgTable(
  "projects",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id")
      .notNull()
      .references(() => clients.id),
    name: text("name").notNull(),
    description: text("description"),
    saleDate: date("sale_date").notNull(),
    saleAmountCents: bigint("sale_amount_cents", { mode: "number" }).notNull(),
    balanceMode: balanceModeEnum("balance_mode").notNull().default("a_definir"),
    expectedDelivery: date("expected_delivery"),
    status: projectStatusEnum("status").notNull().default("aprovado"),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: integer("created_by"),
  },
  (t) => [
    index("projects_client_idx").on(t.clientId),
    index("projects_sale_date_idx").on(t.saleDate),
    index("projects_status_idx").on(t.status),
  ]
);

/* ====================== RECEBÍVEIS / PAGAMENTOS ====================== */

export const receivables = pgTable(
  "receivables",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id").references(() => projects.id),
    clientId: integer("client_id").references(() => clients.id),
    description: text("description").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    receivedAmountCents: bigint("received_amount_cents", { mode: "number" })
      .notNull()
      .default(0),
    dueDate: date("due_date"), // null => sem data (na entrega / a definir)
    condition: text("condition").notNull().default("data"), // 'data' | 'na_entrega' | 'a_definir'
    status: text("status").notNull().default("pendente"), // 'pendente' | 'recebido' | 'cancelado'
    isEntry: boolean("is_entry").notNull().default(false),
    installmentNumber: integer("installment_number"),
    installmentTotal: integer("installment_total"),
    origin: text("origin").notNull().default("manual"), // 'projeto' | 'manual'
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: integer("created_by"),
  },
  (t) => [
    index("receivables_project_idx").on(t.projectId),
    index("receivables_status_due_idx").on(t.status, t.dueDate),
  ]
);

export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    receivableId: integer("receivable_id")
      .notNull()
      .references(() => receivables.id),
    projectId: integer("project_id").references(() => projects.id),
    clientId: integer("client_id").references(() => clients.id),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    date: date("date").notNull(),
    method: paymentMethodEnum("method").notNull().default("pix"),
    notes: text("notes"),
    cashTransactionId: integer("cash_transaction_id").unique(),
    revertedAt: timestamp("reverted_at", { withTimezone: true }),
    reversalReason: text("reversal_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: integer("created_by"),
  },
  (t) => [
    index("payments_receivable_idx").on(t.receivableId),
    index("payments_date_idx").on(t.date),
  ]
);

/* ============================ CUSTOS ============================ */

export const projectCosts = pgTable(
  "project_costs",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id),
    description: text("description").notNull(),
    categoryId: integer("category_id").references(() => categories.id),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    status: text("status").notNull().default("pendente"), // 'pendente' | 'pago' | 'cancelado'
    dueDate: date("due_date"),
    paidDate: date("paid_date"),
    paymentMethod: paymentMethodEnum("payment_method"),
    notes: text("notes"),
    cashTransactionId: integer("cash_transaction_id").unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: integer("created_by"),
  },
  (t) => [
    index("costs_project_idx").on(t.projectId),
    index("costs_status_due_idx").on(t.status, t.dueDate),
  ]
);

/* ============================ DESPESAS ============================ */

export const recurringRules = pgTable("recurring_rules", {
  id: serial("id").primaryKey(),
  description: text("description").notNull(),
  categoryId: integer("category_id").references(() => categories.id),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  dueDay: integer("due_day").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  status: text("status").notNull().default("ativa"), // 'ativa' | 'encerrada'
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: integer("created_by"),
});

export const installmentPlans = pgTable("installment_plans", {
  id: serial("id").primaryKey(),
  description: text("description").notNull(),
  categoryId: integer("category_id").references(() => categories.id),
  installmentAmountCents: bigint("installment_amount_cents", { mode: "number" }).notNull(),
  totalInstallments: integer("total_installments").notNull(),
  firstInstallmentNumber: integer("first_installment_number").notNull().default(1),
  firstDate: date("first_date").notNull(),
  periodicity: text("periodicity").notNull().default("mensal"),
  status: text("status").notNull().default("ativo"), // 'ativo' | 'encerrado' | 'cancelado'
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: integer("created_by"),
});

export const expenses = pgTable(
  "expenses",
  {
    id: serial("id").primaryKey(),
    description: text("description").notNull(),
    categoryId: integer("category_id").references(() => categories.id),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    type: text("type").notNull().default("unica"), // 'unica' | 'recorrente' | 'parcelada'
    status: text("status").notNull().default("pendente"), // 'pendente' | 'paga' | 'cancelada'
    dueDate: date("due_date").notNull(),
    paidDate: date("paid_date"),
    paymentMethod: paymentMethodEnum("payment_method"),
    notes: text("notes"),
    recurringRuleId: integer("recurring_rule_id").references(() => recurringRules.id),
    installmentPlanId: integer("installment_plan_id").references(() => installmentPlans.id),
    installmentNumber: integer("installment_number"),
    installmentTotal: integer("installment_total"),
    cashTransactionId: integer("cash_transaction_id").unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: integer("created_by"),
  },
  (t) => [
    index("expenses_status_due_idx").on(t.status, t.dueDate),
    index("expenses_rule_idx").on(t.recurringRuleId),
    index("expenses_plan_idx").on(t.installmentPlanId),
  ]
);

/* ============================ CAIXA ============================ */

export const cashTransactions = pgTable(
  "cash_transactions",
  {
    id: serial("id").primaryKey(),
    type: text("type").notNull(), // 'entrada' | 'saida'
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    date: date("date").notNull(),
    description: text("description").notNull(),
    origin: text("origin").notNull(), // 'recebimento' | 'custo' | 'despesa' | 'saldo_inicial' | 'ajuste' | 'estorno'
    sourceId: integer("source_id"),
    refLabel: text("ref_label"), // snapshot: cliente/projeto
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: integer("created_by"),
  },
  (t) => [
    index("cash_date_idx").on(t.date),
    // IDEMPOTÊNCIA: uma origem financeira gera no máximo uma movimentação
    uniqueIndex("cash_origin_source_uniq")
      .on(t.origin, t.sourceId)
      .where(cashLinkedOrigins),
  ]
);

/* ============================ ANEXOS / AUDITORIA ============================ */

export const attachments = pgTable(
  "attachments",
  {
    id: serial("id").primaryKey(),
    fileName: text("file_name").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    data: text("data").notNull(), // base64 (V1, arquivos pequenos)
    sourceType: text("source_type").notNull(), // 'projeto' | 'pagamento' | 'custo' | 'despesa'
    sourceId: integer("source_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: integer("created_by"),
  },
  (t) => [index("attachments_source_idx").on(t.sourceType, t.sourceId)]
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: integer("entity_id"),
    details: text("details"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("audit_entity_idx").on(t.entity, t.entityId)]
);
