import http from "node:http";
import { exec } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { URL } from "node:url";
import { shell } from "electron";
import Store from "electron-store";
import { google } from "googleapis";
import { CodeChallengeMethod } from "google-auth-library";
import { loadPublicAppConfig } from "./appConfig";

type TokenStore = {
  get: (key: "googleTokens") => Record<string, unknown> | undefined;
  set: (key: "googleTokens", value: Record<string, unknown>) => void;
  delete: (key: "googleTokens") => void;
};

const tokenStore = new Store({ name: "secure-tokens" }) as unknown as TokenStore;

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/tasks",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile"
];

function getGoogleConfig() {
  const config = loadPublicAppConfig();
  const clientId = config.googleClientId.trim();
  if (!clientId || clientId.startsWith("YOUR_GOOGLE_DESKTOP_CLIENT_ID")) {
    throw new Error("googleClientId is not configured. Update config/app.public.json");
  }
  const clientSecret = (config.googleClientSecret ?? "").trim();
  if (!clientSecret || clientSecret === "SET_DESKTOP_CLIENT_SECRET_HERE") {
    throw new Error("googleClientSecret is not configured. Update config/app.public.json");
  }

  const redirectPort = Number(config.googleRedirectPort ?? 42813);
  if (!Number.isFinite(redirectPort) || redirectPort <= 0) {
    throw new Error("googleRedirectPort must be a positive number in config/app.public.json");
  }

  return { clientId, clientSecret, redirectPort };
}

function createClient() {
  const { clientId, clientSecret, redirectPort } = getGoogleConfig();
  const redirect = `http://127.0.0.1:${redirectPort}/oauth2callback`;
  const client = new google.auth.OAuth2(clientId, clientSecret, redirect);
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

function toBase64Url(buffer: Buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function generatePkcePair() {
  const codeVerifier = toBase64Url(randomBytes(64));
  const codeChallenge = toBase64Url(createHash("sha256").update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
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
            reject(new Error("Could not open browser. Check your default browser settings."));
            return;
          }
          resolve();
        });
      });
  });
}

let cachedGoogleClient: ReturnType<typeof createClient> | null = null;

export async function signInWithGoogle() {
  cachedGoogleClient = null;
  const { redirectPort: port } = getGoogleConfig();
  const client = createClient();
  const { codeVerifier, codeChallenge } = generatePkcePair();

  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    code_challenge_method: CodeChallengeMethod.S256,
    code_challenge: codeChallenge
  });

  const codePromise = waitForCode(port);
  await openExternalWithFallback(authUrl);
  const code = await codePromise;

  const { tokens } = await client.getToken({
    code,
    codeVerifier
  });

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
  cachedGoogleClient = null;
  tokenStore.delete("googleTokens");
  return { connected: false };
}

export function getGoogleClient() {
  const tokens = tokenStore.get("googleTokens");
  if (!tokens) {
    cachedGoogleClient = null;
    return null;
  }
  if (!cachedGoogleClient) {
    cachedGoogleClient = createClient();
  }
  return cachedGoogleClient;
}

export function hasGoogleToken() {
  return Boolean(tokenStore.get("googleTokens"));
}
