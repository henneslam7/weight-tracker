"use client";

import { useCallback, useEffect, useState } from "react";
import { authedFetch } from "@/lib/api";
import {
  getExistingSubscription,
  getRegistration,
  isIos,
  isStandalone,
  pushSupported,
  urlBase64ToUint8Array,
} from "@/lib/push-client";
import { DEFAULT_SETTINGS, type ReminderSettings } from "@/lib/reminders";
import { getSupabase } from "@/lib/supabase";
import InstallButton from "./InstallButton";
import { btnGhost, btnPrimary, card, errorBox, infoBox, input } from "./ui";

type TimeKey = "weight" | "breakfast" | "lunch" | "dinner" | "snack" | "evening";

const ROWS: { key: TimeKey; label: string; hint?: string }[] = [
  { key: "weight", label: "體重提醒", hint: "已記錄就唔提醒" },
  { key: "breakfast", label: "早餐提醒", hint: "已記錄就唔提醒" },
  { key: "lunch", label: "午餐提醒", hint: "已記錄就唔提醒" },
  { key: "dinner", label: "晚餐提醒", hint: "已記錄就唔提醒" },
  { key: "snack", label: "小食提醒" },
  { key: "evening", label: "夜晚補記提醒", hint: "漏記體重或食物先提醒" },
];

export default function Reminders({ userId }: { userId: string }) {
  const [settings, setSettings] = useState<ReminderSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const supported = typeof window !== "undefined" && pushSupported();
  const needsInstall = typeof window !== "undefined" && isIos() && !isStandalone();

  const refresh = useCallback(async () => {
    if (!pushSupported()) {
      setPerm("unsupported");
      return;
    }
    setPerm(Notification.permission);
    setSubscribed((await getExistingSubscription()) !== null);
  }, []);

  useEffect(() => {
    void refresh();
    void (async () => {
      const { data } = await getSupabase().from("reminder_settings").select("*").maybeSingle();
      if (data) {
        const next = { ...DEFAULT_SETTINGS };
        for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof ReminderSettings)[]) {
          if (data[k] !== undefined && data[k] !== null) {
            (next[k] as unknown) =
              typeof DEFAULT_SETTINGS[k] === "string" ? String(data[k]).slice(0, 5) : data[k];
          }
        }
        setSettings(next);
      }
      setLoaded(true);
    })();
  }, [refresh]);

  async function enable() {
    setError(null);
    setMsg(null);
    const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapid) {
      setError("未設定 NEXT_PUBLIC_VAPID_PUBLIC_KEY，請睇設定步驟。");
      return;
    }
    setBusy(true);
    try {
      const reg = await getRegistration();
      const permission = await Notification.requestPermission(); // 必須由撳掣觸發
      setPerm(permission);
      if (permission !== "granted") {
        setError("未獲得通知權限。請喺 iPhone 設定 → 通知 → Fit過林峯 開啟。");
        return;
      }
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapid),
        }));
      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error("訂閱資料唔完整");
      const { error: dbErr } = await getSupabase().from("push_subscriptions").upsert(
        {
          user_id: userId,
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
          user_agent: navigator.userAgent.slice(0, 200),
        },
        { onConflict: "endpoint" },
      );
      if (dbErr) throw dbErr;
      setSubscribed(true);
      setMsg("已開啟通知。撳「發送測試通知」睇下收唔收到。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "開啟通知失敗");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      const sub = await getExistingSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await getSupabase().from("push_subscriptions").delete().eq("endpoint", endpoint);
      }
      setSubscribed(false);
      setMsg("已關閉呢部裝置嘅通知。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "關閉失敗");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await authedFetch("/api/push/test", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { message?: string; sent?: number };
      if (!res.ok) setError(body.message ?? "發送失敗");
      else setMsg(`已發送 ${body.sent ?? 0} 個通知，幾秒內應該收到。`);
    } catch {
      setError("連線失敗，請再試。");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    setMsg(null);
    const { error: dbErr } = await getSupabase()
      .from("reminder_settings")
      .upsert({ user_id: userId, ...settings, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    setBusy(false);
    if (dbErr) setError(dbErr.message);
    else setMsg("已儲存提醒設定。");
  }

  const set = <K extends keyof ReminderSettings>(k: K, v: ReminderSettings[K]) =>
    setSettings((s) => ({ ...s, [k]: v }));

  return (
    <div className="space-y-4">
      <section className={`${card} space-y-3`}>
        <h2 className="font-semibold">推送通知</h2>

        {perm === "unsupported" && (
          <p className={infoBox}>
            呢個瀏覽器唔支援推送通知。iPhone 需要 iOS 16.4 或以上，並要先加入主畫面。
          </p>
        )}
        {needsInstall && (
          <div className="space-y-2">
            <p className={infoBox}>
              iPhone 要先加入主畫面，再由主畫面嘅 icon 開啟，先可以開通知。
            </p>
            <InstallButton variant="primary" />
          </div>
        )}
        {perm === "denied" && (
          <p className={errorBox}>通知權限被拒絕。請去 iPhone 設定 → 通知 → Fit過林峯 重新開啟。</p>
        )}

        <p className="text-sm text-slate-500">
          狀態：{subscribed ? "✅ 呢部裝置已開啟" : "未開啟"}
        </p>

        {!subscribed ? (
          <button className={btnPrimary} disabled={busy || !supported || needsInstall} onClick={() => void enable()}>
            開啟通知
          </button>
        ) : (
          <>
            <button className={btnPrimary} disabled={busy} onClick={() => void sendTest()}>
              發送測試通知
            </button>
            <button className={btnGhost} disabled={busy} onClick={() => void disable()}>
              關閉呢部裝置嘅通知
            </button>
          </>
        )}
      </section>

      <section className={`${card} space-y-3`}>
        <h2 className="font-semibold">提醒時間（香港時間）</h2>
        {!loaded ? (
          <p className="text-sm text-slate-400">載入中…</p>
        ) : (
          <>
            {ROWS.map((r) => (
              <div key={r.key} className="flex items-center justify-between gap-3">
                <label className="flex min-w-0 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings[`${r.key}_enabled`]}
                    onChange={(e) => set(`${r.key}_enabled`, e.target.checked)}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm">{r.label}</span>
                    {r.hint && <span className="block text-xs text-slate-400">{r.hint}</span>}
                  </span>
                </label>
                <input
                  type="time"
                  aria-label={`${r.label}時間`}
                  className={`${input} !w-28`}
                  value={settings[`${r.key}_time`]}
                  onChange={(e) => e.target.value && set(`${r.key}_time`, e.target.value)}
                />
              </div>
            ))}

            <div className="space-y-2 border-t border-slate-100 pt-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.inactive_enabled}
                  onChange={(e) => set("inactive_enabled", e.target.checked)}
                />
                連續
                <select
                  className="rounded-lg border border-slate-300 px-2 py-1"
                  value={settings.inactive_days}
                  onChange={(e) => set("inactive_days", Number(e.target.value))}
                >
                  {[2, 3, 4, 5, 7].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                日冇記錄，輕輕提醒
              </label>

              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={settings.quiet_enabled}
                    onChange={(e) => set("quiet_enabled", e.target.checked)}
                  />
                  靜音時段
                </label>
                <span className="flex items-center gap-1 text-sm">
                  <input
                    type="time"
                    aria-label="靜音開始"
                    className={`${input} !w-28`}
                    value={settings.quiet_start}
                    onChange={(e) => e.target.value && set("quiet_start", e.target.value)}
                  />
                  –
                  <input
                    type="time"
                    aria-label="靜音結束"
                    className={`${input} !w-28`}
                    value={settings.quiet_end}
                    onChange={(e) => e.target.value && set("quiet_end", e.target.value)}
                  />
                </span>
              </div>
            </div>

            <button className={btnPrimary} disabled={busy} onClick={() => void save()}>
              儲存設定
            </button>
          </>
        )}
      </section>

      {error && <p className={errorBox}>{error}</p>}
      {msg && <p className="rounded-xl bg-teal-50 p-3 text-sm text-teal-800">{msg}</p>}

      <p className="text-xs text-slate-400">
        提醒每 5 分鐘檢查一次，所以可能遲幾分鐘先到。已經記錄咗嘅項目唔會再提醒。
      </p>
    </div>
  );
}
