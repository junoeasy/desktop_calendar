import http from "node:http";
import path from "node:path";
import { URL } from "node:url";
import { exec } from "node:child_process";
import { app } from "electron";
import { shell } from "electron";
import Store from "electron-store";
import { google } from "googleapis";
import dotenv from "dotenv";

function loadEnv() {
  const envPaths = new Set<string>();
  envPaths.add(path.join(process.cwd(), ".env"));
  envPaths.add(path.join(path.dirname(process.execPath), ".env"));
  envPaths.add(path.join(process.env.APPDATA ?? "", "desktopcal-sync", ".env"));
  envPaths.add(path.join(process.env.APPDATA ?? "", "DesktopCal Sync", ".env"));

  try {
    envPaths.add(path.join(process.resourcesPath, ".env"));
  } catch {
    // Ignore unavailable process.resourcesPath.
  }

  try {
    envPaths.add(path.join(app.getPath("userData"), ".env"));
  } catch {
    // Ignore unavailable userData path.
  }

  for (const envPath of envPaths) {
    dotenv.config({ path: envPath, override: false });
  }
}

loadEnv();

type TokenStore = {
  get: (key: "googleTokens") => Record<string, unknown> | undefined;
  set: (key: "googleTokens", value: Record<string, unknown>) => void;
  delete: (key: "googleTokens") => void;
};

const tokenStore = new Store({ name: "secure-tokens" }) as unknown as TokenStore;

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile"
];

function env(name: "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET" | "GOOGLE_REDIRECT_PORT") {
  const value = process.env[name];
  if (!value && name !== "GOOGLE_REDIRECT_PORT") {
    let userEnvPath = "AppData/Roaming/DesktopCal Sync/.env";
    try {
      userEnvPath = path.join(app.getPath("userData"), ".env");
    } catch {
      // Keep fallback display path.
    }
    throw new Error(`${name} is required (.env path: ${userEnvPath})`);
  }
  return value ?? "42813";
}

function createClient() {
  const redirect = `http://127.0.0.1:${env("GOOGLE_REDIRECT_PORT")}/oauth2callback`;
  const client = new google.auth.OAuth2(env("GOOGLE_CLIENT_ID"), env("GOOGLE_CLIENT_SECRET"), redirect);
  const tokens = tokenStore.get("googleTokens");
  if (tokens) {
    client.setCredentials(tokens);
  }
  client.on("tokens", (tokens) => {
    const prev = tokenStore.get("googleTokens") ?? {};
    tokenStore.set("googleTokens", { ...prev, ...tokens });
  });
  return client;
}

function waitForCode(port: number) {
  return new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      if (error) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(`Google auth failed: ${error}`);
        server.close();
        reject(new Error(error));
        return;
      }
      if (!code) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Authorization code missing.");
        server.close();
        reject(new Error("Missing authorization code"));
        return;
      }
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Connected. You can close this tab.");
      server.close();
      resolve(code);
    });
    server.listen(port, "127.0.0.1");
    server.on("error", reject);
  });
}

function openExternalWithFallback(url: string) {
  return new Promise<void>((resolve, reject) => {
    shell
      .openExternal(url, { activate: true })
      .then(() => resolve())
      .catch(() => {
        exec(`start "" "${url.replace(/"/g, '\\"')}"`, { shell: "cmd.exe" }, (error) => {
          if (error) {
            reject(new Error("\uBE0C\uB77C\uC6B0\uC800\uB97C \uC5F4 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uAE30\uBCF8 \uBE0C\uB77C\uC6B0\uC800 \uC124\uC815\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694."));
            return;
          }
          resolve();
        });
      });
  });
}

export async function signInWithGoogle() {
  const port = Number(env("GOOGLE_REDIRECT_PORT"));
  const client = createClient();
  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES
  });
  const codePromise = waitForCode(port);
  await openExternalWithFallback(authUrl);
  const code = await codePromise;
  const { tokens } = await client.getToken(code);
  tokenStore.set("googleTokens", tokens as unknown as Record<string, unknown>);
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const profile = await oauth2.userinfo.get();
  return {
    connected: true,
    account: {
      id: profile.data.id ?? "",
      email: profile.data.email ?? "",
      name: profile.data.name ?? "Google User"
    }
  };
}

export function signOutGoogle() {
  tokenStore.delete("googleTokens");
  return { connected: false };
}

export function getGoogleClient() {
  const client = createClient();
  const tokens = tokenStore.get("googleTokens");
  if (!tokens) {
    return null;
  }
  return client;
}

export function hasGoogleToken() {
  return Boolean(tokenStore.get("googleTokens"));
}

