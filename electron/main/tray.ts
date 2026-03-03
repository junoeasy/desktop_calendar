import path from "node:path";
import { app, BrowserWindow, Menu, Tray, nativeImage } from "electron";

let tray: Tray | null = null;

function createTrayIcon() {
  const iconPath = path.join(app.getAppPath(), "assets", "tray-calendar.png");
  let icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    icon = nativeImage.createFromDataURL(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAATUlEQVR42mNkoBAwUqifgYHhP4MDA8P/B4Qx0j8GhjEwMDD8x8DAwPAPRBkYGP4zMDCsB8RjC4xMDAwM/3EwcLC8B8QYKJhQw8A0AAbjQh7L7sRKAAAAAElFTkSuQmCC"
    );
  }
  return icon.resize({ width: 16, height: 16 });
}

export function createTray(mainWindow: BrowserWindow) {
  if (tray) {
    return tray;
  }

  tray = new Tray(createTrayIcon());
  tray.setToolTip("DesktopCal Sync");
  tray.on("double-click", () => {
    if (mainWindow.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow.show();
    }
  });

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "열기", click: () => mainWindow.show() },
      { label: "숨기기", click: () => mainWindow.hide() },
      { type: "separator" },
      { label: "종료", click: () => app.quit() }
    ])
  );

  return tray;
}
