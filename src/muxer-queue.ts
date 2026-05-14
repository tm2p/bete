import {
  DatabaseAdapter,
  getDatabase as getDatabaseAdapter,
} from "./database/adapter";
import { createChildLogger } from "./logger";

const logger = createChildLogger("muxer-queue");

// Export DatabaseAdapter as SqliteDatabase for backward compatibility
export type SqliteDatabase = DatabaseAdapter;

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

let dbAdapter: DatabaseAdapter | null = null;

async function initializeDatabase(): Promise<DatabaseAdapter> {
  const adapter = await getDatabaseAdapter();

  adapter.exec(`
    PRAGMA journal_mode = WAL;

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

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      thread_id TEXT,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      avatar_url TEXT,
      content TEXT NOT NULL,
      edited_content TEXT,
      created_at INTEGER NOT NULL,
      edited_at INTEGER,
      deleted_at INTEGER,
      type TEXT NOT NULL DEFAULT 'text',
      metadata TEXT,
      ai_status TEXT NOT NULL DEFAULT 'pending',
      ai_moderation_flags TEXT,
      ai_moderation_score REAL,
      ai_moderation_raw TEXT,
      ai_analysis TEXT,
      ai_analyzed_at INTEGER,
      ai_error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id);
    CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      thread_id TEXT,
      user_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      size INTEGER NOT NULL,
      type TEXT NOT NULL,
      discord_url TEXT NOT NULL,
      uploaded_url TEXT,
      upload_status TEXT NOT NULL DEFAULT 'pending',
      upload_error TEXT,
      created_at INTEGER NOT NULL,
      uploaded_at INTEGER,
      FOREIGN KEY (message_id) REFERENCES messages(id)
    );

    CREATE INDEX IF NOT EXISTS idx_attachments_channel ON attachments(channel_id);
    CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);
    CREATE INDEX IF NOT EXISTS idx_attachments_status ON attachments(upload_status);

    CREATE TABLE IF NOT EXISTS ui_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  const migrations = [
    "ALTER TABLE attachments ADD COLUMN thread_id TEXT",
    "ALTER TABLE messages ADD COLUMN ai_status TEXT NOT NULL DEFAULT 'pending'",
    "ALTER TABLE messages ADD COLUMN ai_moderation_flags TEXT",
    "ALTER TABLE messages ADD COLUMN ai_moderation_score REAL",
    "ALTER TABLE messages ADD COLUMN ai_moderation_raw TEXT",
    "ALTER TABLE messages ADD COLUMN ai_analysis TEXT",
    "ALTER TABLE messages ADD COLUMN ai_analyzed_at INTEGER",
    "ALTER TABLE messages ADD COLUMN ai_error TEXT",
  ];

  for (const migration of migrations) {
    try {
      adapter.exec(migration);
    } catch {
      // Column already exists on databases initialized after schema updates.
    }
  }

  return adapter;
}

async function getDatabaseAdapterInternal(): Promise<DatabaseAdapter> {
  if (!dbAdapter) {
    dbAdapter = await initializeDatabase();
  }
  return dbAdapter;
}

// Export as getDatabase for backward compatibility
export const getDatabase = getDatabaseAdapterInternal;

export async function getPersistedValue<T>(
  key: string,
  fallback: T,
): Promise<T> {
  const adapter = await getDatabaseAdapterInternal();
  const row = adapter
    .prepare("SELECT value FROM ui_state WHERE key = ?")
    .get(key) as { value: string } | undefined;
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export async function setPersistedValue(
  key: string,
  value: unknown,
): Promise<void> {
  const adapter = await getDatabaseAdapterInternal();
  adapter
    .prepare(`
      INSERT INTO ui_state (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `)
    .run(key, JSON.stringify(value), Date.now());
}

export async function enqueueMuxerJob(data: MuxerJobData): Promise<string> {
  try {
    const adapter = await getDatabaseAdapterInternal();
    const jobId = `${data.userId}-${data.sessionId}`;
    const now = Date.now();

    const stmt = adapter.prepare(`
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
  const adapter = await getDatabaseAdapterInternal();
  const stmt = adapter.prepare(`
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
  const adapter = await getDatabaseAdapterInternal();
  const now = Date.now();

  if (status === "failed") {
    const stmt = adapter.prepare(`
      UPDATE muxer_jobs
      SET status = ?, attempts = attempts + 1, updatedAt = ?, error = ?
      WHERE id = ?
    `);
    stmt.run(status, now, error || null, jobId);
  } else {
    const stmt = adapter.prepare(`
      UPDATE muxer_jobs
      SET status = ?, updatedAt = ?
      WHERE id = ?
    `);
    stmt.run(status, now, jobId);
  }

  logger.info({ jobId, status, error }, "Job status updated");
}

export async function retryFailedJob(jobId: string): Promise<boolean> {
  const adapter = await getDatabaseAdapterInternal();

  const job = adapter
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

  const stmt = adapter.prepare(`
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
  const adapter = await getDatabaseAdapterInternal();
  const cutoffTime = Date.now() - olderThanMs;

  const stmt = adapter.prepare(`
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
  const adapter = await getDatabaseAdapterInternal();

  const stats = adapter
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
  if (dbAdapter) {
    await dbAdapter.close();
    dbAdapter = null;
    logger.info("Muxer queue closed");
  }
}
