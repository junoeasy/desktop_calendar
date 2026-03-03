import { useState } from "react";
import dayjs from "dayjs";

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
  editing?: EventInput | null;
  onClose: () => void;
  onSubmit: (payload: EventInput) => Promise<void>;
};

export function EventModal({ open, date, defaultCalendarId, editing, onClose, onSubmit }: Props) {
  const [title, setTitle] = useState(editing?.title ?? "");
  const [location, setLocation] = useState(editing?.location ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [startTime, setStartTime] = useState(dayjs(editing?.startsAt ?? `${date}T09:00:00`).format("HH:mm"));
  const [endTime, setEndTime] = useState(dayjs(editing?.endsAt ?? `${date}T10:00:00`).format("HH:mm"));
  const [allDay, setAllDay] = useState(editing?.allDay ?? false);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!defaultCalendarId || !title.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({
        id: editing?.id,
        calendarId: defaultCalendarId,
        title: title.trim(),
        location: location || null,
        description: description || null,
        startsAt: allDay ? `${date}T00:00:00.000Z` : dayjs(`${date}T${startTime}`).toISOString(),
        endsAt: allDay ? `${date}T23:59:59.999Z` : dayjs(`${date}T${endTime}`).toISOString(),
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
        <h2 className="mb-4 text-lg font-semibold">{editing ? "일정 수정" : "일정 추가"}</h2>
        <div className="space-y-3">
          <input
            className="w-full rounded border border-slate-300 px-3 py-2"
            placeholder="제목"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            className="w-full rounded border border-slate-300 px-3 py-2"
            placeholder="장소"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
          <textarea
            className="w-full rounded border border-slate-300 px-3 py-2"
            rows={3}
            placeholder="메모"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            하루 종일
          </label>
          {!allDay && (
            <div className="grid grid-cols-2 gap-2">
              <input className="rounded border border-slate-300 px-3 py-2" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              <input className="rounded border border-slate-300 px-3 py-2" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="rounded border px-3 py-2" onClick={onClose} type="button">
            취소
          </button>
          <button className="rounded bg-accent px-3 py-2 text-white" onClick={handleSubmit} disabled={submitting} type="button">
            {submitting ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
