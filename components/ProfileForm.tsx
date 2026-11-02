"use client";

import { useState } from "react";
import { validateProfile } from "@/lib/calc";
import { toDateStr } from "@/lib/date";
import { getSupabase } from "@/lib/supabase";
import type { ActivityLevel, Goal, Profile, Sex } from "@/lib/types";
import { btnGhost, btnPrimary, card, DISCLAIMER, errorBox, input, label } from "./ui";

const ACTIVITY_OPTIONS: { value: ActivityLevel; text: string }[] = [
  { value: "sedentary", text: "極少運動（坐辦公室）" },
  { value: "light", text: "輕度（每週運動 1–3 日）" },
  { value: "moderate", text: "中度（每週運動 3–5 日）" },
  { value: "active", text: "高度（每週運動 6–7 日）" },
  { value: "very_active", text: "極高（體力勞動或每日雙重訓練）" },
];

const GOAL_OPTIONS: { value: Goal; text: string }[] = [
  { value: "lose", text: "減脂" },
  { value: "maintain", text: "維持體重" },
  { value: "gain", text: "增肌" },
];

interface Props {
  userId: string;
  initial: Profile | null;
  /** 已有體重記錄嘅話，唔需要再問現時體重 */
  hasWeight: boolean;
  /** 用嚟檢查目標體重 */
  latestWeightKg: number | null;
  onSaved: () => void;
  onCancel?: () => void;
}

export default function ProfileForm({
  userId,
  initial,
  hasWeight,
  latestWeightKg,
  onSaved,
  onCancel,
}: Props) {
  const [sex, setSex] = useState<Sex>(initial?.sex ?? "male");
  const [birth, setBirth] = useState(initial?.birth_date ?? "");
  const [height, setHeight] = useState(initial ? String(initial.height_cm) : "");
  const [weight, setWeight] = useState("");
  const [activity, setActivity] = useState<ActivityLevel>(
    initial?.activity_level ?? "light",
  );
  const [goal, setGoal] = useState<Goal>(initial?.goal ?? "lose");
  const [target, setTarget] = useState(
    initial?.target_weight_kg ? String(initial.target_weight_kg) : "",
  );
  const [rate, setRate] = useState(String(initial?.weekly_rate_kg ?? 0.5));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rateOptions = goal === "gain" ? [0.25, 0.5] : [0.25, 0.5, 0.75];
  const effectiveRate = rateOptions.includes(Number(rate)) ? rate : "0.5";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const today = toDateStr();
    const profile: Profile = {
      sex,
      birth_date: birth,
      height_cm: Number(height),
      activity_level: activity,
      goal,
      target_weight_kg: goal === "maintain" ? null : Number(target),
      weekly_rate_kg: goal === "maintain" ? null : Number(effectiveRate),
    };
    const currentWeight = hasWeight
      ? latestWeightKg
      : weight === ""
        ? null
        : Number(weight);

    if (!hasWeight && currentWeight === null) {
      setError("請輸入現時體重。");
      return;
    }
    const problem = validateProfile({ profile, currentWeightKg: currentWeight, today });
    if (problem) {
      setError(problem);
      return;
    }

    setBusy(true);
    try {
      const supabase = getSupabase();
      const { error: pErr } = await supabase
        .from("profiles")
        .upsert(
          { user_id: userId, ...profile, updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        );
      if (pErr) throw pErr;

      if (!hasWeight && currentWeight !== null) {
        const { error: wErr } = await supabase
          .from("weight_logs")
          .upsert(
            { user_id: userId, logged_on: today, weight_kg: currentWeight },
            { onConflict: "user_id,logged_on" },
          );
        if (wErr) throw wErr;
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "儲存失敗，請再試。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-6">
      <h1 className="text-2xl font-bold">{initial ? "修改個人資料" : "設定個人資料"}</h1>
      <p className="text-sm text-slate-500">
        呢啲資料用嚟計算你每日嘅 calories 同營養目標。只供 18 歲或以上使用。
      </p>
      <form onSubmit={submit} className={`${card} space-y-4`}>
        <div>
          <span className={label}>性別</span>
          <div className="grid grid-cols-2 gap-2">
            {(["male", "female"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSex(s)}
                className={`rounded-xl px-3 py-2.5 ring-1 ${
                  sex === s
                    ? "bg-emerald-500 text-white ring-emerald-500"
                    : "bg-white text-slate-700 ring-slate-300"
                }`}
              >
                {s === "male" ? "男" : "女"}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={label} htmlFor="birth">出生日期</label>
          <input
            id="birth"
            type="date"
            required
            max={toDateStr()}
            className={input}
            value={birth}
            onChange={(e) => setBirth(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="height">身高（厘米）</label>
            <input
              id="height"
              type="number"
              inputMode="decimal"
              step="0.1"
              required
              className={input}
              value={height}
              onChange={(e) => setHeight(e.target.value)}
            />
          </div>
          {!hasWeight && (
            <div>
              <label className={label} htmlFor="weight">現時體重（公斤）</label>
              <input
                id="weight"
                type="number"
                inputMode="decimal"
                step="0.1"
                required
                className={input}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
            </div>
          )}
        </div>

        <div>
          <label className={label} htmlFor="activity">活動量</label>
          <select
            id="activity"
            className={input}
            value={activity}
            onChange={(e) => setActivity(e.target.value as ActivityLevel)}
          >
            {ACTIVITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.text}</option>
            ))}
          </select>
        </div>

        <div>
          <span className={label}>目標</span>
          <div className="grid grid-cols-3 gap-2">
            {GOAL_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setGoal(o.value)}
                className={`rounded-xl px-2 py-2.5 ring-1 ${
                  goal === o.value
                    ? "bg-emerald-500 text-white ring-emerald-500"
                    : "bg-white text-slate-700 ring-slate-300"
                }`}
              >
                {o.text}
              </button>
            ))}
          </div>
        </div>

        {goal !== "maintain" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="target">目標體重（公斤）</label>
              <input
                id="target"
                type="number"
                inputMode="decimal"
                step="0.1"
                required
                className={input}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </div>
            <div>
              <label className={label} htmlFor="rate">每週速度</label>
              <select
                id="rate"
                className={input}
                value={effectiveRate}
                onChange={(e) => setRate(e.target.value)}
              >
                {rateOptions.map((r) => (
                  <option key={r} value={r}>{r} kg／週</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {error && <p className={errorBox}>{error}</p>}
        <button className={btnPrimary} disabled={busy}>
          {busy ? "儲存中…" : "儲存"}
        </button>
        {onCancel && (
          <button type="button" className={btnGhost} onClick={onCancel}>
            取消
          </button>
        )}
      </form>
      <p className="text-xs text-slate-400">{DISCLAIMER}</p>
    </main>
  );
}
