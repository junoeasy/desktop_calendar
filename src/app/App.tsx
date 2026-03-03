import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import type { CalendarRow, SyncStatus } from "@shared/apiTypes";
import type { EventEntity } from "@shared/models";
import { CalendarGrid } from "@/components/CalendarGrid";
import { EventModal } from "@/components/EventModal";
import { SettingsPanel } from "@/components/SettingsPanel";
import { SyncStatusBar } from "@/components/SyncStatusBar";
import { useCreateEvent, useDayEvents, useDeleteEvent, useMonthEvents, useSettings, useSyncNow, useUpdateEvent } from "@/hooks/useCalendarData";
import { monthLabel } from "@/lib/day";
import { useAppStore } from "@/lib/store";

export function App() {
  const [auth, setAuth] = useState<{ connected: boolean; user?: { email: string } | null } | null>(null);
  const [authMessage, setAuthMessage] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [editing, setEditing] = useState<EventEntity | null>(null);
  const [calendars, setCalendars] = useState<CalendarRow[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(true);

  const selectedDate = useAppStore((s) => s.selectedDate);
  const setSelectedDate = useAppStore((s) => s.setSelectedDate);
  const year = useAppStore((s) => s.monthYear);
  const month = useAppStore((s) => s.month);
  const setMonth = useAppStore((s) => s.setMonth);
  const setSettings = useAppStore((s) => s.setSettings);
  const settings = useAppStore((s) => s.settings);

  const { data: monthPreviews = [] } = useMonthEvents();
  const { data: dayEvents = [] } = useDayEvents();
  useSettings();
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();
  const syncNow = useSyncNow();

  useEffect(() => {
    void (async () => {
      const [status, calList, sync] = await Promise.all([
        window.desktopCalApi.auth.status(),
        window.desktopCalApi.calendars.list(),
        window.desktopCalApi.sync.status()
      ]);
      setAuth(status);
      setCalendars(calList);
      setSyncStatus(sync);
    })();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      void (async () => {
        const status = await window.desktopCalApi.sync.status();
        setSyncStatus(status);
      })();
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!settings) return;
    document.documentElement.style.setProperty("--accent", settings.accentColor);
    document.documentElement.classList.toggle("dark", settings.themeMode === "dark");
    void window.desktopCalApi.window.setDesktopPinned(settings.desktopPinned);
  }, [settings]);

  const defaultCalendarId = useMemo(() => calendars.find((c) => c.selected === 1)?.id ?? null, [calendars]);

  const goPrevMonth = () => {
    const prev = dayjs(`${year}-${month}-01`).subtract(1, "month");
    setMonth(prev.year(), prev.month() + 1);
  };

  const goNextMonth = () => {
    const next = dayjs(`${year}-${month}-01`).add(1, "month");
    setMonth(next.year(), next.month() + 1);
  };

  return (
    <div className="h-screen overflow-hidden p-3">
      <div className="mx-auto flex h-full max-w-[1450px] flex-col gap-2">
        <header className="relative rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 text-xs text-slate-600">
              <span className="truncate">{auth?.connected ? `Connected: ${auth?.user?.email ?? ""}` : "Google not connected"}</span>
              {authMessage ? <span className="ml-2 truncate">| {authMessage}</span> : null}
            </div>
            <div className="flex items-center gap-2">
              {auth?.connected ? (
                <button
                  className="rounded bg-slate-200 px-2 py-1 text-xs"
                  onClick={async () => {
                    await window.desktopCalApi.auth.signOut();
                    setAuth({ connected: false });
                    setAuthMessage("Signed out");
                  }}
                >
                  Sign out
                </button>
              ) : (
                <button
                  className="rounded bg-accent px-2 py-1 text-xs text-white"
                  onClick={async () => {
                    setAuthMessage("Signing in...");
                    const result = await window.desktopCalApi.auth.signIn();
                    if (!result.connected) {
                      setAuthMessage(`Sign in failed: ${result.error}`);
                      return;
                    }
                    setAuth({ connected: true, user: { email: result.user.email } });
                    setCalendars(result.calendars);
                    setAuthMessage("Connected");
                  }}
                >
                  Google Sign In
                </button>
              )}

              <button
                className="rounded border border-slate-300 px-2 py-1 text-xs"
                onClick={() => setMenuOpen((prev) => !prev)}
                title="Settings menu"
              >
                Menu
              </button>
            </div>
          </div>

          {menuOpen && (
            <div className="absolute right-2 top-11 z-20 w-[320px] max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
              <SettingsPanel
                onPatchSettings={async (patch) => {
                  const next = await window.desktopCalApi.settings.update(patch);
                  setSettings(next);
                }}
                onSyncNow={async () => {
                  const next = await syncNow.mutateAsync();
                  setSyncStatus(next);
                }}
              />
            </div>
          )}
        </header>

        <SyncStatusBar status={syncStatus} />

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[1fr_340px]">
          <section className="min-h-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-base font-semibold">{monthLabel(year, month)}</span>
              <div className="flex items-center gap-1.5">
                <button className="rounded border border-slate-300 px-2 py-1 text-xs" onClick={goPrevMonth}>
                  Prev
                </button>
                <button className="rounded border border-slate-300 px-2 py-1 text-xs" onClick={goNextMonth}>
                  Next
                </button>
                <button className="rounded border border-slate-300 px-2 py-1 text-xs" onClick={() => setModalOpen(true)}>
                  Add Event
                </button>
              </div>
            </div>
            <CalendarGrid
              previews={monthPreviews}
              onDoubleClickDate={(date) => {
                setSelectedDate(date);
                setEditing(null);
                setModalOpen(true);
              }}
            />
          </section>

          <section className="min-h-0 space-y-3 overflow-y-auto pr-1">
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">캘린더 선택</h3>
                <button className="rounded border border-slate-300 px-2 py-0.5 text-[11px]" onClick={() => setCalendarOpen((v) => !v)}>
                  {calendarOpen ? "접기" : "펼치기"}
                </button>
              </div>
              {calendarOpen && (
                <div className="space-y-2">
                  {calendars.map((cal) => (
                    <div key={cal.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 text-sm">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={cal.selected === 1}
                          onChange={async (e) => {
                            const next = await window.desktopCalApi.calendars.setSelected({ calendarId: cal.id, selected: e.target.checked });
                            setCalendars(next);
                          }}
                        />
                        <span>{cal.title}</span>
                      </label>
                      <input
                        type="color"
                        className="h-6 w-10 cursor-pointer rounded border border-slate-300 p-0"
                        value={cal.color_hex ?? "#a21caf"}
                        onChange={async (e) => {
                          const next = await window.desktopCalApi.calendars.setColor({ calendarId: cal.id, colorHex: e.target.value });
                          setCalendars(next);
                        }}
                      />
                      <span className="h-3 w-3 rounded-full border border-slate-300" style={{ backgroundColor: cal.color_hex ?? "#a21caf" }} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-2 text-sm font-semibold">{selectedDate} 일정</div>
              <ul className="space-y-2">
                {dayEvents.map((event: EventEntity) => (
                  <li key={event.id} className="rounded border border-slate-200 p-2 text-xs">
                    <div className="font-medium">{event.title}</div>
                    <div className="text-[11px] text-slate-500">
                      {dayjs(event.startsAt).format("HH:mm")} - {dayjs(event.endsAt).format("HH:mm")}
                    </div>
                    <div className="mt-1 flex gap-1">
                      <button
                        className="rounded border px-2 py-1 text-[11px]"
                        onClick={() => {
                          setEditing(event);
                          setModalOpen(true);
                        }}
                      >
                        수정
                      </button>
                      <button className="rounded border border-rose-300 px-2 py-1 text-[11px] text-rose-600" onClick={() => deleteEvent.mutate(event.id)}>
                        삭제
                      </button>
                    </div>
                  </li>
                ))}
                {dayEvents.length === 0 && <li className="text-xs text-slate-500">일정이 없습니다.</li>}
              </ul>
            </div>
          </section>
        </div>
      </div>

      <EventModal
        open={modalOpen}
        date={selectedDate}
        editing={editing}
        defaultCalendarId={defaultCalendarId}
        onClose={() => setModalOpen(false)}
        onSubmit={async (payload) => {
          if (payload.id) {
            await updateEvent.mutateAsync(payload);
          } else {
            await createEvent.mutateAsync(payload);
          }
        }}
      />
    </div>
  );
}
