import { BrowserWindow, ipcMain } from "electron";
import dayjs from "dayjs";
import { IPC_CHANNELS, calendarColorSchema, calendarSelectionSchema, eventDeleteSchema, eventUpsertSchema, monthQuerySchema, openClawChatSchema, settingsUpdateSchema, syncTriggerSchema, timerStartSchema, windowResizeSchema } from "../../shared/ipc";
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
    // Unpin 시 이전 고정 상태의 크기 제한이 남지 않도록 명시적으로 초기화한다.
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
    const created = eventRepository.upsertLocal({
      calendarId: input.calendarId,
      title: input.title,
      description: input.description ?? null,
      location: input.location ?? null,
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
    const endpoint = process.env.OPENCLAW_CHAT_URL?.trim();
    if (!endpoint) {
      return { ok: false, error: "OPENCLAW_CHAT_URL 환경변수가 설정되지 않았습니다." };
    }

    const messages = [...(input.history ?? []), { role: "user" as const, content: input.message }];
    const body: Record<string, unknown> = {
      messages,
      message: input.message,
      stream: false
    };
    if (process.env.OPENCLAW_MODEL?.trim()) {
      body.model = process.env.OPENCLAW_MODEL.trim();
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    const apiKey = process.env.OPENCLAW_API_KEY?.trim();
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    try {
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

      const endpointCandidates = buildOpenClawCandidateEndpoints(endpoint);
      let lastParsed: { response: Response; rawText: string; json: unknown } | null = null;

      for (const candidate of endpointCandidates) {
        const requestBody =
          candidate.includes("/responses") || candidate.endsWith("/responses")
            ? ({
                model: body.model ?? "openclaw:main",
                input: messages.map((m) => `${m.role}: ${m.content}`).join("\n")
              } as Record<string, unknown>)
            : body;

        const parsed = await parseResponse(await send(candidate, requestBody));
        lastParsed = parsed;
        if (parsed.response.ok) {
          const content = extractOpenClawText(parsed.json) ?? parsed.rawText?.trim();
          if (!content) {
            return { ok: false, error: "OpenClaw 응답에서 메시지를 찾지 못했습니다." };
          }
          return { ok: true, content };
        }
        if (parsed.response.status !== 404 && parsed.response.status !== 405) {
          const detail = extractOpenClawText(parsed.json) ?? parsed.rawText;
          return { ok: false, error: `OpenClaw 응답 오류 (${parsed.response.status})${detail ? `: ${detail}` : ""}` };
        }
      }

      if (lastParsed) {
        const detail = extractOpenClawText(lastParsed.json) ?? lastParsed.rawText;
        return { ok: false, error: `OpenClaw 응답 오류 (${lastParsed.response.status})${detail ? `: ${detail}` : ""}` };
      }
      return { ok: false, error: "OpenClaw 엔드포인트를 찾지 못했습니다." };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
}
