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

  return (
    <div className="app-no-drag flex items-center gap-1.5">
      <span className="text-[11px] text-slate-600">
        {status?.running
          ? `코테 타이머 ${status.elapsedLabel} / ${String(status.durationMinutes).padStart(2, "0")}:00:00 (${formatPercent(status.progress)})`
          : "코테 타이머 대기"}
      </span>

      {!status?.running ? (
        <button
          className="rounded border border-slate-300 bg-white/95 px-2 py-1 text-xs font-medium text-slate-800 shadow-sm hover:bg-white"
          onClick={async () => {
            const next = await window.desktopCalApi.timer.start({ durationMinutes: DEFAULT_DURATION_MINUTES });
            setStatus(next);
            setMessage("4시간 타이머를 시작했습니다.");
          }}
        >
          코테 시작
        </button>
      ) : (
        <>
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
