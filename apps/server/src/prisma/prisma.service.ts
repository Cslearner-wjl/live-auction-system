import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const databaseUrl = new URL(
      process.env.DATABASE_URL ??
        "mysql://auction:change_me@127.0.0.1:3307/live_auction"
    );
    const database = databaseUrl.pathname.replace(/^\//, "");
    const adapter = new PrismaMariaDb(
      {
        host: databaseUrl.hostname,
        port: Number(databaseUrl.port || 3306),
        user: decodeURIComponent(databaseUrl.username),
        password: decodeURIComponent(databaseUrl.password),
        database,
        connectionLimit: 5,
        connectTimeout: 1000
      },
      { database }
    );

    super({ adapter });
  }

  async checkConnection(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
