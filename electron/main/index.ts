import { app, BrowserWindow } from "electron";
import { createMainWindow } from "./window";
import { createTray } from "./tray";
import { registerIpc } from "./ipc";
import { closeDb } from "./db";
import { runSync } from "./syncEngine";
import { settingsRepository } from "./repositories";

let mainWindow: BrowserWindow | null = null;
let syncTimer: NodeJS.Timeout | null = null;
let realtimeSyncTimer: NodeJS.Timeout | null = null;
let isQuitting = false;

function configureAutoLaunch() {
  const settings = settingsRepository.get();
  app.setLoginItemSettings({
    openAtLogin: settings.startupLaunch
  });
}

function configureSyncTimer() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
  const settings = settingsRepository.get();
  syncTimer = setInterval(() => {
    void runSync(false);
  }, settings.syncIntervalMinutes * 60 * 1000);
}

function configureRealtimeSyncTimer() {
  if (realtimeSyncTimer) {
    clearInterval(realtimeSyncTimer);
    realtimeSyncTimer = null;
  }
  realtimeSyncTimer = setInterval(() => {
    void runSync(false);
  }, 20 * 1000);
}

async function bootstrap() {
  mainWindow = createMainWindow();
  const settings = settingsRepository.get();
  mainWindow.setResizable(!settings.desktopPinned);
  mainWindow.setMaximizable(!settings.desktopPinned);
  registerIpc(mainWindow);
  createTray(mainWindow);
  configureAutoLaunch();
  configureSyncTimer();
  configureRealtimeSyncTimer();
  void runSync(false);

  mainWindow.on("close", (event) => {
    const settings = settingsRepository.get();
    if (settings.minimizeToTray && !isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  app.on("before-quit", () => {
    isQuitting = true;
  });
}

app.whenReady().then(() => {
  void bootstrap();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void bootstrap();
  } else {
    mainWindow?.show();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    if (syncTimer) clearInterval(syncTimer);
    if (realtimeSyncTimer) clearInterval(realtimeSyncTimer);
    closeDb();
    app.quit();
  }
});
