import path from "node:path";
import Database from "better-sqlite3";
import { createChildLogger } from "./logger";

const logger = createChildLogger("muxer-queue");

export interface MuxerJobData {
  userId: string;
  sessionId: string;
  recordingsDir: string;
  outputDir: string;
}

interface StoredJob {
  id: string;
  data: string;
  status: "pending" | "processing" | "completed" | "failed";
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  updatedAt: number;
  error?: string;
}

const dbPath = path.join(process.cwd(), ".muxer-queue.db");
let db: Database.Database | null = null;

function initializeDatabase(): Database.Database {
  const database = new Database(dbPath);
  database.pragma("journal_mode = WAL");

  database.exec(`
    CREATE TABLE IF NOT EXISTS muxer_jobs (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      maxAttempts INTEGER NOT NULL DEFAULT 3,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_status ON muxer_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_createdAt ON muxer_jobs(createdAt);
  `);

  return database;
}

function getDatabase(): Database.Database {
  if (!db) {
    db = initializeDatabase();
  }
  return db;
}

export async function enqueueMuxerJob(data: MuxerJobData): Promise<string> {
  try {
    const database = getDatabase();
    const jobId = `${data.userId}-${data.sessionId}`;
    const now = Date.now();

    const stmt = database.prepare(`
      INSERT INTO muxer_jobs (id, data, status, attempts, maxAttempts, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(jobId, JSON.stringify(data), "pending", 0, 3, now, now);

    logger.info(
      { jobId, userId: data.userId, sessionId: data.sessionId },
      "Muxer job enqueued",
    );

    return jobId;
  } catch (error) {
    logger.error(
      {
        userId: data.userId,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to enqueue muxer job",
    );
    throw error;
  }
}

export async function getPendingJobs(): Promise<StoredJob[]> {
  const database = getDatabase();
  const stmt = database.prepare(`
    SELECT id, data, status, attempts, maxAttempts, createdAt, updatedAt, error
    FROM muxer_jobs
    WHERE status = 'pending'
    ORDER BY createdAt ASC
    LIMIT 10
  `);

  const rows = stmt.all() as Array<{
    id: string;
    data: string;
    status: string;
    attempts: number;
    maxAttempts: number;
    createdAt: number;
    updatedAt: number;
    error?: string;
  }>;

  return rows.map((row) => ({
    ...row,
    status: row.status as "pending" | "processing" | "completed" | "failed",
  }));
}

export async function updateJobStatus(
  jobId: string,
  status: "processing" | "completed" | "failed",
  error?: string,
): Promise<void> {
  const database = getDatabase();
  const now = Date.now();

  if (status === "failed") {
    const stmt = database.prepare(`
      UPDATE muxer_jobs
      SET status = ?, attempts = attempts + 1, updatedAt = ?, error = ?
      WHERE id = ?
    `);
    stmt.run(status, now, error || null, jobId);
  } else {
    const stmt = database.prepare(`
      UPDATE muxer_jobs
      SET status = ?, updatedAt = ?
      WHERE id = ?
    `);
    stmt.run(status, now, jobId);
  }

  logger.info({ jobId, status, error }, "Job status updated");
}

export async function retryFailedJob(jobId: string): Promise<boolean> {
  const database = getDatabase();

  const job = database
    .prepare("SELECT * FROM muxer_jobs WHERE id = ?")
    .get(jobId) as StoredJob | undefined;

  if (!job) {
    logger.warn({ jobId }, "Job not found");
    return false;
  }

  if (job.attempts >= job.maxAttempts) {
    logger.warn(
      { jobId, attempts: job.attempts, maxAttempts: job.maxAttempts },
      "Max retry attempts reached",
    );
    return false;
  }

  const stmt = database.prepare(`
    UPDATE muxer_jobs
    SET status = 'pending', updatedAt = ?
    WHERE id = ?
  `);

  stmt.run(Date.now(), jobId);
  logger.info({ jobId, attempt: job.attempts + 1 }, "Job retried");

  return true;
}

export async function cleanupCompletedJobs(
  olderThanMs: number = 24 * 60 * 60 * 1000,
): Promise<number> {
  const database = getDatabase();
  const cutoffTime = Date.now() - olderThanMs;

  const stmt = database.prepare(`
    DELETE FROM muxer_jobs
    WHERE status = 'completed' AND updatedAt < ?
  `);

  const result = stmt.run(cutoffTime);
  logger.info({ deletedCount: result.changes }, "Cleaned up completed jobs");

  return result.changes;
}

export async function getJobStats(): Promise<{
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}> {
  const database = getDatabase();

  const stats = database
    .prepare(`
      SELECT
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM muxer_jobs
    `)
    .get() as {
    pending: number | null;
    processing: number | null;
    completed: number | null;
    failed: number | null;
  };

  return {
    pending: stats.pending || 0,
    processing: stats.processing || 0,
    completed: stats.completed || 0,
    failed: stats.failed || 0,
  };
}

export async function closeQueue(): Promise<void> {
  if (db) {
    db.close();
    db = null;
    logger.info("Muxer queue closed");
  }
}
