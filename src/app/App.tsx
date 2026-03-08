import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import dayjs from "dayjs";
import type { CalendarRow, NotificationSummaryPayload, SyncStatus } from "@shared/apiTypes";
import type { EventEntity } from "@shared/models";
import { CalendarGrid } from "@/components/CalendarGrid";
import { EventModal } from "@/components/EventModal";
import { SettingsPanel } from "@/components/SettingsPanel";
import { StudyTimerControls } from "@/components/StudyTimerControls";
import { useCreateEvent, useDayEvents, useDeleteEvent, useMonthEvents, useSettings, useSyncNow, useUpdateEvent } from "@/hooks/useCalendarData";
import { monthLabel } from "@/lib/day";
import { useAppStore } from "@/lib/store";

function formatEventTime(event: EventEntity) {
  if (event.allDay) return "하루 종일";
  return `${dayjs(event.startsAt).format("HH:mm")} - ${dayjs(event.endsAt).format("HH:mm")}`;
}

function formatSummaryTime(startsAt: string, allDay: number) {
  return allDay ? dayjs(startsAt).format("M/D (ddd) 하루 종일") : dayjs(startsAt).format("M/D (ddd) HH:mm");
}

const UI_LABELS = {
  syncChecking: "\uB3D9\uAE30\uD654 \uC0C1\uD0DC \uD655\uC778 \uC911...",
  syncing: "\uB3D9\uAE30\uD654 \uC911",
  waiting: "\uB300\uAE30 \uC911",
  connectedPrefix: "\uC5F0\uACB0\uB428",
  disconnected: "Google \uBBF8\uC5F0\uACB0",
  recentSuccessPrefix: "\uCD5C\uADFC \uC131\uACF5",
  errorPrefix: "\uC624\uB958",
  summary: "\uC694\uC57D",
  sync: "\uB3D9\uAE30\uD654",
  syncFailedPrefix: "\uB3D9\uAE30\uD654 \uC2E4\uD328",
  syncDone: "\uB3D9\uAE30\uD654 \uC644\uB8CC",
  signedOut: "\uB85C\uADF8\uC544\uC6C3\uB428",
  logout: "\uB85C\uADF8\uC544\uC6C3",
  loginInProgress: "\uB85C\uADF8\uC778 \uC911...",
  loginFailedPrefix: "\uB85C\uADF8\uC778 \uC2E4\uD328",
  connectedDone: "\uC5F0\uACB0 \uC644\uB8CC",
  loginGoogle: "Google \uB85C\uADF8\uC778",
  settingsMenuTitle: "\uC124\uC815 \uBA54\uB274",
  menu: "\uBA54\uB274"
} as const;

export function App() {
  const [auth, setAuth] = useState<{ connected: boolean; user?: { email: string } | null } | null>(null);
  const [authMessage, setAuthMessage] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [dayPopupOpen, setDayPopupOpen] = useState(false);
  const [summaryPopupOpen, setSummaryPopupOpen] = useState(false);
  const [summaryPayload, setSummaryPayload] = useState<NotificationSummaryPayload | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [editing, setEditing] = useState<EventEntity | null>(null);
  const [calendars, setCalendars] = useState<CalendarRow[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(true);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const resizeSessionRef = useRef<{ pointerId: number; startX: number; startY: number; startWidth: number; startHeight: number } | null>(null);
  const resizePendingRef = useRef<{ width: number; height: number } | null>(null);
  const resizeRafRef = useRef<number | null>(null);

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

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (menuButtonRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    const unsubscribe = window.desktopCalApi.notifications.onOpenSummary((payload) => {
      openSummaryPopup(payload);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    return () => {
      if (resizeRafRef.current !== null) {
        window.cancelAnimationFrame(resizeRafRef.current);
      }
    };
  }, []);

  const defaultCalendarId = useMemo(() => calendars.find((c) => c.selected === 1)?.id ?? null, [calendars]);
  const calendarTitleMap = useMemo(() => new Map(calendars.map((cal) => [cal.id, cal.title])), [calendars]);
  const panelOpacity = Number.isFinite(settings?.windowOpacity) ? Math.min(1, Math.max(0.3, settings?.windowOpacity ?? 1)) : 1;
  const calendarPanelOpacity = Math.max(0.05, panelOpacity * 0.8);
  const chromePanelStyle = { backgroundColor: `rgba(255, 255, 255, ${panelOpacity})` };
  const calendarPanelStyle = { backgroundColor: `rgba(255, 255, 255, ${calendarPanelOpacity})` };
  const popupPanelStyle = { backgroundColor: "rgba(255, 255, 255, 0.96)" };
  const appBgStyle = { backgroundColor: "transparent" };
  const syncStatusLabel = !syncStatus
    ? UI_LABELS.syncChecking
    : syncStatus.running
      ? UI_LABELS.syncing
      : UI_LABELS.waiting;
  const syncStatusClass = !syncStatus
    ? "text-slate-500"
    : syncStatus.running
      ? "text-amber-600"
      : "text-emerald-600";
  const openSummaryPopup = (payload: NotificationSummaryPayload) => {
    setSummaryPayload(payload);
    setSummaryPopupOpen(true);
  };

  const goPrevMonth = () => {
    const prev = dayjs(`${year}-${month}-01`).subtract(1, "month");
    setMonth(prev.year(), prev.month() + 1);
  };

  const goNextMonth = () => {
    const next = dayjs(`${year}-${month}-01`).add(1, "month");
    setMonth(next.year(), next.month() + 1);
  };

  const flushResize = () => {
    resizeRafRef.current = null;
    const next = resizePendingRef.current;
    if (!next) return;
    void window.desktopCalApi.window.resize(next);
    resizePendingRef.current = null;
  };

  const queueResize = (width: number, height: number) => {
    resizePendingRef.current = { width, height };
    if (resizeRafRef.current !== null) return;
    resizeRafRef.current = window.requestAnimationFrame(flushResize);
  };

  const onResizeHandlePointerDown = async (event: ReactPointerEvent<HTMLDivElement>) => {
    if (settings?.desktopPinned) return;
    event.preventDefault();
    const bounds = await window.desktopCalApi.window.getBounds();
    resizeSessionRef.current = {
      pointerId: event.pointerId,
      startX: event.screenX,
      startY: event.screenY,
      startWidth: bounds?.width ?? window.innerWidth,
      startHeight: bounds?.height ?? window.innerHeight
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onResizeHandlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = resizeSessionRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    if ((event.buttons & 1) !== 1) return;
    const width = Math.max(640, state.startWidth + (event.screenX - state.startX));
    const height = Math.max(480, state.startHeight + (event.screenY - state.startY));
    queueResize(width, height);
  };

  const onResizeHandlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = resizeSessionRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    resizeSessionRef.current = null;
  };

  return (
    <div className="h-screen overflow-hidden p-3" style={appBgStyle}>
      <div className="mx-auto flex h-full max-w-[1450px] flex-col gap-2">
        <header className="relative rounded-xl border border-slate-200 px-3 py-2 shadow-sm" style={chromePanelStyle}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="app-drag flex min-h-8 flex-1 items-center rounded-md px-2 text-xs text-slate-600">
              <span className="truncate">{auth?.connected ? `${UI_LABELS.connectedPrefix}: ${auth?.user?.email ?? ""}` : UI_LABELS.disconnected}</span>
              <span className={`ml-2 shrink-0 ${syncStatusClass}`}>{syncStatusLabel}</span>
              {syncStatus?.lastSuccessAt ? <span className="ml-2 shrink-0 text-slate-500">{UI_LABELS.recentSuccessPrefix}: {new Date(syncStatus.lastSuccessAt).toLocaleTimeString()}</span> : null}
              {syncStatus?.lastError ? <span className="ml-2 truncate text-rose-600">{UI_LABELS.errorPrefix}: {syncStatus.lastError}</span> : null}
              {authMessage ? <span className="ml-2 truncate">| {authMessage}</span> : null}
            </div>
            <div className="app-no-drag flex items-center gap-2">
              <StudyTimerControls />
              <button
                className="rounded border border-slate-300 bg-white/95 px-2 py-1 text-xs font-medium text-slate-800 shadow-sm hover:bg-white"
                onClick={async () => {
                  const payload = await window.desktopCalApi.summary.get();
                  openSummaryPopup(payload);
                }}
              >
                {UI_LABELS.summary}
              </button>
              <button
                className="rounded border border-slate-300 bg-white/95 px-2 py-1 text-xs font-medium text-slate-800 shadow-sm hover:bg-white"
                onClick={async () => {
                  const next = await syncNow.mutateAsync();
                  setSyncStatus(next);
                  setAuthMessage(next.lastError ? `${UI_LABELS.syncFailedPrefix}: ${next.lastError}` : UI_LABELS.syncDone);
                }}
              >
                {UI_LABELS.sync}
              </button>
              {auth?.connected ? (
                <button
                  className="rounded border border-slate-300 bg-white/95 px-2 py-1 text-xs font-medium text-slate-800 shadow-sm hover:bg-white"
                  onClick={async () => {
                    await window.desktopCalApi.auth.signOut();
                    setAuth({ connected: false });
                    setAuthMessage(UI_LABELS.signedOut);
                  }}
                >
                  {UI_LABELS.logout}
                </button>
              ) : (
                <button
                  className="rounded bg-accent px-2 py-1 text-xs font-medium text-white shadow-sm hover:brightness-95"
                  onClick={async () => {
                    setAuthMessage(UI_LABELS.loginInProgress);
                    const result = await window.desktopCalApi.auth.signIn();
                    if (!result.connected) {
                      setAuthMessage(`${UI_LABELS.loginFailedPrefix}: ${result.error}`);
                      return;
                    }
                    setAuth({ connected: true, user: { email: result.user.email } });
                    setCalendars(result.calendars);
                    setAuthMessage(UI_LABELS.connectedDone);
                  }}
                >
                  {UI_LABELS.loginGoogle}
                </button>
              )}

              <button
                ref={menuButtonRef}
                className="rounded border border-slate-300 bg-white/95 px-2 py-1 text-xs font-medium text-slate-800 shadow-sm hover:bg-white"
                onClick={() => setMenuOpen((prev) => !prev)}
                title={UI_LABELS.settingsMenuTitle}
              >
                {UI_LABELS.menu}
              </button>
            </div>
          </div>

          {menuOpen && (
            <div ref={menuRef} className="absolute right-2 top-11 z-20 w-[340px] max-h-[76vh] overflow-y-auto rounded-xl border border-slate-200 p-2 shadow-lg" style={popupPanelStyle}>
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

              <div className="mt-2 rounded-xl border border-slate-200 p-3 shadow-sm" style={popupPanelStyle}>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Calendars</h3>
                  <button className="rounded border border-slate-300 bg-white/95 px-2 py-0.5 text-[11px] font-medium text-slate-800 shadow-sm hover:bg-white" onClick={() => setCalendarOpen((v) => !v)}>
                    {calendarOpen ? "숨기기" : "보이기"}
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
                          <span className="truncate">{cal.title}</span>
                        </label>
                        <input
                          type="color"
                          className="h-6 w-8 cursor-pointer rounded border border-slate-300 p-0"
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
            </div>
          )}
        </header>

        <section className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 p-2 shadow-sm" style={calendarPanelStyle}>
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-base font-semibold">{monthLabel(year, month)}</span>
            <div className="flex items-center gap-1.5">
              <button className="rounded border border-slate-300 bg-white/95 px-2 py-1 text-xs font-medium text-slate-800 shadow-sm hover:bg-white" onClick={goPrevMonth}>
                이전
              </button>
              <button className="rounded border border-slate-300 bg-white/95 px-2 py-1 text-xs font-medium text-slate-800 shadow-sm hover:bg-white" onClick={goNextMonth}>
                다음
              </button>
              <button
                className="rounded border border-slate-300 bg-white/95 px-2 py-1 text-xs font-medium text-slate-800 shadow-sm hover:bg-white"
                onClick={() => {
                  setEditing(null);
                  setModalOpen(true);
                }}
              >
                일정 추가
              </button>
            </div>
          </div>
          <CalendarGrid
            previews={monthPreviews}
            panelOpacity={calendarPanelOpacity}
            onClickDate={(date) => {
              setSelectedDate(date);
              setDayPopupOpen(true);
            }}
            onDoubleClickDate={(date) => {
              setSelectedDate(date);
              setDayPopupOpen(true);
            }}
          />
        </section>
      </div>

      {dayPopupOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/35 p-3"
          onMouseDown={(e) => {
            if (e.target !== e.currentTarget) return;
            e.preventDefault();
            e.stopPropagation();
            setDayPopupOpen(false);
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <div
            className="max-h-[85vh] w-full max-w-[680px] overflow-y-auto rounded-xl border border-slate-200 p-4 shadow-xl"
            style={popupPanelStyle}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex select-none items-center justify-between">
              <h3 className="text-base font-semibold">{selectedDate} 일정</h3>
              <div className="flex items-center gap-1.5">
                <button
                  className="rounded border border-slate-300 bg-white/95 px-2.5 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-white"
                  onClick={() => {
                    setEditing(null);
                    setDayPopupOpen(false);
                    setModalOpen(true);
                  }}
                >
                  추가
                </button>
                <button className="rounded border border-slate-300 bg-white/95 px-2.5 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-white" onClick={() => setDayPopupOpen(false)}>
                  닫기
                </button>
              </div>
            </div>

            <ul className="space-y-2">
              {dayEvents.map((event: EventEntity) => (
                <li key={event.id} className="rounded border border-slate-200 p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium leading-snug">{event.title}</div>
                    <span className="shrink-0 rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600">
                      {calendarTitleMap.get(event.calendarId) ?? "캘린더"}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">{formatEventTime(event)}</div>
                  <div className="mt-2 flex gap-2">
                    <button
                      className="rounded border border-slate-300 bg-white/95 px-2.5 py-1 text-xs font-medium text-slate-800 shadow-sm hover:bg-white"
                      onClick={() => {
                        setEditing(event);
                        setDayPopupOpen(false);
                        setModalOpen(true);
                      }}
                    >
                      수정
                    </button>
                    <button className="rounded border border-rose-300 bg-white/95 px-2.5 py-1 text-xs font-medium text-rose-600 shadow-sm hover:bg-rose-50" onClick={() => deleteEvent.mutate(event.id)}>
                      삭제
                    </button>
                  </div>
                </li>
              ))}
              {dayEvents.length === 0 && <li className="text-sm text-slate-500">일정이 없습니다.</li>}
            </ul>
          </div>
        </div>
      )}

      {summaryPopupOpen && summaryPayload && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-3"
          onMouseDown={(e) => {
            if (e.target !== e.currentTarget) return;
            e.preventDefault();
            e.stopPropagation();
            setSummaryPopupOpen(false);
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <div
            className="max-h-[85vh] w-full max-w-[620px] overflow-y-auto rounded-xl border border-slate-200 p-3 shadow-xl"
            style={popupPanelStyle}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">일정 요약</h3>
              <button className="rounded border border-slate-300 bg-white/95 px-2 py-1 text-xs font-medium text-slate-800 shadow-sm hover:bg-white" onClick={() => setSummaryPopupOpen(false)}>
                닫기
              </button>
            </div>

            <section className="mb-3 rounded border border-slate-200 p-2">
              <div className="mb-1 text-xs font-semibold text-slate-700">오늘 일정</div>
              <ul className="space-y-1 text-xs">
                {summaryPayload.today.map((event) => (
                  <li key={`today-${event.id}`} className="rounded border border-slate-100 px-2 py-1">
                    <div className="font-medium">{event.title}</div>
                    <div className="text-[11px] text-slate-500">{formatSummaryTime(event.startsAt, event.allDay)}</div>
                  </li>
                ))}
                {summaryPayload.today.length === 0 && <li className="text-slate-500">오늘 일정이 없습니다.</li>}
              </ul>
            </section>

            <section className="rounded border border-slate-200 p-2">
              <div className="mb-1 text-xs font-semibold text-slate-700">7일 일정</div>
              <ul className="space-y-1 text-xs">
                {summaryPayload.week.map((event) => (
                  <li key={`week-${event.id}-${event.startsAt}`} className="rounded border border-slate-100 px-2 py-1">
                    <div className="font-medium">{event.title}</div>
                    <div className="text-[11px] text-slate-500">{formatSummaryTime(event.startsAt, event.allDay)}</div>
                  </li>
                ))}
                {summaryPayload.week.length === 0 && <li className="text-slate-500">7일 내 일정이 없습니다.</li>}
              </ul>
            </section>
          </div>
        </div>
      )}

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

      {settings && !settings.desktopPinned && (
        <div
          className="app-no-drag fixed bottom-2 right-2 z-[90] flex h-5 w-5 cursor-nwse-resize touch-none select-none items-end justify-end rounded-sm border border-slate-400 bg-white/80 px-[2px] py-[1px] shadow-sm"
          onPointerDown={onResizeHandlePointerDown}
          onPointerMove={onResizeHandlePointerMove}
          onPointerUp={onResizeHandlePointerUp}
          onPointerCancel={onResizeHandlePointerUp}
          title="창 크기 조절"
        >
          <span className="select-none text-[9px] leading-none text-slate-500">///</span>
        </div>
      )}
    </div>
  );
}

