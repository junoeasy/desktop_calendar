import { useEffect, useRef, useState } from "react";
import type { StudyTimerStatus } from "@shared/apiTypes";

const wrapperStyle = {
  background: "rgba(15, 23, 42, 0.92)"
};
const MIN_OVERLAY_WIDTH = 220;
const MIN_OVERLAY_HEIGHT = 90;

const LABELS = {
  waiting: "\uD0C0\uC774\uBA38 \uB300\uAE30 \uC911",
  fallbackProblem: "\uCF54\uD14C \uBB38\uC81C",
  overtimePrefix: "\uCD94\uAC00 \uC2DC\uAC04 +",
  remainingPrefix: "\uB0A8\uC740 \uC2DC\uAC04 ",
  pausedTag: " (\uC77C\uC2DC\uC815\uC9C0)",
  resume: "\uC7AC\uAC1C",
  pause: "\uC77C\uC2DC\uC815\uC9C0",
  save: "\uC800\uC7A5",
  complete: "\uC644\uB8CC",
  stop: "\uC911\uC9C0",
  collapse: "\uC811\uAE30",
  expand: "\uD3BC\uCE58\uAE30"
} as const;

export function TimerOverlayApp() {
  const [status, setStatus] = useState<StudyTimerStatus | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);
  const expandedSizeRef = useRef<{ width: number; height: number } | null>(null);

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

  const resizeOverlay = async (width: number, height: number) => {
    await window.desktopCalApi.window.resize({
      width: Math.max(MIN_OVERLAY_WIDTH, width),
      height: Math.max(MIN_OVERLAY_HEIGHT, height)
    });
  };

  const toggleCollapsed = async () => {
    if (collapsed) {
      const restore = expandedSizeRef.current ?? { width: 420, height: 320 };
      await resizeOverlay(restore.width, restore.height);
      setCollapsed(false);
      return;
    }
    const bounds = await window.desktopCalApi.window.getBounds();
    if (bounds) {
      expandedSizeRef.current = { width: bounds.width, height: bounds.height };
    }
    await resizeOverlay(240, 96);
    setCollapsed(true);
  };

  const confirmStop = async () => {
    await window.desktopCalApi.timer.stop();
    setStopConfirmOpen(false);
  };

  if (!status?.active) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="rounded-xl border border-slate-700 px-4 py-3 text-sm text-slate-200" style={wrapperStyle}>
          {LABELS.waiting}
        </div>
      </div>
    );
  }

  return (
    <div className={collapsed ? "h-screen p-1.5" : "h-screen p-2"}>
      <div className={`app-drag flex h-full flex-col rounded-xl border border-slate-700 text-slate-100 shadow-lg ${collapsed ? "px-2 py-1.5" : "px-3 py-2"}`} style={wrapperStyle}>
        {collapsed ? (
          <div className="app-no-drag flex h-full items-center justify-between gap-2">
            <div className="text-3xl font-semibold tracking-wide">{status.elapsedLabel}</div>
            <button
              type="button"
              className="rounded border border-slate-500 px-2 py-0.5 text-[11px] text-slate-200 hover:bg-slate-700"
              onClick={toggleCollapsed}
            >
              {LABELS.expand}
            </button>
          </div>
        ) : (
          <>
            <div className="text-[11px] text-slate-300">{status.problemName ?? LABELS.fallbackProblem}</div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <div className="text-3xl font-semibold tracking-wide">{status.elapsedLabel}</div>
              <div className="app-no-drag">
                <button
                  type="button"
                  className="rounded border border-slate-500 px-2 py-0.5 text-[11px] text-slate-200 hover:bg-slate-700"
                  onClick={toggleCollapsed}
                >
                  {LABELS.collapse}
                </button>
              </div>
            </div>
            <div className="text-xs text-slate-300">
              {status.overtimeSeconds > 0 ? `${LABELS.overtimePrefix}${status.overtimeLabel}` : `${LABELS.remainingPrefix}${status.remainingLabel}`}
            </div>
            <div className="mt-2 h-2 w-full rounded-full bg-slate-700">
              <div className="h-2 rounded-full bg-emerald-400" style={{ width: `${Math.round(status.progress * 100)}%` }} />
            </div>
            <div className="mt-1 text-right text-[11px] text-slate-300">
              {Math.round(status.progress * 100)}%
              {status.paused ? LABELS.pausedTag : ""}
            </div>
            <div className="app-no-drag mt-2 flex gap-2">
              {status.paused ? (
                <button
                  className="rounded bg-sky-500 px-2 py-1 text-xs font-medium text-white hover:bg-sky-400"
                  onClick={async () => {
                    await window.desktopCalApi.timer.resume();
                  }}
                >
                  {LABELS.resume}
                </button>
              ) : (
                <button
                  className="rounded bg-amber-500 px-2 py-1 text-xs font-medium text-white hover:bg-amber-400"
                  onClick={async () => {
                    await window.desktopCalApi.timer.pause();
                  }}
                >
                  {LABELS.pause}
                </button>
              )}
              <button
                className="rounded bg-violet-500 px-2 py-1 text-xs font-medium text-white hover:bg-violet-400"
                onClick={async () => {
                  await window.desktopCalApi.timer.save();
                }}
              >
                {LABELS.save}
              </button>
              <button
                className="flex-1 rounded bg-emerald-500 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-400"
                onClick={async () => {
                  await window.desktopCalApi.timer.complete();
                }}
              >
                {LABELS.complete}
              </button>
              <button
                className="rounded border border-slate-500 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700"
                onClick={() => setStopConfirmOpen(true)}
              >
                {LABELS.stop}
              </button>
            </div>
          </>
        )}
      </div>

      {stopConfirmOpen && (
        <div
          className="app-no-drag fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/35 p-3"
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
          <div className="w-full max-w-[380px] rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-slate-100 shadow-xl">
            <div className="text-sm font-semibold">중단 확인</div>
            <div className="mt-2 text-xs text-slate-300">중단을 하면 저장이 되지 않습니다. 중단하시겠습니까?</div>
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                autoFocus
                className="rounded bg-rose-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-rose-400"
                onClick={() => void confirmStop()}
              >
                네
              </button>
              <button
                className="rounded border border-slate-500 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-800"
                onClick={() => setStopConfirmOpen(false)}
              >
                아니요
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
