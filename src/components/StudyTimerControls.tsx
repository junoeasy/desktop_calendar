import { useEffect, useState } from "react";
import type { StudyTimerCompletion, StudyTimerStatus } from "@shared/apiTypes";

const DEFAULT_DURATION_MINUTES = 240;

function formatPercent(progress: number) {
  return `${Math.round(progress * 100)}%`;
}

function CompletionMessage({ result }: { result: StudyTimerCompletion | null }) {
  if (!result) return null;
  return <span className="ml-2 truncate text-[11px] text-slate-500">{result.message}</span>;
}

export function StudyTimerControls() {
  const [status, setStatus] = useState<StudyTimerStatus | null>(null);
  const [problemName, setProblemName] = useState("삼성 B형 문제");
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
          ? `${status.problemName ?? "코테 문제"} ${status.elapsedLabel} / ${String(status.durationMinutes).padStart(2, "0")}:00:00 (${formatPercent(status.progress)})${overtimeText}${status.paused ? " [일시정지]" : ""}`
          : "코테 타이머 대기"}
      </span>

      {!status?.active ? (
        <>
          <input
            className="w-36 rounded border border-slate-300 bg-white/95 px-2 py-1 text-xs text-slate-800 shadow-sm"
            value={problemName}
            onChange={(e) => setProblemName(e.target.value)}
            placeholder="코테 문제 이름"
          />
          <button
            className="rounded border border-slate-300 bg-white/95 px-2 py-1 text-xs font-medium text-slate-800 shadow-sm hover:bg-white"
            onClick={async () => {
              const next = await window.desktopCalApi.timer.start({ durationMinutes: DEFAULT_DURATION_MINUTES, problemName });
              setStatus(next);
              setMessage("4시간 타이머를 시작했습니다.");
            }}
          >
            코테 시작
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
                setMessage("타이머를 재개했습니다.");
              }}
            >
              재개
            </button>
          ) : (
            <button
              className="rounded border border-amber-400 bg-white/95 px-2 py-1 text-xs font-medium text-amber-700 shadow-sm hover:bg-amber-50"
              onClick={async () => {
                const next = await window.desktopCalApi.timer.pause();
                setStatus(next);
                setMessage("타이머를 일시정지했습니다.");
              }}
            >
              일시정지
            </button>
          )}
          <button
            className="rounded border border-emerald-400 bg-white/95 px-2 py-1 text-xs font-medium text-emerald-700 shadow-sm hover:bg-emerald-50"
            onClick={async () => {
              const next = await window.desktopCalApi.timer.complete();
              setStatus(next);
              setMessage(next.completed?.message ?? "세션을 완료했습니다.");
            }}
          >
            완료
          </button>
          <button
            className="rounded border border-slate-300 bg-white/95 px-2 py-1 text-xs font-medium text-slate-800 shadow-sm hover:bg-white"
            onClick={async () => {
              const next = await window.desktopCalApi.timer.stop();
              setStatus(next);
              setMessage("타이머를 중지했습니다.");
            }}
          >
            중지
          </button>
        </>
      )}

      <span className="max-w-[220px] truncate text-[11px] text-slate-500">{message}</span>
      <CompletionMessage result={status?.lastResult ?? null} />
    </div>
  );
}
