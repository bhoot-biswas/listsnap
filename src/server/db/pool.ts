import "server-only";
import { createPool, type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { env } from "@/server/env";

/**
 * One pool per process, kept on globalThis so dev hot reloads don't open a new one on
 * every edit. Hostinger's shared MySQL caps connections per user, so 5 is the default.
 * `timezone: "Z"` makes mysql2 read and write DATETIME/TIMESTAMP as UTC, which Better
 * Auth requires and which keeps lock expiry comparisons honest on a Dhaka-time laptop.
 */
const g = globalThis as unknown as { __listsnapPool?: Pool };

export function getPool(): Pool {
  const { databaseUrl, poolSize } = env();
  if (!databaseUrl) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local (see README).");
  if (!g.__listsnapPool) {
    g.__listsnapPool = createPool({
      uri: databaseUrl,
      timezone: "Z",
      connectionLimit: poolSize,
      waitForConnections: true,
      charset: "utf8mb4",
      // DECIMAL as numbers: costs and confidence are small
      decimalNumbers: true,
      // MySQL and MariaDB 11 send JSON columns typed as JSON, which mysql2 parses. Older
      // MariaDB sends them as text, so every column named *_json is parsed here as well.
      typeCast(field, next) {
        if (
          field.name.endsWith("_json") &&
          (field.type === "BLOB" || field.type === "VAR_STRING" || field.type === "STRING")
        ) {
          const text = field.string("utf8");
          return text === null ? null : JSON.parse(text);
        }
        return next();
      },
    });
  }
  return g.__listsnapPool;
}

type Params = (string | number | boolean | Date | null | Buffer)[];

export async function select<T>(sql: string, params: Params = []): Promise<T[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(sql, params);
  return rows as T[];
}

export async function selectOne<T>(sql: string, params: Params = []): Promise<T | null> {
  return (await select<T>(sql, params))[0] ?? null;
}

export async function execute(sql: string, params: Params = []): Promise<ResultSetHeader> {
  const [result] = await getPool().query<ResultSetHeader>(sql, params);
  return result;
}

/** Runs `fn` in a transaction on one connection; rolls back if it throws. */
export async function transaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** JSON columns: mysql2 parses them on read; on write they go in as strings. */
export const json = (value: unknown): string => JSON.stringify(value ?? null);
