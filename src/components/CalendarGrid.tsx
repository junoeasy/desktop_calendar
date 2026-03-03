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
  onDoubleClickDate: (date: string) => void;
};

export function CalendarGrid({ previews, onDoubleClickDate }: Props) {
  const year = useAppStore((s) => s.monthYear);
  const month = useAppStore((s) => s.month);
  const selectedDate = useAppStore((s) => s.selectedDate);
  const setSelectedDate = useAppStore((s) => s.setSelectedDate);
  const days = monthMatrix(year, month);
  const previewMap = new Map(previews.map((p) => [p.date, p]));

  return (
    <div className="grid h-full grid-cols-7 gap-1.5 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((weekday) => (
        <div key={weekday} className="px-1 py-1 text-center text-[11px] font-semibold text-slate-500">
          {weekday}
        </div>
      ))}
      {days.map((day) => {
        const iso = day.format("YYYY-MM-DD");
        const preview = previewMap.get(iso);
        const isCurrentMonth = day.month() + 1 === month;
        const isSelected = iso === selectedDate;
        return (
          <button
            key={iso}
            type="button"
            onClick={() => setSelectedDate(iso)}
            onDoubleClick={() => onDoubleClickDate(iso)}
            className={clsx(
              "flex min-h-24 flex-col items-start justify-start rounded-md border p-1.5 text-left transition",
              isCurrentMonth ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50 text-slate-400",
              isSelected ? "ring-2 ring-accent" : "hover:border-accent/60"
            )}
          >
            <div className="text-sm font-semibold leading-none">{day.date()}</div>
            <div className="mt-1 w-full space-y-0.5 text-left">
              {preview?.events.map((event) => (
                <div key={event.id} className="truncate px-1 text-[11px]" style={{ color: event.colorHex ?? "#a21caf" }} title={event.title}>
                  {event.title}
                </div>
              ))}
              {(preview?.moreCount ?? 0) > 0 && <div className="text-[11px] text-slate-500">+{preview?.moreCount} more</div>}
              {dayjs().format("YYYY-MM-DD") === iso && <div className="text-[10px] text-emerald-600">Today</div>}
            </div>
          </button>
        );
      })}
    </div>
  );
}
