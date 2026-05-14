import "dotenv/config";
import Database from "better-sqlite3";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { migrate as migrateSqlite } from "drizzle-orm/better-sqlite3/migrator";
import { migrate as migratePostgres } from "drizzle-orm/node-postgres/migrator";
import { config } from "../config";
import { createChildLogger } from "../logger";
import { closeDatabase, initializeDatabase } from "./drizzle";

const logger = createChildLogger("migrate");

export function initializeMigrationSqliteDatabase(path = ".muxer-queue.db") {
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  return { sqlite, db: drizzleSqlite(sqlite) };
}

export async function runMigrations(): Promise<void> {
  try {
    logger.info("Starting database migrations");

    if (config.DATABASE_TYPE === "postgres") {
      logger.info("Running PostgreSQL migrations");
      const db = (await initializeDatabase()) as Parameters<
        typeof migratePostgres
      >[0];
      try {
        await migratePostgres(db, { migrationsFolder: "./drizzle/migrations" });
      } finally {
        await closeDatabase();
      }
      logger.info("PostgreSQL migrations completed successfully");
    } else {
      logger.info("Running SQLite migrations");
      const { sqlite, db } = initializeMigrationSqliteDatabase();
      try {
        migrateSqlite(db, { migrationsFolder: "./drizzle/migrations" });
      } finally {
        sqlite.close();
      }
      logger.info("SQLite migrations completed successfully");
    }
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Migration failed",
    );
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => {
      logger.info("Migrations completed");
      process.exit(0);
    })
    .catch((error) => {
      logger.error({ error }, "Migration failed");
      process.exit(1);
    });
}
