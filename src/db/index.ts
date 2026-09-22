import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

// Desenvolvimento local (sandbox) usa Postgres sem TLS;
// qualquer outro destino (ex.: Supabase) exige TLS.
const isLocalhost =
  databaseUrl.includes("127.0.0.1") || databaseUrl.includes("localhost");

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

function createPool(): Pool {
  const pool = new Pool({
    connectionString: databaseUrl,
    // Serverless (Vercel): 1 conexao por instancia evita exaurir o pooler.
    max: 1,
    // Falha rapido em vez de pendurar a funcao serverless.
    connectionTimeoutMillis: 10000,
    // Devolve o backend rapidamente ao Transaction Pooler.
    idleTimeoutMillis: 10000,
    // Garante search_path=public em cada checkout do pooler, sem depender
    // do estado da sessao do backend (verificado: Supavisor honra `options`
    // por transacao; o Drizzle gera SQL nao qualificado para "public").
    options: "-c search_path=public",
    // Supabase exige TLS; Postgres local de desenvolvimento nao usa.
    ...(isLocalhost ? {} : { ssl: { rejectUnauthorized: false } }),
  });
  // Erros assincronos em clientes idle nao devem derrubar o processo.
  pool.on("error", (err) => {
    console.error(
      "[db] idle client error:",
      err instanceof Error ? err.message : err
    );
  });
  return pool;
}

// Reuso via globalThis em dev E producao: na Vercel, invocacoes mornas
// reaproveitam o mesmo pool em vez de abrir conexoes a cada request.
if (!globalForDb.__arenaNextJsPostgresqlPool) {
  globalForDb.__arenaNextJsPostgresqlPool = createPool();
}

export const pool = globalForDb.__arenaNextJsPostgresqlPool;

export const db = drizzle(pool);
