const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs/promises");
const http = require("http");
const { URL } = require("url");
const dotenv = require("dotenv");
const { google } = require("googleapis");

dotenv.config();

const SCOPES = ["https://www.googleapis.com/auth/calendar"];
const TOKEN_FILE = "google_tokens.json";
let mainWindow = null;

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is missing in .env`);
  }
  return value;
}

function tokenFilePath() {
  return path.join(app.getPath("userData"), TOKEN_FILE);
}

function normalizeError(error) {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  if (error.response?.data?.error_description) return error.response.data.error_description;
  if (error.response?.data?.error) return JSON.stringify(error.response.data.error);
  if (error.message) return error.message;
  return String(error);
}

function createOAuthClient() {
  const clientId = requiredEnv("GOOGLE_CLIENT_ID");
  const clientSecret = requiredEnv("GOOGLE_CLIENT_SECRET");
  const port = Number(process.env.GOOGLE_REDIRECT_PORT || 42813);
  const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

async function saveTokens(tokens) {
  await fs.writeFile(tokenFilePath(), JSON.stringify(tokens, null, 2), "utf8");
}

async function loadTokens() {
  try {
    const raw = await fs.readFile(tokenFilePath(), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function clearTokens() {
  try {
    await fs.unlink(tokenFilePath());
  } catch {
    // No saved session yet.
  }
}

function waitForAuthCode(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const requestUrl = new URL(req.url, `http://127.0.0.1:${port}`);
      const code = requestUrl.searchParams.get("code");
      const error = requestUrl.searchParams.get("error");

      if (error) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Google authorization failed. You can close this tab.");
        server.close();
        reject(new Error(error));
        return;
      }

      if (!code) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("No authorization code received. You can close this tab.");
        server.close();
        reject(new Error("Missing authorization code"));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Google account connected. You can close this tab now.");
      server.close();
      resolve(code);
    });

    server.on("error", reject);
    server.listen(port, "127.0.0.1");
  });
}

async function authenticateWithGoogle() {
  const port = Number(process.env.GOOGLE_REDIRECT_PORT || 42813);
  const oauth2Client = createOAuthClient();
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES
  });

  const codePromise = waitForAuthCode(port);
  await shell.openExternal(authUrl);
  const code = await codePromise;
  const { tokens } = await oauth2Client.getToken(code);
  const previous = (await loadTokens()) || {};
  const merged = { ...previous, ...tokens };
  oauth2Client.setCredentials(merged);
  await saveTokens(merged);
  return { connected: true };
}

async function getAuthorizedClient() {
  const oauth2Client = createOAuthClient();
  const savedTokens = await loadTokens();
  if (!savedTokens) {
    return null;
  }

  let currentTokens = { ...savedTokens };
  oauth2Client.setCredentials(currentTokens);
  oauth2Client.on("tokens", async (tokens) => {
    currentTokens = { ...currentTokens, ...tokens };
    await saveTokens(currentTokens);
  });
  return oauth2Client;
}

function eventDto(item) {
  return {
    id: item.id,
    summary: item.summary || "(No title)",
    location: item.location || "",
    start: item.start?.dateTime || item.start?.date || "",
    end: item.end?.dateTime || item.end?.date || "",
    htmlLink: item.htmlLink || "",
    allDay: Boolean(item.start?.date)
  };
}

function dayRange(dateText) {
  const start = new Date(`${dateText}T00:00:00`);
  const end = new Date(`${dateText}T23:59:59.999`);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

async function listEventsByDate(dateText) {
  const auth = await getAuthorizedClient();
  if (!auth) {
    return { connected: false, events: [] };
  }

  const calendar = google.calendar({ version: "v3", auth });
  const { startIso, endIso } = dayRange(dateText);
  const result = await calendar.events.list({
    calendarId: "primary",
    timeMin: startIso,
    timeMax: endIso,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 100
  });

  return {
    connected: true,
    date: dateText,
    events: (result.data.items || []).map(eventDto)
  };
}

async function listMonthEventDays(year, month) {
  const auth = await getAuthorizedClient();
  if (!auth) {
    return { connected: false, days: [] };
  }

  const calendar = google.calendar({ version: "v3", auth });
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 1, 0, 0, 0, 0);

  const result = await calendar.events.list({
    calendarId: "primary",
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 500
  });

  const days = new Set();
  for (const item of result.data.items || []) {
    const raw = item.start?.dateTime || item.start?.date;
    if (!raw) continue;
    const dateText = raw.slice(0, 10);
    if (dateText.startsWith(`${year}-${String(month).padStart(2, "0")}`)) {
      days.add(dateText);
    }
  }
  return { connected: true, days: Array.from(days) };
}

function nextDateText(dateText) {
  const date = new Date(`${dateText}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function composeEventPayload(payload) {
  if (!payload || !payload.date || !payload.summary) {
    throw new Error("summary and date are required");
  }

  if (payload.allDay) {
    return {
      summary: payload.summary,
      location: payload.location || "",
      description: payload.description || "",
      start: { date: payload.date },
      end: { date: nextDateText(payload.date) }
    };
  }

  if (!payload.startTime || !payload.endTime) {
    throw new Error("startTime and endTime are required for timed events");
  }

  const start = new Date(`${payload.date}T${payload.startTime}:00`);
  const end = new Date(`${payload.date}T${payload.endTime}:00`);
  if (!(start < end)) {
    throw new Error("end time must be after start time");
  }

  return {
    summary: payload.summary,
    location: payload.location || "",
    description: payload.description || "",
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() }
  };
}

async function createEvent(payload) {
  const auth = await getAuthorizedClient();
  if (!auth) {
    return { connected: false };
  }

  const calendar = google.calendar({ version: "v3", auth });
  const event = composeEventPayload(payload);
  const result = await calendar.events.insert({
    calendarId: "primary",
    requestBody: event
  });

  return { connected: true, event: eventDto(result.data) };
}

async function probeConnection() {
  const auth = await getAuthorizedClient();
  if (!auth) {
    return { connected: false };
  }

  const calendar = google.calendar({ version: "v3", auth });
  await calendar.calendarList.list({ maxResults: 1 });
  return { connected: true };
}

function setPinned(pinned) {
  if (!mainWindow) {
    return { pinned: false };
  }
  mainWindow.setAlwaysOnTop(pinned, "screen-saver");
  return { pinned };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 860,
    minHeight: 620,
    autoHideMenuBar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
  ipcMain.handle("auth:connect", async () => {
    try {
      return await authenticateWithGoogle();
    } catch (error) {
      return { connected: false, error: normalizeError(error) };
    }
  });

  ipcMain.handle("auth:logout", async () => {
    await clearTokens();
    return { connected: false };
  });

  ipcMain.handle("auth:status", async () => {
    try {
      return await probeConnection();
    } catch (error) {
      return { connected: false, error: normalizeError(error) };
    }
  });

  ipcMain.handle("events:listByDate", async (_event, dateText) => {
    try {
      return await listEventsByDate(dateText);
    } catch (error) {
      return { connected: false, events: [], error: normalizeError(error) };
    }
  });

  ipcMain.handle("events:listMonthDays", async (_event, year, month) => {
    try {
      return await listMonthEventDays(year, month);
    } catch (error) {
      return { connected: false, days: [], error: normalizeError(error) };
    }
  });

  ipcMain.handle("events:create", async (_event, payload) => {
    try {
      return await createEvent(payload);
    } catch (error) {
      return { connected: false, error: normalizeError(error) };
    }
  });

  ipcMain.handle("window:setPinned", async (_event, pinned) => setPinned(Boolean(pinned)));
  ipcMain.handle("window:getPinned", async () => ({
    pinned: mainWindow ? mainWindow.isAlwaysOnTop() : false
  }));

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
