import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import type { AiConfigPublic, AiProvider } from "@shared/apiTypes";

type Props = {
  onPatchSettings: (patch: Record<string, unknown>) => Promise<void>;
  onSyncNow: () => Promise<void>;
};

export function SettingsPanel({ onPatchSettings, onSyncNow }: Props) {
  const settings = useAppStore((s) => s.settings);
  const [aiConfig, setAiConfig] = useState<AiConfigPublic | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [aiSaving, setAiSaving] = useState(false);
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void window.desktopCalApi.ai.getConfig().then((config) => {
      if (alive) {
        setAiConfig(config);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!settings) return null;
  const opacity = Number.isFinite(settings.windowOpacity) ? Math.min(1, Math.max(0.3, settings.windowOpacity)) : 1;
  const opacityPercent = Math.round(opacity * 100);

  const patchAiConfig = async (patch: { provider?: AiProvider; chatUrl?: string; model?: string; apiKey?: string }) => {
    setAiSaving(true);
    setAiStatus(null);
    setAiError(null);
    try {
      const next = await window.desktopCalApi.ai.updateConfig(patch);
      setAiConfig(next);
      if (patch.apiKey !== undefined) {
        setApiKey("");
      }
      setAiStatus("저장됨");
    } catch (error) {
      setAiError(error instanceof Error ? error.message : String(error));
    } finally {
      setAiSaving(false);
    }
  };

  const testAiConfig = async () => {
    setAiSaving(true);
    setAiStatus(null);
    setAiError(null);
    try {
      const result = await window.desktopCalApi.ai.testConfig();
      if (result.ok) {
        setAiStatus("연결 성공");
      } else {
        setAiError(result.error);
      }
    } catch (error) {
      setAiError(error instanceof Error ? error.message : String(error));
    } finally {
      setAiSaving(false);
    }
  };

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

      {aiConfig && (
        <div className="space-y-2 border-t border-slate-200 pt-3">
          <h4 className="text-xs font-semibold text-slate-600">AI 일정 추가</h4>

          <label className="flex items-center justify-between gap-2 text-sm">
            제공자
            <select
              className="max-w-[160px] rounded border border-slate-300 px-2 py-1 text-sm"
              value={aiConfig.provider}
              disabled={aiSaving}
              onChange={(e) => void patchAiConfig({ provider: e.target.value as AiProvider })}
            >
              <option value="nvidia">NVIDIA NIM</option>
              <option value="openai">OpenAI</option>
              <option value="custom">Custom</option>
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-xs text-slate-500">API Key {aiConfig.hasApiKey ? "(저장됨)" : ""}</span>
            <div className="flex gap-2">
              <input
                className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
                type="password"
                value={apiKey}
                placeholder={aiConfig.provider === "nvidia" ? "nvapi-..." : "sk-..."}
                disabled={aiSaving}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <button
                className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                type="button"
                disabled={aiSaving}
                onClick={() => void patchAiConfig({ apiKey })}
              >
                저장
              </button>
            </div>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-xs text-slate-500">모델</span>
            <input
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
              value={aiConfig.model}
              disabled={aiSaving}
              onChange={(e) => setAiConfig({ ...aiConfig, model: e.target.value })}
              onBlur={(e) => void patchAiConfig({ model: e.target.value })}
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-xs text-slate-500">Chat URL</span>
            <input
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
              value={aiConfig.chatUrl}
              disabled={aiSaving}
              onChange={(e) => setAiConfig({ ...aiConfig, chatUrl: e.target.value })}
              onBlur={(e) => void patchAiConfig({ chatUrl: e.target.value })}
            />
          </label>

          <div className="flex items-center gap-2">
            <button
              className="rounded bg-slate-800 px-2 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-60"
              type="button"
              disabled={aiSaving}
              onClick={() => void testAiConfig()}
            >
              연결 테스트
            </button>
            {aiStatus && <span className="text-xs text-emerald-600">{aiStatus}</span>}
            {aiError && <span className="min-w-0 truncate text-xs text-red-600" title={aiError}>{aiError}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
