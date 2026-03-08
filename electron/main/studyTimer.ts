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
};

type CompleteResult = {
  completedAt: string;
  savedToCalendar: boolean;
  eventId: string | null;
  message: string;
};

let session: SessionState | null = null;
let lastResult: CompleteResult | null = null;

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

export function getStudyTimerStatus() {
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
      lastResult
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
    lastResult
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
    pausedAtIso: null
  };
  return getStudyTimerStatus();
}

export function pauseStudyTimer() {
  if (!session || session.pausedAtIso) {
    return getStudyTimerStatus();
  }
  session.pausedAtIso = new Date().toISOString();
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
  return getStudyTimerStatus();
}

export function stopStudyTimer() {
  session = null;
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
  const selectedCalendars = calendarRepository.listSelected() as Array<{
    id: string;
    provider_calendar_id: string;
  }>;
  const primary = selectedCalendars[0];

  let savedToCalendar = false;
  let eventId: string | null = null;
  let message = "타이머가 완료되었습니다.";

  if (primary) {
    const elapsedLabel = formatSeconds(computeElapsedSeconds(Date.now()));
    const created = eventRepository.upsertLocal({
      calendarId: primary.id,
      title: `${session.problemName} (${elapsedLabel})`,
      description: `${session.problemName} 풀이 완료, 총 진행 시간 ${elapsedLabel}`,
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
      message = "완료 기록을 캘린더에 저장했습니다.";
    }
  } else {
    message = "선택된 캘린더가 없어 완료 기록은 저장하지 못했습니다.";
  }

  lastResult = {
    completedAt,
    savedToCalendar,
    eventId,
    message
  };
  session = null;

  return {
    ...getStudyTimerStatus(),
    completed: lastResult
  };
}
