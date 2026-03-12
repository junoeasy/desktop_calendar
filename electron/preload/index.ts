import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS, NOTIFICATION_EVENTS } from "../../shared/ipc";
import type { NotificationSummaryPayload } from "../../shared/apiTypes";

const api = {
  app: {
    version: () => ipcRenderer.invoke(IPC_CHANNELS.appVersion)
  },
  auth: {
    signIn: () => ipcRenderer.invoke(IPC_CHANNELS.authSignIn),
    signOut: () => ipcRenderer.invoke(IPC_CHANNELS.authSignOut),
    status: () => ipcRenderer.invoke(IPC_CHANNELS.authStatus)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGet),
    update: (patch: unknown) => ipcRenderer.invoke(IPC_CHANNELS.settingsUpdate, patch)
  },
  calendars: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.calendarList),
    setSelected: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.calendarSelect, payload),
    setColor: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.calendarColor, payload)
  },
  events: {
    month: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.monthEvents, payload),
    day: (dateIso: string) => ipcRenderer.invoke(IPC_CHANNELS.dayEvents, dateIso),
    create: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.eventCreate, payload),
    update: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.eventUpdate, payload),
    delete: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.eventDelete, payload)
  },
  sync: {
    now: (payload?: unknown) => ipcRenderer.invoke(IPC_CHANNELS.syncNow, payload ?? {}),
    status: () => ipcRenderer.invoke(IPC_CHANNELS.syncStatus)
  },
  timer: {
    start: (payload?: unknown) => ipcRenderer.invoke(IPC_CHANNELS.timerStart, payload ?? {}),
    pause: () => ipcRenderer.invoke(IPC_CHANNELS.timerPause),
    resume: () => ipcRenderer.invoke(IPC_CHANNELS.timerResume),
    save: () => ipcRenderer.invoke(IPC_CHANNELS.timerSave),
    stop: () => ipcRenderer.invoke(IPC_CHANNELS.timerStop),
    resumeSaved: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.timerResumeSaved, payload),
    deleteSaved: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.timerDeleteSaved, payload),
    savedList: () => ipcRenderer.invoke(IPC_CHANNELS.timerSavedList),
    complete: () => ipcRenderer.invoke(IPC_CHANNELS.timerComplete),
    status: () => ipcRenderer.invoke(IPC_CHANNELS.timerStatus)
  },
  summary: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.summaryGet)
  },
  window: {
    setDesktopPinned: (pinned: boolean) => ipcRenderer.invoke(IPC_CHANNELS.desktopPinned, pinned),
    getBounds: () => ipcRenderer.invoke(IPC_CHANNELS.windowGetBounds),
    resize: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.windowResize, payload)
  },
  openclaw: {
    chat: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.openClawChat, payload),
    createEvent: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.openClawCreateEvent, payload)
  },
  tasks: {
    byDate: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.tasksByDate, payload),
    today: () => ipcRenderer.invoke(IPC_CHANNELS.tasksToday),
    complete: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.taskComplete, payload),
    create: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.taskCreate, payload),
    delete: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.taskDelete, payload)
  },
  notifications: {
    onOpenSummary: (callback: (payload: NotificationSummaryPayload) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: NotificationSummaryPayload) => callback(payload);
      ipcRenderer.on(NOTIFICATION_EVENTS.openSummary, handler);
      return () => {
        ipcRenderer.off(NOTIFICATION_EVENTS.openSummary, handler);
      };
    }
  }
};

contextBridge.exposeInMainWorld("desktopCalApi", api);
