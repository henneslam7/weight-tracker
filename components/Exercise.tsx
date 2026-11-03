"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { dayBudget } from "@/lib/budget";
import type { Plan } from "@/lib/calc";
import { addDays, formatShort, toDateStr } from "@/lib/date";
import {
  EXERCISE_CREDIT_CAP,
  EXERCISE_TYPES,
  findType,
  MAX_ENTRY_KCAL,
  MAX_MINUTES,
  netKcal,
  sumBurned,
} from "@/lib/exercise";
import { getSupabase } from "@/lib/supabase";
import type { ExerciseLog } from "@/lib/types";
import { btnPrimary, card, DISCLAIMER, errorBox, infoBox, input, label } from "./ui";

interface Props {
  userId: string;
  plan: Plan | null;
  /** 最新體重（用嚟估算運動消耗） */
  weightKg: number | null;
  onChanged: () => void;
}

export default function Exercise({ userId, plan, weightKg, onChanged }: Props) {
  const today = toDateStr();
  const [date, setDate] = useState(today);
  const [logs, setLogs] = useState<ExerciseLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [typeId, setTypeId] = useState("brisk_walk");
  const [minutes, setMinutes] = useState("30");
  const [manual, setManual] = useState(false);
  const [kcalInput, setKcalInput] = useState("");
  const [customName, setCustomName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const { data, error } = await getSupabase()
      .from("exercise_logs")
      .select("id, logged_on, exercise_type, name, duration_min, calories, source")
      .eq("logged_on", date)
      .order("created_at", { ascending: true });
    if (error) setError(error.message);
    else setLogs((data ?? []) as ExerciseLog[]);
    setLoading(false);
  }, [date]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const type = findType(typeId);
  const forcedManual = type?.met === null;
  const useManual = manual || forcedManual;
  const mins = Number(minutes);
  const auto = useMemo(
    () => (type?.met && weightKg ? netKcal(type.met, weightKg, mins) : null),
    [type, weightKg, mins],
  );

  const burned = sumBurned(logs);
  const budget = plan ? dayBudget(plan, burned) : null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!type) return;

    let calories: number;
    let duration: number | null = null;
    if (minutes !== "") {
      if (!(mins >= 1 && mins <= MAX_MINUTES)) {
        setError(`時間請輸入 1–${MAX_MINUTES} 分鐘。`);
        return;
      }
      duration = Math.round(mins);
    }
    if (useManual) {
      calories = Math.round(Number(kcalInput));
      if (!(calories >= 0 && calories <= MAX_ENTRY_KCAL) || kcalInput === "") {
        setError(`消耗請輸入 0–${MAX_ENTRY_KCAL} kcal。`);
        return;
      }
    } else {
      if (duration === null) {
        setError("請輸入運動時間。");
        return;
      }
      if (auto === null) {
        setError("未有體重記錄，無法估算。請先記錄體重，或者揀「自己輸入 kcal」。");
        return;
      }
      calories = auto;
    }
    const name = forcedManual ? customName.trim() : type.label;
    if (!name || name.length > 60) {
      setError("請輸入運動名稱（最多 60 字）。");
      return;
    }

    setBusy(true);
    const { error: dbErr } = await getSupabase().from("exercise_logs").insert({
      user_id: userId,
      logged_on: date,
      exercise_type: type.id,
      name,
      duration_min: duration,
      calories,
      source: useManual ? "manual" : "met",
    });
    setBusy(false);
    if (dbErr) {
      setError(dbErr.message);
      return;
    }
    setKcalInput("");
    setCustomName("");
    await load();
    onChanged();
  }

  async function remove(id: string) {
    if (!window.confirm("確定刪除呢個運動記錄？")) return;
    const { error } = await getSupabase().from("exercise_logs").delete().eq("id", id);
    if (error) setError(error.message);
    else {
      await load();
      onChanged();
    }
  }

  const isToday = date === today;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          aria-label="前一日"
          className="rounded-lg px-3 py-1 text-xl text-slate-500 active:bg-slate-100"
          onClick={() => setDate(addDays(date, -1))}
        >
          ‹
        </button>
        <div className="text-center">
          <div className="font-semibold">{isToday ? "今日" : formatShort(date)}</div>
          {!isToday && (
            <button className="text-xs text-teal-700 underline" onClick={() => setDate(today)}>
              返回今日
            </button>
          )}
        </div>
        <button
          aria-label="後一日"
          disabled={isToday}
          className="rounded-lg px-3 py-1 text-xl text-slate-500 active:bg-slate-100 disabled:opacity-30"
          onClick={() => setDate(addDays(date, 1))}
        >
          ›
        </button>
      </div>

      <section className={card}>
        <div className="text-center">
          <div className="text-3xl font-bold text-teal-700">
            {burned}
            <span className="text-base font-normal text-slate-400"> kcal</span>
          </div>
          <div className="text-sm text-slate-500">{isToday ? "今日" : "當日"}運動消耗（估算）</div>
        </div>
        {budget ? (
          <p className="mt-3 rounded-xl bg-teal-50 p-3 text-center text-sm text-teal-900">
            食物上限：基本 {budget.baseCalories} ＋ 運動 {budget.exerciseCredit} ＝{" "}
            <b>{budget.calories} kcal</b>
            {burned > EXERCISE_CREDIT_CAP && (
              <span className="block text-xs">運動加成每日最多 {EXERCISE_CREDIT_CAP} kcal</span>
            )}
          </p>
        ) : (
          <p className={`${infoBox} mt-3`}>記錄體重後，先會計到每日目標同運動加成。</p>
        )}
        {burned >= 800 && (
          <p className="mt-2 text-xs text-slate-500">運動量好大，記得補充營養、飲水同休息。</p>
        )}
      </section>

      <form onSubmit={save} className={`${card} space-y-3`}>
        <h2 className="font-semibold">記錄運動</h2>
        <div>
          <label className={label} htmlFor="ex-type">運動類型</label>
          <select id="ex-type" className={input} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            {EXERCISE_TYPES.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>

        {forcedManual && (
          <div>
            <label className={label} htmlFor="ex-name">運動名稱</label>
            <input
              id="ex-name"
              className={input}
              maxLength={60}
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="ex-min">時間（分鐘）</label>
            <input
              id="ex-min"
              type="number"
              inputMode="numeric"
              min="1"
              max={MAX_MINUTES}
              className={input}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </div>
          <div>
            <label className={label} htmlFor="ex-kcal">
              {useManual ? "消耗（kcal）" : "預計消耗"}
            </label>
            {useManual ? (
              <input
                id="ex-kcal"
                type="number"
                inputMode="numeric"
                min="0"
                max={MAX_ENTRY_KCAL}
                className={input}
                value={kcalInput}
                onChange={(e) => setKcalInput(e.target.value)}
              />
            ) : (
              <div
                id="ex-kcal"
                className="flex h-[46px] items-center rounded-xl bg-slate-50 px-3 font-semibold text-teal-800"
              >
                {auto === null ? "—" : `約 ${auto} kcal`}
              </div>
            )}
          </div>
        </div>

        {!forcedManual && (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} />
            自己輸入 kcal（例如跟手錶數值）
          </label>
        )}
        {!useManual && weightKg === null && (
          <p className={infoBox}>未有體重記錄，無法估算。請先去「體重」頁記錄。</p>
        )}
        {useManual && (
          <p className="text-xs text-slate-400">
            手錶數值通常包含靜止都會燒嘅部分，請填「活動 calories」，唔好填總消耗，否則會重複計算。
          </p>
        )}

        {error && <p className={errorBox}>{error}</p>}
        <button className={btnPrimary} disabled={busy}>
          {busy ? "儲存中…" : "儲存運動"}
        </button>
      </form>

      <section className={card}>
        <h2 className="mb-2 font-semibold">運動記錄</h2>
        {loading ? (
          <p className="text-sm text-slate-400">載入中…</p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-slate-400">呢日未有運動記錄。休息日都係訓練嘅一部分。</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {logs.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <div className="truncate">{l.name}</div>
                  <div className="text-xs text-slate-400">
                    {l.duration_min ? `${l.duration_min} 分鐘 · ` : ""}
                    {l.source === "manual" ? "自己輸入" : "按 MET 估算"}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-medium">{l.calories} kcal</span>
                  <button
                    onClick={() => void remove(l.id)}
                    className="text-sm text-slate-400 underline"
                    aria-label={`刪除 ${l.name}`}
                  >
                    刪除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="space-y-1 text-xs text-slate-400">
        <p>
          消耗按「(MET − 1) × 體重 × 時間」估算，已扣除靜止時本來都會燒嘅部分。實際消耗因人同強度而異，只係參考。
        </p>
        <p>
          運動消耗會加返入當日 calories 上限，每日最多 {EXERCISE_CREDIT_CAP} kcal。運動係為咗健康同體能，唔需要為咗「賺」食嘅份量而過度運動。
        </p>
        <p>{DISCLAIMER}</p>
      </div>
    </div>
  );
}
