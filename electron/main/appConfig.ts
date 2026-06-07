import fs from "node:fs";
import path from "node:path";

type PublicAppConfig = {
  googleClientId: string;
  googleClientSecret?: string;
  googleRedirectPort?: number;
};

let cachedConfig: PublicAppConfig | null = null;

function readConfigFrom(pathname: string): PublicAppConfig | null {
  if (!fs.existsSync(pathname)) {
    return null;
  }
  const raw = fs.readFileSync(pathname, "utf-8");
  const parsed = JSON.parse(raw) as PublicAppConfig;
  if (!parsed.googleClientId || typeof parsed.googleClientId !== "string") {
    throw new Error(`Invalid googleClientId in config: ${pathname}`);
  }
  return parsed;
}

export function loadPublicAppConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }

  const candidates = [
    path.resolve(__dirname, "../../../config/app.public.json"),
    path.resolve(process.cwd(), "config/app.public.json")
  ];

  for (const candidate of candidates) {
    const config = readConfigFrom(candidate);
    if (config) {
      cachedConfig = config;
      return config;
    }
  }

  throw new Error(
    `Missing app config file. Expected one of: ${candidates.join(", ")}`
  );
}
