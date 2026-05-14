import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initializeMigrationSqliteDatabase } from "../../src/database/migrate";

describe("initializeMigrationSqliteDatabase", () => {
  it("creates a SQLite DB with WAL journal mode", () => {
    const dir = mkdtempSync(join(tmpdir(), "bete-migrate-"));
    const dbPath = join(dir, "test.db");
    const { sqlite, db } = initializeMigrationSqliteDatabase(dbPath);

    try {
      expect(db).toBeDefined();
      expect(sqlite.pragma("journal_mode", { simple: true })).toBe("wal");
    } finally {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
