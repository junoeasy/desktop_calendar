import { app, BrowserWindow } from "electron";
import path from "node:path";

let timerOverlayWindow: BrowserWindow | null = null;

export function showTimerOverlayWindow() {
  if (timerOverlayWindow && !timerOverlayWindow.isDestroyed()) {
    timerOverlayWindow.show();
    timerOverlayWindow.focus();
    return timerOverlayWindow;
  }

  timerOverlayWindow = new BrowserWindow({
    width: 300,
    height: 190,
    resizable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    title: "Study Timer",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  timerOverlayWindow.setAlwaysOnTop(true, "screen-saver");
  timerOverlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  const devServer = process.env.VITE_DEV_SERVER_URL;
  if (devServer) {
    void timerOverlayWindow.loadURL(`${devServer}#timer-overlay`);
  } else {
    const rendererEntry = path.join(app.getAppPath(), "dist-renderer", "index.html");
    void timerOverlayWindow.loadFile(rendererEntry, { hash: "timer-overlay" });
  }

  timerOverlayWindow.on("closed", () => {
    timerOverlayWindow = null;
  });

  return timerOverlayWindow;
}

export function hideTimerOverlayWindow() {
  if (!timerOverlayWindow || timerOverlayWindow.isDestroyed()) {
    timerOverlayWindow = null;
    return;
  }
  timerOverlayWindow.close();
  timerOverlayWindow = null;
}
