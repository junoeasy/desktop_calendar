import { z } from "zod";

export const eventUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  calendarId: z.string().uuid(),
  title: z.string().min(1).max(150),
  description: z.string().max(2000).nullable().optional(),
  location: z.string().max(255).nullable().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  allDay: z.boolean()
});

export const eventDeleteSchema = z.object({
  eventId: z.string().uuid()
});

export const monthQuerySchema = z.object({
  year: z.number().int().min(1970).max(2200),
  month: z.number().int().min(1).max(12)
});

export const syncTriggerSchema = z.object({
  forceFull: z.boolean().optional()
});

export const settingsUpdateSchema = z.object({
  startupLaunch: z.boolean().optional(),
  minimizeToTray: z.boolean().optional(),
  desktopPinned: z.boolean().optional(),
  syncIntervalMinutes: z.number().int().min(1).max(120).optional(),
  themeMode: z.enum(["light", "dark"]).optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  windowOpacity: z.number().min(0.3).max(1).optional()
});

export const calendarSelectionSchema = z.object({
  calendarId: z.string().uuid(),
  selected: z.boolean()
});

export const calendarColorSchema = z.object({
  calendarId: z.string().uuid(),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/)
});

export type EventUpsertInput = z.infer<typeof eventUpsertSchema>;
export type EventDeleteInput = z.infer<typeof eventDeleteSchema>;
export type MonthQueryInput = z.infer<typeof monthQuerySchema>;
export type SyncTriggerInput = z.infer<typeof syncTriggerSchema>;
export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;
export type CalendarSelectionInput = z.infer<typeof calendarSelectionSchema>;
export type CalendarColorInput = z.infer<typeof calendarColorSchema>;

export const IPC_CHANNELS = {
  authSignIn: "auth:sign-in",
  authSignOut: "auth:sign-out",
  authStatus: "auth:status",
  settingsGet: "settings:get",
  settingsUpdate: "settings:update",
  calendarList: "calendar:list",
  calendarSelect: "calendar:select",
  calendarColor: "calendar:color",
  monthEvents: "event:month",
  dayEvents: "event:day",
  eventCreate: "event:create",
  eventUpdate: "event:update",
  eventDelete: "event:delete",
  syncNow: "sync:now",
  syncStatus: "sync:status",
  summaryGet: "summary:get",
  desktopPinned: "window:desktop-pinned",
  setTrayMinimize: "window:tray-minimize"
} as const;

export const NOTIFICATION_EVENTS = {
  openSummary: "notification:open-summary"
} as const;
