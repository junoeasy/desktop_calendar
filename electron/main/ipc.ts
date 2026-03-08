import { BrowserWindow, ipcMain } from "electron";
import dayjs from "dayjs";
import { IPC_CHANNELS, calendarColorSchema, calendarSelectionSchema, eventDeleteSchema, eventUpsertSchema, monthQuerySchema, settingsUpdateSchema, syncTriggerSchema, timerStartSchema, windowResizeSchema } from "../../shared/ipc";
import { calendarRepository, eventRepository, settingsRepository, syncRepository, userRepository } from "./repositories";
import { hasGoogleToken, signInWithGoogle, signOutGoogle } from "./googleAuth";
import { getSyncStatus, runSync, syncCalendarsFromGoogle } from "./syncEngine";
import { buildQueuePayload } from "./queueMapper";
import { completeStudyTimer, getStudyTimerStatus, pauseStudyTimer, resumeStudyTimer, startStudyTimer, stopStudyTimer } from "./studyTimer";
import type { CalendarRow } from "../../shared/apiTypes";

const WINDOW_MIN_WIDTH = 360;
const WINDOW_MIN_HEIGHT = 280;
const WINDOW_MAX_WIDTH = 10000;
const WINDOW_MAX_HEIGHT = 10000;

function applyDesktopPinnedMode(mainWindow: BrowserWindow, pinned: boolean) {
  mainWindow.setResizable(!pinned);
  mainWindow.setMaximizable(!pinned);
  mainWindow.setMovable(!pinned);
  mainWindow.setSkipTaskbar(pinned);

  if (!pinned) {
    // Unpin 시 이전 고정 상태의 크기 제한이 남지 않도록 명시적으로 초기화한다.
    mainWindow.setMinimumSize(WINDOW_MIN_WIDTH, WINDOW_MIN_HEIGHT);
    mainWindow.setMaximumSize(WINDOW_MAX_WIDTH, WINDOW_MAX_HEIGHT);
  }
}

function dayList(year: number, month: number) {
  const events = eventRepository.listByMonth(year, month);
  const colors = new Map((calendarRepository.listAll() as CalendarRow[]).map((c) => [c.id, c.color_hex]));
  const grouped = new Map<string, typeof events>();
  for (const event of events) {
    const key = dayjs(event.startsAt).format("YYYY-MM-DD");
    grouped.set(key, [...(grouped.get(key) ?? []), event]);
  }
  return Array.from(grouped.entries()).map(([date, list]) => ({
    date,
    events: list
      .slice(0, 3)
      .map((e) => ({
        id: e.id,
        title: e.title,
        startsAt: e.startsAt,
        endsAt: e.endsAt,
        allDay: Boolean(e.allDay),
        colorHex: colors.get(e.calendarId) ?? null
      })),
    moreCount: Math.max(0, list.length - 3)
  }));
}

function summaryPayload() {
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

type RegisterIpcOptions = {
  showTimerOverlayWindow: () => void;
  hideTimerOverlayWindow: () => void;
};

export function registerIpc(mainWindow: BrowserWindow, options: RegisterIpcOptions) {
  ipcMain.handle(IPC_CHANNELS.authSignIn, async () => {
    try {
      const result = await signInWithGoogle();
      const user = userRepository.upsert({
        googleAccountId: result.account.id,
        email: result.account.email,
        displayName: result.account.name
      });
      const calendars = await syncCalendarsFromGoogle(user.id);
      void runSync(false);
      return { connected: true, user, calendars };
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.authSignOut, async () => {
    const result = signOutGoogle();
    syncRepository.clearAll();
    eventRepository.clearAll();
    calendarRepository.clearAll();
    userRepository.clearAll();
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.authStatus, async () => {
    const user = userRepository.getCurrent();
    return {
      connected: hasGoogleToken(),
      user
    };
  });

  ipcMain.handle(IPC_CHANNELS.settingsGet, async () => settingsRepository.get());
  ipcMain.handle(IPC_CHANNELS.settingsUpdate, async (_e, payload: unknown) => {
    const patch = settingsUpdateSchema.parse(payload);
    const settings = settingsRepository.update(patch);
    applyDesktopPinnedMode(mainWindow, settings.desktopPinned);
    return settings;
  });

  ipcMain.handle(IPC_CHANNELS.calendarList, async () => calendarRepository.listAll());
  ipcMain.handle(IPC_CHANNELS.calendarSelect, async (_e, payload: unknown) => {
    const input = calendarSelectionSchema.parse(payload);
    calendarRepository.setSelected(input.calendarId, input.selected);
    void runSync(false);
    return calendarRepository.listAll();
  });

  ipcMain.handle(IPC_CHANNELS.calendarColor, async (_e, payload: unknown) => {
    const input = calendarColorSchema.parse(payload);
    calendarRepository.setColor(input.calendarId, input.colorHex);
    return calendarRepository.listAll();
  });

  ipcMain.handle(IPC_CHANNELS.monthEvents, async (_e, payload: unknown) => {
    const input = monthQuerySchema.parse(payload);
    return dayList(input.year, input.month);
  });

  ipcMain.handle(IPC_CHANNELS.dayEvents, async (_e, dateIso: string) => {
    return eventRepository.listByDay(dateIso);
  });

  ipcMain.handle(IPC_CHANNELS.eventCreate, async (_e, payload: unknown) => {
    const input = eventUpsertSchema.parse(payload);
    const created = eventRepository.upsertLocal({
      calendarId: input.calendarId,
      title: input.title,
      description: input.description ?? null,
      location: input.location ?? null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      allDay: input.allDay ? 1 : 0
    });
    const cal = (calendarRepository.listAll() as CalendarRow[]).find((c) => c.id === input.calendarId);
    if (created && cal) {
      syncRepository.enqueue({
        action: "create",
        entityType: "event",
        entityId: created.id,
        payloadJson: buildQueuePayload(created.id, cal.provider_calendar_id)
      });
      void runSync(false);
    }
    return created;
  });

  ipcMain.handle(IPC_CHANNELS.eventUpdate, async (_e, payload: unknown) => {
    const input = eventUpsertSchema.parse(payload);
    const updated = eventRepository.upsertLocal({
      id: input.id,
      calendarId: input.calendarId,
      title: input.title,
      description: input.description ?? null,
      location: input.location ?? null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      allDay: input.allDay ? 1 : 0
    });
    const cal = (calendarRepository.listAll() as CalendarRow[]).find((c) => c.id === input.calendarId);
    if (updated && cal) {
      syncRepository.enqueue({
        action: "update",
        entityType: "event",
        entityId: updated.id,
        payloadJson: buildQueuePayload(updated.id, cal.provider_calendar_id)
      });
      void runSync(false);
    }
    return updated;
  });

  ipcMain.handle(IPC_CHANNELS.eventDelete, async (_e, payload: unknown) => {
    const input = eventDeleteSchema.parse(payload);
    const event = eventRepository.getById(input.eventId);
    if (!event) {
      return { ok: true };
    }
    eventRepository.markDeleted(event.id);
    const cal = (calendarRepository.listAll() as CalendarRow[]).find((c) => c.id === event.calendarId);
    if (cal) {
      syncRepository.enqueue({
        action: "delete",
        entityType: "event",
        entityId: event.id,
        payloadJson: buildQueuePayload(event.id, cal.provider_calendar_id)
      });
      void runSync(false);
    }
    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.syncNow, async (_e, payload: unknown) => {
    const input = syncTriggerSchema.parse(payload ?? {});
    return runSync(Boolean(input.forceFull));
  });

  ipcMain.handle(IPC_CHANNELS.syncStatus, async () => getSyncStatus());
  ipcMain.handle(IPC_CHANNELS.timerStart, async (_e, payload: unknown) => {
    const input = timerStartSchema.parse(payload ?? {});
    const status = startStudyTimer(input.durationMinutes, input.problemName);
    if (status.active) {
      options.showTimerOverlayWindow();
    }
    return status;
  });
  ipcMain.handle(IPC_CHANNELS.timerPause, async () => pauseStudyTimer());
  ipcMain.handle(IPC_CHANNELS.timerResume, async () => {
    const status = resumeStudyTimer();
    if (status.active) {
      options.showTimerOverlayWindow();
    }
    return status;
  });
  ipcMain.handle(IPC_CHANNELS.timerStop, async () => {
    const status = stopStudyTimer();
    options.hideTimerOverlayWindow();
    return status;
  });
  ipcMain.handle(IPC_CHANNELS.timerComplete, async () => {
    const status = completeStudyTimer();
    options.hideTimerOverlayWindow();
    return status;
  });
  ipcMain.handle(IPC_CHANNELS.timerStatus, async () => getStudyTimerStatus());
  ipcMain.handle(IPC_CHANNELS.summaryGet, async () => summaryPayload());

  ipcMain.handle(IPC_CHANNELS.desktopPinned, async (_e, pinned: boolean) => {
    applyDesktopPinnedMode(mainWindow, pinned);
    return { pinned };
  });

  ipcMain.handle(IPC_CHANNELS.windowGetBounds, async (event) => {
    const target = BrowserWindow.fromWebContents(event.sender);
    if (!target || target.isDestroyed()) {
      return null;
    }
    return target.getBounds();
  });

  ipcMain.handle(IPC_CHANNELS.windowResize, async (event, payload: unknown) => {
    const input = windowResizeSchema.parse(payload);
    const target = BrowserWindow.fromWebContents(event.sender);
    if (!target || target.isDestroyed()) {
      return null;
    }
    if (target.isMaximized()) {
      target.unmaximize();
    }
    const bounds = target.getBounds();
    target.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: input.width,
      height: input.height
    });
    return target.getBounds();
  });
}
