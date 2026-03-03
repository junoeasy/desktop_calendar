import { useAppStore } from "@/lib/store";

type Props = {
  onPatchSettings: (patch: Record<string, unknown>) => Promise<void>;
  onSyncNow: () => Promise<void>;
};

export function SettingsPanel({ onPatchSettings, onSyncNow }: Props) {
  const settings = useAppStore((s) => s.settings);
  if (!settings) return null;
  const opacity = Number.isFinite(settings.windowOpacity) ? Math.min(1, Math.max(0.3, settings.windowOpacity)) : 1;
  const opacityPercent = Math.round(opacity * 100);

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 p-3 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-700">설정</h3>

      <label className="flex items-center justify-between text-sm">
        시작 프로그램 등록
        <input type="checkbox" checked={settings.startupLaunch} onChange={(e) => void onPatchSettings({ startupLaunch: e.target.checked })} />
      </label>

      <label className="flex items-center justify-between text-sm">
        트레이로 최소화
        <input type="checkbox" checked={settings.minimizeToTray} onChange={(e) => void onPatchSettings({ minimizeToTray: e.target.checked })} />
      </label>

      <label className="flex items-center justify-between text-sm">
        바탕화면 고정 모드
        <input type="checkbox" checked={settings.desktopPinned} onChange={(e) => void onPatchSettings({ desktopPinned: e.target.checked })} />
      </label>

      <label className="flex items-center justify-between gap-2 text-sm">
        동기화 주기(분)
        <input
          className="w-16 rounded border border-slate-300 px-2 py-1"
          type="number"
          value={settings.syncIntervalMinutes}
          min={1}
          max={120}
          onChange={(e) => void onPatchSettings({ syncIntervalMinutes: Number(e.target.value) })}
        />
      </label>

      <label className="flex items-center justify-between gap-2 text-sm">
        테마
        <select
          className="rounded border border-slate-300 px-2 py-1"
          value={settings.themeMode}
          onChange={(e) => void onPatchSettings({ themeMode: e.target.value })}
        >
          <option value="light">라이트</option>
          <option value="dark">다크</option>
        </select>
      </label>

      <label className="flex items-center justify-between gap-2 text-sm">
        강조 색상
        <input type="color" value={settings.accentColor} onChange={(e) => void onPatchSettings({ accentColor: e.target.value })} />
      </label>

      <label className="flex items-center justify-between gap-2 text-sm">
        투명도
        <div className="flex items-center gap-2">
          <input
            className="w-28"
            type="range"
            min={30}
            max={100}
            step={1}
            value={opacityPercent}
            onChange={(e) => void onPatchSettings({ windowOpacity: Number(e.target.value) / 100 })}
          />
          <span className="w-10 text-right text-xs text-slate-500">{opacityPercent}%</span>
        </div>
      </label>

      <button className="w-full rounded bg-accent px-2 py-1.5 text-sm font-medium text-white shadow-sm hover:brightness-95" type="button" onClick={() => void onSyncNow()}>
        지금 동기화
      </button>
    </div>
  );
}
