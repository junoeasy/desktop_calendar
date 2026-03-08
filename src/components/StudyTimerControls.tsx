import { useEffect, useState } from "react";
import type { StudyTimerCompletion, StudyTimerStatus } from "@shared/apiTypes";

const DEFAULT_DURATION_MINUTES = 240;
const LABELS = {
  defaultProblem: "\uC0BC\uC131 B\uD615 \uBB38\uC81C",
  fallbackProblem: "\uCF54\uD14C \uBB38\uC81C",
  waiting: "\uCF54\uD14C \uD0C0\uC774\uBA38 \uB300\uAE30",
  pauseTag: " [\uC77C\uC2DC\uC815\uC9C0]",
  problemPlaceholder: "\uCF54\uD14C \uBB38\uC81C \uC774\uB984",
  start: "\uCF54\uD14C \uC2DC\uC791",
  resume: "\uC7AC\uAC1C",
  pause: "\uC77C\uC2DC\uC815\uC9C0",
  complete: "\uC644\uB8CC",
  stop: "\uC911\uC9C0",
  startedMessage: "4\uC2DC\uAC04 \uD0C0\uC774\uBA38\uB97C \uC2DC\uC791\uD588\uC2B5\uB2C8\uB2E4.",
  resumedMessage: "\uD0C0\uC774\uBA38\uB97C \uC7AC\uAC1C\uD588\uC2B5\uB2C8\uB2E4.",
  pausedMessage: "\uD0C0\uC774\uBA38\uB97C \uC77C\uC2DC\uC815\uC9C0\uD588\uC2B5\uB2C8\uB2E4.",
  completedFallbackMessage: "\uC138\uC158\uC744 \uC644\uB8CC\uD588\uC2B5\uB2C8\uB2E4.",
  stoppedMessage: "\uD0C0\uC774\uBA38\uB97C \uC911\uC9C0\uD588\uC2B5\uB2C8\uB2E4."
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

  return (
    <div className="app-no-drag flex items-center gap-1.5">
      <span className="max-w-[300px] truncate text-[11px] text-slate-600">
        {status?.active
          ? `${status.problemName ?? LABELS.fallbackProblem} ${status.elapsedLabel} / ${String(status.durationMinutes).padStart(2, "0")}:00:00 (${formatPercent(status.progress)})${overtimeText}${status.paused ? LABELS.pauseTag : ""}`
          : LABELS.waiting}
      </span>

      {!status?.active ? (
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
      ) : (
        <>
          {status.paused ? (
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
            onClick={async () => {
              const next = await window.desktopCalApi.timer.stop();
              setStatus(next);
              setMessage(LABELS.stoppedMessage);
            }}
          >
            {LABELS.stop}
          </button>
        </>
      )}

      <span className="max-w-[220px] truncate text-[11px] text-slate-500">{message}</span>
      <CompletionMessage result={status?.lastResult ?? null} />
    </div>
  );
}
