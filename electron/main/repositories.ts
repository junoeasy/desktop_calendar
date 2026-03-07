import { v4 as uuidv4 } from "uuid";
import dayjs from "dayjs";
import { getDb } from "./db";
import type { AppSettings, CalendarEntity, EventEntity, SyncQueueItem, User } from "../../shared/models";
import { computeRetryDelaySeconds, resolveByUpdatedAt } from "./syncUtils";

function nowIso() {
  return new Date().toISOString();
}

export const defaultSettings: AppSettings = {
  startupLaunch: false,
  minimizeToTray: true,
  desktopPinned: true,
  syncIntervalMinutes: 1,
  themeMode: "light",
  accentColor: "#2563eb",
  windowOpacity: 1
};

export const userRepository = {
  upsert(user: Pick<User, "googleAccountId" | "email" | "displayName">): User {
    const db = getDb();
    const existing = db
      .prepare("SELECT * FROM users WHERE google_account_id = ?")
      .get(user.googleAccountId) as
      | {
          id: string;
          google_account_id: string;
          email: string;
          display_name: string;
          created_at: string;
          updated_at: string;
        }
      | undefined;
    const ts = nowIso();
    if (!existing) {
      const id = uuidv4();
      db.prepare(
        "INSERT INTO users (id, google_account_id, email, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(id, user.googleAccountId, user.email, user.displayName, ts, ts);
      return { id, ...user, createdAt: ts, updatedAt: ts };
    }
    db.prepare("UPDATE users SET email = ?, display_name = ?, updated_at = ? WHERE id = ?").run(
      user.email,
      user.displayName,
      ts,
      existing.id
    );
    return {
      id: existing.id,
      googleAccountId: user.googleAccountId,
      email: user.email,
      displayName: user.displayName,
      createdAt: existing.created_at,
      updatedAt: ts
    };
  },
  getCurrent(): User | null {
    const db = getDb();
    const row = db.prepare("SELECT * FROM users ORDER BY updated_at DESC LIMIT 1").get() as
      | {
          id: string;
          google_account_id: string;
          email: string;
          display_name: string;
          created_at: string;
          updated_at: string;
        }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      googleAccountId: row.google_account_id,
      email: row.email,
      displayName: row.display_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
};

export const calendarRepository = {
  upsertMany(userId: string, calendars: Array<Partial<CalendarEntity> & { providerCalendarId: string; title: string }>) {
    const db = getDb();
    const ts = nowIso();
    const stmt = db.prepare(
      `INSERT INTO calendars (id, user_id, provider_calendar_id, title, color_hex, selected, etag, updated_at)
       VALUES (@id, @user_id, @provider_calendar_id, @title, @color_hex, @selected, @etag, @updated_at)
       ON CONFLICT(provider_calendar_id) DO UPDATE SET
         title=excluded.title, color_hex=excluded.color_hex, etag=excluded.etag, updated_at=excluded.updated_at`
    );
    const tx = db.transaction(() => {
      for (const cal of calendars) {
        stmt.run({
          id: cal.id ?? uuidv4(),
          user_id: userId,
          provider_calendar_id: cal.providerCalendarId,
          title: cal.title,
          color_hex: cal.colorHex ?? null,
          selected: cal.selected ?? 1,
          etag: cal.etag ?? null,
          updated_at: ts
        });
      }
    });
    tx();
  },
  listSelected() {
    const db = getDb();
    return db
      .prepare("SELECT * FROM calendars WHERE selected = 1 ORDER BY title ASC")
      .all() as Array<{ id: string; provider_calendar_id: string; title: string; selected: number; color_hex: string | null }>;
  },
  listAll() {
    const db = getDb();
    return db.prepare("SELECT * FROM calendars ORDER BY title ASC").all();
  },
  setSelected(id: string, selected: boolean) {
    getDb().prepare("UPDATE calendars SET selected = ?, updated_at = ? WHERE id = ?").run(selected ? 1 : 0, nowIso(), id);
  },
  setColor(id: string, colorHex: string) {
    getDb().prepare("UPDATE calendars SET color_hex = ?, updated_at = ? WHERE id = ?").run(colorHex, nowIso(), id);
  },
  getByProviderId(providerCalendarId: string) {
    return getDb()
      .prepare("SELECT * FROM calendars WHERE provider_calendar_id = ?")
      .get(providerCalendarId) as { id: string } | undefined;
  }
};

type DbEvent = {
  id: string;
  calendar_id: string;
  provider_event_id: string | null;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  all_day: number;
  etag: string | null;
  remote_updated_at: string | null;
  local_updated_at: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

function mapEvent(row: DbEvent): EventEntity {
  return {
    id: row.id,
    calendarId: row.calendar_id,
    providerEventId: row.provider_event_id,
    title: row.title,
    description: row.description,
    location: row.location,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    allDay: row.all_day,
    etag: row.etag,
    remoteUpdatedAt: row.remote_updated_at,
    localUpdatedAt: row.local_updated_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export const eventRepository = {
  listByDay(dateIso: string) {
    const day = dayjs(dateIso).format("YYYY-MM-DD");
    return (getDb()
      .prepare(
        `SELECT * FROM events
         WHERE deleted_at IS NULL
           AND date(datetime(starts_at), 'localtime') = date(?)
           AND calendar_id IN (SELECT id FROM calendars WHERE selected = 1)
         ORDER BY starts_at ASC`
      )
      .all(day) as DbEvent[]).map(mapEvent);
  },
  listByMonth(year: number, month: number) {
    const start = dayjs(`${year}-${String(month).padStart(2, "0")}-01`).startOf("month").toISOString();
    const end = dayjs(start).endOf("month").toISOString();
    return (getDb()
      .prepare(
        `SELECT * FROM events
         WHERE deleted_at IS NULL
           AND julianday(starts_at) <= julianday(?)
           AND julianday(ends_at) >= julianday(?)
           AND calendar_id IN (SELECT id FROM calendars WHERE selected = 1)
         ORDER BY starts_at ASC`
      )
      .all(end, start) as DbEvent[]).map(mapEvent);
  },
  listUpcoming(days = 7) {
    const start = nowIso();
    const end = dayjs().add(days, "day").toISOString();
    return (getDb()
      .prepare(
        `SELECT * FROM events
         WHERE deleted_at IS NULL
           AND julianday(starts_at) >= julianday(?)
           AND julianday(starts_at) <= julianday(?)
           AND calendar_id IN (SELECT id FROM calendars WHERE selected = 1)
         ORDER BY starts_at ASC`
      )
      .all(start, end) as DbEvent[]).map(mapEvent);
  },
  upsertLocal(input: Omit<EventEntity, "id" | "createdAt" | "updatedAt" | "localUpdatedAt" | "providerEventId" | "etag" | "remoteUpdatedAt" | "deletedAt"> & { id?: string }) {
    const id = input.id ?? uuidv4();
    const ts = nowIso();
    getDb()
      .prepare(
        `INSERT INTO events (
          id, calendar_id, provider_event_id, title, description, location,
          starts_at, ends_at, all_day, etag, remote_updated_at, local_updated_at,
          deleted_at, created_at, updated_at
        ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, NULL, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          calendar_id=excluded.calendar_id, title=excluded.title, description=excluded.description,
          location=excluded.location, starts_at=excluded.starts_at, ends_at=excluded.ends_at,
          all_day=excluded.all_day, local_updated_at=excluded.local_updated_at, updated_at=excluded.updated_at`
      )
      .run(id, input.calendarId, input.title, input.description ?? null, input.location ?? null, input.startsAt, input.endsAt, input.allDay, ts, ts, ts);
    return this.getById(id);
  },
  markDeleted(id: string) {
    const ts = nowIso();
    getDb().prepare("UPDATE events SET deleted_at = ?, local_updated_at = ?, updated_at = ? WHERE id = ?").run(ts, ts, ts, id);
  },
  hardDelete(id: string) {
    getDb().prepare("DELETE FROM events WHERE id = ?").run(id);
  },
  clearRemoteCache() {
    getDb().prepare("DELETE FROM events WHERE provider_event_id IS NOT NULL").run();
  },
  getById(id: string) {
    const row = getDb().prepare("SELECT * FROM events WHERE id = ?").get(id) as DbEvent | undefined;
    return row ? mapEvent(row) : null;
  },
  getByProviderEventId(providerEventId: string) {
    const row = getDb().prepare("SELECT * FROM events WHERE provider_event_id = ?").get(providerEventId) as DbEvent | undefined;
    return row ? mapEvent(row) : null;
  },
  upsertRemote(row: {
    calendarId: string;
    providerEventId: string;
    title: string;
    description: string | null;
    location: string | null;
    startsAt: string;
    endsAt: string;
    allDay: number;
    etag: string | null;
    remoteUpdatedAt: string | null;
  }) {
    const existing = getDb()
      .prepare("SELECT * FROM events WHERE provider_event_id = ?")
      .get(row.providerEventId) as DbEvent | undefined;
    const ts = nowIso();
    const id = existing?.id ?? uuidv4();
    getDb()
      .prepare(
        `INSERT INTO events (
          id, calendar_id, provider_event_id, title, description, location,
          starts_at, ends_at, all_day, etag, remote_updated_at, local_updated_at,
          deleted_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
        ON CONFLICT(provider_event_id) DO UPDATE SET
          calendar_id=excluded.calendar_id, title=excluded.title, description=excluded.description,
          location=excluded.location, starts_at=excluded.starts_at, ends_at=excluded.ends_at,
          all_day=excluded.all_day, etag=excluded.etag, remote_updated_at=excluded.remote_updated_at,
          deleted_at=NULL, updated_at=excluded.updated_at`
      )
      .run(
        id,
        row.calendarId,
        row.providerEventId,
        row.title,
        row.description,
        row.location,
        row.startsAt,
        row.endsAt,
        row.allDay,
        row.etag,
        row.remoteUpdatedAt,
        ts,
        existing?.created_at ?? ts,
        ts
      );
  },
  listPendingSync() {
    return (getDb()
      .prepare(
        `SELECT * FROM events
         WHERE local_updated_at > COALESCE(remote_updated_at, '1970-01-01T00:00:00.000Z')
            OR (deleted_at IS NOT NULL AND provider_event_id IS NOT NULL)`
      )
      .all() as DbEvent[]).map(mapEvent);
  },
  resolveConflict(local: EventEntity, remoteUpdatedAt: string | null) {
    return resolveByUpdatedAt(local.localUpdatedAt, remoteUpdatedAt);
  }
};

export const syncRepository = {
  enqueue(item: Pick<SyncQueueItem, "action" | "entityType" | "entityId" | "payloadJson">) {
    const ts = nowIso();
    getDb()
      .prepare(
        `INSERT INTO sync_queue (id, action, entity_type, entity_id, payload_json, attempts, next_retry_at, last_error, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, NULL, ?, ?)`
      )
      .run(uuidv4(), item.action, item.entityType, item.entityId, item.payloadJson, ts, ts, ts);
  },
  listReady(limit = 50) {
    return getDb()
      .prepare(
        `SELECT * FROM sync_queue
         WHERE next_retry_at <= ?
         ORDER BY created_at ASC
         LIMIT ?`
      )
      .all(nowIso(), limit) as SyncQueueItem[];
  },
  markSuccess(id: string) {
    getDb().prepare("DELETE FROM sync_queue WHERE id = ?").run(id);
  },
  markFailure(id: string, attempts: number, error: string) {
    const delaySec = computeRetryDelaySeconds(attempts);
    const nextRetryAt = dayjs().add(delaySec, "second").toISOString();
    getDb()
      .prepare("UPDATE sync_queue SET attempts = ?, next_retry_at = ?, last_error = ?, updated_at = ? WHERE id = ?")
      .run(attempts, nextRetryAt, error, nowIso(), id);
  },
  syncTokenKey(calendarProviderId: string) {
    return `google:${calendarProviderId}`;
  },
  setSyncToken(calendarProviderId: string, token: string | null) {
    const ts = nowIso();
    getDb()
      .prepare(
        `INSERT INTO sync_state (id, user_id, provider, sync_token, last_full_sync_at, updated_at)
         VALUES (?, '', 'google', ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET sync_token=excluded.sync_token, updated_at=excluded.updated_at`
      )
      .run(this.syncTokenKey(calendarProviderId), token, ts, ts);
  },
  getSyncToken(calendarProviderId: string) {
    const row = getDb()
      .prepare("SELECT sync_token FROM sync_state WHERE id = ?")
      .get(this.syncTokenKey(calendarProviderId)) as { sync_token: string | null } | undefined;
    return row?.sync_token ?? null;
  },
  clearAllSyncTokens() {
    getDb()
      .prepare("UPDATE sync_state SET sync_token = NULL, updated_at = ? WHERE provider = 'google'")
      .run(nowIso());
  }
};

export const settingsRepository = {
  normalize(settings: Partial<AppSettings>): AppSettings {
    const merged = { ...defaultSettings, ...settings };
    const opacity =
      typeof merged.windowOpacity === "number" && Number.isFinite(merged.windowOpacity)
        ? merged.windowOpacity
        : defaultSettings.windowOpacity;
    return {
      ...merged,
      windowOpacity: Math.min(1, Math.max(0.3, opacity))
    };
  },
  get(): AppSettings {
    const row = getDb().prepare("SELECT value_json FROM app_settings WHERE key='main'").get() as { value_json: string } | undefined;
    if (!row) {
      return defaultSettings;
    }
    try {
      return this.normalize(JSON.parse(row.value_json) as Partial<AppSettings>);
    } catch {
      return defaultSettings;
    }
  },
  update(patch: Partial<AppSettings>) {
    const next = this.normalize({ ...this.get(), ...patch });
    getDb()
      .prepare(
        `INSERT INTO app_settings (key, value_json, updated_at) VALUES ('main', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at`
      )
      .run(JSON.stringify(next), nowIso());
    return next;
  }
};
