import Store from "electron-store";
import { v4 as uuidv4 } from "uuid";
import { calendarRepository, eventRepository, syncRepository } from "./repositories";
import { buildQueuePayload } from "./queueMapper";
import { runSync } from "./syncEngine";

const DEFAULT_DURATION_MINUTES = 240;
const MIN_DURATION_MINUTES = 1;
const MAX_DURATION_MINUTES = 720;
const DEFAULT_PROBLEM_NAME = "코테 문제";

type SessionState = {
  startedAtIso: string;
  durationMinutes: number;
  problemName: string;
  totalPausedSeconds: number;
  pausedAtIso: string | null;
  savedTimerId: string | null;
};

type CompleteResult = {
  completedAt: string;
  savedToCalendar: boolean;
  eventId: string | null;
  message: string;
};

type SavedTimer = {
  id: string;
  problemName: string;
  durationMinutes: number;
  elapsedSeconds: number;
  savedAt: string;
};

type CompletedTimerRecord = {
  id: string;
  problemName: string;
  durationMinutes: number;
  elapsedSeconds: number;
  completedAt: string;
  savedToCalendar: boolean;
  eventId: string | null;
};

type TimerStoreShape = {
  session: SessionState | null;
  lastResult: CompleteResult | null;
  savedTimers: SavedTimer[];
  completedTimers: CompletedTimerRecord[];
};

const timerStore = new Store<TimerStoreShape>({
  name: "study-timer",
  defaults: {
    session: null,
    lastResult: null,
    savedTimers: [],
    completedTimers: []
  }
}) as unknown as {
  get: <K extends keyof TimerStoreShape>(key: K) => TimerStoreShape[K];
  set: <K extends keyof TimerStoreShape>(key: K, value: TimerStoreShape[K]) => void;
};

let session: SessionState | null = timerStore.get("session");
let lastResult: CompleteResult | null = timerStore.get("lastResult");
let savedTimers: SavedTimer[] = timerStore.get("savedTimers") ?? [];
let completedTimers: CompletedTimerRecord[] = timerStore.get("completedTimers") ?? [];

function persistTimerState() {
  timerStore.set("session", session);
  timerStore.set("lastResult", lastResult);
  timerStore.set("savedTimers", savedTimers);
  timerStore.set("completedTimers", completedTimers);
}

function clampDurationMinutes(value: number | undefined) {
  if (!value || !Number.isFinite(value)) {
    return DEFAULT_DURATION_MINUTES;
  }
  return Math.min(MAX_DURATION_MINUTES, Math.max(MIN_DURATION_MINUTES, Math.floor(value)));
}

function formatSeconds(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((safeSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(safeSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function normalizeProblemName(name: string | undefined) {
  const value = (name ?? "").trim();
  if (!value) {
    return DEFAULT_PROBLEM_NAME;
  }
  return value.slice(0, 120);
}

function computeElapsedSeconds(nowMs: number) {
  if (!session) {
    return 0;
  }
  const startedMs = new Date(session.startedAtIso).getTime();
  const pausedNowSeconds = session.pausedAtIso ? Math.max(0, Math.floor((nowMs - new Date(session.pausedAtIso).getTime()) / 1000)) : 0;
  const elapsed = Math.floor((nowMs - startedMs) / 1000) - session.totalPausedSeconds - pausedNowSeconds;
  return Math.max(0, elapsed);
}

function mapSavedTimer(timer: SavedTimer) {
  return {
    id: timer.id,
    problemName: timer.problemName,
    durationMinutes: timer.durationMinutes,
    elapsedSeconds: timer.elapsedSeconds,
    elapsedLabel: formatSeconds(timer.elapsedSeconds),
    savedAt: timer.savedAt
  };
}

function mapCompletedTimer(timer: CompletedTimerRecord) {
  return {
    id: timer.id,
    problemName: timer.problemName,
    durationMinutes: timer.durationMinutes,
    elapsedSeconds: timer.elapsedSeconds,
    elapsedLabel: formatSeconds(timer.elapsedSeconds),
    completedAt: timer.completedAt,
    savedToCalendar: timer.savedToCalendar,
    eventId: timer.eventId
  };
}

function upsertSavedTimer(saved: SavedTimer) {
  const index = savedTimers.findIndex((item) => item.id === saved.id);
  if (index >= 0) {
    savedTimers[index] = saved;
  } else {
    savedTimers = [saved, ...savedTimers];
  }
}

function removeSavedTimer(savedTimerId: string | null) {
  if (!savedTimerId) return;
  savedTimers = savedTimers.filter((item) => item.id !== savedTimerId);
}

function appendCompletedTimer(item: CompletedTimerRecord) {
  completedTimers = [item, ...completedTimers].slice(0, 200);
}

export function listSavedStudyTimers() {
  return savedTimers
    .slice()
    .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime())
    .map(mapSavedTimer);
}

export function listCompletedStudyTimers() {
  return completedTimers
    .slice()
    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
    .map(mapCompletedTimer);
}

export function getStudyTimerStatus() {
  const saved = listSavedStudyTimers();
  const completed = listCompletedStudyTimers();
  if (!session) {
    return {
      active: false,
      running: false,
      paused: false,
      durationMinutes: DEFAULT_DURATION_MINUTES,
      problemName: null,
      startedAt: null,
      elapsedSeconds: 0,
      remainingSeconds: 0,
      overtimeSeconds: 0,
      progress: 0,
      elapsedLabel: formatSeconds(0),
      remainingLabel: formatSeconds(0),
      overtimeLabel: formatSeconds(0),
      lastResult,
      savedTimers: saved,
      completedTimers: completed
    };
  }

  const now = Date.now();
  const elapsedSeconds = computeElapsedSeconds(now);
  const durationSeconds = session.durationMinutes * 60;
  const remainingSeconds = Math.max(0, durationSeconds - elapsedSeconds);
  const overtimeSeconds = Math.max(0, elapsedSeconds - durationSeconds);
  const progress = Math.min(1, elapsedSeconds / durationSeconds);
  const paused = Boolean(session.pausedAtIso);

  return {
    active: true,
    running: !paused,
    paused,
    durationMinutes: session.durationMinutes,
    problemName: session.problemName,
    startedAt: session.startedAtIso,
    elapsedSeconds,
    remainingSeconds,
    overtimeSeconds,
    progress,
    elapsedLabel: formatSeconds(elapsedSeconds),
    remainingLabel: formatSeconds(remainingSeconds),
    overtimeLabel: formatSeconds(overtimeSeconds),
    lastResult,
    savedTimers: saved,
    completedTimers: completed
  };
}

export function startStudyTimer(durationMinutes?: number, problemName?: string) {
  if (session) {
    return getStudyTimerStatus();
  }
  session = {
    startedAtIso: new Date().toISOString(),
    durationMinutes: clampDurationMinutes(durationMinutes),
    problemName: normalizeProblemName(problemName),
    totalPausedSeconds: 0,
    pausedAtIso: null,
    savedTimerId: null
  };
  persistTimerState();
  return getStudyTimerStatus();
}

export function pauseStudyTimer() {
  if (!session || session.pausedAtIso) {
    return getStudyTimerStatus();
  }
  session.pausedAtIso = new Date().toISOString();
  persistTimerState();
  return getStudyTimerStatus();
}

export function resumeStudyTimer() {
  if (!session || !session.pausedAtIso) {
    return getStudyTimerStatus();
  }
  const pausedAt = new Date(session.pausedAtIso).getTime();
  const now = Date.now();
  const pausedSeconds = Math.max(0, Math.floor((now - pausedAt) / 1000));
  session.totalPausedSeconds += pausedSeconds;
  session.pausedAtIso = null;
  persistTimerState();
  return getStudyTimerStatus();
}

export function saveStudyTimer() {
  if (!session) {
    return {
      ...getStudyTimerStatus(),
      saved: null
    };
  }
  const elapsedSeconds = computeElapsedSeconds(Date.now());
  const saved: SavedTimer = {
    id: session.savedTimerId ?? uuidv4(),
    problemName: session.problemName,
    durationMinutes: session.durationMinutes,
    elapsedSeconds,
    savedAt: new Date().toISOString()
  };
  upsertSavedTimer(saved);
  session = null;
  persistTimerState();
  return {
    ...getStudyTimerStatus(),
    saved: mapSavedTimer(saved)
  };
}

export function resumeSavedStudyTimer(savedTimerId: string) {
  if (session) {
    return getStudyTimerStatus();
  }
  const target = savedTimers.find((item) => item.id === savedTimerId);
  if (!target) {
    return getStudyTimerStatus();
  }
  const now = Date.now();
  const startedAtMs = now - target.elapsedSeconds * 1000;
  session = {
    startedAtIso: new Date(startedAtMs).toISOString(),
    durationMinutes: clampDurationMinutes(target.durationMinutes),
    problemName: normalizeProblemName(target.problemName),
    totalPausedSeconds: 0,
    pausedAtIso: null,
    savedTimerId: target.id
  };
  persistTimerState();
  return getStudyTimerStatus();
}

export function deleteSavedStudyTimer(savedTimerId: string) {
  removeSavedTimer(savedTimerId);
  persistTimerState();
  return getStudyTimerStatus();
}

export function stopStudyTimer() {
  removeSavedTimer(session?.savedTimerId ?? null);
  session = null;
  persistTimerState();
  return getStudyTimerStatus();
}

export function completeStudyTimer() {
  if (!session) {
    return {
      ...getStudyTimerStatus(),
      completed: null
    };
  }

  const completedAt = new Date().toISOString();
  const elapsedSeconds = computeElapsedSeconds(Date.now());
  const selectedCalendars = calendarRepository.listSelected() as Array<{
    id: string;
    provider_calendar_id: string;
  }>;
  const primary = selectedCalendars[0];

  let savedToCalendar = false;
  let eventId: string | null = null;
  let message = "세션을 완료했지만 캘린더에 저장하지 못했습니다.";

  if (primary) {
    const elapsedLabel = formatSeconds(computeElapsedSeconds(Date.now()));
    const created = eventRepository.upsertLocal({
      calendarId: primary.id,
      title: `${session.problemName} (${elapsedLabel})`,
      description: `${session.problemName} 학습 세션, 총 소요시간 ${elapsedLabel}`,
      location: null,
      startsAt: session.startedAtIso,
      endsAt: completedAt,
      allDay: 0
    });
    if (created) {
      syncRepository.enqueue({
        action: "create",
        entityType: "event",
        entityId: created.id,
        payloadJson: buildQueuePayload(created.id, primary.provider_calendar_id)
      });
      void runSync(false);
      savedToCalendar = true;
      eventId = created.id;
      message = "학습 세션을 캘린더에 저장했습니다.";
    }
  } else {
    message = "선택된 캘린더가 없어 학습 세션을 캘린더에 저장하지 못했습니다.";
  }

  removeSavedTimer(session.savedTimerId);
  appendCompletedTimer({
    id: uuidv4(),
    problemName: session.problemName,
    durationMinutes: session.durationMinutes,
    elapsedSeconds,
    completedAt,
    savedToCalendar,
    eventId
  });
  lastResult = {
    completedAt,
    savedToCalendar,
    eventId,
    message
  };
  session = null;
  persistTimerState();

  return {
    ...getStudyTimerStatus(),
    completed: lastResult
  };
}
