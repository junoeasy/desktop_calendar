import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import dayjs from "dayjs";
import type { CalendarRow, GoogleTaskItem, NotificationSummaryPayload, SyncStatus } from "@shared/apiTypes";
import type { EventEntity } from "@shared/models";
import { CalendarGrid } from "@/components/CalendarGrid";
import { EventModal } from "@/components/EventModal";
import { OpenClawChatModal } from "@/components/OpenClawChatModal";
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

function isTaskCalendarTitle(title: string) {
  const normalized = title.toLowerCase().replace(/\s+/g, "");
  return normalized.includes("task") || normalized.includes("tasks") || normalized.includes("할일") || normalized.includes("todo");
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
  menu: "\uBA54\uB274",
  todayTasks: "\uC624\uB298 \uD560 \uC77C"
} as const;
const WINDOW_MIN_WIDTH = 856;
const WINDOW_MIN_HEIGHT = 804;
const TODAY_TASK_ORDER_KEY = "today-task-order-v1";
const TODAY_TASK_ROW_GAP_PX = 6;

function todayTaskKey(task: Pick<GoogleTaskItem, "taskListId" | "id">) {
  return `${task.taskListId}:${task.id}`;
}

function loadTodayTaskOrder() {
  try {
    const raw = window.localStorage.getItem(TODAY_TASK_ORDER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function saveTodayTaskOrder(order: string[]) {
  try {
    window.localStorage.setItem(TODAY_TASK_ORDER_KEY, JSON.stringify(order));
  } catch {
    // ignore storage write errors
  }
}

function reorderListByIndex<T>(list: T[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex) return list;
  const next = [...list];
  const [picked] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, picked);
  return next;
}

export function App() {
  const [appVersion, setAppVersion] = useState("");
  const [auth, setAuth] = useState<{ connected: boolean; user?: { email: string } | null } | null>(null);
  const [authMessage, setAuthMessage] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [dayPopupOpen, setDayPopupOpen] = useState(false);
  const [summaryPopupOpen, setSummaryPopupOpen] = useState(false);
  const [todayTasksOpen, setTodayTasksOpen] = useState(false);
  const [summaryPayload, setSummaryPayload] = useState<NotificationSummaryPayload | null>(null);
  const [todayTasks, setTodayTasks] = useState<GoogleTaskItem[]>([]);
  const [todayTasksLoading, setTodayTasksLoading] = useState(false);
  const [todayTasksError, setTodayTasksError] = useState("");
  const [newTodayTaskTitle, setNewTodayTaskTitle] = useState("");
  const [addingTodayTask, setAddingTodayTask] = useState(false);
  const [todayTaskDrag, setTodayTaskDrag] = useState<{
    key: string;
    startY: number;
    currentY: number;
    fromIndex: number;
    toIndex: number;
    rowHeight: number;
  } | null>(null);
  const [dayTasks, setDayTasks] = useState<GoogleTaskItem[]>([]);
  const [dayTasksLoading, setDayTasksLoading] = useState(false);
  const [dayTasksError, setDayTasksError] = useState("");
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [editing, setEditing] = useState<EventEntity | null>(null);
  const [calendars, setCalendars] = useState<CalendarRow[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(true);
  const [openClawChatOpen, setOpenClawChatOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const todayTaskItemRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const resizeSessionRef = useRef<{ pointerId: number; lastX: number; lastY: number; width: number; height: number } | null>(null);
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
      const [version, status, calList, sync] = await Promise.all([
        window.desktopCalApi.app.version(),
        window.desktopCalApi.auth.status(),
        window.desktopCalApi.calendars.list(),
        window.desktopCalApi.sync.status()
      ]);
      setAppVersion(version);
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

  useEffect(() => {
    if (!dayPopupOpen) return;
    void loadTasksByDate(selectedDate);
  }, [dayPopupOpen, selectedDate]);

  useEffect(() => {
    if (!todayTasksOpen) return;
    void loadTodayTasks();
  }, [todayTasksOpen]);

  const defaultCalendarId = useMemo(() => {
    const normalizeTitle = (value: string) => value.trim().toLowerCase().replace(/\s+/g, "").replace(/캘린더$/g, "");
    const selected = calendars.filter((calendar) => calendar.selected === 1);
    const pool = selected.length > 0 ? selected : calendars;
    const preferred = pool.find((calendar) => normalizeTitle(calendar.title).includes("일정"));
    return preferred?.id ?? pool[0]?.id ?? null;
  }, [calendars]);
  const calendarTitleMap = useMemo(() => new Map(calendars.map((cal) => [cal.id, cal.title])), [calendars]);
  const visibleDayEvents = useMemo(() => {
    return dayEvents.filter((event) => !isTaskCalendarTitle(calendarTitleMap.get(event.calendarId) ?? ""));
  }, [dayEvents, calendarTitleMap]);
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

  const loadTasksByDate = async (dateIso: string) => {
    setDayTasksLoading(true);
    setDayTasksError("");
    try {
      const tasks = await window.desktopCalApi.tasks.byDate({ dateIso });
      setDayTasks(tasks);
    } catch (error) {
      setDayTasks([]);
      setDayTasksError(error instanceof Error ? error.message : String(error));
    } finally {
      setDayTasksLoading(false);
    }
  };

  const loadTodayTasks = async () => {
    setTodayTasksLoading(true);
    setTodayTasksError("");
    try {
      const tasks = await window.desktopCalApi.tasks.today();
      const order = loadTodayTaskOrder();
      const orderIndex = new Map(order.map((key, idx) => [key, idx]));
      const sorted = [...tasks].sort((a, b) => {
        const ai = orderIndex.get(todayTaskKey(a));
        const bi = orderIndex.get(todayTaskKey(b));
        if (ai !== undefined && bi !== undefined) return ai - bi;
        if (ai !== undefined) return -1;
        if (bi !== undefined) return 1;
        if (a.status !== b.status) return a.status === "needsAction" ? -1 : 1;
        return a.title.localeCompare(b.title, "ko");
      });
      setTodayTasks(sorted);
    } catch (error) {
      setTodayTasks([]);
      setTodayTasksError(error instanceof Error ? error.message : String(error));
    } finally {
      setTodayTasksLoading(false);
    }
  };

  const completeTask = async (task: GoogleTaskItem, context: "day" | "today") => {
    const shouldComplete = task.status !== "completed";
    const result = await window.desktopCalApi.tasks.complete({ taskListId: task.taskListId, taskId: task.id, completed: shouldComplete });
    if (!result.ok) {
      const errorText = result.error || "Task completion failed.";
      if (context === "day") {
        setDayTasksError(errorText);
      } else {
        setTodayTasksError(errorText);
      }
      return;
    }
    if (context === "day") {
      await loadTasksByDate(selectedDate);
    } else {
      await loadTodayTasks();
    }
    const status = await window.desktopCalApi.sync.status();
    setSyncStatus(status);
  };

  const addTodayTask = async () => {
    const title = newTodayTaskTitle.trim();
    if (!title || addingTodayTask) return;
    setAddingTodayTask(true);
    setTodayTasksError("");
    const result = await window.desktopCalApi.tasks.create({
      title,
      dateIso: dayjs().format("YYYY-MM-DD")
    });
    setAddingTodayTask(false);
    if (!result.ok) {
      setTodayTasksError(result.error);
      return;
    }
    setNewTodayTaskTitle("");
    await loadTodayTasks();
  };

  const deleteTodayTask = async (task: GoogleTaskItem) => {
    const result = await window.desktopCalApi.tasks.delete({
      taskListId: task.taskListId,
      taskId: task.id
    });
    if (!result.ok) {
      setTodayTasksError(result.error);
      return;
    }
    await loadTodayTasks();
  };

  const startTodayTaskDrag = (event: ReactPointerEvent<HTMLButtonElement>, key: string) => {
    event.preventDefault();
    const fromIndex = todayTasks.findIndex((item) => todayTaskKey(item) === key);
    if (fromIndex < 0) return;
    const rowEl = todayTaskItemRefs.current[key];
    const rowHeight = Math.max(1, (rowEl?.getBoundingClientRect().height ?? 40) + TODAY_TASK_ROW_GAP_PX);
    setTodayTaskDrag({
      key,
      startY: event.clientY,
      currentY: event.clientY,
      fromIndex,
      toIndex: fromIndex,
      rowHeight
    });
  };

  useEffect(() => {
    if (!todayTaskDrag) return;
    const maxIndex = todayTasks.length - 1;
    const onPointerMove = (event: PointerEvent) => {
      setTodayTaskDrag((prev) => {
        if (!prev) return null;
        const deltaY = event.clientY - prev.startY;
        const steps = Math.round(deltaY / prev.rowHeight);
        const toIndex = Math.max(0, Math.min(maxIndex, prev.fromIndex + steps));
        return {
          ...prev,
          currentY: event.clientY,
          toIndex
        };
      });
    };
    const onPointerUp = () => {
      setTodayTaskDrag((prev) => {
        if (!prev) return null;
        if (prev.fromIndex !== prev.toIndex) {
          setTodayTasks((list) => {
            const next = reorderListByIndex(list, prev.fromIndex, prev.toIndex);
            saveTodayTaskOrder(next.map((item) => todayTaskKey(item)));
            return next;
          });
        }
        return null;
      });
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [todayTaskDrag, todayTasks.length]);

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
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = await window.desktopCalApi.window.getBounds();
    resizeSessionRef.current = {
      pointerId: event.pointerId,
      lastX: event.screenX,
      lastY: event.screenY,
      width: bounds?.width ?? window.innerWidth,
      height: bounds?.height ?? window.innerHeight
    };
  };

  const onResizeHandlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = resizeSessionRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const deltaX = event.screenX - state.lastX;
    const deltaY = event.screenY - state.lastY;
    state.lastX = event.screenX;
    state.lastY = event.screenY;
    const width = Math.max(WINDOW_MIN_WIDTH, state.width + deltaX);
    const height = Math.max(WINDOW_MIN_HEIGHT, state.height + deltaY);
    state.width = width;
    state.height = height;
    queueResize(width, height);
  };

  const onResizeHandlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = resizeSessionRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resizeSessionRef.current = null;
  };

  const resizeWindowBy = async (deltaWidth: number, deltaHeight: number) => {
    if (settings?.desktopPinned) return;
    const bounds = await window.desktopCalApi.window.getBounds();
    if (!bounds) return;
    const width = Math.max(WINDOW_MIN_WIDTH, Math.min(4096, bounds.width + deltaWidth));
    const height = Math.max(WINDOW_MIN_HEIGHT, Math.min(3072, bounds.height + deltaHeight));
    await window.desktopCalApi.window.resize({ width, height });
  };

  const handleSignOut = async () => {
    await window.desktopCalApi.auth.signOut();
    setAuth({ connected: false });
    setAuthMessage(UI_LABELS.signedOut);
    setMenuOpen(false);
  };

  return (
    <div className="h-screen overflow-hidden p-3" style={appBgStyle}>
      <div className="relative mx-auto flex h-full max-w-[1450px] flex-col gap-2">
        <header className="app-drag relative rounded-xl border border-slate-200 px-3 py-1.5 shadow-sm" style={chromePanelStyle}>
          <div className="flex flex-wrap items-start justify-between gap-1.5">
            <div className="app-no-drag shrink-0">
              <button className="rounded border border-slate-300 bg-white/95 px-2 py-1 text-xs font-medium text-slate-800 shadow-sm hover:bg-white" onClick={() => setTodayTasksOpen((prev) => !prev)}>
                {UI_LABELS.todayTasks}
              </button>
            </div>
            <div className="flex min-h-0 flex-1 items-center rounded-md px-2 py-0.5 text-xs text-slate-600" />
            <div className="flex flex-wrap items-start gap-1.5">
              <StudyTimerControls />
              <button
                className="app-no-drag rounded border border-slate-300 bg-white/95 px-2 py-1 text-xs font-medium text-slate-800 shadow-sm hover:bg-white"
                onClick={async () => {
                  const payload = await window.desktopCalApi.summary.get();
                  openSummaryPopup(payload);
                }}
              >
                {UI_LABELS.summary}
              </button>
              <button
                className="app-no-drag rounded border border-slate-300 bg-white/95 px-2 py-1 text-xs font-medium text-slate-800 shadow-sm hover:bg-white"
                onClick={async () => {
                  const next = await syncNow.mutateAsync();
                  setSyncStatus(next);
                  setAuthMessage(next.lastError ? `${UI_LABELS.syncFailedPrefix}: ${next.lastError}` : UI_LABELS.syncDone);
                }}
              >
                {UI_LABELS.sync}
              </button>
              {!auth?.connected ? (
                <button
                  className="app-no-drag rounded bg-accent px-2 py-1 text-xs font-medium text-white shadow-sm hover:brightness-95"
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
              ) : null}

              <button
                ref={menuButtonRef}
                className="app-no-drag rounded border border-slate-300 bg-white/95 px-2 py-1 text-xs font-medium text-slate-800 shadow-sm hover:bg-white"
                onClick={() => setMenuOpen((prev) => !prev)}
                title={UI_LABELS.settingsMenuTitle}
              >
                {UI_LABELS.menu}
              </button>
            </div>
          </div>

          {menuOpen && (
            <div ref={menuRef} className="app-no-drag absolute right-2 top-11 z-20 w-[340px] max-h-[76vh] overflow-y-auto rounded-xl border border-slate-200 p-2 shadow-lg" style={popupPanelStyle}>
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

              {auth?.connected ? (
                <div className="mt-2 rounded-xl border border-slate-200 p-2 shadow-sm" style={popupPanelStyle}>
                  <button
                    className="w-full rounded border border-slate-300 bg-white/95 px-2 py-1.5 text-xs font-medium text-slate-800 shadow-sm hover:bg-white"
                    onClick={() => void handleSignOut()}
                  >
                    {UI_LABELS.logout}
                  </button>
                </div>
              ) : null}

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

              <div className="mt-2 px-1 pb-1 text-right text-[11px] text-slate-500">
                버전 {appVersion || "-"}
              </div>
            </div>
          )}
        </header>

        <section className="min-h-0 flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 p-2 shadow-sm" style={calendarPanelStyle}>
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-base font-semibold">{monthLabel(year, month)}</span>
            <div className="flex items-center gap-1.5">
              <div className="max-w-[460px] truncate text-xs text-slate-600">
                <span className="truncate">{auth?.connected ? `${UI_LABELS.connectedPrefix}: ${auth?.user?.email ?? ""}` : UI_LABELS.disconnected}</span>
                <span className={`ml-2 shrink-0 ${syncStatusClass}`}>{syncStatusLabel}</span>
                {syncStatus?.lastSuccessAt ? <span className="ml-2 shrink-0 text-slate-500">{UI_LABELS.recentSuccessPrefix}: {new Date(syncStatus.lastSuccessAt).toLocaleTimeString()}</span> : null}
                {syncStatus?.lastError ? <span className="ml-2 truncate text-rose-600">{UI_LABELS.errorPrefix}: {syncStatus.lastError}</span> : null}
                {authMessage ? <span className="ml-2 truncate">| {authMessage}</span> : null}
              </div>
              <button className="rounded border border-slate-300 bg-white/95 px-2 py-1 text-xs font-medium text-slate-800 shadow-sm hover:bg-white" onClick={goPrevMonth}>
                이전
              </button>
              <button className="rounded border border-slate-300 bg-white/95 px-2 py-1 text-xs font-medium text-slate-800 shadow-sm hover:bg-white" onClick={goNextMonth}>
                다음
              </button>
              <button
                className="rounded border border-slate-300 bg-white/95 px-2 py-1 text-xs font-medium text-slate-800 shadow-sm hover:bg-white"
                onClick={() => {
                  setOpenClawChatOpen(true);
                }}
              >
                일정 추가
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <CalendarGrid
              previews={monthPreviews}
              panelOpacity={calendarPanelOpacity}
              onClickDate={(date) => {
                setSelectedDate(date);
              }}
              onDoubleClickDate={(date) => {
                setSelectedDate(date);
                setDayPopupOpen(true);
              }}
            />
          </div>
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

            <section className="mb-3 rounded border border-slate-200 p-2">
              <div className="mb-1 text-xs font-semibold text-slate-700">할 일</div>
              {dayTasksLoading ? <div className="text-xs text-slate-500">불러오는 중...</div> : null}
              {dayTasksError ? <div className="text-xs text-rose-600">{dayTasksError}</div> : null}
              <ul className="space-y-1 text-xs">
                {dayTasks.map((task) => (
                  <li key={`day-task-${task.taskListId}-${task.id}`} className="rounded border border-slate-100 px-2 py-1">
                    <label className="flex cursor-pointer items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={task.status === "completed"}
                        onChange={() => {
                          void completeTask(task, "day");
                        }}
                      />
                      <span className={task.status === "completed" ? "line-through text-slate-400" : "text-slate-700"}>{task.title}</span>
                    </label>
                    <div className="ml-5 text-[11px] text-slate-500">{task.taskListTitle}</div>
                  </li>
                ))}
                {!dayTasksLoading && dayTasks.length === 0 ? <li className="text-slate-500">이 날짜의 할 일이 없습니다.</li> : null}
              </ul>
            </section>

            <ul className="space-y-2">
              {visibleDayEvents.map((event: EventEntity) => (
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
              {visibleDayEvents.length === 0 && <li className="text-sm text-slate-500">일정이 없습니다.</li>}
            </ul>
          </div>
        </div>
      )}

      {todayTasksOpen && (
        <aside className="app-no-drag fixed left-3 top-20 z-50 h-[calc(100vh-6rem)] w-[340px] overflow-y-auto rounded-xl border border-slate-200 p-3 shadow-xl" style={popupPanelStyle}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">오늘 할 일</h3>
            <div className="flex items-center gap-2">
              <button
                className="rounded border border-slate-300 bg-white/95 px-2 py-1 text-xs font-medium text-slate-800 shadow-sm hover:bg-white"
                onClick={() => void loadTodayTasks()}
              >
                새로고침
              </button>
              <button className="rounded border border-slate-300 bg-white/95 px-2 py-1 text-xs font-medium text-slate-800 shadow-sm hover:bg-white" onClick={() => setTodayTasksOpen(false)}>
                닫기
              </button>
            </div>
          </div>

          {todayTasksLoading ? <div className="text-xs text-slate-500">불러오는 중...</div> : null}
          {todayTasksError ? <div className="mb-2 text-xs text-rose-600">{todayTasksError}</div> : null}
          <div className="mb-2 flex items-center gap-1.5">
            <input
              className="w-full rounded border border-slate-300 bg-white/95 px-2 py-1 text-xs text-slate-800 shadow-sm"
              value={newTodayTaskTitle}
              placeholder="할 일 추가"
              onChange={(e) => setNewTodayTaskTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addTodayTask();
                }
              }}
            />
            <button
              className="shrink-0 whitespace-nowrap rounded border border-slate-300 bg-white/95 px-2 py-1 text-xs font-medium text-slate-800 shadow-sm hover:bg-white disabled:opacity-50"
              onClick={() => void addTodayTask()}
              disabled={addingTodayTask || newTodayTaskTitle.trim().length === 0}
            >
              추가
            </button>
          </div>
          <ul className="space-y-1.5 text-xs">
            {todayTasks.map((task, index) => {
              const key = todayTaskKey(task);
              const dragging = todayTaskDrag?.key === key;
              let translateY = 0;
              if (todayTaskDrag) {
                const deltaY = todayTaskDrag.currentY - todayTaskDrag.startY;
                if (dragging) {
                  translateY = deltaY;
                } else if (todayTaskDrag.fromIndex < todayTaskDrag.toIndex && index > todayTaskDrag.fromIndex && index <= todayTaskDrag.toIndex) {
                  translateY = -todayTaskDrag.rowHeight;
                } else if (todayTaskDrag.fromIndex > todayTaskDrag.toIndex && index >= todayTaskDrag.toIndex && index < todayTaskDrag.fromIndex) {
                  translateY = todayTaskDrag.rowHeight;
                }
              }
              return (
                <li
                  key={`today-task-${task.taskListId}-${task.id}`}
                  ref={(el) => {
                    todayTaskItemRefs.current[key] = el;
                  }}
                  className={`rounded border border-slate-100 px-2 py-1.5 pr-7 ${dragging ? "opacity-90" : ""}`}
                  style={{
                    transform: `translateY(${translateY}px)`,
                    transition: dragging ? "none" : "transform 140ms ease",
                    zIndex: dragging ? 20 : 1,
                    boxShadow: dragging ? "0 8px 16px rgba(15, 23, 42, 0.18)" : undefined,
                    position: "relative"
                  }}
                >
                <div className="flex items-start gap-2">
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={task.status === "completed"}
                      onChange={() => {
                        void completeTask(task, "today");
                      }}
                    />
                    <span className={task.status === "completed" ? "line-through text-slate-400" : "text-slate-700"}>{task.title}</span>
                  </label>
                </div>
                <button
                  type="button"
                  data-drag-handle="1"
                  className="touch-none absolute right-1.5 top-1/2 -translate-y-1/2 cursor-grab rounded px-1 text-[12px] leading-none text-slate-400 hover:text-slate-600 active:cursor-grabbing"
                  title="드래그해서 순서 변경"
                  onPointerDown={(event) => startTodayTaskDrag(event, key)}
                  style={{ border: "none", background: "transparent", boxShadow: "none" }}
                >
                  ≡
                </button>
                <div className="ml-5 text-[11px] text-slate-500">{task.taskListTitle}</div>
                <div className="ml-5 mt-1">
                  <button
                    className="rounded border border-rose-300 bg-white/95 px-1.5 py-0.5 text-[10px] font-medium text-rose-600 shadow-sm hover:bg-rose-50"
                    onClick={() => void deleteTodayTask(task)}
                  >
                    삭제
                  </button>
                </div>
              </li>
              );
            })}
            {!todayTasksLoading && todayTasks.length === 0 ? <li className="text-slate-500">오늘 할 일이 없습니다.</li> : null}
          </ul>
        </aside>
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
        calendars={calendars}
        onClose={() => setModalOpen(false)}
        onSubmit={async (payload) => {
          if (payload.id) {
            await updateEvent.mutateAsync(payload);
          } else {
            await createEvent.mutateAsync(payload);
          }
        }}
      />

      <OpenClawChatModal open={openClawChatOpen} calendars={calendars} onClose={() => setOpenClawChatOpen(false)} />

      {settings && !settings.desktopPinned && (
        <div className="app-no-drag fixed bottom-2 right-2 z-[90] flex items-center gap-1">
          <button
            className="h-5 w-5 rounded border border-slate-400 bg-white/90 text-[11px] leading-none text-slate-700 shadow-sm hover:bg-white"
            onClick={() => void resizeWindowBy(-60, -40)}
            title="창 줄이기"
          >
            -
          </button>
          <button
            className="h-5 w-5 rounded border border-slate-400 bg-white/90 text-[11px] leading-none text-slate-700 shadow-sm hover:bg-white"
            onClick={() => void resizeWindowBy(60, 40)}
            title="창 늘리기"
          >
            +
          </button>
          <div
            className="flex h-5 w-5 cursor-nwse-resize touch-none select-none items-end justify-end rounded-sm border border-slate-400 bg-white/80 px-[2px] py-[1px] shadow-sm"
            onPointerDown={onResizeHandlePointerDown}
            onPointerMove={onResizeHandlePointerMove}
            onPointerUp={onResizeHandlePointerUp}
            onPointerCancel={onResizeHandlePointerUp}
            title="창 크기 조절"
          >
            <span className="select-none text-[9px] leading-none text-slate-500">///</span>
          </div>
        </div>
      )}
    </div>
  );
}

