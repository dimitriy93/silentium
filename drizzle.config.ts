import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

// Next.js читает .env.local; drizzle-kit — нет, поэтому грузим вручную.
// .env.local имеет приоритет над .env (dotenv не перезаписывает уже заданные ключи).
dotenv.config({ path: ".env.local" });
dotenv.config();

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
