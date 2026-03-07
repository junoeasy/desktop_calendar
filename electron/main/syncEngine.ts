import { google } from "googleapis";
import dayjs from "dayjs";
import { calendarRepository, eventRepository, syncRepository } from "./repositories";
import { getGoogleClient } from "./googleAuth";
import type { EventEntity } from "@shared/models";

export type SyncStatus = {
  running: boolean;
  lastSuccessAt: string | null;
  lastError: string | null;
};

const status: SyncStatus = {
  running: false,
  lastSuccessAt: null,
  lastError: null
};

function selectedCalendars() {
  return calendarRepository.listSelected();
}

export async function syncCalendarsFromGoogle(userId: string) {
  const client = getGoogleClient();
  if (!client) return [];
  const api = google.calendar({ version: "v3", auth: client });
  const resp = await api.calendarList.list({ maxResults: 250 });
  const calendars =
    resp.data.items?.map((item) => ({
      providerCalendarId: item.id ?? "",
      title: item.summary ?? "(Unnamed calendar)",
      colorHex: item.backgroundColor ?? null,
      selected: item.selected === false ? 0 : 1,
      etag: item.etag ?? null
    })) ?? [];
  calendarRepository.upsertMany(userId, calendars.filter((x) => x.providerCalendarId));
  return calendarRepository.listAll();
}

function toGoogleEvent(event: EventEntity) {
  if (event.allDay) {
    return {
      summary: event.title,
      description: event.description ?? undefined,
      location: event.location ?? undefined,
      start: { date: event.startsAt.slice(0, 10) },
      end: { date: dayjs(event.endsAt).add(1, "day").format("YYYY-MM-DD") }
    };
  }
  return {
    summary: event.title,
    description: event.description ?? undefined,
    location: event.location ?? undefined,
    start: { dateTime: event.startsAt },
    end: { dateTime: event.endsAt }
  };
}

async function pullFromGoogle() {
  const client = getGoogleClient();
  if (!client) {
    return;
  }
  const api = google.calendar({ version: "v3", auth: client });
  for (const cal of selectedCalendars()) {
    let syncToken = syncRepository.getSyncToken(cal.provider_calendar_id);
    const baseParams = {
      calendarId: cal.provider_calendar_id,
      maxResults: 1000,
      singleEvents: true,
      showDeleted: true
    };

    let pageToken: string | undefined;
    let nextSyncToken: string | null = null;
    do {
      let resp;
      try {
        resp = await api.events.list({
          ...baseParams,
          ...(syncToken ? { syncToken } : {}),
          ...(pageToken ? { pageToken } : {})
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const shouldReset =
          message.includes("Sync token is no longer valid") ||
          message.includes("full sync is required") ||
          message.includes("410");
        if (!shouldReset) {
          throw error;
        }
        syncRepository.setSyncToken(cal.provider_calendar_id, null);
        syncToken = null;
        pageToken = undefined;
        resp = await api.events.list(baseParams);
      }

      const items = resp.data.items ?? [];
      for (const item of items) {
        if (!item.id) continue;
        if (item.status === "cancelled") {
          const local = eventRepository
            .listPendingSync()
            .find((e) => e.providerEventId === item.id);
          if (local) {
            eventRepository.hardDelete(local.id);
          }
          continue;
        }
        const isAllDay = Boolean(item.start?.date && item.end?.date);
        const startsAt = isAllDay
          ? dayjs(item.start?.date).startOf("day").toISOString()
          : item.start?.dateTime ?? `${dayjs().format("YYYY-MM-DD")}T00:00:00.000Z`;
        // Google all-day end.date is exclusive; subtract one day for inclusive local storage.
        const endsAt = isAllDay
          ? dayjs(item.end?.date).subtract(1, "day").endOf("day").toISOString()
          : item.end?.dateTime ?? `${dayjs().format("YYYY-MM-DD")}T23:59:59.999Z`;
        eventRepository.upsertRemote({
          calendarId: cal.id,
          providerEventId: item.id,
          title: item.summary ?? "(No title)",
          description: item.description ?? null,
          location: item.location ?? null,
          startsAt,
          endsAt,
          allDay: isAllDay ? 1 : 0,
          etag: item.etag ?? null,
          remoteUpdatedAt: item.updated ?? null
        });
      }

      pageToken = resp.data.nextPageToken ?? undefined;
      nextSyncToken = resp.data.nextSyncToken ?? nextSyncToken;
    } while (pageToken);

    syncRepository.setSyncToken(cal.provider_calendar_id, nextSyncToken);
  }
}

async function pushQueue() {
  const client = getGoogleClient();
  if (!client) {
    return;
  }
  const api = google.calendar({ version: "v3", auth: client });
  const queue = syncRepository.listReady(50);
  for (const item of queue) {
    try {
      const payload = JSON.parse(item.payloadJson) as { eventId: string; calendarProviderId: string };
      const event = eventRepository.getById(payload.eventId);
      if (!event) {
        syncRepository.markSuccess(item.id);
        continue;
      }
      if (item.action === "delete") {
        if (event.providerEventId) {
          await api.events.delete({ calendarId: payload.calendarProviderId, eventId: event.providerEventId });
        }
        eventRepository.hardDelete(event.id);
        syncRepository.markSuccess(item.id);
        continue;
      }
      const body = toGoogleEvent(event);
      if (event.providerEventId) {
        const updated = await api.events.patch({
          calendarId: payload.calendarProviderId,
          eventId: event.providerEventId,
          requestBody: body
        });
        eventRepository.upsertRemote({
          calendarId: event.calendarId,
          providerEventId: updated.data.id ?? event.providerEventId,
          title: updated.data.summary ?? event.title,
          description: updated.data.description ?? event.description,
          location: updated.data.location ?? event.location,
          startsAt: updated.data.start?.dateTime ?? event.startsAt,
          endsAt: updated.data.end?.dateTime ?? event.endsAt,
          allDay: updated.data.start?.date ? 1 : event.allDay,
          etag: updated.data.etag ?? null,
          remoteUpdatedAt: updated.data.updated ?? null
        });
      } else {
        const created = await api.events.insert({
          calendarId: payload.calendarProviderId,
          requestBody: body
        });
        eventRepository.upsertRemote({
          calendarId: event.calendarId,
          providerEventId: created.data.id ?? "",
          title: created.data.summary ?? event.title,
          description: created.data.description ?? event.description,
          location: created.data.location ?? event.location,
          startsAt: created.data.start?.dateTime ?? event.startsAt,
          endsAt: created.data.end?.dateTime ?? event.endsAt,
          allDay: created.data.start?.date ? 1 : event.allDay,
          etag: created.data.etag ?? null,
          remoteUpdatedAt: created.data.updated ?? null
        });
      }
      syncRepository.markSuccess(item.id);
    } catch (error) {
      syncRepository.markFailure(item.id, item.attempts + 1, error instanceof Error ? error.message : String(error));
    }
  }
}

export async function runSync(forceFull = false) {
  if (status.running) {
    return status;
  }
  status.running = true;
  status.lastError = null;
  try {
    if (forceFull) {
      syncRepository.clearAllSyncTokens();
    }
    await pushQueue();
    if (forceFull) {
      eventRepository.clearRemoteCache();
    }
    await pullFromGoogle();
    status.lastSuccessAt = new Date().toISOString();
  } catch (error) {
    status.lastError = error instanceof Error ? error.message : String(error);
  } finally {
    status.running = false;
  }
  return status;
}

export function getSyncStatus() {
  return { ...status };
}
