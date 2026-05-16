import Database from "better-sqlite3";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { drizzle as drizzlePostgres } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { config } from "../config";
import { createChildLogger } from "../logger";
import * as schema from "./schema";

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

  if (config.DATABASE_TYPE === "postgres") {
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
    logger.info("PostgreSQL database initialized");
  } else {
    const sqlite = new Database(".muxer-queue.db");
    sqlite.pragma("journal_mode = WAL");

    db = drizzleSqlite(sqlite, { schema });
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
