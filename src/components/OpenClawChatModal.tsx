import { useEffect, useMemo, useRef, useState } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
};

export function OpenClawChatModal({ open, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setError("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const target = listRef.current;
    if (!target) return;
    target.scrollTop = target.scrollHeight;
  }, [messages, open, loading]);

  const canSend = useMemo(() => input.trim().length > 0 && !loading, [input, loading]);

  if (!open) return null;

  const onSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setError("");
    const nextMessages = [...messages, { role: "user" as const, content: text }];
    setMessages(nextMessages);
    setLoading(true);

    const result = await window.desktopCalApi.openclaw.chat({
      message: text,
      history: messages
    });

    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setMessages((prev) => [...prev, { role: "assistant", content: result.content }]);
    setLoading(false);
  };

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
          <h3 className="text-sm font-semibold text-slate-800">OpenClaw 채팅</h3>
          <button className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50" onClick={onClose}>
            닫기
          </button>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
          {messages.length === 0 && <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">메시지를 입력하면 OpenClaw 서버와 대화합니다.</div>}
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`max-w-[92%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                message.role === "user" ? "ml-auto bg-slate-900 text-white" : "mr-auto border border-slate-200 bg-slate-50 text-slate-800"
              }`}
            >
              {message.content}
            </div>
          ))}
          {loading && <div className="mr-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">응답 생성 중...</div>}
        </div>

        <div className="border-t border-slate-200 px-3 py-2">
          {error && <div className="mb-2 text-xs text-rose-600">{error}</div>}
          <div className="flex items-center gap-2">
            <input
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="메시지를 입력하세요"
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
              disabled={!canSend}
            >
              전송
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
