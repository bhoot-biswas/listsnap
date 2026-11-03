import "server-only";
import { createPool, type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { env } from "@/server/env";

/**
 * One mysql2 pool for the app, and the few helpers every query in src/server/db goes
 * through. Values always travel as `?` parameters; nothing is spliced into SQL text.
 */

// what mysql2 accepts as query values (its own type isn't exported)
type Params = (NonNullable<unknown> | null | undefined)[];

// dev reloads re-run this module; one pool across them keeps connections from piling up
const g = globalThis as { __listsnapPool?: Pool };

export function getPool(): Pool {
  g.__listsnapPool ??= createPool({
    uri: env().databaseUrl,
    connectionLimit: env().poolSize,
    // every timestamp is stored and read as UTC; the UI turns it into Dhaka time
    timezone: "Z",
    charset: "utf8mb4_unicode_ci",
    // scores and costs are small DECIMALs; numbers are what the code does arithmetic on
    decimalNumbers: true,
    // a DATE is a calendar day, not an instant: as a Date it would shift with the time zone
    dateStrings: ["DATE"],
    enableKeepAlive: true,
  });
  return g.__listsnapPool;
}

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

/** Runs `fn` on one connection inside a transaction: committed if it returns, rolled back if it throws. */
export async function transaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

/** For JSON columns: MariaDB stores them as text, so values go in as a JSON string. */
export const json = (value: unknown): string => JSON.stringify(value ?? null);
