import { defineConfig } from "drizzle-kit";
import { config } from "./src/config";

export default defineConfig({
  schema: "./src/database/schema.ts",
  out: "./drizzle/migrations",
  dialect: config.DATABASE_TYPE === "postgres" ? "postgresql" : "sqlite",
  dbCredentials:
    config.DATABASE_TYPE === "postgres"
      ? {
          host: config.POSTGRES_HOST,
          port: config.POSTGRES_PORT,
          user: config.POSTGRES_USER || "postgres",
          password: config.POSTGRES_PASSWORD || "",
          database: config.POSTGRES_DB || "moderation_bot",
        }
      : {
          url: "./.muxer-queue.db",
        },
});
