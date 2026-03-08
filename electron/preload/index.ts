import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS, NOTIFICATION_EVENTS } from "../../shared/ipc";
import type { NotificationSummaryPayload } from "../../shared/apiTypes";

const api = {
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
    stop: () => ipcRenderer.invoke(IPC_CHANNELS.timerStop),
    complete: () => ipcRenderer.invoke(IPC_CHANNELS.timerComplete),
    status: () => ipcRenderer.invoke(IPC_CHANNELS.timerStatus)
  },
  summary: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.summaryGet)
  },
  window: {
    setDesktopPinned: (pinned: boolean) => ipcRenderer.invoke(IPC_CHANNELS.desktopPinned, pinned)
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
