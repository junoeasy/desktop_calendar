import { app, BrowserWindow, screen } from "electron";
import path from "node:path";
import Store from "electron-store";

type WindowState = {
  width: number;
  height: number;
  x?: number;
  y?: number;
};

const windowStore = new Store<{ mainWindow: WindowState }>({
  name: "window-state",
  defaults: {
    mainWindow: { width: 1220, height: 800 }
  }
}) as unknown as {
  get: (key: "mainWindow") => WindowState;
  set: (key: "mainWindow", value: WindowState) => void;
};

export function createMainWindow() {
  const saved = windowStore.get("mainWindow");
  const display = screen.getPrimaryDisplay().workAreaSize;
  const width = Math.min(saved.width, display.width);
  const height = Math.min(saved.height, display.height);
  const window = new BrowserWindow({
    width,
    height,
    x: saved.x,
    y: saved.y,
    icon: path.join(app.getAppPath(), "assets", "app.ico"),
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    title: "DesktopCal Sync",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const devServer = process.env.VITE_DEV_SERVER_URL;
  if (devServer) {
    void window.loadURL(devServer);
  } else {
    const rendererEntry = path.join(app.getAppPath(), "dist-renderer", "index.html");
    void window.loadFile(rendererEntry);
  }

  window.webContents.on("did-fail-load", (_event, code, description, validatedURL) => {
    console.error("Renderer load failed", { code, description, validatedURL });
  });

  const saveBounds = () => {
    if (window.isMinimized() || window.isMaximized()) return;
    const bounds = window.getBounds();
    windowStore.set("mainWindow", bounds);
  };
  window.on("resize", saveBounds);
  window.on("move", saveBounds);
  return window;
}
