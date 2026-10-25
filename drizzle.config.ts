import type { Config } from "drizzle-kit";

export default {
  dialect: "sqlite",
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_PATH ?? "./data/buildtogether.db",
  },
  strict: false,
  verbose: true,
} satisfies Config;
