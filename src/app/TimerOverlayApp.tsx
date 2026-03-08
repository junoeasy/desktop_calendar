import { useEffect, useState } from "react";
import type { StudyTimerStatus } from "@shared/apiTypes";

const wrapperStyle = {
  background: "rgba(15, 23, 42, 0.92)"
};

export function TimerOverlayApp() {
  const [status, setStatus] = useState<StudyTimerStatus | null>(null);

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

  if (!status?.active) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="rounded-xl border border-slate-700 px-4 py-3 text-sm text-slate-200" style={wrapperStyle}>
          타이머 대기 중
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen p-2">
      <div className="app-drag flex h-full flex-col rounded-xl border border-slate-700 px-3 py-2 text-slate-100 shadow-lg" style={wrapperStyle}>
        <div className="text-[11px] text-slate-300">{status.problemName ?? "코테 문제"}</div>
        <div className="mt-1 text-3xl font-semibold tracking-wide">{status.elapsedLabel}</div>
        <div className="text-xs text-slate-300">
          {status.overtimeSeconds > 0 ? `추가 시간 +${status.overtimeLabel}` : `남은 시간 ${status.remainingLabel}`}
        </div>
        <div className="mt-2 h-2 w-full rounded-full bg-slate-700">
          <div className="h-2 rounded-full bg-emerald-400" style={{ width: `${Math.round(status.progress * 100)}%` }} />
        </div>
        <div className="mt-1 text-right text-[11px] text-slate-300">
          {Math.round(status.progress * 100)}%
          {status.paused ? " (일시정지)" : ""}
        </div>
        <div className="app-no-drag mt-2 flex gap-2">
          {status.paused ? (
            <button
              className="rounded bg-sky-500 px-2 py-1 text-xs font-medium text-white hover:bg-sky-400"
              onClick={async () => {
                await window.desktopCalApi.timer.resume();
              }}
            >
              재개
            </button>
          ) : (
            <button
              className="rounded bg-amber-500 px-2 py-1 text-xs font-medium text-white hover:bg-amber-400"
              onClick={async () => {
                await window.desktopCalApi.timer.pause();
              }}
            >
              일시정지
            </button>
          )}
          <button
            className="flex-1 rounded bg-emerald-500 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-400"
            onClick={async () => {
              await window.desktopCalApi.timer.complete();
            }}
          >
            완료
          </button>
          <button
            className="rounded border border-slate-500 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700"
            onClick={async () => {
              await window.desktopCalApi.timer.stop();
            }}
          >
            중지
          </button>
        </div>
      </div>
    </div>
  );
}
