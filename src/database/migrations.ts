import { createChildLogger } from "../logger";
import { query } from "./postgres";

const logger = createChildLogger("migrations");

/**
 * Run all database migrations to create schema
 */
export async function runMigrations(): Promise<void> {
  logger.info("Starting database migrations");

  try {
    // Create muxer_jobs table
    await query(`
      CREATE TABLE IF NOT EXISTS muxer_jobs (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        maxAttempts INTEGER NOT NULL DEFAULT 3,
        createdAt BIGINT NOT NULL,
        updatedAt BIGINT NOT NULL,
        error TEXT
      )
    `);
    logger.debug("Created muxer_jobs table");

    await query(`
      CREATE INDEX IF NOT EXISTS idx_muxer_jobs_status ON muxer_jobs(status)
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_muxer_jobs_createdAt ON muxer_jobs(createdAt)
    `);
    logger.debug("Created muxer_jobs indexes");

    // Create messages table
    await query(`
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
        created_at BIGINT NOT NULL,
        edited_at BIGINT,
        deleted_at BIGINT,
        type TEXT NOT NULL DEFAULT 'text',
        metadata TEXT,
        ai_status TEXT NOT NULL DEFAULT 'pending',
        ai_moderation_flags TEXT,
        ai_moderation_score REAL,
        ai_moderation_raw TEXT,
        ai_analysis TEXT,
        ai_analyzed_at BIGINT,
        ai_error TEXT
      )
    `);
    logger.debug("Created messages table");

    await query(`
      CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id)
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id)
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC)
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id)
    `);
    logger.debug("Created messages indexes");

    // Create attachments table
    await query(`
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
        created_at BIGINT NOT NULL,
        uploaded_at BIGINT,
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
      )
    `);
    logger.debug("Created attachments table");

    await query(`
      CREATE INDEX IF NOT EXISTS idx_attachments_channel ON attachments(channel_id)
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id)
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_attachments_status ON attachments(upload_status)
    `);
    logger.debug("Created attachments indexes");

    // Create ui_state table
    await query(`
      CREATE TABLE IF NOT EXISTS ui_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at BIGINT NOT NULL
      )
    `);
    logger.debug("Created ui_state table");

    logger.info("Database migrations completed successfully");
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Database migrations failed",
    );
    throw error;
  }
}
