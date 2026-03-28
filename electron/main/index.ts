import { app, BrowserWindow, Notification } from "electron";
import dayjs from "dayjs";
import Store from "electron-store";
import { NOTIFICATION_EVENTS } from "../../shared/ipc";
import type { NotificationSummaryPayload } from "../../shared/apiTypes";
import { createMainWindow } from "./window";
import { createTray } from "./tray";
import { registerIpc } from "./ipc";
import { closeDb } from "./db";
import { runSync } from "./syncEngine";
import { eventRepository, settingsRepository } from "./repositories";
import { hideTimerOverlayWindow, showTimerOverlayWindow } from "./timerOverlay";
import { configureAutoUpdater } from "./updater";

let mainWindow: BrowserWindow | null = null;
let syncTimer: NodeJS.Timeout | null = null;
let realtimeSyncTimer: NodeJS.Timeout | null = null;
let reminderTimer: NodeJS.Timeout | null = null;
let isQuitting = false;
const WINDOW_MIN_WIDTH = 856;
const WINDOW_MIN_HEIGHT = 804;
const WINDOW_MAX_WIDTH = 10000;
const WINDOW_MAX_HEIGHT = 10000;

const reminderStore = new Store<{ notifiedReminderKeys: Record<string, string> }>({
  name: "reminder-state",
  defaults: {
    notifiedReminderKeys: {}
  }
}) as unknown as {
  get: (key: "notifiedReminderKeys") => Record<string, string>;
  set: (key: "notifiedReminderKeys", value: Record<string, string>) => void;
};

function getSummaryPayload(): NotificationSummaryPayload {
  const todayDate = dayjs().format("YYYY-MM-DD");
  const today = eventRepository.listByDay(todayDate).map((event) => ({
    id: event.id,
    title: event.title,
    startsAt: event.startsAt,
    allDay: event.allDay
  }));
  const week = eventRepository.listUpcoming(7).map((event) => ({
    id: event.id,
    title: event.title,
    startsAt: event.startsAt,
    allDay: event.allDay
  }));
  return {
    generatedAt: new Date().toISOString(),
    today,
    week
  };
}

function openSummaryPopupFromNotification() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
  mainWindow.webContents.send(NOTIFICATION_EVENTS.openSummary, getSummaryPayload());
}

function showDesktopNotification(title: string, body: string) {
  if (!Notification.isSupported()) {
    return;
  }
  const notification = new Notification({ title, body, silent: false });
  notification.on("click", () => {
    openSummaryPopupFromNotification();
  });
  notification.show();
}

function sendWeeklyDigestNotification() {
  const upcoming = eventRepository.listUpcoming(7);
  if (upcoming.length === 0) {
    showDesktopNotification("이번 주 일정", "앞으로 7일간 등록된 일정이 없습니다.");
    return;
  }
  const preview = upcoming
    .slice(0, 5)
    .map((event) => {
      const when = event.allDay ? dayjs(event.startsAt).format("M/D") : dayjs(event.startsAt).format("M/D HH:mm");
      return `${when} ${event.title}`;
    })
    .join("\n");
  const suffix = upcoming.length > 5 ? `\n외 ${upcoming.length - 5}건` : "";
  showDesktopNotification("이번 주 일정", `${upcoming.length}건\n${preview}${suffix}`);
}

function runDayBeforeReminderCheck() {
  const now = dayjs();
  const upcoming = eventRepository.listUpcoming(8);
  const notified = reminderStore.get("notifiedReminderKeys");
  const nextNotified = { ...notified };

  for (const event of upcoming) {
    const startAt = dayjs(event.startsAt);
    if (!startAt.isValid()) continue;
    if (startAt.isBefore(now)) continue;
    const reminderAt = startAt.subtract(1, "day");
    if (reminderAt.isAfter(now)) continue;

    const key = `${event.id}:${event.startsAt}`;
    if (nextNotified[key]) continue;

    const when = event.allDay ? `${startAt.format("M/D")} 하루 종일` : startAt.format("M/D HH:mm");
    showDesktopNotification("내일 일정 알림", `${when} ${event.title}`);
    nextNotified[key] = new Date().toISOString();
  }

  const pruneBefore = dayjs().subtract(35, "day");
  for (const [key, value] of Object.entries(nextNotified)) {
    if (dayjs(value).isBefore(pruneBefore)) {
      delete nextNotified[key];
    }
  }
  reminderStore.set("notifiedReminderKeys", nextNotified);
}

function configureReminderTimer() {
  if (reminderTimer) {
    clearInterval(reminderTimer);
    reminderTimer = null;
  }
  reminderTimer = setInterval(() => {
    runDayBeforeReminderCheck();
  }, 60 * 1000);
}

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
    runSync(false).catch((err: unknown) => console.error("[sync] Scheduled sync failed:", err));
  }, settings.syncIntervalMinutes * 60 * 1000);
}

function configureRealtimeSyncTimer() {
  if (realtimeSyncTimer) {
    clearInterval(realtimeSyncTimer);
    realtimeSyncTimer = null;
  }
  realtimeSyncTimer = setInterval(() => {
    runSync(false).catch((err: unknown) => console.error("[sync] Realtime sync failed:", err));
  }, 20 * 1000);
}

async function bootstrap() {
  mainWindow = createMainWindow();
  const settings = settingsRepository.get();
  mainWindow.setResizable(!settings.desktopPinned);
  mainWindow.setMaximizable(!settings.desktopPinned);
  mainWindow.setMovable(!settings.desktopPinned);
  mainWindow.setSkipTaskbar(settings.desktopPinned);
  if (!settings.desktopPinned) {
    mainWindow.setMinimumSize(WINDOW_MIN_WIDTH, WINDOW_MIN_HEIGHT);
    mainWindow.setMaximumSize(WINDOW_MAX_WIDTH, WINDOW_MAX_HEIGHT);
  }

  registerIpc(mainWindow, { showTimerOverlayWindow, hideTimerOverlayWindow });
  createTray(mainWindow);
  configureAutoLaunch();
  configureSyncTimer();
  configureRealtimeSyncTimer();
  configureReminderTimer();
  configureAutoUpdater(mainWindow);

  await runSync(false);
  sendWeeklyDigestNotification();
  runDayBeforeReminderCheck();

  mainWindow.on("close", (event) => {
    const nextSettings = settingsRepository.get();
    if (nextSettings.minimizeToTray && !isQuitting) {
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
    if (reminderTimer) clearInterval(reminderTimer);
    hideTimerOverlayWindow();
    closeDb();
    app.quit();
  }
});
