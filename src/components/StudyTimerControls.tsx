import { useEffect, useState } from "react";
import type { StudyCompletedTimer, StudySavedTimer, StudyTimerCompletion, StudyTimerStatus } from "@shared/apiTypes";

const DEFAULT_DURATION_MINUTES = 240;
const LABELS = {
  defaultProblem: "삼성 B형 문제",
  fallbackProblem: "코테 문제",
  waiting: "코테 타이머 대기",
  pauseTag: " [일시정지]",
  problemPlaceholder: "코테 문제 이름",
  start: "코테 시작",
  save: "저장",
  savedList: "저장 목록",
  resume: "재개",
  pause: "일시정지",
  complete: "완료",
  stop: "중지",
  startedMessage: "4시간 타이머를 시작했습니다.",
  resumedMessage: "타이머를 재개했습니다.",
  pausedMessage: "타이머를 일시정지했습니다.",
  savedMessage: "타이머를 저장했습니다.",
  completedFallbackMessage: "세션을 완료했습니다.",
  stoppedMessage: "타이머를 중지했습니다.",
  collapse: "접기",
  expand: "펼치기",
  compactWaiting: "대기",
  compactActivePrefix: "진행",
  savedListTitle: "저장된 타이머",
  activeTab: "진행중",
  completedTab: "완료",
  emptySavedList: "저장된 타이머가 없습니다.",
  emptyCompletedList: "완료된 타이머가 없습니다."
} as const;

function formatPercent(progress: number) {
  return `${Math.round(progress * 100)}%`;
}

function CompletionMessage({ result }: { result: StudyTimerCompletion | null }) {
  if (!result) return null;
  return <span className="ml-2 truncate text-[11px] text-slate-500">{result.message}</span>;
}

export function StudyTimerControls() {
  const [status, setStatus] = useState<StudyTimerStatus | null>(null);
  const [problemName, setProblemName] = useState(LABELS.defaultProblem);
  const [message, setMessage] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [savedModalOpen, setSavedModalOpen] = useState(false);
  const [savedTab, setSavedTab] = useState<"active" | "completed">("active");
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const next = await window.desktopCalApi.timer.status();
      if (!cancelled) {
        setStatus(next);
      }
    };
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const overtimeText = status && status.overtimeSeconds > 0 ? ` +${status.overtimeLabel}` : "";
  const compactStatusText = status?.active
    ? `${LABELS.compactActivePrefix} ${status.elapsedLabel} (${formatPercent(status.progress)})${status.paused ? LABELS.pauseTag : ""}`
    : LABELS.compactWaiting;
  const savedTimers = status?.savedTimers ?? [];
  const completedTimers = status?.completedTimers ?? [];

  const resumeSaved = async (savedTimerId: string) => {
    const next = await window.desktopCalApi.timer.resumeSaved({ savedTimerId });
    setStatus(next);
    setMessage(LABELS.resumedMessage);
    setSavedModalOpen(false);
  };

  const deleteSaved = async (savedTimerId: string) => {
    const next = await window.desktopCalApi.timer.deleteSaved({ savedTimerId });
    setStatus(next);
    setMessage("저장된 타이머를 삭제했습니다.");
  };

  const confirmStop = async () => {
    const next = await window.desktopCalApi.timer.stop();
    setStatus(next);
    setMessage(LABELS.stoppedMessage);
    setStopConfirmOpen(false);
  };

  return (
    <>
      <div className="app-no-drag flex items-start gap-1.5">
        <button
          type="button"
          className="rounded border border-slate-300 bg-white/95 px-2 py-1 text-xs font-medium text-slate-800 shadow-sm hover:bg-white"
          onClick={() => setCollapsed((prev) => !prev)}
        >
          {collapsed ? LABELS.expand : LABELS.collapse}
        </button>

        <span className="max-w-[320px] truncate pt-1 text-[11px] text-slate-600">
          {collapsed
            ? compactStatusText
            : status?.active
              ? `${status.problemName ?? LABELS.fallbackProblem} ${status.elapsedLabel} / ${String(status.durationMinutes).padStart(2, "0")}:00:00 (${formatPercent(status.progress)})${overtimeText}${status.paused ? LABELS.pauseTag : ""}`
              : LABELS.waiting}
        </span>

        <button
          className="rounded border border-slate-300 bg-white/95 px-2 py-1 text-xs font-medium text-slate-800 shadow-sm hover:bg-white"
          onClick={() => {
            setSavedTab("active");
            setSavedModalOpen(true);
          }}
        >
          {LABELS.savedList} ({savedTimers.length})
        </button>

        {!collapsed && !status?.active ? (
          <>
            <input
              className="w-36 rounded border border-slate-300 bg-white/95 px-2 py-1 text-xs text-slate-800 shadow-sm"
              value={problemName}
              onChange={(e) => setProblemName(e.target.value)}
              placeholder={LABELS.problemPlaceholder}
            />
            <button
              className="rounded border border-slate-300 bg-white/95 px-2 py-1 text-xs font-medium text-slate-800 shadow-sm hover:bg-white"
              onClick={async () => {
                const next = await window.desktopCalApi.timer.start({ durationMinutes: DEFAULT_DURATION_MINUTES, problemName });
                setStatus(next);
                setMessage(LABELS.startedMessage);
              }}
            >
              {LABELS.start}
            </button>
          </>
        ) : !collapsed ? (
          <>
            {status?.paused ? (
              <button
                className="rounded border border-sky-400 bg-white/95 px-2 py-1 text-xs font-medium text-sky-700 shadow-sm hover:bg-sky-50"
                onClick={async () => {
                  const next = await window.desktopCalApi.timer.resume();
                  setStatus(next);
                  setMessage(LABELS.resumedMessage);
                }}
              >
                {LABELS.resume}
              </button>
            ) : (
              <button
                className="rounded border border-amber-400 bg-white/95 px-2 py-1 text-xs font-medium text-amber-700 shadow-sm hover:bg-amber-50"
                onClick={async () => {
                  const next = await window.desktopCalApi.timer.pause();
                  setStatus(next);
                  setMessage(LABELS.pausedMessage);
                }}
              >
                {LABELS.pause}
              </button>
            )}
            <button
              className="rounded border border-violet-400 bg-white/95 px-2 py-1 text-xs font-medium text-violet-700 shadow-sm hover:bg-violet-50"
              onClick={async () => {
                const next = await window.desktopCalApi.timer.save();
                setStatus(next);
                setMessage(next.saved ? LABELS.savedMessage : "저장할 타이머가 없습니다.");
              }}
            >
              {LABELS.save}
            </button>
            <button
              className="rounded border border-emerald-400 bg-white/95 px-2 py-1 text-xs font-medium text-emerald-700 shadow-sm hover:bg-emerald-50"
              onClick={async () => {
                const next = await window.desktopCalApi.timer.complete();
                setStatus(next);
                setMessage(next.completed?.message ?? LABELS.completedFallbackMessage);
              }}
            >
              {LABELS.complete}
            </button>
            <button
              className="rounded border border-slate-300 bg-white/95 px-2 py-1 text-xs font-medium text-slate-800 shadow-sm hover:bg-white"
              onClick={() => setStopConfirmOpen(true)}
            >
              {LABELS.stop}
            </button>
          </>
        ) : null}

        {!collapsed ? (
          <>
            <span className="max-w-[220px] truncate pt-1 text-[11px] text-slate-500">{message}</span>
            <CompletionMessage result={status?.lastResult ?? null} />
          </>
        ) : null}

        {collapsed && message ? <span className="max-w-[180px] truncate pt-1 text-[11px] text-slate-500">{message}</span> : null}
        {collapsed && status?.lastResult ? <span className="max-w-[180px] truncate pt-1 text-[11px] text-slate-500">{status.lastResult.message}</span> : null}
      </div>

      {savedModalOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/35 p-3"
          onMouseDown={(e) => {
            if (e.target !== e.currentTarget) return;
            e.preventDefault();
            e.stopPropagation();
            setSavedModalOpen(false);
          }}
        >
          <div className="app-no-drag max-h-[80vh] w-full max-w-[560px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">{LABELS.savedListTitle}</h3>
              <button
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50"
                onClick={() => setSavedModalOpen(false)}
              >
                닫기
              </button>
            </div>

            <div className="mb-2 flex items-center gap-1">
              <button
                className={`rounded px-2 py-1 text-xs font-medium ${savedTab === "active" ? "bg-slate-800 text-white" : "border border-slate-300 bg-white text-slate-700"}`}
                onClick={() => setSavedTab("active")}
              >
                {LABELS.activeTab} ({savedTimers.length})
              </button>
              <button
                className={`rounded px-2 py-1 text-xs font-medium ${savedTab === "completed" ? "bg-slate-800 text-white" : "border border-slate-300 bg-white text-slate-700"}`}
                onClick={() => setSavedTab("completed")}
              >
                {LABELS.completedTab} ({completedTimers.length})
              </button>
            </div>

            {savedTab === "active" ? (
              <div className="space-y-2">
                {savedTimers.length === 0 ? <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">{LABELS.emptySavedList}</div> : null}
                {savedTimers.map((timer: StudySavedTimer) => (
                  <div key={timer.id} className="rounded border border-slate-200 px-3 py-2">
                    <div className="text-sm font-medium text-slate-800">{timer.problemName}</div>
                    <div className="mt-0.5 text-xs text-slate-600">
                      {timer.elapsedLabel} / {String(timer.durationMinutes).padStart(2, "0")}:00:00
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        className="rounded border border-sky-400 bg-white px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50"
                        onClick={() => void resumeSaved(timer.id)}
                      >
                        이어하기
                      </button>
                      <button
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        onClick={() => void deleteSaved(timer.id)}
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {completedTimers.length === 0 ? <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">{LABELS.emptyCompletedList}</div> : null}
                {completedTimers.map((timer: StudyCompletedTimer) => (
                  <div key={timer.id} className="rounded border border-slate-200 px-3 py-2">
                    <div className="text-sm font-medium text-slate-800">{timer.problemName}</div>
                    <div className="mt-0.5 text-xs text-slate-600">
                      {timer.elapsedLabel} / {String(timer.durationMinutes).padStart(2, "0")}:00:00
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      완료: {new Date(timer.completedAt).toLocaleString()} {timer.savedToCalendar ? "· 캘린더 저장됨" : "· 캘린더 미저장"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {stopConfirmOpen && (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/35 p-3"
          onMouseDown={(e) => {
            if (e.target !== e.currentTarget) return;
            e.preventDefault();
            e.stopPropagation();
            setStopConfirmOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void confirmStop();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setStopConfirmOpen(false);
            }
          }}
        >
          <div className="app-no-drag w-full max-w-[420px] rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
            <div className="text-sm font-semibold text-slate-800">중단 확인</div>
            <div className="mt-2 text-sm text-slate-600">중단하면 저장되지 않습니다. 중단하시겠습니까?</div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                autoFocus
                className="rounded border border-rose-400 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                onClick={() => void confirmStop()}
              >
                네
              </button>
              <button
                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setStopConfirmOpen(false)}
              >
                아니요
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
