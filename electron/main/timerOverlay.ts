import { app, BrowserWindow } from "electron";
import path from "node:path";
import Store from "electron-store";

let timerOverlayWindow: BrowserWindow | null = null;

type OverlayBounds = {
  width: number;
  height: number;
  x?: number;
  y?: number;
};

const overlayStore = new Store<{ timerOverlay: OverlayBounds }>({
  name: "timer-overlay-state",
  defaults: {
    timerOverlay: { width: 300, height: 190 }
  }
}) as unknown as {
  get: (key: "timerOverlay") => OverlayBounds;
  set: (key: "timerOverlay", value: OverlayBounds) => void;
};

export function showTimerOverlayWindow() {
  if (timerOverlayWindow && !timerOverlayWindow.isDestroyed()) {
    timerOverlayWindow.show();
    timerOverlayWindow.focus();
    return timerOverlayWindow;
  }

  const saved = overlayStore.get("timerOverlay");

  timerOverlayWindow = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    x: saved.x,
    y: saved.y,
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

  const saveBounds = () => {
    if (!timerOverlayWindow || timerOverlayWindow.isDestroyed()) return;
    overlayStore.set("timerOverlay", timerOverlayWindow.getBounds());
  };
  timerOverlayWindow.on("move", saveBounds);
  timerOverlayWindow.on("resize", saveBounds);
  timerOverlayWindow.on("close", saveBounds);
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
