const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopCalendar", {
  connectGoogle: () => ipcRenderer.invoke("auth:connect"),
  logoutGoogle: () => ipcRenderer.invoke("auth:logout"),
  authStatus: () => ipcRenderer.invoke("auth:status"),
  listEventsByDate: (dateText) => ipcRenderer.invoke("events:listByDate", dateText),
  listMonthEventDays: (year, month) => ipcRenderer.invoke("events:listMonthDays", year, month),
  createEvent: (payload) => ipcRenderer.invoke("events:create", payload),
  setPinned: (pinned) => ipcRenderer.invoke("window:setPinned", pinned),
  getPinned: () => ipcRenderer.invoke("window:getPinned")
});
