import { app, BrowserWindow, Menu, Tray, nativeImage } from "electron";

let tray: Tray | null = null;

export function createTray(mainWindow: BrowserWindow) {
  if (tray) {
    return tray;
  }
  const icon = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAATUlEQVR42mNkoBAwUqifgYHhP4MDA8P/B4Qx0j8GhjEwMDD8x8DAwPAPRBkYGP4zMDCsB8RjC4xMDAwM/3EwcLC8B8QYKJhQw8A0AAbjQh7L7sRKAAAAAElFTkSuQmCC"
  );
  tray = new Tray(icon);
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
