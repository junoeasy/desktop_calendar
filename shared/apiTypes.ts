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

export type StudyTimerCompletion = {
  completedAt: string;
  savedToCalendar: boolean;
  eventId: string | null;
  message: string;
};

export type StudyTimerStatus = {
  active: boolean;
  running: boolean;
  paused: boolean;
  durationMinutes: number;
  problemName: string | null;
  startedAt: string | null;
  elapsedSeconds: number;
  remainingSeconds: number;
  overtimeSeconds: number;
  progress: number;
  elapsedLabel: string;
  remainingLabel: string;
  overtimeLabel: string;
  lastResult: StudyTimerCompletion | null;
};

export type SummaryEvent = {
  id: string;
  title: string;
  startsAt: string;
  allDay: number;
};

export type NotificationSummaryPayload = {
  generatedAt: string;
  today: SummaryEvent[];
  week: SummaryEvent[];
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
  timer: {
    start: (payload?: { durationMinutes?: number; problemName?: string }) => Promise<StudyTimerStatus>;
    pause: () => Promise<StudyTimerStatus>;
    resume: () => Promise<StudyTimerStatus>;
    stop: () => Promise<StudyTimerStatus>;
    complete: () => Promise<StudyTimerStatus & { completed: StudyTimerCompletion | null }>;
    status: () => Promise<StudyTimerStatus>;
  };
  summary: {
    get: () => Promise<NotificationSummaryPayload>;
  };
  window: {
    setDesktopPinned: (pinned: boolean) => Promise<{ pinned: boolean }>;
  };
  notifications: {
    onOpenSummary: (callback: (payload: NotificationSummaryPayload) => void) => () => void;
  };
};
