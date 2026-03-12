import { useEffect, useRef } from "react";
import dayjs from "dayjs";
import clsx from "clsx";
import { monthMatrix } from "@/lib/day";
import { useAppStore } from "@/lib/store";

type PreviewEvent = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  colorHex: string | null;
};

type Props = {
  previews: Array<{ date: string; events: PreviewEvent[]; moreCount: number }>;
  onClickDate?: (date: string) => void;
  onDoubleClickDate: (date: string) => void;
  panelOpacity?: number;
};

export function CalendarGrid({ previews, onClickDate, onDoubleClickDate, panelOpacity = 1 }: Props) {
  const year = useAppStore((s) => s.monthYear);
  const month = useAppStore((s) => s.month);
  const selectedDate = useAppStore((s) => s.selectedDate);
  const setSelectedDate = useAppStore((s) => s.setSelectedDate);
  const clickTimerRef = useRef<number | null>(null);
  const days = monthMatrix(year, month);
  const previewMap = new Map(previews.map((p) => [p.date, p]));

  useEffect(() => {
    return () => {
      if (clickTimerRef.current !== null) {
        window.clearTimeout(clickTimerRef.current);
      }
    };
  }, []);

  return (
    <div
      className="grid h-full grid-cols-7 grid-rows-[auto_repeat(6,minmax(0,1fr))] gap-1.5 rounded-xl border border-slate-200 p-2 shadow-sm"
      style={{ backgroundColor: `rgba(255, 255, 255, ${panelOpacity})` }}
    >
      {["일", "월", "화", "수", "목", "금", "토"].map((weekday) => (
        <div key={weekday} className="px-1 py-1 text-center text-[11px] font-semibold text-slate-500">
          {weekday}
        </div>
      ))}
      {days.map((day) => {
        const iso = day.format("YYYY-MM-DD");
        const preview = previewMap.get(iso);
        const isCurrentMonth = day.month() + 1 === month;
        const isSelected = iso === selectedDate;
        const isToday = dayjs().format("YYYY-MM-DD") === iso;
        const cellBg = isCurrentMonth ? `rgba(255, 255, 255, ${panelOpacity})` : `rgba(248, 250, 252, ${panelOpacity})`;
        return (
          <button
            key={iso}
            type="button"
            onClick={() => {
              if (clickTimerRef.current !== null) {
                window.clearTimeout(clickTimerRef.current);
              }
              clickTimerRef.current = window.setTimeout(() => {
                setSelectedDate(iso);
                onClickDate?.(iso);
                clickTimerRef.current = null;
              }, 220);
            }}
            onDoubleClick={() => {
              if (clickTimerRef.current !== null) {
                window.clearTimeout(clickTimerRef.current);
                clickTimerRef.current = null;
              }
              onDoubleClickDate(iso);
            }}
            className={clsx(
              "flex min-h-0 flex-col items-start justify-start rounded-md border p-1.5 text-left transition",
              isCurrentMonth ? "border-slate-200" : "border-slate-100 text-slate-400",
              isToday && !isSelected ? "border-emerald-500 shadow-[0_0_0_1px_rgba(16,185,129,0.5)]" : "",
              isSelected ? "ring-2 ring-accent" : "hover:border-accent/60"
            )}
            style={{ backgroundColor: cellBg }}
          >
            <div className="text-sm font-semibold leading-none">{day.date()}</div>
            <div className="mt-1 w-full space-y-0.5 text-left">
              {preview?.events.map((event) => (
                <div key={event.id} className="truncate px-1 text-xs" style={{ color: event.colorHex ?? "#a21caf" }} title={event.title}>
                  {event.title}
                </div>
              ))}
              {(preview?.moreCount ?? 0) > 0 && <div className="text-[11px] text-slate-500">+{preview?.moreCount}개 더보기</div>}
              {isToday && <div className="text-[10px] font-semibold text-emerald-600">오늘</div>}
            </div>
          </button>
        );
      })}
    </div>
  );
}
