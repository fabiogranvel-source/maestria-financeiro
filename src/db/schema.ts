import {
  pgTable,
  serial,
  text,
  integer,
  bigint,
  timestamp,
  date,
  boolean,
  jsonb,
  varchar,
  index,
} from "drizzle-orm/pg-core";

// ============ USERS & AUTH ============
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: varchar("role", { length: 32 }).notNull().default("admin"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ============ CLIENTS ============
export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ============ CATEGORIES ============
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  kind: varchar("kind", { length: 16 }).notNull().default("both"), // cost | expense | both
  color: varchar("color", { length: 16 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ============ PROJECTS ============
export const projects = pgTable(
  "projects",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    saleDate: date("sale_date").notNull(),
    totalValueCents: bigint("total_value_cents", { mode: "number" }).notNull(),
    downPaymentCents: bigint("down_payment_cents", { mode: "number" }).notNull().default(0),
    downPaymentReceived: boolean("down_payment_received").notNull().default(false),
    balanceMode: varchar("balance_mode", { length: 24 }).notNull().default("undefined"), // on_delivery | fixed_date | installments | undefined
    balanceDueDate: date("balance_due_date"),
    deliveryForecast: date("delivery_forecast"),
    notes: text("notes"),
    status: varchar("status", { length: 40 }).notNull().default("approved"),
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_projects_client").on(t.clientId),
    index("idx_projects_sale_date").on(t.saleDate),
    index("idx_projects_status").on(t.status),
  ]
);

export const projectStatusHistory = pgTable("project_status_history", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  fromStatus: varchar("from_status", { length: 40 }),
  toStatus: varchar("to_status", { length: 40 }).notNull(),
  changedBy: integer("changed_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ============ RECEIVABLES (obrigações a receber) ============
export const receivables = pgTable(
  "receivables",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id").notNull(),
    clientId: integer("client_id").notNull(),
    description: text("description").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    receivedCents: bigint("received_cents", { mode: "number" }).notNull().default(0),
    dueDate: date("due_date"),
    condition: varchar("condition", { length: 24 }).notNull().default("fixed"), // on_delivery | fixed | installment | undefined
    status: varchar("status", { length: 16 }).notNull().default("pending"), // pending | partial | received | cancelled
    notes: text("notes"),
    createdBy: integer("created_by"),
    updatedBy: integer("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_recv_project").on(t.projectId),
    index("idx_recv_status").on(t.status),
    index("idx_recv_due").on(t.dueDate),
  ]
);

// Pagamentos efetivamente recebidos (cada um gera 1 entrada no caixa)
export const paymentsReceived = pgTable(
  "payments_received",
  {
    id: serial("id").primaryKey(),
    receivableId: integer("receivable_id"),
    projectId: integer("project_id").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    paidAt: date("paid_at").notNull(),
    method: varchar("method", { length: 24 }).notNull().default("pix"),
    notes: text("notes"),
    idempotencyKey: varchar("idempotency_key", { length: 64 }).unique(),
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
    reversalReason: text("reversal_reason"),
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_pay_project").on(t.projectId),
    index("idx_pay_date").on(t.paidAt),
  ]
);

// ============ PROJECT COSTS ============
export const projectCosts = pgTable(
  "project_costs",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id").notNull(),
    description: text("description").notNull(),
    categoryId: integer("category_id"),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("pending"), // pending | paid | cancelled
    dueDate: date("due_date"),
    paidAt: date("paid_at"),
    paymentMethod: varchar("payment_method", { length: 24 }),
    notes: text("notes"),
    idempotencyKey: varchar("idempotency_key", { length: 64 }).unique(),
    createdBy: integer("created_by"),
    updatedBy: integer("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_cost_project").on(t.projectId),
    index("idx_cost_status").on(t.status),
    index("idx_cost_due").on(t.dueDate),
  ]
);

// ============ EXPENSES (despesas gerais: única + competências geradas) ============
export const recurringRules = pgTable("recurring_rules", {
  id: serial("id").primaryKey(),
  description: text("description").notNull(),
  categoryId: integer("category_id"),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  periodicity: varchar("periodicity", { length: 16 }).notNull().default("monthly"),
  dueDay: integer("due_day").notNull().default(10),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  status: varchar("status", { length: 16 }).notNull().default("active"), // active | closed
  notes: text("notes"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const installmentPlans = pgTable("installment_plans", {
  id: serial("id").primaryKey(),
  description: text("description").notNull(),
  categoryId: integer("category_id"),
  installmentAmountCents: bigint("installment_amount_cents", { mode: "number" }).notNull(),
  totalInstallments: integer("total_installments").notNull(),
  firstDueDate: date("first_due_date").notNull(),
  periodicity: varchar("periodicity", { length: 16 }).notNull().default("monthly"),
  notes: text("notes"),
  status: varchar("status", { length: 16 }).notNull().default("active"), // active | finished | cancelled
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const expenses = pgTable(
  "expenses",
  {
    id: serial("id").primaryKey(),
    description: text("description").notNull(),
    categoryId: integer("category_id"),
    kind: varchar("kind", { length: 16 }).notNull().default("unique"), // unique | recurring | installment
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("pending"), // pending | paid | cancelled
    dueDate: date("due_date"),
    paidAt: date("paid_at"),
    paymentMethod: varchar("payment_method", { length: 24 }),
    notes: text("notes"),
    recurringRuleId: integer("recurring_rule_id"),
    installmentPlanId: integer("installment_plan_id"),
    installmentNumber: integer("installment_number"),
    competence: varchar("competence", { length: 7 }), // YYYY-MM
    idempotencyKey: varchar("idempotency_key", { length: 64 }).unique(),
    createdBy: integer("created_by"),
    updatedBy: integer("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_exp_status").on(t.status),
    index("idx_exp_due").on(t.dueDate),
    index("idx_exp_comp").on(t.competence),
    index("idx_exp_rule").on(t.recurringRuleId),
    index("idx_exp_plan").on(t.installmentPlanId),
  ]
);

// ============ CASH (somente realizados) ============
export const cashTransactions = pgTable(
  "cash_transactions",
  {
    id: serial("id").primaryKey(),
    type: varchar("type", { length: 16 }).notNull(), // entry | exit
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    occurredAt: date("occurred_at").notNull(),
    description: text("description").notNull(),
    categoryId: integer("category_id"),
    projectId: integer("project_id"),
    clientId: integer("client_id"),
    sourceType: varchar("source_type", { length: 32 }).notNull(), // payment_received | project_cost | expense | opening_balance | adjustment | manual
    sourceId: integer("source_id"),
    idempotencyKey: varchar("idempotency_key", { length: 80 }).unique(),
    method: varchar("method", { length: 24 }),
    notes: text("notes"),
    reversed: boolean("reversed").notNull().default(false),
    reversalReason: text("reversal_reason"),
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_cash_date").on(t.occurredAt),
    index("idx_cash_type").on(t.type),
    index("idx_cash_source").on(t.sourceType, t.sourceId),
  ]
);

// ============ ATTACHMENTS (base64/data-url simplificado) ============
export const attachments = pgTable("attachments", {
  id: serial("id").primaryKey(),
  relatedType: varchar("related_type", { length: 32 }).notNull(), // project | receivable | payment | cost | expense
  relatedId: integer("related_id").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type"),
  dataUrl: text("data_url"),
  sizeBytes: integer("size_bytes"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ============ SETTINGS (singleton) ============
export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull().default("Maestria"),
  openingBalanceCents: bigint("opening_balance_cents", { mode: "number" }).notNull().default(0),
  openingBalanceDate: date("opening_balance_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const balanceAdjustments = pgTable("balance_adjustments", {
  id: serial("id").primaryKey(),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(), // pode ser + ou -
  reason: text("reason").notNull(),
  occurredAt: date("occurred_at").notNull(),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ============ AUDIT ============
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  action: varchar("action", { length: 64 }).notNull(),
  entityType: varchar("entity_type", { length: 40 }).notNull(),
  entityId: integer("entity_id"),
  details: jsonb("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
