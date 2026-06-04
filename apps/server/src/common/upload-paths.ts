import { existsSync } from "node:fs";
import { join } from "node:path";

export function resolveUploadStaticRoot(): string {
  const cwd = process.cwd();

  if (existsSync(join(cwd, "apps", "server"))) {
    return join(cwd, "apps", "server", "public", "uploads");
  }

  return join(cwd, "public", "uploads");
}
