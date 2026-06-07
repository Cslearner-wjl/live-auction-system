const DEFAULT_WEB_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174"
];

const WEB_ORIGIN_ENV_KEYS = ["ADMIN_WEB_URL", "MOBILE_WEB_URL"] as const;

export type CorsOriginCallback = (
  error: Error | null,
  allow?: boolean
) => void;

export type CorsOriginDelegate = (
  origin: string | undefined,
  callback: CorsOriginCallback
) => void;

export function getAllowedWebOrigins(
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const origins = new Set(DEFAULT_WEB_ORIGINS);

  for (const key of WEB_ORIGIN_ENV_KEYS) {
    for (const origin of parseOriginList(env[key])) {
      origins.add(origin);
    }
  }

  return [...origins];
}

export function createCorsOriginDelegate(
  origins: string[] = getAllowedWebOrigins()
): CorsOriginDelegate {
  const allowedOrigins = new Set(
    origins.map(normalizeOrigin).filter((origin) => origin.length > 0)
  );

  return (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    callback(null, allowedOrigins.has(normalizeOrigin(origin)));
  };
}

function parseOriginList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map(normalizeOrigin)
    .filter((origin) => origin.length > 0);
}

function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/+$/, "");
}
