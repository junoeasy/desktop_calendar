import { app, BrowserWindow, ipcMain } from "electron";
import dayjs from "dayjs";
import Store from "electron-store";
import {
  IPC_CHANNELS,
  aiConfigUpdateSchema,
  calendarColorSchema,
  calendarSelectionSchema,
  eventDeleteSchema,
  eventUpsertSchema,
  monthQuerySchema,
  openClawChatSchema,
  openClawCreateEventSchema,
  savedTimerActionSchema,
  settingsUpdateSchema,
  syncTriggerSchema,
  taskCompleteSchema,
  taskCreateSchema,
  taskDeleteSchema,
  tasksByDateSchema,
  timerStartSchema,
  windowResizeSchema
} from "../../shared/ipc";
import { localDateFromIso, localDayBoundsToUtc } from "../../shared/dateTime";
import { calendarRepository, eventRepository, settingsRepository, syncRepository, userRepository } from "./repositories";
import { hasGoogleToken, signInWithGoogle, signOutGoogle } from "./googleAuth";
import { getSyncStatus, runSync, syncCalendarsFromGoogle } from "./syncEngine";
import { buildQueuePayload } from "./queueMapper";
import { completeStudyTimer, deleteSavedStudyTimer, getStudyTimerStatus, listSavedStudyTimers, pauseStudyTimer, resumeSavedStudyTimer, resumeStudyTimer, saveStudyTimer, startStudyTimer, stopStudyTimer } from "./studyTimer";
import type { CalendarRow } from "../../shared/apiTypes";
import type { OpenClawCreateEventInput } from "../../shared/ipc";
import type { EventEntity } from "../../shared/models";
import { completeGoogleTask, createGoogleTask, deleteGoogleTask, listGoogleTasksByDate, listTodayGoogleTasks } from "./googleTasks";
import { checkForUpdatesManually } from "./updater";

const WINDOW_MIN_WIDTH = 856;
const WINDOW_MIN_HEIGHT = 804;
const WINDOW_MAX_WIDTH = 10000;
const WINDOW_MAX_HEIGHT = 10000;
const NVIDIA_CHAT_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const NVIDIA_DEFAULT_MODEL = "openai/gpt-oss-120b";
const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";

type AiProvider = "nvidia" | "openai" | "custom";

type AiConfigPrivate = {
  provider: AiProvider;
  apiKey: string;
  chatUrl: string;
  model: string;
};

type AiConfigPublic = Omit<AiConfigPrivate, "apiKey"> & {
  hasApiKey: boolean;
};

const defaultAiConfig: AiConfigPrivate = {
  provider: "nvidia",
  apiKey: "",
  chatUrl: NVIDIA_CHAT_URL,
  model: NVIDIA_DEFAULT_MODEL
};

const aiConfigStore = new Store<{ config: AiConfigPrivate }>({
  name: "ai-config",
  defaults: {
    config: defaultAiConfig
  }
}) as unknown as {
  get: (key: "config") => AiConfigPrivate | undefined;
  set: (key: "config", value: AiConfigPrivate) => void;
};

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
  const week = eventRepository.listRelevantUpcoming(7).map((event) => ({
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
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string }; text?: string }>;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  };
  if (typeof raw.error?.message === "string" && raw.error.message.trim().length > 0) return raw.error.message.trim();
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

type AiMessage = { role: "system" | "user" | "assistant"; content: string };

function defaultsForAiProvider(provider: AiProvider) {
  if (provider === "openai") {
    return { chatUrl: OPENAI_CHAT_URL, model: OPENAI_DEFAULT_MODEL };
  }
  if (provider === "nvidia") {
    return { chatUrl: NVIDIA_CHAT_URL, model: NVIDIA_DEFAULT_MODEL };
  }
  return { chatUrl: "", model: "" };
}

function normalizeAiConfig(config: Partial<AiConfigPrivate>): AiConfigPrivate {
  const provider = config.provider ?? defaultAiConfig.provider;
  const providerDefaults = defaultsForAiProvider(provider);
  return {
    provider,
    apiKey: (config.apiKey ?? "").trim(),
    chatUrl: (config.chatUrl ?? providerDefaults.chatUrl).trim(),
    model: (config.model ?? providerDefaults.model).trim()
  };
}

function getStoredAiConfig() {
  return normalizeAiConfig(aiConfigStore.get("config") ?? defaultAiConfig);
}

function toPublicAiConfig(config: AiConfigPrivate): AiConfigPublic {
  return {
    provider: config.provider,
    chatUrl: config.chatUrl,
    model: config.model,
    hasApiKey: config.apiKey.trim().length > 0
  };
}

function updateStoredAiConfig(patch: Partial<AiConfigPrivate>) {
  const current = getStoredAiConfig();
  const provider = patch.provider ?? current.provider;
  const providerChanged = patch.provider && patch.provider !== current.provider;
  const providerDefaults = defaultsForAiProvider(provider);
  const next = normalizeAiConfig({
    provider,
    apiKey: patch.apiKey !== undefined ? patch.apiKey : current.apiKey,
    chatUrl: patch.chatUrl !== undefined ? patch.chatUrl : providerChanged ? providerDefaults.chatUrl : current.chatUrl,
    model: patch.model !== undefined ? patch.model : providerChanged ? providerDefaults.model : current.model
  });
  aiConfigStore.set("config", next);
  return next;
}

function getEnvOpenAiConfig(): AiConfigPrivate | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  const chatUrl = process.env.OPENAI_CHAT_URL?.trim() || OPENAI_CHAT_URL;
  const provider: AiProvider = chatUrl.includes("integrate.api.nvidia.com") ? "nvidia" : "openai";
  return normalizeAiConfig({
    provider,
    apiKey,
    chatUrl,
    model: process.env.OPENAI_MODEL?.trim() || (provider === "nvidia" ? NVIDIA_DEFAULT_MODEL : OPENAI_DEFAULT_MODEL)
  });
}

function buildAiHeaders(apiKey?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

type AiRequestOptions = {
  jsonMode?: boolean;
};

async function requestOpenAiCompatible(messages: AiMessage[], config: AiConfigPrivate, options: AiRequestOptions = {}) {
  if (!config.apiKey.trim()) {
    return { ok: false as const, error: "AI API key is not set." };
  }
  if (!config.chatUrl.trim()) {
    return { ok: false as const, error: "AI chat URL is not set." };
  }
  if (!config.model.trim()) {
    return { ok: false as const, error: "AI model is not set." };
  }

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    stream: false
  };
  if (options.jsonMode !== false) {
    body.response_format = { type: "json_object" };
  }
  const send = (requestBody: Record<string, unknown>) =>
    fetch(config.chatUrl, {
      method: "POST",
      headers: buildAiHeaders(config.apiKey),
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
    let parsed = await parseResponse(await send(body));
    if (!parsed.response.ok && (parsed.response.status === 400 || parsed.response.status === 422)) {
      const fallbackBody = { ...body };
      delete fallbackBody.response_format;
      parsed = await parseResponse(await send(fallbackBody));
    }
    if (!parsed.response.ok) {
      const detail = extractOpenClawText(parsed.json) ?? parsed.rawText;
      return { ok: false as const, error: `AI response error (${parsed.response.status})${detail ? `: ${detail}` : ""}` };
    }
    const content = extractOpenClawText(parsed.json) ?? parsed.rawText.trim();
    if (!content) {
      return { ok: false as const, error: "Could not read AI response body." };
    }
    return { ok: true as const, content };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function requestOpenClaw(messages: AiMessage[]) {
  const endpoint = process.env.OPENCLAW_CHAT_URL?.trim();
  if (!endpoint) {
    return { ok: false as const, error: "OPENAI_API_KEY or OPENCLAW_CHAT_URL environment variable is not set." };
  }

  const model = process.env.OPENCLAW_MODEL?.trim();
  const openClawMessages = messages.filter((message) => message.role !== "system") as Array<{ role: "user" | "assistant"; content: string }>;
  const body: Record<string, unknown> = {
    messages: openClawMessages,
    stream: false
  };
  if (model) {
    body.model = model;
  }
  const headers = buildAiHeaders(process.env.OPENCLAW_API_KEY?.trim());

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

async function requestAi(messages: AiMessage[], options: AiRequestOptions = {}) {
  const storedConfig = getStoredAiConfig();
  if (storedConfig.apiKey.trim()) {
    return requestOpenAiCompatible(messages, storedConfig, options);
  }

  const envOpenAiConfig = getEnvOpenAiConfig();
  if (envOpenAiConfig) {
    return requestOpenAiCompatible(messages, envOpenAiConfig, options);
  }

  return requestOpenClaw(messages);
}

async function testAiConfig() {
  const prompt = [
    "Return ONLY this JSON object:",
    '{ "ok": true, "message": "connected" }'
  ].join("\n");
  const result = await requestOpenAiCompatible([{ role: "user", content: prompt }], getStoredAiConfig());
  if (!result.ok) {
    return result;
  }
  return { ok: true as const, content: result.content };
}

type ParsedAiEvent = {
  action?: "create" | "delete" | "none";
  title: string;
  startsAt: string;
  endsAt?: string;
  allDay?: boolean;
  description?: string | null;
  location?: string | null;
  calendarId?: string;
  calendarTitle?: string;
};

type ParsedAiDeleteEvent = {
  title?: string | null;
  dateIso?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  calendarId?: string | null;
  calendarTitle?: string | null;
};

type ParsedAiCalendarAction = {
  action?: "create" | "delete" | "none";
  reply?: string;
  event?: ParsedAiEvent | null;
  events?: ParsedAiEvent[] | null;
  delete?: ParsedAiDeleteEvent | null;
  title?: string;
  startsAt?: string;
  endsAt?: string;
  allDay?: boolean;
  description?: string | null;
  location?: string | null;
  calendarId?: string;
  calendarTitle?: string;
};

type AiEventDraft = {
  calendarId: string;
  calendarTitle: string | null;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
};

type AiDeleteEventDraft = {
  eventId: string;
  calendarTitle: string | null;
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
};

type OpenClawSignalEnvelope = {
  reply?: string;
  signals?: Array<{ kind?: string; payload?: ParsedAiEvent | ParsedAiDeleteEvent }>;
};

function extractJsonBlock(text: string): ParsedAiCalendarAction | ParsedAiEvent | null {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidates = [fenceMatch?.[1], trimmed].filter((item): item is string => Boolean(item));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as ParsedAiCalendarAction | ParsedAiEvent;
    } catch {
      const start = candidate.indexOf("{");
      const end = candidate.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(candidate.slice(start, end + 1)) as ParsedAiCalendarAction | ParsedAiEvent;
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

function deleteLocalEvent(eventId: string) {
  const event = eventRepository.getById(eventId);
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
}

function normalizeSearchText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

function eventMatchesCalendar(event: EventEntity, calendarId: string | null | undefined, calendarTitle: string | null | undefined) {
  if (calendarId && event.calendarId !== calendarId) {
    return false;
  }
  if (!calendarTitle) {
    return true;
  }
  const calendar = (calendarRepository.listAll() as CalendarRow[]).find((row) => row.id === event.calendarId);
  if (!calendar) {
    return true;
  }
  return normalizeSearchText(calendar.title).includes(normalizeSearchText(calendarTitle));
}

function scoreDeleteCandidate(event: EventEntity, parsed: ParsedAiDeleteEvent) {
  const wantedTitle = normalizeSearchText(parsed.title);
  const eventTitle = normalizeSearchText(event.title);
  let score = 0;

  if (wantedTitle) {
    if (eventTitle === wantedTitle) score += 80;
    else if (eventTitle.includes(wantedTitle) || wantedTitle.includes(eventTitle)) score += 55;
    else return -1;
  } else {
    score += 10;
  }

  const wantedStart = parsed.startsAt ? new Date(parsed.startsAt) : null;
  if (wantedStart && !Number.isNaN(wantedStart.getTime())) {
    const eventStart = new Date(event.startsAt);
    const minutes = Math.abs(eventStart.getTime() - wantedStart.getTime()) / 60000;
    if (minutes <= 5) score += 50;
    else if (minutes <= 60) score += 30;
    else if (localDateFromIso(eventStart) === localDateFromIso(wantedStart)) score += 15;
  }

  return score;
}

function findAiDeleteDraft(parsed: ParsedAiDeleteEvent): { draft: AiDeleteEventDraft | null; ambiguous: boolean } {
  const parsedStart = parsed.startsAt ? new Date(parsed.startsAt) : null;
  const parsedStartDate = parsedStart && !Number.isNaN(parsedStart.getTime()) ? localDateFromIso(parsedStart) : null;
  const parsedDate =
    parsed.dateIso?.match(/^\d{4}-\d{2}-\d{2}$/)?.[0] ??
    parsedStartDate;
  const candidates = parsedDate ? eventRepository.listByDay(parsedDate) : eventRepository.listRelevantUpcoming(30);
  const calendarMap = new Map((calendarRepository.listAll() as CalendarRow[]).map((calendar) => [calendar.id, calendar.title]));
  const ranked = candidates
    .filter((event) => eventMatchesCalendar(event, parsed.calendarId, parsed.calendarTitle))
    .map((event) => ({ event, score: scoreDeleteCandidate(event, parsed) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) {
    return { draft: null, ambiguous: false };
  }
  const [first, second] = ranked;
  if (second && first.score - second.score < 20) {
    return { draft: null, ambiguous: true };
  }
  return {
    ambiguous: false,
    draft: {
      eventId: first.event.id,
      calendarTitle: calendarMap.get(first.event.calendarId) ?? null,
      title: first.event.title,
      startsAt: first.event.startsAt,
      endsAt: first.event.endsAt,
      allDay: Boolean(first.event.allDay)
    }
  };
}

function buildAiEventDraft(parsed: ParsedAiEvent, input: OpenClawCreateEventInput): { ok: true; draft: AiEventDraft } | { ok: false; error: string } {
  const startsAt = dayjs(parsed.startsAt);
  if (!startsAt.isValid()) {
    return { ok: false, error: "Invalid start time returned by AI." };
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
  const calendarTitle = (calendarRepository.listAll() as CalendarRow[]).find((calendar) => calendar.id === resolvedCalendarId)?.title ?? null;
  const payloadForCreate = {
    calendarId: resolvedCalendarId,
    title: String(parsed.title).trim().slice(0, 150),
    description: typeof parsed.description === "string" ? parsed.description.slice(0, 2000) : null,
    location: typeof parsed.location === "string" ? parsed.location.slice(0, 255) : null,
    startsAt: allDay ? localDayBoundsToUtc(localDateFromIso(startsAt.toISOString())).start : startsAt.toISOString(),
    endsAt: allDay ? localDayBoundsToUtc(localDateFromIso(endsAt.toISOString())).end : endsAt.toISOString(),
    allDay
  };
  const validated = eventUpsertSchema.parse(payloadForCreate);
  return {
    ok: true,
    draft: {
      calendarId: validated.calendarId,
      calendarTitle,
      title: validated.title,
      description: validated.description ?? null,
      location: validated.location ?? null,
      startsAt: validated.startsAt,
      endsAt: validated.endsAt,
      allDay: validated.allDay
    }
  };
}

async function answerGeneralAiQuestion(input: OpenClawCreateEventInput) {
  const messages = [...(input.history ?? []), { role: "user" as const, content: input.message }];
  const prompt = [
    "You are a helpful assistant inside a desktop calendar app.",
    "Answer ordinary questions naturally in Korean unless the user uses another language.",
    "Keep answers concise and practical.",
    "If the user asks for live data such as current weather, prices, or news, say that the app needs a connected live-data tool for exact results instead of guessing."
  ].join("\n");
  const ai = await requestAi([{ role: "system", content: prompt }, ...messages], { jsonMode: false });
  if (!ai.ok) {
    return ai;
  }
  return {
    ok: true as const,
    content: ai.content,
    draft: null,
    drafts: [],
    deleteDraft: null
  };
}

async function parseAiEventDraft(input: OpenClawCreateEventInput) {
  const messages = [...(input.history ?? []), { role: "user" as const, content: input.message }];
  const availableCalendars = (calendarRepository.listAll() as CalendarRow[]).map((calendar) => ({
    id: calendar.id,
    title: calendar.title,
    selected: calendar.selected === 1
  }));

  const now = new Date();
  const prompt = [
    "You are a calendar command parser for a desktop calendar app.",
    "Return ONLY one JSON object with this exact shape:",
    '{ "action": "create"|"delete"|"none", "reply": string, "event": { "title": string, "startsAt": string, "endsAt": string, "allDay": boolean, "description": string|null, "location": string|null, "calendarId": string|null, "calendarTitle": string|null }|null, "events": [{ "title": string, "startsAt": string, "endsAt": string, "allDay": boolean, "description": string|null, "location": string|null, "calendarId": string|null, "calendarTitle": string|null }], "delete": { "title": string|null, "dateIso": string|null, "startsAt": string|null, "endsAt": string|null, "calendarId": string|null, "calendarTitle": string|null }|null }',
    "Rules:",
    "- Use action=create only when the user asks to add/register/create an event.",
    "- Use action=delete only when the user asks to remove/delete/cancel an existing event.",
    "- Use action=none when the request is not a calendar create/delete command.",
    "- For create: event.startsAt/endsAt must be ISO8601 date-time strings.",
    "- For create with multiple events: put every item in events and set event to null.",
    "- For create with one event: use event or a one-item events array.",
    "- For create: if allDay is true, still return ISO8601 values.",
    "- For create: infer missing end time as 1 hour after start for timed events.",
    "- For delete: fill delete.title with the event title or topic to remove.",
    "- For delete: fill delete.dateIso as YYYY-MM-DD when the user gives or implies a date.",
    "- For delete: fill delete.startsAt when the user gives or implies a specific time.",
    "- Keep titles concise.",
    "- Calendar routing policy: resume/interview/job topics -> 취업 calendar, exam/study topics -> 공부 calendar, appointment/general plan topics -> 일정 calendar.",
    "- Prefer the user-selected calendar context when available.",
    `- User-selected calendarId from app: ${input.calendarId ?? "(none)"}.`,
    `- Available calendars: ${JSON.stringify(availableCalendars)}.`,
    `- Current time reference: ${now.toISOString()}.`
  ].join("\n");
  const ai = await requestAi([{ role: "system", content: prompt }, ...messages]);
  if (!ai.ok) {
    return ai;
  }

  const envelope = extractOpenClawEnvelope(ai.content);
  let parsed: ParsedAiEvent | null = null;
  let parsedEvents: ParsedAiEvent[] = [];
  let parsedDelete: ParsedAiDeleteEvent | null = null;
  let reply = "";
  if (envelope) {
    reply = typeof envelope.reply === "string" ? envelope.reply : "";
    const createSignals = (envelope.signals ?? []).filter((signal) => signal?.kind === "create_event" && signal.payload);
    const deleteSignal = (envelope.signals ?? []).find((signal) => signal?.kind === "delete_event" && signal.payload);
    parsedEvents = createSignals.map((signal) => signal.payload as ParsedAiEvent);
    parsed = parsedEvents[0] ?? null;
    parsedDelete = (deleteSignal?.payload as ParsedAiDeleteEvent | undefined) ?? null;
  }

  if (parsedEvents.length === 0) {
    const fallback = extractJsonBlock(ai.content);
    if (fallback) {
      const action = "action" in fallback ? fallback.action : undefined;
      reply = ("reply" in fallback && typeof fallback.reply === "string" ? fallback.reply : reply) || "";
      if (action === "delete" && "delete" in fallback) {
        parsedDelete = fallback.delete ?? null;
      } else if (action === "create" && "event" in fallback) {
        parsedEvents = [
          ...(("events" in fallback && Array.isArray(fallback.events) ? fallback.events : []) ?? []),
          ...(fallback.event ? [fallback.event] : [])
        ];
        parsed = parsedEvents[0] ?? null;
      } else if ("title" in fallback && "startsAt" in fallback && fallback.title && fallback.startsAt) {
        parsed = fallback as ParsedAiEvent;
        parsedEvents = [parsed];
      }
    }
  }

  if (parsedDelete) {
    const match = findAiDeleteDraft(parsedDelete);
    if (!match.draft) {
      return {
        ok: true as const,
        content: match.ambiguous
          ? "삭제할 일정이 여러 개로 보여요. 날짜, 시간, 제목을 조금 더 구체적으로 말해 주세요."
          : "삭제할 일정을 찾지 못했어요. 날짜나 일정 제목을 조금 더 자세히 말해 주세요.",
        draft: null,
        drafts: [],
        deleteDraft: null
      };
    }
    return {
      ok: true as const,
      content: reply || `${match.draft.title} 일정을 삭제할까요?`,
      draft: null,
      drafts: [],
      deleteDraft: match.draft
    };
  }

  if (parsedEvents.length === 0) {
    return answerGeneralAiQuestion(input);
  }

  const draftResults = parsedEvents.map((event) => buildAiEventDraft(event, input));
  const failed = draftResults.find((result) => !result.ok);
  if (failed && !failed.ok) {
    return { ok: false as const, error: failed.error };
  }
  const drafts = draftResults.map((result) => (result as { ok: true; draft: AiEventDraft }).draft);
  const draft = drafts[0] ?? null;
  return {
    ok: true as const,
    content: reply || (drafts.length > 1 ? `${drafts.length}개 일정을 추가할까요?` : `${draft?.title ?? "일정"} 일정을 추가할까요?`),
    draft,
    drafts,
    deleteDraft: null
  };
}

type RegisterIpcOptions = {
  showTimerOverlayWindow: () => void;
  hideTimerOverlayWindow: () => void;
  applyRuntimeSettings: () => void;
};

export function registerIpc(mainWindow: BrowserWindow, options: RegisterIpcOptions) {
  ipcMain.handle(IPC_CHANNELS.appVersion, async () => app.getVersion());
  ipcMain.handle(IPC_CHANNELS.appCheckUpdates, async () => checkForUpdatesManually());

  ipcMain.handle(IPC_CHANNELS.authSignIn, async () => {
    try {
      const result = await signInWithGoogle();
      const user = userRepository.upsert({
        googleAccountId: result.account.id,
        email: result.account.email,
        displayName: result.account.name
      });
      let calendars = calendarRepository.listAll();
      let warning: string | null = null;
      try {
        calendars = await syncCalendarsFromGoogle(user.id);
        void runSync(false);
      } catch (error) {
        console.error("[auth:sign-in] syncCalendarsFromGoogle failed:", error);
        warning = error instanceof Error ? error.message : String(error);
      }
      return { connected: true, user, calendars, warning };
    } catch (error) {
      console.error("[auth:sign-in] failed:", error);
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
    options.applyRuntimeSettings();
    return settings;
  });

  ipcMain.handle(IPC_CHANNELS.aiConfigGet, async () => toPublicAiConfig(getStoredAiConfig()));

  ipcMain.handle(IPC_CHANNELS.aiConfigUpdate, async (_e, payload: unknown) => {
    const patch = aiConfigUpdateSchema.parse(payload);
    const next = updateStoredAiConfig(patch);
    return toPublicAiConfig(next);
  });

  ipcMain.handle(IPC_CHANNELS.aiConfigTest, async () => testAiConfig());

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
    return deleteLocalEvent(input.eventId);
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
  ipcMain.handle(IPC_CHANNELS.timerSave, async () => {
    const status = saveStudyTimer();
    options.hideTimerOverlayWindow();
    return status;
  });
  ipcMain.handle(IPC_CHANNELS.timerStop, async () => {
    const status = stopStudyTimer();
    options.hideTimerOverlayWindow();
    return status;
  });
  ipcMain.handle(IPC_CHANNELS.timerResumeSaved, async (_e, payload: unknown) => {
    const input = savedTimerActionSchema.parse(payload);
    const status = resumeSavedStudyTimer(input.savedTimerId);
    if (status.active) {
      options.showTimerOverlayWindow();
    }
    return status;
  });
  ipcMain.handle(IPC_CHANNELS.timerDeleteSaved, async (_e, payload: unknown) => {
    const input = savedTimerActionSchema.parse(payload);
    return deleteSavedStudyTimer(input.savedTimerId);
  });
  ipcMain.handle(IPC_CHANNELS.timerSavedList, async () => listSavedStudyTimers());
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
    return requestAi(messages, { jsonMode: false });
  });

  ipcMain.handle(IPC_CHANNELS.openClawParseEvent, async (_event, payload: unknown) => {
    const input = openClawCreateEventSchema.parse(payload);
    return parseAiEventDraft(input);
  });

  ipcMain.handle(IPC_CHANNELS.openClawCreateEvent, async (_event, payload: unknown) => {
    const input = openClawCreateEventSchema.parse(payload);
    const parsed = await parseAiEventDraft(input);
    if (!parsed.ok) {
      return parsed;
    }
    const drafts = parsed.drafts?.length ? parsed.drafts : parsed.draft ? [parsed.draft] : [];
    if (drafts.length === 0) {
      return {
        ok: true,
        content: parsed.content,
        created: null
      };
    }
    const createdEvents = [];
    for (const draft of drafts) {
      const created = createLocalEvent({
        calendarId: draft.calendarId,
        title: draft.title,
        description: draft.description,
        location: draft.location,
        startsAt: draft.startsAt,
        endsAt: draft.endsAt,
        allDay: draft.allDay
      });
      if (!created) {
        return { ok: false, error: "Failed to create event in local database." };
      }
      createdEvents.push(created);
    }

    const created = createdEvents[0];
    const when = created.allDay ? dayjs(created.startsAt).format("M/D 하루 종일") : dayjs(created.startsAt).format("M/D HH:mm");
    const targetCalendarTitle = drafts[0]?.calendarTitle ?? "기본 캘린더";
    const calendarSuffix = ` (캘린더: ${targetCalendarTitle})`;
    const contentWithCalendar =
      createdEvents.length > 1
        ? `${createdEvents.length}개 일정을 등록했어요.${calendarSuffix}`
        : `일정을 등록했어요: ${created.title} (${when})${calendarSuffix}`;
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

  ipcMain.handle(IPC_CHANNELS.tasksByDate, async (_event, payload: unknown) => {
    const input = tasksByDateSchema.parse(payload);
    return listGoogleTasksByDate(input.dateIso);
  });

  ipcMain.handle(IPC_CHANNELS.tasksToday, async () => {
    return listTodayGoogleTasks();
  });

  ipcMain.handle(IPC_CHANNELS.taskComplete, async (_event, payload: unknown) => {
    const input = taskCompleteSchema.parse(payload);
    return completeGoogleTask(input.taskListId, input.taskId, input.completed ?? true);
  });

  ipcMain.handle(IPC_CHANNELS.taskCreate, async (_event, payload: unknown) => {
    const input = taskCreateSchema.parse(payload);
    return createGoogleTask(input);
  });

  ipcMain.handle(IPC_CHANNELS.taskDelete, async (_event, payload: unknown) => {
    const input = taskDeleteSchema.parse(payload);
    return deleteGoogleTask(input.taskListId, input.taskId);
  });
}
