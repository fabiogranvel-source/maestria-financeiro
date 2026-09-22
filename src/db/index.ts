import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

/**
 * Hardening da conexão — Vercel (serverless) + Supabase Pooler.
 *
 * - SSL/TLS: obrigatório para Supabase (pooler/direct). Desligado apenas
 *   quando o alvo é claramente local (127.0.0.1 / localhost) para o sandbox de dev.
 * - Pool pequeno por instância: lambdas sobem várias instâncias quentes;
 *   mantemos o total bem abaixo dos slots do pooler.
 * - connectionTimeoutMillis: falha rápida em vez de requisição pendurada.
 * - idleTimeoutMillis + allowExitOnIdle: libera conexões ociosas rápido
 *   (essencial em serverless, evita esgotar slots do pooler).
 * - Reuso do pool via globalThis: instância quente reaproveita o pool —
 *   seguro porque o Pool é stateless por consulta e evita tempestade de conexões.
 */
const isLocalDb = /(?:@|\/\/)(?:127\.0\.0\.1|localhost)(?::|\/|$)/.test(databaseUrl);

const poolConfig: PoolConfig = {
  connectionString: databaseUrl,
  ssl: isLocalDb ? undefined : { rejectUnauthorized: false },
  max: 3,
  min: 0,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 20_000,
  allowExitOnIdle: true,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
};

const globalForDb = globalThis as typeof globalThis & {
  __maestriaPgPool?: Pool;
};

export const pool = globalForDb.__maestriaPgPool ?? new Pool(poolConfig);

// Reuso seguro: em produção (lambda quente) e em dev (HMR), evita recriar o pool.
globalForDb.__maestriaPgPool = pool;

export const db = drizzle(pool);
