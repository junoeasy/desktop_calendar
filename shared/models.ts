export type ThemeMode = "light" | "dark";

export type User = {
  id: string;
  googleAccountId: string;
  email: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
};

export type CalendarEntity = {
  id: string;
  userId: string;
  providerCalendarId: string;
  title: string;
  colorHex: string | null;
  selected: number;
  etag: string | null;
  updatedAt: string;
};

export type EventEntity = {
  id: string;
  calendarId: string;
  providerEventId: string | null;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  allDay: number;
  etag: string | null;
  remoteUpdatedAt: string | null;
  localUpdatedAt: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SyncQueueItem = {
  id: string;
  action: "create" | "update" | "delete";
  entityType: "event";
  entityId: string;
  payloadJson: string;
  attempts: number;
  nextRetryAt: string;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AppSettings = {
  startupLaunch: boolean;
  minimizeToTray: boolean;
  desktopPinned: boolean;
  syncIntervalMinutes: number;
  themeMode: ThemeMode;
  accentColor: string;
};

export type CalendarDayEventPreview = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
};

export type DayCellData = {
  date: string;
  events: CalendarDayEventPreview[];
  moreCount: number;
};
