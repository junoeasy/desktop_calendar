import { BrowserWindow, ipcMain } from "electron";
import dayjs from "dayjs";
import { IPC_CHANNELS, calendarColorSchema, calendarSelectionSchema, eventDeleteSchema, eventUpsertSchema, monthQuerySchema, openClawChatSchema, openClawCreateEventSchema, settingsUpdateSchema, syncTriggerSchema, timerStartSchema, windowResizeSchema } from "../../shared/ipc";
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
    // Unpin ???댁쟾 怨좎젙 ?곹깭???ш린 ?쒗븳???⑥? ?딅룄濡?紐낆떆?곸쑝濡?珥덇린?뷀븳??
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

function extractOpenClawText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const raw = payload as {
    message?: string | { content?: string };
    reply?: string;
    output_text?: string;
    content?: string;
    choices?: Array<{ message?: { content?: string }; text?: string }>;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  };
  if (typeof raw.content === "string" && raw.content.trim().length > 0) return raw.content.trim();
  if (typeof raw.reply === "string" && raw.reply.trim().length > 0) return raw.reply.trim();
  if (typeof raw.output_text === "string" && raw.output_text.trim().length > 0) return raw.output_text.trim();
  if (typeof raw.message === "string" && raw.message.trim().length > 0) return raw.message.trim();
  if (raw.message && typeof raw.message === "object" && typeof raw.message.content === "string" && raw.message.content.trim().length > 0) {
    return raw.message.content.trim();
  }
  const firstChoice = raw.choices?.[0];
  if (firstChoice?.message?.content && firstChoice.message.content.trim().length > 0) return firstChoice.message.content.trim();
  if (firstChoice?.text && firstChoice.text.trim().length > 0) return firstChoice.text.trim();
  const outputText = raw.output?.[0]?.content?.[0]?.text;
  if (typeof outputText === "string" && outputText.trim().length > 0) return outputText.trim();
  return null;
}

function hasCreateSignalEnvelope(payload: unknown) {
  if (!payload || typeof payload !== "object") return false;
  const raw = payload as { signals?: Array<{ kind?: string }> };
  return Array.isArray(raw.signals) && raw.signals.some((signal) => signal?.kind === "create_event");
}

function buildOpenClawCandidateEndpoints(endpoint: string): string[] {
  const candidates = new Set<string>();
  candidates.add(endpoint);

  try {
    const url = new URL(endpoint);
    const addPath = (pathname: string, port?: string) => {
      const next = new URL(url.toString());
      next.pathname = pathname;
      if (port) next.port = port;
      candidates.add(next.toString());
    };

    addPath("/v1/chat/completions");
    addPath("/v1/responses");
    addPath("/chat/completions");
    addPath("/responses");

    if (url.port === "18789") {
      addPath("/v1/chat/completions", "18792");
      addPath("/v1/responses", "18792");
      addPath("/chat/completions", "18792");
      addPath("/responses", "18792");
    }
  } catch {
    // Keep original endpoint only if URL parsing fails.
  }

  return Array.from(candidates);
}

type OpenClawMessage = { role: "user" | "assistant"; content: string };

function buildOpenClawHeaders() {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  const apiKey = process.env.OPENCLAW_API_KEY?.trim();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

async function requestOpenClaw(messages: OpenClawMessage[]) {
  const endpoint = process.env.OPENCLAW_CHAT_URL?.trim();
  if (!endpoint) {
    return { ok: false as const, error: "OPENCLAW_CHAT_URL environment variable is not set." };
  }

  const model = process.env.OPENCLAW_MODEL?.trim();
  const body: Record<string, unknown> = {
    messages,
    stream: false
  };
  if (model) {
    body.model = model;
  }
  const headers = buildOpenClawHeaders();

  const send = async (url: string, requestBody: Record<string, unknown>) =>
    fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody)
    });

  const parseResponse = async (response: Response) => {
    const rawText = await response.text();
    let json: unknown = null;
    try {
      json = rawText ? JSON.parse(rawText) : null;
    } catch {
      json = null;
    }
    return { response, rawText, json };
  };

  try {
    const endpointCandidates = buildOpenClawCandidateEndpoints(endpoint);
    let lastParsed: { response: Response; rawText: string; json: unknown } | null = null;

    for (const candidate of endpointCandidates) {
      const responsesBody: Record<string, unknown> = {
        model: body.model ?? "openclaw:main",
        input: messages.map((m) => `${m.role}: ${m.content}`).join("\n")
      };
      const requestBodies =
        candidate.includes("/responses") || candidate.endsWith("/responses")
          ? [responsesBody]
          : [body, responsesBody];

      for (const requestBody of requestBodies) {
        const parsed = await parseResponse(await send(candidate, requestBody));
        lastParsed = parsed;
        if (parsed.response.ok) {
          const content = hasCreateSignalEnvelope(parsed.json)
            ? parsed.rawText?.trim()
            : (extractOpenClawText(parsed.json) ?? parsed.rawText?.trim());
          if (!content) {
            return { ok: false as const, error: "Could not read OpenClaw response body." };
          }
          return { ok: true as const, content };
        }

        if (parsed.response.status === 404 || parsed.response.status === 405 || parsed.response.status === 400) {
          continue;
        }

        const detail = extractOpenClawText(parsed.json) ?? parsed.rawText;
        return { ok: false as const, error: `OpenClaw response error (${parsed.response.status})${detail ? `: ${detail}` : ""}` };
      }
    }

    if (lastParsed) {
      const detail = extractOpenClawText(lastParsed.json) ?? lastParsed.rawText;
      return { ok: false as const, error: `OpenClaw response error (${lastParsed.response.status})${detail ? `: ${detail}` : ""}` };
    }
    return { ok: false as const, error: "OpenClaw endpoint could not be reached." };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

type ParsedAiEvent = {
  title: string;
  startsAt: string;
  endsAt?: string;
  allDay?: boolean;
  description?: string | null;
  location?: string | null;
  calendarId?: string;
  calendarTitle?: string;
};

type OpenClawSignalEnvelope = {
  reply?: string;
  signals?: Array<{ kind?: string; payload?: ParsedAiEvent }>;
};

function extractJsonBlock(text: string): ParsedAiEvent | null {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidates = [fenceMatch?.[1], trimmed].filter((item): item is string => Boolean(item));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as ParsedAiEvent;
    } catch {
      const start = candidate.indexOf("{");
      const end = candidate.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(candidate.slice(start, end + 1)) as ParsedAiEvent;
        } catch {
          // Try next candidate.
        }
      }
    }
  }
  return null;
}

function extractOpenClawEnvelope(text: string): OpenClawSignalEnvelope | null {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidates = [fenceMatch?.[1], trimmed].filter((item): item is string => Boolean(item));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as OpenClawSignalEnvelope;
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    } catch {
      // Try next candidate.
    }
  }
  return null;
}

function pickDefaultCalendarId() {
  const calendars = calendarRepository.listAll() as CalendarRow[];
  const normalizeTitle = (value: string) => value.trim().toLowerCase().replace(/\s+/g, "").replace(/캘린더$/g, "");
  const selected = calendars.filter((calendar) => calendar.selected === 1);
  const selectedPool = selected.length > 0 ? selected : calendars;
  const preferred = selectedPool.find((calendar) => normalizeTitle(calendar.title).includes("일정"));
  if (preferred) return preferred.id;
  return selectedPool[0]?.id ?? null;
}

function resolveCalendarId(inputCalendarId: string | undefined, parsed: ParsedAiEvent, userMessage: string | undefined) {
  const calendars = calendarRepository.listAll() as CalendarRow[];
  const normalizeTitle = (value: string) => value.trim().toLowerCase().replace(/\s+/g, "").replace(/캘린더$/g, "");
  const findByTitleKeyword = (keyword: string) => {
    const normalizedKeyword = normalizeTitle(keyword);
    const selected = calendars.filter((calendar) => calendar.selected === 1);
    const selectedPool = selected.length > 0 ? selected : calendars;
    const exact = selectedPool.find((calendar) => normalizeTitle(calendar.title) === normalizedKeyword);
    if (exact) return exact.id;
    const contains = selectedPool.find((calendar) => normalizeTitle(calendar.title).includes(normalizedKeyword));
    if (contains) return contains.id;
    return null;
  };
  if (inputCalendarId) {
    return calendars.find((calendar) => calendar.id === inputCalendarId)?.id ?? null;
  }

  const parsedCalendarId = parsed.calendarId?.trim();
  if (parsedCalendarId) {
    const byId = calendars.find((calendar) => calendar.id === parsedCalendarId);
    if (byId) return byId.id;
  }

  const parsedCalendarTitle = parsed.calendarTitle?.trim().toLowerCase();
  if (parsedCalendarTitle) {
    const normalizedTarget = normalizeTitle(parsedCalendarTitle);
    const byTitle = calendars.find((calendar) => normalizeTitle(calendar.title) === normalizedTarget);
    if (byTitle) return byTitle.id;
    const byContains = calendars.find((calendar) => {
      const normalizedTitle = normalizeTitle(calendar.title);
      return normalizedTitle.includes(normalizedTarget) || normalizedTarget.includes(normalizedTitle);
    });
    if (byContains) return byContains.id;
  }

  const parsedTitle = parsed.title?.trim();
  if (parsedTitle) {
    const inferred = calendars.find((calendar) => parsedTitle.includes(`[${calendar.title}]`) || parsedTitle.includes(calendar.title));
    if (inferred) return inferred.id;
  }

  const sourceText = `${parsed.title ?? ""} ${parsed.description ?? ""} ${userMessage ?? ""}`.toLowerCase();
  const employmentKeywords = ["이력서", "자소서", "포트폴리오", "취업", "면접", "채용", "지원", "회사", "인턴"];
  const studyKeywords = ["시험", "공부", "학습", "강의", "과제", "문제풀이", "토익", "토플", "코테", "코딩테스트"];
  const scheduleKeywords = ["약속", "일정", "미팅", "회의", "병원", "식사", "모임", "데이트", "방문"];

  if (employmentKeywords.some((keyword) => sourceText.includes(keyword))) {
    const id = findByTitleKeyword("취업");
    if (id) return id;
  }
  if (studyKeywords.some((keyword) => sourceText.includes(keyword))) {
    const id = findByTitleKeyword("공부");
    if (id) return id;
  }
  if (scheduleKeywords.some((keyword) => sourceText.includes(keyword))) {
    const id = findByTitleKeyword("일정");
    if (id) return id;
  }

  return pickDefaultCalendarId();
}

function createLocalEvent(input: {
  calendarId: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
}) {
  const created = eventRepository.upsertLocal({
    calendarId: input.calendarId,
    title: input.title,
    description: input.description,
    location: input.location,
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
    return createLocalEvent({
      calendarId: input.calendarId,
      title: input.title,
      description: input.description ?? null,
      location: input.location ?? null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      allDay: input.allDay
    });
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

  ipcMain.handle(IPC_CHANNELS.openClawChat, async (_event, payload: unknown) => {
    const input = openClawChatSchema.parse(payload);
    const messages = [...(input.history ?? []), { role: "user" as const, content: input.message }];
    return requestOpenClaw(messages);
  });

  ipcMain.handle(IPC_CHANNELS.openClawCreateEvent, async (_event, payload: unknown) => {
    const input = openClawCreateEventSchema.parse(payload);
    const messages = [...(input.history ?? []), { role: "user" as const, content: input.message }];
    const defaultCalendarId = pickDefaultCalendarId();
    if (!defaultCalendarId) {
      return { ok: false, error: "No calendar is available. Connect Google Calendar first." };
    }
    const availableCalendars = (calendarRepository.listAll() as CalendarRow[]).map((calendar) => ({
      id: calendar.id,
      title: calendar.title,
      selected: calendar.selected === 1
    }));

    const now = new Date();
    const prompt = [
      "You are an event parser for a desktop calendar app.",
      "Return ONLY one JSON object with this exact shape:",
      '{ "title": string, "startsAt": string, "endsAt": string, "allDay": boolean, "description": string|null, "location": string|null, "calendarId": string|null, "calendarTitle": string|null }',
      "Rules:",
      "- startsAt/endsAt must be ISO8601 date-time strings.",
      "- If allDay is true, still return ISO8601 values.",
      "- Infer missing end time as 1 hour after start for timed events.",
      "- Keep title concise.",
      "- Calendar routing policy: resume/interview/job topics -> 취업 calendar, exam/study topics -> 공부 calendar, appointment/general plan topics -> 일정 calendar.",
      "- Prefer the user-selected calendar context when available.",
      `- User-selected calendarId from app: ${input.calendarId ?? "(none)"}.`,
      `- Available calendars: ${JSON.stringify(availableCalendars)}.`,
      `- Current time reference: ${now.toISOString()}.`
    ].join("\n");
    const ai = await requestOpenClaw([{ role: "assistant", content: prompt }, ...messages]);
    if (!ai.ok) {
      return ai;
    }

    const envelope = extractOpenClawEnvelope(ai.content);
    let parsed: ParsedAiEvent | null = null;
    let reply = "";
    if (envelope) {
      reply = typeof envelope.reply === "string" ? envelope.reply : "";
      const createSignal = (envelope.signals ?? []).find((signal) => signal?.kind === "create_event" && signal.payload);
      parsed = createSignal?.payload ?? null;
    }

    if (!parsed) {
      const fallback = extractJsonBlock(ai.content);
      if (fallback && fallback.title && fallback.startsAt) {
        parsed = fallback;
      }
    }

    if (!parsed) {
      return {
        ok: true,
        content: reply || ai.content,
        created: null
      };
    }

    const startsAt = dayjs(parsed.startsAt);
    if (!startsAt.isValid()) {
      return { ok: false, error: "Invalid start time returned by OpenClaw." };
    }
    const allDay = Boolean(parsed.allDay);
    let endsAt = parsed.endsAt ? dayjs(parsed.endsAt) : startsAt.add(allDay ? 1 : 1, allDay ? "day" : "hour");
    if (!endsAt.isValid() || endsAt.isBefore(startsAt)) {
      endsAt = startsAt.add(allDay ? 1 : 1, allDay ? "day" : "hour");
    }

    const resolvedCalendarId = resolveCalendarId(input.calendarId, parsed, input.message);
    if (!resolvedCalendarId) {
      return { ok: false, error: "Could not resolve target calendar." };
    }

    const payloadForCreate = {
      calendarId: resolvedCalendarId,
      title: String(parsed.title).trim().slice(0, 150),
      description: typeof parsed.description === "string" ? parsed.description.slice(0, 2000) : null,
      location: typeof parsed.location === "string" ? parsed.location.slice(0, 255) : null,
      startsAt: allDay ? startsAt.startOf("day").toISOString() : startsAt.toISOString(),
      endsAt: allDay ? endsAt.endOf("day").toISOString() : endsAt.toISOString(),
      allDay
    };
    const validated = eventUpsertSchema.parse(payloadForCreate);
    const created = createLocalEvent({
      calendarId: validated.calendarId,
      title: validated.title,
      description: validated.description ?? null,
      location: validated.location ?? null,
      startsAt: validated.startsAt,
      endsAt: validated.endsAt,
      allDay: validated.allDay
    });
    if (!created) {
      return { ok: false, error: "Failed to create event in local database." };
    }

    const when = created.allDay ? dayjs(created.startsAt).format("M/D 하루 종일") : dayjs(created.startsAt).format("M/D HH:mm");
    const targetCalendarTitle =
      availableCalendars.find((calendar) => calendar.id === validated.calendarId)?.title ??
      (calendarRepository.listAll() as CalendarRow[]).find((calendar) => calendar.id === validated.calendarId)?.title ??
      "기본 캘린더";
    const calendarSuffix = ` (캘린더: ${targetCalendarTitle})`;
    const contentWithCalendar = reply ? `${reply}${calendarSuffix}` : `일정을 등록했어요: ${created.title} (${when})${calendarSuffix}`;
    return {
      ok: true,
      content: contentWithCalendar,
      created: {
        eventId: created.id,
        title: created.title,
        startsAt: created.startsAt,
        endsAt: created.endsAt,
        allDay: Boolean(created.allDay)
      }
    };
  });
}

