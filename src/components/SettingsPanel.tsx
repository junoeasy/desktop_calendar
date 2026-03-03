import { useAppStore } from "@/lib/store";

type Props = {
  onPatchSettings: (patch: Record<string, unknown>) => Promise<void>;
  onSyncNow: () => Promise<void>;
};

export function SettingsPanel({ onPatchSettings, onSyncNow }: Props) {
  const settings = useAppStore((s) => s.settings);
  if (!settings) return null;

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-700">설정</h3>

      <label className="flex items-center justify-between text-sm">
        시작 프로그램
        <input type="checkbox" checked={settings.startupLaunch} onChange={(e) => void onPatchSettings({ startupLaunch: e.target.checked })} />
      </label>

      <label className="flex items-center justify-between text-sm">
        트레이 최소화
        <input type="checkbox" checked={settings.minimizeToTray} onChange={(e) => void onPatchSettings({ minimizeToTray: e.target.checked })} />
      </label>

      <label className="flex items-center justify-between text-sm">
        창 크기 고정
        <input type="checkbox" checked={settings.desktopPinned} onChange={(e) => void onPatchSettings({ desktopPinned: e.target.checked })} />
      </label>

      <label className="flex items-center justify-between gap-2 text-sm">
        동기화(분)
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
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>

      <label className="flex items-center justify-between gap-2 text-sm">
        강조 색상
        <input type="color" value={settings.accentColor} onChange={(e) => void onPatchSettings({ accentColor: e.target.value })} />
      </label>

      <button className="w-full rounded bg-accent px-2 py-1.5 text-sm text-white" type="button" onClick={() => void onSyncNow()}>
        지금 동기화
      </button>
    </div>
  );
}
