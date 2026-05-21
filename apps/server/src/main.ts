import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.SERVER_PORT ?? 3000);

  app.enableCors({
    origin: [
      process.env.ADMIN_WEB_URL ?? "http://localhost:5173",
      process.env.MOBILE_WEB_URL ?? "http://localhost:5174"
    ],
    credentials: true
  });

  await app.listen(port);
}

void bootstrap();
