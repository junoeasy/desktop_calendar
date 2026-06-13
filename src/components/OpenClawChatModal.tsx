import { useEffect, useMemo, useRef, useState } from "react";
import type { AiDeleteEventDraft, AiEventDraft, CalendarRow } from "@shared/apiTypes";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type Props = {
  open: boolean;
  calendars: CalendarRow[];
  onCreateEvent: (payload: AiEventDraft) => Promise<{ title: string }>;
  onDeleteEvent: (eventId: string) => Promise<unknown>;
  onClose: () => void;
};

function toDisplayReply(text: string) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) {
    return text;
  }
  try {
    const parsed = JSON.parse(trimmed) as { reply?: unknown };
    if (typeof parsed.reply === "string" && parsed.reply.trim().length > 0) {
      return parsed.reply;
    }
  } catch {
    // Keep original text when not JSON.
  }
  return text;
}

function formatDraftWhen(draft: { startsAt: string; endsAt: string; allDay: boolean }) {
  const start = new Date(draft.startsAt);
  const end = new Date(draft.endsAt);
  if (Number.isNaN(start.getTime())) {
    return draft.startsAt;
  }
  if (draft.allDay) {
    return `${start.toLocaleDateString("ko-KR")} 하루 종일`;
  }
  const startText = start.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
  const endText = Number.isNaN(end.getTime())
    ? ""
    : end.toLocaleTimeString("ko-KR", {
        hour: "numeric",
        minute: "2-digit"
      });
  return endText ? `${startText} - ${endText}` : startText;
}

export function OpenClawChatModal({ open, calendars, onCreateEvent, onDeleteEvent, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pendingDrafts, setPendingDrafts] = useState<AiEventDraft[]>([]);
  const [pendingDelete, setPendingDelete] = useState<AiDeleteEventDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setPendingDrafts([]);
    setPendingDelete(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const target = listRef.current;
    if (!target) return;
    target.scrollTop = target.scrollHeight;
  }, [messages, open, loading]);

  useEffect(() => {
    if (!open) return;
    const timerId = window.setTimeout(() => {
      const target = inputRef.current;
      if (!target) return;
      target.focus();
      const end = target.value.length;
      target.setSelectionRange(end, end);
    }, 0);
    return () => window.clearTimeout(timerId);
  }, [open]);

  const canSend = useMemo(() => input.trim().length > 0 && !loading && pendingDrafts.length === 0 && !pendingDelete, [input, loading, pendingDrafts.length, pendingDelete]);

  if (!open) return null;

  const onSend = async () => {
    const text = input.trim();
    if (!text || loading || pendingDrafts.length > 0 || pendingDelete || inFlightRef.current) return;

    inFlightRef.current = true;
    setInput("");
    setError("");
    setPendingDrafts([]);
    setPendingDelete(null);
    const nextMessages = [...messages, { role: "user" as const, content: text }];
    setMessages(nextMessages);
    setLoading(true);

    try {
      const result = await window.desktopCalApi.openclaw.parseEvent({
        message: text
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      if (result.deleteDraft) {
        setPendingDelete(result.deleteDraft);
        setMessages((prev) => [...prev, { role: "assistant", content: `${result.deleteDraft.title} 일정을 삭제할까요?` }]);
      } else if ((result.drafts?.length ?? 0) > 0 || result.draft) {
        const drafts = result.drafts?.length ? result.drafts : result.draft ? [result.draft] : [];
        setPendingDrafts(drafts);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: drafts.length > 1 ? `${drafts.length}개 일정을 추가할까요?` : `${drafts[0]?.title ?? "일정"} 일정을 추가할까요?`
          }
        ]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: toDisplayReply(result.content) }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  };

  const onConfirmDraft = async () => {
    if (pendingDrafts.length === 0 || loading || inFlightRef.current) return;

    inFlightRef.current = true;
    setLoading(true);
    setError("");
    try {
      const created = [];
      for (const draft of pendingDrafts) {
        created.push(await onCreateEvent(draft));
      }
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: created.length > 1 ? `${created.length}개 일정을 등록했어요.` : `등록했어요: ${created[0]?.title ?? "일정"}`
        }
      ]);
      setPendingDrafts([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  };

  const onRejectDraft = () => {
    if (loading) return;
    setMessages((prev) => [...prev, { role: "assistant", content: "등록하지 않았어요." }]);
    setPendingDrafts([]);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const onConfirmDelete = async () => {
    if (!pendingDelete || loading || inFlightRef.current) return;

    inFlightRef.current = true;
    setLoading(true);
    setError("");
    try {
      await onDeleteEvent(pendingDelete.eventId);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `삭제했어요: ${pendingDelete.title}`
        }
      ]);
      setPendingDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  };

  const onRejectDelete = () => {
    if (loading) return;
    setMessages((prev) => [...prev, { role: "assistant", content: "삭제하지 않았어요." }]);
    setPendingDelete(null);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const hasCalendars = calendars.length > 0;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/35 p-3"
      onMouseDown={(e) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="flex h-[72vh] w-full max-w-[760px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
          <h3 className="text-sm font-semibold text-slate-800">AI 일정 추가</h3>
          <button className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50" onClick={onClose}>
            닫기
          </button>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
          {messages.length === 0 && <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">자연어로 입력하면 AI가 해석합니다. Shift+Enter로 줄바꿈할 수 있습니다.</div>}
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`max-w-[92%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                message.role === "user" ? "ml-auto bg-slate-900 text-white" : "mr-auto border border-slate-200 bg-slate-50 text-slate-800"
              }`}
            >
              {message.content}
            </div>
          ))}
          {loading && <div className="mr-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">응답 생성 중...</div>}
          {pendingDrafts.length > 0 && (
            <div className="mr-auto w-full max-w-[92%] rounded-lg border border-accent/30 bg-accent/5 px-3 py-3 text-sm text-slate-800">
              <div className="mb-2 font-semibold">{pendingDrafts.length > 1 ? `${pendingDrafts.length}개 일정으로 추가할까요?` : "이 일정으로 추가할까요?"}</div>
              <div className="space-y-2 text-xs">
                {pendingDrafts.map((draft, index) => (
                  <div key={`${draft.title}-${draft.startsAt}-${index}`} className={pendingDrafts.length > 1 ? "rounded border border-accent/20 bg-white/70 p-2" : ""}>
                    <div><span className="font-medium text-slate-600">제목</span> {draft.title}</div>
                    <div><span className="font-medium text-slate-600">시간</span> {formatDraftWhen(draft)}</div>
                    <div><span className="font-medium text-slate-600">분류</span> {draft.calendarTitle ?? "기본 캘린더"}</div>
                    {draft.location && <div><span className="font-medium text-slate-600">장소</span> {draft.location}</div>}
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white shadow-sm disabled:opacity-60"
                  type="button"
                  disabled={loading}
                  onClick={() => void onConfirmDraft()}
                >
                  네
                </button>
                <button
                  className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  type="button"
                  disabled={loading}
                  onClick={onRejectDraft}
                >
                  아니요
                </button>
              </div>
            </div>
          )}
          {pendingDelete && (
            <div className="mr-auto w-full max-w-[92%] rounded-lg border border-rose-300 bg-rose-50 px-3 py-3 text-sm text-slate-800">
              <div className="mb-2 font-semibold text-rose-700">이 일정을 삭제할까요?</div>
              <div className="space-y-1 text-xs">
                <div><span className="font-medium text-slate-600">제목</span> {pendingDelete.title}</div>
                <div><span className="font-medium text-slate-600">시간</span> {formatDraftWhen(pendingDelete)}</div>
                <div><span className="font-medium text-slate-600">분류</span> {pendingDelete.calendarTitle ?? "기본 캘린더"}</div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  className="rounded bg-rose-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm disabled:opacity-60"
                  type="button"
                  disabled={loading}
                  onClick={() => void onConfirmDelete()}
                >
                  삭제
                </button>
                <button
                  className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  type="button"
                  disabled={loading}
                  onClick={onRejectDelete}
                >
                  아니요
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 px-3 py-2">
          {!hasCalendars && <div className="mb-2 text-xs text-rose-600">등록할 캘린더가 없습니다. Google 연동을 먼저 완료해 주세요.</div>}
          {error && <div className="mb-2 text-xs text-rose-600">{error}</div>}
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              className="min-h-[76px] w-full resize-y rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="예: 내일 오후 3시에 팀 회의 1시간 추가해줘"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void onSend();
                }
              }}
            />
            <button
              className="rounded bg-accent px-3 py-2 text-sm font-medium text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => void onSend()}
              disabled={!canSend || !hasCalendars}
            >
              전송
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
