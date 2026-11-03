"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/api";
import { AI_ESTIMATE_NOTE } from "@/lib/copy";
import { MEAL_LABEL, MEAL_TYPES } from "@/lib/food";
import { getSupabase } from "@/lib/supabase";
import type { MealType, SavedMeal } from "@/lib/types";
import { btnGhost, btnPrimary, errorBox, infoBox, input, label } from "./ui";

interface Draft {
  key: string;
  name: string;
  quantity_text: string;
  calories: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
  save: boolean;
  /** AI 原始估算（存入 ai_raw） */
  raw: unknown;
}

interface AiItem {
  name: string;
  quantity_text: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: string;
}

type Mode = "ai" | "manual" | "saved";

const emptyDraft = (): Draft => ({
  key: crypto.randomUUID(),
  name: "",
  quantity_text: "",
  calories: "",
  protein_g: "",
  carbs_g: "",
  fat_g: "",
  save: false,
  raw: null,
});

interface Props {
  userId: string;
  date: string;
  meal: MealType;
  onMealChange: (m: MealType) => void;
  onAdded: () => void;
}

function toRow(d: Draft, userId: string, date: string, meal: MealType) {
  return {
    user_id: userId,
    logged_on: date,
    meal_type: meal,
    name: d.name.trim(),
    quantity_text: d.quantity_text.trim() || null,
    calories: Math.round(Number(d.calories)),
    protein_g: Number(d.protein_g || 0),
    carbs_g: Number(d.carbs_g || 0),
    fat_g: Number(d.fat_g || 0),
    source: d.raw ? "ai" : "manual",
    ai_raw: d.raw ?? null,
  };
}

function checkDraft(d: Draft): string | null {
  const n = (v: string) => Number(v === "" ? 0 : v);
  if (!d.name.trim()) return "每項食物都要有名。";
  if (d.calories === "" || !(n(d.calories) >= 0 && n(d.calories) <= 5000)) {
    return `「${d.name || "食物"}」calories 請輸入 0–5000。`;
  }
  for (const [k, max] of [["protein_g", 500], ["carbs_g", 800], ["fat_g", 500]] as const) {
    if (!(n(d[k]) >= 0 && n(d[k]) <= max)) return `「${d.name}」嘅營養數值唔合理。`;
  }
  return null;
}

export default function FoodAdd({ userId, date, meal, onMealChange, onAdded }: Props) {
  const [mode, setMode] = useState<Mode>("ai");
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedMeal[]>([]);

  async function loadSaved() {
    const { data } = await getSupabase()
      .from("saved_meals")
      .select("id, name, quantity_text, calories, protein_g, carbs_g, fat_g")
      .order("name");
    setSaved((data ?? []) as SavedMeal[]);
  }

  useEffect(() => {
    if (mode === "saved") void loadSaved();
  }, [mode]);

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
    setNotice(null);
    setDrafts(m === "manual" ? [emptyDraft()] : []);
  }

  async function estimate() {
    setError(null);
    setNotice(null);
    if (!text.trim()) {
      setError("請輸入你食咗啲咩。");
      return;
    }
    setBusy(true);
    try {
      const res = await authedFetch("/api/ai/food", {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        items?: AiItem[];
        message?: string;
      };
      if (!res.ok) {
        setError(body.message ?? "AI 暫時用唔到，可以手動輸入。");
        return;
      }
      const items = body.items ?? [];
      if (items.length === 0) {
        setNotice("AI 認唔到食物，請寫詳細啲，或者改用手動輸入。");
        return;
      }
      setDrafts(
        items.map((i) => ({
          key: crypto.randomUUID(),
          name: i.name,
          quantity_text: i.quantity_text,
          calories: String(i.calories),
          protein_g: String(i.protein_g),
          carbs_g: String(i.carbs_g),
          fat_g: String(i.fat_g),
          save: false,
          raw: i,
        })),
      );
    } catch {
      setError("連線失敗，請檢查網絡後再試。");
    } finally {
      setBusy(false);
    }
  }

  function update(key: string, patch: Partial<Draft>) {
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  async function saveAll() {
    setError(null);
    for (const d of drafts) {
      const problem = checkDraft(d);
      if (problem) {
        setError(problem);
        return;
      }
    }
    setBusy(true);
    try {
      const supabase = getSupabase();
      const { error: fErr } = await supabase
        .from("food_logs")
        .insert(drafts.map((d) => toRow(d, userId, date, meal)));
      if (fErr) throw fErr;

      const toSave = drafts.filter((d) => d.save);
      if (toSave.length > 0) {
        const { error: sErr } = await supabase.from("saved_meals").upsert(
          toSave.map((d) => ({
            user_id: userId,
            name: d.name.trim(),
            quantity_text: d.quantity_text.trim() || null,
            calories: Math.round(Number(d.calories)),
            protein_g: Number(d.protein_g || 0),
            carbs_g: Number(d.carbs_g || 0),
            fat_g: Number(d.fat_g || 0),
          })),
          { onConflict: "user_id,name" },
        );
        if (sErr) throw sErr;
      }
      setDrafts(mode === "manual" ? [emptyDraft()] : []);
      setText("");
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "儲存失敗，請再試。");
    } finally {
      setBusy(false);
    }
  }

  async function addSaved(m: SavedMeal) {
    setBusy(true);
    setError(null);
    const { error } = await getSupabase().from("food_logs").insert({
      user_id: userId,
      logged_on: date,
      meal_type: meal,
      name: m.name,
      quantity_text: m.quantity_text,
      calories: m.calories,
      protein_g: m.protein_g,
      carbs_g: m.carbs_g,
      fat_g: m.fat_g,
      source: "saved",
    });
    setBusy(false);
    if (error) setError(error.message);
    else onAdded();
  }

  async function removeSaved(id: string) {
    if (!window.confirm("確定刪除呢個常食餐單？")) return;
    const { error } = await getSupabase().from("saved_meals").delete().eq("id", id);
    if (error) setError(error.message);
    else void loadSaved();
  }

  const isAiDraft = drafts.some((d) => d.raw);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {([["ai", "AI 輸入"], ["manual", "手動"], ["saved", "常食"]] as const).map(([m, t]) => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            className={`rounded-xl px-2 py-2 text-sm ring-1 ${
              mode === m ? "bg-emerald-500 text-white ring-emerald-500" : "bg-white text-slate-600 ring-slate-300"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div>
        <span className={label}>邊一餐</span>
        <div className="grid grid-cols-4 gap-2">
          {MEAL_TYPES.map((m) => (
            <button
              key={m}
              onClick={() => onMealChange(m)}
              className={`rounded-xl px-1 py-2 text-sm ring-1 ${
                meal === m ? "bg-emerald-100 text-emerald-700 ring-emerald-400" : "bg-white text-slate-600 ring-slate-300"
              }`}
            >
              {MEAL_LABEL[m]}
            </button>
          ))}
        </div>
      </div>

      {mode === "ai" && drafts.length === 0 && (
        <div className="space-y-2">
          <label className={label} htmlFor="ai-text">用廣東話講你食咗啲咩</label>
          <textarea
            id="ai-text"
            rows={3}
            maxLength={300}
            className={input}
            placeholder="例如：午餐食咗碗叉燒飯加凍檸茶"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button className={btnPrimary} disabled={busy} onClick={() => void estimate()}>
            {busy ? "AI 估算緊…" : "AI 估算"}
          </button>
          <p className="text-xs text-slate-400">{AI_ESTIMATE_NOTE}</p>
        </div>
      )}

      {mode === "saved" && (
        <div className="space-y-2">
          {saved.length === 0 ? (
            <p className="text-sm text-slate-400">
              未有常食餐單。用 AI 或手動輸入時剔「存為常食」，之後就可以一鍵加入。
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {saved.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{m.name}</div>
                    <div className="text-xs text-slate-400">
                      {m.quantity_text ? `${m.quantity_text} · ` : ""}
                      {m.calories} kcal
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      disabled={busy}
                      onClick={() => void addSaved(m)}
                      className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                    >
                      加入
                    </button>
                    <button onClick={() => void removeSaved(m.id)} className="text-sm text-slate-400 underline">
                      刪除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {drafts.length > 0 && (
        <div className="space-y-3">
          {isAiDraft && <p className={infoBox}>{AI_ESTIMATE_NOTE}</p>}
          {drafts.map((d, idx) => (
            <fieldset key={d.key} className="space-y-2 rounded-xl bg-slate-50 p-3">
              <div className="flex items-center justify-between">
                <legend className="text-xs text-slate-400">
                  項目 {idx + 1}
                  {d.raw ? ` · AI 信心：${(d.raw as AiItem).confidence}` : ""}
                </legend>
                {drafts.length > 1 && (
                  <button
                    className="text-xs text-slate-400 underline"
                    onClick={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))}
                  >
                    移除
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  aria-label="食物名稱"
                  placeholder="食物名稱"
                  className={input}
                  value={d.name}
                  onChange={(e) => update(d.key, { name: e.target.value })}
                />
                <input
                  aria-label="份量"
                  placeholder="份量（例如 1 碟）"
                  className={input}
                  value={d.quantity_text}
                  onChange={(e) => update(d.key, { quantity_text: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-4 gap-2">
                {([
                  ["calories", "kcal"],
                  ["protein_g", "蛋白 g"],
                  ["carbs_g", "碳水 g"],
                  ["fat_g", "脂肪 g"],
                ] as const).map(([k, ph]) => (
                  <input
                    key={k}
                    aria-label={ph}
                    placeholder={ph}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    className={input}
                    value={d[k]}
                    onChange={(e) => update(d.key, { [k]: e.target.value })}
                  />
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={d.save}
                  onChange={(e) => update(d.key, { save: e.target.checked })}
                />
                存為常食餐單
              </label>
            </fieldset>
          ))}
          {mode === "manual" && (
            <button className={btnGhost} onClick={() => setDrafts((ds) => [...ds, emptyDraft()])}>
              ＋ 加多一項
            </button>
          )}
          <button className={btnPrimary} disabled={busy} onClick={() => void saveAll()}>
            {busy ? "儲存中…" : `儲存到${MEAL_LABEL[meal]}`}
          </button>
          {mode === "ai" && (
            <button className={btnGhost} onClick={() => setDrafts([])}>
              重新輸入
            </button>
          )}
        </div>
      )}

      {error && <p className={errorBox}>{error}</p>}
      {notice && <p className={infoBox}>{notice}</p>}
    </div>
  );
}
