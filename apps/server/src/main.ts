import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { createCorsOriginDelegate } from "./common/cors-origins";
import { loadLocalEnv } from "./common/load-env";
import { resolveUploadStaticRoot } from "./common/upload-paths";

loadLocalEnv();

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false
  });
  const port = Number(process.env.SERVER_PORT || process.env.PORT || 3000);

  app.useBodyParser("json", { limit: "5mb" });
  app.useBodyParser("urlencoded", { extended: true, limit: "5mb" });
  app.useStaticAssets(resolveUploadStaticRoot(), {
    prefix: "/uploads/"
  });

  app.enableCors({
    origin: createCorsOriginDelegate(),
    credentials: true
  });

  await app.listen(port);
}

void bootstrap();
