"use client";

import { useMemo, useState } from "react";
import { movingAverage, weeklyTrendKg } from "@/lib/calc";
import { savedMessage, WEIGHT_EMPTY } from "@/lib/copy";
import { formatShort, isValidDateStr, toDateStr } from "@/lib/date";
import { getSupabase } from "@/lib/supabase";
import type { WeightLog } from "@/lib/types";
import WeightChart from "./WeightChart";
import { btnPrimary, card, errorBox, input, label } from "./ui";

interface Props {
  userId: string;
  logs: WeightLog[]; // 升序
  targetKg: number | null;
  onChanged: () => void;
}

export default function Weight({ userId, logs, targetKg, onChanged }: Props) {
  const [date, setDate] = useState(toDateStr());
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const points = useMemo(() => movingAverage(logs), [logs]);
  const trend = useMemo(() => weeklyTrendKg(logs), [logs]);
  const recent = useMemo(() => [...logs].reverse().slice(0, 30), [logs]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    const kg = Number(value);
    if (!isValidDateStr(date) || date > toDateStr()) {
      setError("請揀正確嘅日期（唔可以係未來）。");
      return;
    }
    if (!(kg >= 30 && kg <= 300)) {
      setError("體重請輸入 30–300 公斤。");
      return;
    }
    setBusy(true);
    try {
      // 同一日再記會覆蓋（unique user_id, logged_on）
      const { error } = await getSupabase()
        .from("weight_logs")
        .upsert(
          { user_id: userId, logged_on: date, weight_kg: kg },
          { onConflict: "user_id,logged_on" },
        );
      if (error) throw error;
      setValue("");
      setOk(savedMessage(date));
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "儲存失敗，請再試。");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("確定刪除呢個記錄？")) return;
    setError(null);
    const { error } = await getSupabase().from("weight_logs").delete().eq("id", id);
    if (error) setError(error.message);
    else onChanged();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={save} className={`${card} space-y-3`}>
        <h2 className="font-semibold">記錄體重</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="w-date">日期</label>
            <input
              id="w-date"
              type="date"
              max={toDateStr()}
              className={input}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <label className={label} htmlFor="w-kg">體重（公斤）</label>
            <input
              id="w-kg"
              type="number"
              inputMode="decimal"
              step="0.1"
              className={input}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
        </div>
        {error && <p className={errorBox}>{error}</p>}
        {ok && (
          <p className="rounded-xl bg-teal-50 p-3 text-sm text-teal-800">{ok}</p>
        )}
        <button className={btnPrimary} disabled={busy}>
          {busy ? "儲存中…" : "儲存"}
        </button>
        <p className="text-xs text-slate-400">同一日再記會覆蓋之前嘅記錄。</p>
      </form>

      <section className={card}>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-semibold">趨勢</h2>
          <span className="text-sm text-slate-500">
            {trend === null
              ? "需要 5 日以上記錄先有每週趨勢"
              : `每週 ${trend > 0 ? "+" : ""}${trend} kg`}
          </span>
        </div>
        <WeightChart points={points} targetKg={targetKg} />
        <p className="mt-1 text-xs text-slate-400">灰點 = 每日體重；綠線 = 7 日移動平均。</p>
      </section>

      <section className={card}>
        <h2 className="mb-2 font-semibold">最近記錄</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-400">{WEIGHT_EMPTY}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recent.map((l) => (
              <li key={l.id} className="flex items-center justify-between py-2">
                <span className="text-slate-600">{formatShort(l.logged_on)}</span>
                <span className="flex items-center gap-4">
                  <span className="font-medium">{l.weight_kg} kg</span>
                  <button
                    onClick={() => remove(l.id)}
                    className="text-sm text-slate-400 underline"
                    aria-label={`刪除 ${l.logged_on} 嘅記錄`}
                  >
                    刪除
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
