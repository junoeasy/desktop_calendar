type Props = {
  status: { running: boolean; lastSuccessAt: string | null; lastError: string | null } | null;
};

export function SyncStatusBar({ status }: Props) {
  if (!status) {
    return <div className="rounded border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500">동기화 상태 확인 중...</div>;
  }

  return (
    <div className="rounded border border-slate-200 bg-white px-3 py-1.5 text-xs">
      <span className={status.running ? "text-amber-600" : "text-emerald-600"}>{status.running ? "동기화 중" : "대기 중"}</span>
      {status.lastSuccessAt && <span className="ml-2 text-slate-500">최근 성공: {new Date(status.lastSuccessAt).toLocaleTimeString()}</span>}
      {status.lastError && <span className="ml-2 text-rose-600">오류: {status.lastError}</span>}
    </div>
  );
}
