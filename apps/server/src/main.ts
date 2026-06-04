import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { resolveUploadStaticRoot } from "./common/upload-paths";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false
  });
  const port = Number(process.env.SERVER_PORT ?? 3000);

  app.useBodyParser("json", { limit: "5mb" });
  app.useBodyParser("urlencoded", { extended: true, limit: "5mb" });
  app.useStaticAssets(resolveUploadStaticRoot(), {
    prefix: "/uploads/"
  });

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
