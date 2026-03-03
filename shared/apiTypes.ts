import type { AppSettings, EventEntity, User } from "./models";

export type AuthStatus = {
  connected: boolean;
  user?: User | null;
};

export type CalendarRow = {
  id: string;
  user_id: string;
  provider_calendar_id: string;
  title: string;
  color_hex: string | null;
  selected: number;
  etag: string | null;
  updated_at: string;
};

export type MonthPreview = {
  date: string;
  events: Array<{ id: string; title: string; startsAt: string; endsAt: string; allDay: boolean; colorHex: string | null }>;
  moreCount: number;
};

export type SyncStatus = {
  running: boolean;
  lastSuccessAt: string | null;
  lastError: string | null;
};

export type DesktopCalBridge = {
  auth: {
    signIn: () => Promise<{ connected: true; user: User; calendars: CalendarRow[] } | { connected: false; error: string }>;
    signOut: () => Promise<{ connected: false }>;
    status: () => Promise<AuthStatus>;
  };
  settings: {
    get: () => Promise<AppSettings>;
    update: (patch: Partial<AppSettings>) => Promise<AppSettings>;
  };
  calendars: {
    list: () => Promise<CalendarRow[]>;
    setSelected: (payload: { calendarId: string; selected: boolean }) => Promise<CalendarRow[]>;
    setColor: (payload: { calendarId: string; colorHex: string }) => Promise<CalendarRow[]>;
  };
  events: {
    month: (payload: { year: number; month: number }) => Promise<MonthPreview[]>;
    day: (dateIso: string) => Promise<EventEntity[]>;
    create: (payload: Record<string, unknown>) => Promise<EventEntity>;
    update: (payload: Record<string, unknown>) => Promise<EventEntity>;
    delete: (payload: { eventId: string }) => Promise<{ ok: boolean }>;
  };
  sync: {
    now: (payload?: { forceFull?: boolean }) => Promise<SyncStatus>;
    status: () => Promise<SyncStatus>;
  };
  window: {
    setDesktopPinned: (pinned: boolean) => Promise<{ pinned: boolean }>;
  };
};
