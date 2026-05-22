import { defineConfig } from "prisma/config";

const databaseUrl =
  process.env.DATABASE_URL ??
  "mysql://auction:change_me@127.0.0.1:3307/live_auction";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: databaseUrl
  },
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts"
  }
});
