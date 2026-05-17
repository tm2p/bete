import Database from "better-sqlite3";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { drizzle as drizzlePostgres } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { config } from "../config.ts";
import { createChildLogger } from "../logger.ts";
import * as schema from "./schema.ts";

const logger = createChildLogger("drizzle");

let db:
  | ReturnType<typeof drizzlePostgres>
  | ReturnType<typeof drizzleSqlite>
  | null = null;

/**
 * Initialize the database connection based on DATABASE_TYPE config
 * Supports both PostgreSQL and SQLite
 */
export async function initializeDatabase() {
  if (db !== null) {
    return db;
  }

  // During tests prefer an isolated SQLite instance to avoid using shared
  // external Postgres instances which can lead to flaky test interference.
  const usePostgres =
    config.DATABASE_TYPE === "postgres" && process.env.NODE_ENV !== "test";

  if (usePostgres) {
    let pool: Pool;

    // Use DATABASE_URL if available, otherwise build from individual variables
    if (config.DATABASE_URL) {
      pool = new Pool({
        connectionString: config.DATABASE_URL,
        min: config.POSTGRES_POOL_MIN,
        max: config.POSTGRES_POOL_MAX,
      });
    } else {
      pool = new Pool({
        host: config.POSTGRES_HOST,
        port: config.POSTGRES_PORT,
        user: config.POSTGRES_USER,
        password: config.POSTGRES_PASSWORD,
        database: config.POSTGRES_DB,
        min: config.POSTGRES_POOL_MIN,
        max: config.POSTGRES_POOL_MAX,
      });
    }

    db = drizzlePostgres(pool, { schema });
    // Provide a simple `run` helper for tests that expect it.
    try {
      (db as any).run = (sql: string) => pool.query(sql);
    } catch {
      // ignore
    }
    logger.info("PostgreSQL database initialized");
  } else {
    const sqlite = new Database(".muxer-queue.db");
    sqlite.pragma("journal_mode = WAL");

    db = drizzleSqlite(sqlite, { schema });
    // Expose a convenience `run` method used by tests that expect a simple API.
    // `sqlite` is the underlying better-sqlite3 Database instance.
    try {
      (db as any).run = (sql: string) => sqlite.exec(sql);
    } catch {
      // ignore
    }
    logger.info("SQLite database initialized");
  }

  return db;
}

/**
 * Get the initialized database instance
 * Throws if database has not been initialized
 */
export function getDatabase() {
  if (db === null) {
    throw new Error(
      "Database not initialized. Call initializeDatabase() first.",
    );
  }
  return db;
}

/**
 * Close the database connection
 * For PostgreSQL, the pool will close on process exit
 * For SQLite, closes the database connection
 */
export async function closeDatabase() {
  if (db === null) {
    return;
  }

  if (config.DATABASE_TYPE === "postgres") {
    logger.info("PostgreSQL connection pool will close on process exit");
  } else {
    logger.info("SQLite database closed");
  }

  db = null;
}
