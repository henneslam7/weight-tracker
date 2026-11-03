"use client";

import { useState } from "react";
import { authedFetch } from "@/lib/api";
import { MEAL_LABEL, MEAL_TYPES } from "@/lib/food";
import { getSupabase } from "@/lib/supabase";
import type { MealType } from "@/lib/types";
import { btnGhost, btnPrimary, card, errorBox, infoBox, input, label } from "./ui";

type Mode = "any" | "cook" | "eat_out";

interface Suggestion {
  title: string;
  kind: "cook" | "eat_out";
  summary: string;
  ingredients: string[];
  steps: string[];
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  why: string;
}

interface Result {
  suggestions: Suggestion[];
  remaining: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  note: string | null;
}

interface Props {
  userId: string;
  /** 今日日期（建議只針對今日） */
  date: string;
  defaultMeal: MealType;
  onAdded: () => void;
}

const MODES: { id: Mode; text: string }[] = [
  { id: "any", text: "都得" },
  { id: "cook", text: "屋企煮食" },
  { id: "eat_out", text: "外食" },
];

export default function MealSuggest({ userId, date, defaultMeal, onAdded }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("any");
  const [meal, setMeal] = useState<MealType>(defaultMeal);
  const [pref, setPref] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [added, setAdded] = useState<Set<number>>(new Set());

  async function ask() {
    setBusy(true);
    setError(null);
    setResult(null);
    setAdded(new Set());
    try {
      const res = await authedFetch("/api/ai/suggest", {
        method: "POST",
        body: JSON.stringify({ mode, meal, preference: pref }),
      });
      const body = (await res.json().catch(() => ({}))) as Partial<Result> & { message?: string };
      if (!res.ok) {
        setError(body.message ?? "AI 暫時用唔到，請稍後再試。");
        return;
      }
      setResult({
        suggestions: body.suggestions ?? [],
        remaining: body.remaining ?? { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
        note: body.note ?? null,
      });
    } catch {
      setError("連線失敗，請檢查網絡後再試。");
    } finally {
      setBusy(false);
    }
  }

  async function addToLog(s: Suggestion, idx: number) {
    setError(null);
    const { error: dbErr } = await getSupabase().from("food_logs").insert({
      user_id: userId,
      logged_on: date,
      meal_type: meal,
      name: s.title,
      quantity_text: "1 份",
      calories: Math.round(s.calories),
      protein_g: s.protein_g,
      carbs_g: s.carbs_g,
      fat_g: s.fat_g,
      source: "ai",
      ai_raw: { ...s, input: "suggest" },
    });
    if (dbErr) {
      setError(dbErr.message);
      return;
    }
    setAdded((a) => new Set(a).add(idx));
    onAdded();
  }

  if (!open) {
    return (
      <button className={btnGhost} onClick={() => setOpen(true)}>
        🤖 AI 食咩好？（按剩餘 calories 建議）
      </button>
    );
  }

  const r = result?.remaining;
  return (
    <section className={`${card} space-y-3`}>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">AI 食咩好？</h2>
        <button className="text-sm text-slate-400 underline" onClick={() => setOpen(false)}>
          收埋
        </button>
      </div>

      <div>
        <span className={label}>邊一餐</span>
        <div className="grid grid-cols-4 gap-2">
          {MEAL_TYPES.map((m) => (
            <button
              key={m}
              onClick={() => setMeal(m)}
              className={`rounded-xl px-1 py-2 text-sm ring-1 ${
                meal === m ? "bg-emerald-100 text-emerald-700 ring-emerald-400" : "bg-white text-slate-600 ring-slate-300"
              }`}
            >
              {MEAL_LABEL[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`rounded-xl px-1 py-2 text-sm ring-1 ${
              mode === m.id ? "bg-emerald-500 text-white ring-emerald-500" : "bg-white text-slate-600 ring-slate-300"
            }`}
          >
            {m.text}
          </button>
        ))}
      </div>

      <div>
        <label className={label} htmlFor="sg-pref">偏好／忌口（可選）</label>
        <input
          id="sg-pref"
          className={input}
          maxLength={100}
          placeholder="例如：唔食牛、想食飯、15 分鐘內搞掂"
          value={pref}
          onChange={(e) => setPref(e.target.value)}
        />
      </div>

      <button className={btnPrimary} disabled={busy} onClick={() => void ask()}>
        {busy ? "AI 諗緊…" : "AI 建議"}
      </button>

      {error && <p className={errorBox}>{error}</p>}

      {result && (
        <div className="space-y-3">
          {r && (
            <p className="text-sm text-slate-500">
              今日仲剩 <b className="text-slate-700">{Math.round(r.calories)} kcal</b>
              {r.calories > 0 && (
                <>
                  ・蛋白質 {Math.max(0, Math.round(r.protein_g))} g・碳水 {Math.max(0, Math.round(r.carbs_g))} g・脂肪{" "}
                  {Math.max(0, Math.round(r.fat_g))} g
                </>
              )}
            </p>
          )}
          {result.note && <p className={infoBox}>{result.note}</p>}

          {result.suggestions.map((s, i) => (
            <article key={`${s.title}-${i}`} className="space-y-2 rounded-xl bg-slate-50 p-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold">{s.title}</h3>
                <span className="shrink-0 rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                  {s.kind === "cook" ? "煮食" : "外食"}
                </span>
              </div>
              {s.summary && <p className="text-sm text-slate-600">{s.summary}</p>}
              <p className="text-sm">
                <b>{s.calories} kcal</b>
                <span className="text-slate-500">
                  {" "}・P {s.protein_g} · C {s.carbs_g} · F {s.fat_g}
                </span>
              </p>
              {s.why && <p className="text-xs text-emerald-700">{s.why}</p>}
              {(s.ingredients.length > 0 || s.steps.length > 0) && (
                <details className="text-sm text-slate-600">
                  <summary className="cursor-pointer text-emerald-700">
                    {s.kind === "cook" ? "材料同步驟" : "點餐方法"}
                  </summary>
                  {s.ingredients.length > 0 && (
                    <ul className="mt-2 list-disc space-y-0.5 pl-5">
                      {s.ingredients.map((x, k) => (
                        <li key={k}>{x}</li>
                      ))}
                    </ul>
                  )}
                  {s.steps.length > 0 && (
                    <ol className="mt-2 list-decimal space-y-0.5 pl-5">
                      {s.steps.map((x, k) => (
                        <li key={k}>{x}</li>
                      ))}
                    </ol>
                  )}
                </details>
              )}
              <button
                className={added.has(i) ? btnGhost : btnPrimary}
                disabled={added.has(i)}
                onClick={() => void addToLog(s, i)}
              >
                {added.has(i) ? "已加入記錄 ✓" : `加入${MEAL_LABEL[meal]}記錄`}
              </button>
            </article>
          ))}

          {result.suggestions.length > 0 && (
            <p className="text-xs text-slate-400">
              AI 建議同營養數字都係估算，唔係醫療建議。有過敏、疾病或特殊飲食需要，請向醫生或註冊營養師查詢。
            </p>
          )}
        </div>
      )}
    </section>
  );
}
