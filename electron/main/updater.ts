import path from "node:path";
import { app, BrowserWindow, dialog } from "electron";
import dotenv from "dotenv";
import { autoUpdater } from "electron-updater";

function loadEnv() {
  const envPaths = new Set<string>();
  envPaths.add(path.join(process.cwd(), ".env"));
  envPaths.add(path.join(path.dirname(process.execPath), ".env"));
  envPaths.add(path.join(process.env.APPDATA ?? "", "desktopcal-sync", ".env"));
  envPaths.add(path.join(process.env.APPDATA ?? "", "DesktopCal Sync", ".env"));
  try {
    envPaths.add(path.join(process.resourcesPath, ".env"));
  } catch {
    // ignore
  }
  try {
    envPaths.add(path.join(app.getPath("userData"), ".env"));
  } catch {
    // ignore
  }
  for (const envPath of envPaths) {
    dotenv.config({ path: envPath, override: false });
  }
}

loadEnv();

let checkingUpdates = false;

export function configureAutoUpdater(mainWindow: BrowserWindow) {
  if (!app.isPackaged) {
    return;
  }

  const feedUrl = process.env.AUTO_UPDATE_URL?.trim();
  if (feedUrl) {
    autoUpdater.setFeedURL({
      provider: "generic",
      url: feedUrl
    });
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("error", (error) => {
    console.warn("[auto-updater] error:", error instanceof Error ? error.message : String(error));
  });

  autoUpdater.on("update-available", () => {
    void dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "업데이트 확인",
      message: "새 버전이 있습니다. 다운로드를 시작합니다."
    });
  });

  autoUpdater.on("update-downloaded", () => {
    void dialog
      .showMessageBox(mainWindow, {
        type: "question",
        title: "업데이트 준비 완료",
        message: "업데이트가 준비되었습니다. 지금 설치하고 다시 시작할까요?",
        buttons: ["지금 설치", "나중에"],
        defaultId: 0,
        cancelId: 1
      })
      .then(({ response }) => {
        if (response === 0) {
          setImmediate(() => autoUpdater.quitAndInstall());
        }
      });
  });

  void autoUpdater.checkForUpdatesAndNotify();
}

export async function checkForUpdatesManually() {
  if (!app.isPackaged) {
    return {
      ok: false as const,
      status: "unsupported" as const,
      message: "Packaged app only. Update checks are disabled in dev mode."
    };
  }

  if (checkingUpdates) {
    return {
      ok: false as const,
      status: "checking" as const,
      message: "Update check is already running."
    };
  }

  checkingUpdates = true;
  try {
    const result = await autoUpdater.checkForUpdates();
    const nextVersion = result?.updateInfo?.version?.trim();
    const currentVersion = app.getVersion();
    if (nextVersion && nextVersion !== currentVersion) {
      return {
        ok: true as const,
        status: "available" as const,
        version: nextVersion,
        message: `Update found: v${nextVersion}. Download started.`
      };
    }
    return {
      ok: true as const,
      status: "none" as const,
      message: `You are up to date (v${currentVersion}).`
    };
  } catch (error) {
    return {
      ok: false as const,
      status: "error" as const,
      message: error instanceof Error ? error.message : String(error)
    };
  } finally {
    checkingUpdates = false;
  }
}
