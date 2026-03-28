import { useEffect, useState } from "react";
import dayjs from "dayjs";
import type { CalendarRow } from "@shared/apiTypes";

type EventInput = {
  id?: string;
  calendarId: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
};

type Props = {
  open: boolean;
  date: string;
  defaultCalendarId: string | null;
  calendars: CalendarRow[];
  editing?: EventInput | null;
  onClose: () => void;
  onSubmit: (payload: EventInput) => Promise<void>;
};

export function EventModal({ open, date, defaultCalendarId, calendars, editing, onClose, onSubmit }: Props) {
  const [title, setTitle] = useState(editing?.title ?? "");
  const [location, setLocation] = useState(editing?.location ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [startTime, setStartTime] = useState(dayjs(editing?.startsAt ?? `${date}T09:00:00`).format("HH:mm"));
  const [endTime, setEndTime] = useState(dayjs(editing?.endsAt ?? `${date}T10:00:00`).format("HH:mm"));
  const [allDay, setAllDay] = useState(editing?.allDay ?? false);
  const [calendarId, setCalendarId] = useState(editing?.calendarId ?? defaultCalendarId ?? calendars[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title ?? "");
    setLocation(editing?.location ?? "");
    setDescription(editing?.description ?? "");
    setStartTime(dayjs(editing?.startsAt ?? `${date}T09:00:00`).format("HH:mm"));
    setEndTime(dayjs(editing?.endsAt ?? `${date}T10:00:00`).format("HH:mm"));
    setAllDay(editing?.allDay ?? false);
    setCalendarId(editing?.calendarId ?? defaultCalendarId ?? calendars[0]?.id ?? "");
  }, [open, editing, date, defaultCalendarId, calendars]);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!calendarId || !title.trim()) return;
    if (!allDay && startTime >= endTime) return;
    setSubmitting(true);
    try {
      await onSubmit({
        id: editing?.id,
        calendarId,
        title: title.trim(),
        location: location || null,
        description: description || null,
        // 종일 이벤트는 KST(UTC+9) 기준 하루 전체를 UTC로 변환하여 저장
        startsAt: allDay ? new Date(`${date}T00:00:00.000+09:00`).toISOString() : dayjs(`${date}T${startTime}`).toISOString(),
        endsAt: allDay ? new Date(`${date}T23:59:59.999+09:00`).toISOString() : dayjs(`${date}T${endTime}`).toISOString(),
        allDay
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl">
        <h2 className="mb-4 text-lg font-semibold">{editing ? "\uC77C\uC815 \uC218\uC815" : "\uC77C\uC815 \uCD94\uAC00"}</h2>
        <div className="space-y-3">
          <input className="w-full rounded border border-slate-300 px-3 py-2" placeholder="\uC81C\uBAA9" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="w-full rounded border border-slate-300 px-3 py-2" placeholder="\uC7A5\uC18C" value={location} onChange={(e) => setLocation(e.target.value)} />
          <textarea className="w-full rounded border border-slate-300 px-3 py-2" rows={3} placeholder="\uBA54\uBAA8" value={description} onChange={(e) => setDescription(e.target.value)} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            \uD558\uB8E8 \uC885\uC77C
          </label>
          <select className="w-full rounded border border-slate-300 px-3 py-2 text-sm" value={calendarId} onChange={(e) => setCalendarId(e.target.value)}>
            {calendars.map((calendar) => (
              <option key={calendar.id} value={calendar.id}>
                {calendar.title}
              </option>
            ))}
          </select>
          {!allDay && (
            <div className="grid grid-cols-2 gap-2">
              <input className="rounded border border-slate-300 px-3 py-2" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              <input className="rounded border border-slate-300 px-3 py-2" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="rounded border px-3 py-2" onClick={onClose} type="button">
            \uCDE8\uC18C
          </button>
          <button className="rounded bg-accent px-3 py-2 text-white" onClick={handleSubmit} disabled={submitting} type="button">
            {submitting ? "\uC800\uC7A5 \uC911..." : "\uC800\uC7A5"}
          </button>
        </div>
      </div>
    </div>
  );
}
