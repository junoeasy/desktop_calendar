import { calendarRepository, eventRepository, syncRepository } from "./repositories";
import { buildQueuePayload } from "./queueMapper";
import { runSync } from "./syncEngine";

const DEFAULT_DURATION_MINUTES = 240;
const MIN_DURATION_MINUTES = 1;
const MAX_DURATION_MINUTES = 720;

type SessionState = {
  startedAtIso: string;
  durationMinutes: number;
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

export function getStudyTimerStatus() {
  if (!session) {
    return {
      running: false,
      durationMinutes: DEFAULT_DURATION_MINUTES,
      startedAt: null,
      elapsedSeconds: 0,
      remainingSeconds: 0,
      progress: 0,
      elapsedLabel: formatSeconds(0),
      remainingLabel: formatSeconds(0),
      lastResult
    };
  }

  const now = Date.now();
  const started = new Date(session.startedAtIso).getTime();
  const elapsedSeconds = Math.max(0, Math.floor((now - started) / 1000));
  const durationSeconds = session.durationMinutes * 60;
  const remainingSeconds = Math.max(0, durationSeconds - elapsedSeconds);
  const progress = Math.min(1, elapsedSeconds / durationSeconds);

  return {
    running: true,
    durationMinutes: session.durationMinutes,
    startedAt: session.startedAtIso,
    elapsedSeconds,
    remainingSeconds,
    progress,
    elapsedLabel: formatSeconds(elapsedSeconds),
    remainingLabel: formatSeconds(remainingSeconds),
    lastResult
  };
}

export function startStudyTimer(durationMinutes?: number) {
  if (session) {
    return getStudyTimerStatus();
  }
  session = {
    startedAtIso: new Date().toISOString(),
    durationMinutes: clampDurationMinutes(durationMinutes)
  };
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
    title: string;
  }>;
  const primary = selectedCalendars[0];

  let savedToCalendar = false;
  let eventId: string | null = null;
  let message = "타이머가 완료되었습니다.";

  if (primary) {
    const created = eventRepository.upsertLocal({
      calendarId: primary.id,
      title: "삼성 B형 코테 문제 풀이 완료",
      description: `${session.durationMinutes}분 집중 세션 완료`,
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
