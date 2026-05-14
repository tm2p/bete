import { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import { config } from "../config";
import { createChildLogger } from "../logger";

const logger = createChildLogger("postgres");

export interface PostgresConfig {
  host: string;
  port: number;
  user?: string;
  password?: string;
  database?: string;
  min: number;
  max: number;
}

let pool: Pool | null = null;

/**
 * Parse DATABASE_URL or build config from individual POSTGRES_* variables
 */
export function buildConfig(): PostgresConfig {
  if (config.DATABASE_URL) {
    try {
      const url = new URL(config.DATABASE_URL);
      return {
        host: url.hostname || "localhost",
        port: url.port ? parseInt(url.port, 10) : 5432,
        user: url.username || undefined,
        password: url.password || undefined,
        database: url.pathname?.slice(1) || undefined,
        min: config.POSTGRES_POOL_MIN,
        max: config.POSTGRES_POOL_MAX,
      };
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        "Failed to parse DATABASE_URL, falling back to individual variables",
      );
    }
  }

  return {
    host: config.POSTGRES_HOST,
    port: config.POSTGRES_PORT,
    user: config.POSTGRES_USER,
    password: config.POSTGRES_PASSWORD,
    database: config.POSTGRES_DB,
    min: config.POSTGRES_POOL_MIN,
    max: config.POSTGRES_POOL_MAX,
  };
}

/**
 * Initialize PostgreSQL connection pool
 */
export function initializePool(): Pool {
  const pgConfig = buildConfig();

  logger.info(
    {
      host: pgConfig.host,
      port: pgConfig.port,
      database: pgConfig.database,
      min: pgConfig.min,
      max: pgConfig.max,
    },
    "Initializing PostgreSQL connection pool",
  );

  const newPool = new Pool({
    host: pgConfig.host,
    port: pgConfig.port,
    user: pgConfig.user,
    password: pgConfig.password,
    database: pgConfig.database,
    min: pgConfig.min,
    max: pgConfig.max,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  newPool.on("error", (error) => {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Unexpected error on idle client in pool",
    );
  });

  newPool.on("connect", () => {
    logger.debug("New client connected to pool");
  });

  newPool.on("remove", () => {
    logger.debug("Client removed from pool");
  });

  return newPool;
}

/**
 * Get or initialize the connection pool
 */
export function getPool(): Pool {
  if (!pool) {
    pool = initializePool();
  }
  return pool;
}

/**
 * Execute a query with type safety
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: unknown[],
): Promise<QueryResult<T>> {
  const client = await getPool().connect();
  try {
    logger.debug({ text, values: values?.length || 0 }, "Executing query");
    return await client.query<T>(text, values);
  } catch (error) {
    logger.error(
      {
        text,
        error: error instanceof Error ? error.message : String(error),
      },
      "Query execution failed",
    );
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get a client from the pool for transaction or batch operations
 */
export async function getClient(): Promise<PoolClient> {
  try {
    const client = await getPool().connect();
    logger.debug("Client acquired from pool");
    return client;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to acquire client from pool",
    );
    throw error;
  }
}

/**
 * Close the connection pool
 */
export async function closePool(): Promise<void> {
  if (pool) {
    try {
      logger.info("Closing PostgreSQL connection pool");
      await pool.end();
      pool = null;
      logger.info("PostgreSQL connection pool closed");
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Error closing connection pool",
      );
      throw error;
    }
  }
}
