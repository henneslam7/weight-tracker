"use client";

import { useState } from "react";
import { checkFoodEdit, foodUpdateRow, macroGap, MEAL_LABEL, MEAL_TYPES, type FoodEditInput } from "@/lib/food";
import { toDateStr } from "@/lib/date";
import { getSupabase } from "@/lib/supabase";
import type { FoodLog, MealType } from "@/lib/types";
import { btnGhost, btnPrimary, errorBox, infoBox, input, label } from "./ui";

interface Props {
  item: FoodLog;
  onSaved: () => void;
  onCancel: () => void;
}

/** 編輯一條食物記錄：名、份量、餐別、日期、calories、營養素 */
export default function FoodEdit({ item, onSaved, onCancel }: Props) {
  const [f, setF] = useState<FoodEditInput>({
    name: item.name,
    quantity_text: item.quantity_text ?? "",
    meal_type: item.meal_type,
    logged_on: item.logged_on,
    calories: String(item.calories),
    protein_g: String(item.protein_g),
    carbs_g: String(item.carbs_g),
    fat_g: String(item.fat_g),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof FoodEditInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((cur) => ({ ...cur, [k]: e.target.value }));

  const today = toDateStr();
  const gap = checkFoodEdit(f, today) === null ? macroGap(f) : 0;

  async function save() {
    const problem = checkFoodEdit(f, today);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await getSupabase().from("food_logs").update(foodUpdateRow(f, item)).eq("id", item.id);
    setBusy(false);
    if (err) setError(err.message);
    else onSaved();
  }

  return (
    <li className="space-y-3 rounded-xl bg-teal-50 p-3" aria-label={`編輯 ${item.name}`}>
      <div>
        <label className={label} htmlFor={`n-${item.id}`}>食物名</label>
        <input id={`n-${item.id}`} className={input} value={f.name} maxLength={80} onChange={set("name")} />
      </div>
      <div>
        <label className={label} htmlFor={`q-${item.id}`}>份量（可選）</label>
        <input id={`q-${item.id}`} className={input} value={f.quantity_text} maxLength={80} onChange={set("quantity_text")} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor={`m-${item.id}`}>餐別</label>
          <select id={`m-${item.id}`} className={input} value={f.meal_type} onChange={set("meal_type")}>
            {MEAL_TYPES.map((m: MealType) => (
              <option key={m} value={m}>{MEAL_LABEL[m]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor={`d-${item.id}`}>日期</label>
          <input id={`d-${item.id}`} type="date" max={today} className={input} value={f.logged_on} onChange={set("logged_on")} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor={`c-${item.id}`}>Calories (kcal)</label>
          <input id={`c-${item.id}`} type="number" inputMode="numeric" min={0} max={5000} className={input} value={f.calories} onChange={set("calories")} />
        </div>
        <div>
          <label className={label} htmlFor={`p-${item.id}`}>蛋白質 (g)</label>
          <input id={`p-${item.id}`} type="number" inputMode="decimal" step="0.1" min={0} className={input} value={f.protein_g} onChange={set("protein_g")} />
        </div>
        <div>
          <label className={label} htmlFor={`cb-${item.id}`}>碳水 (g)</label>
          <input id={`cb-${item.id}`} type="number" inputMode="decimal" step="0.1" min={0} className={input} value={f.carbs_g} onChange={set("carbs_g")} />
        </div>
        <div>
          <label className={label} htmlFor={`f-${item.id}`}>脂肪 (g)</label>
          <input id={`f-${item.id}`} type="number" inputMode="decimal" step="0.1" min={0} className={input} value={f.fat_g} onChange={set("fat_g")} />
        </div>
      </div>
      {Math.abs(gap) > 100 && (
        <p className={infoBox}>
          營養素加埋約 {Math.round(Number(f.calories) + gap)} kcal，同你填嘅 {f.calories} kcal 差 {Math.abs(gap)} kcal。可能有一邊填錯，不過你想照儲存都得。
        </p>
      )}
      {item.source === "ai" && <p className="text-xs text-slate-500">呢項原本係 AI 估算。改咗 calories 或營養素之後，會當係你自己確認嘅數字。</p>}
      {error && <p className={errorBox}>{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button className={btnPrimary} disabled={busy} onClick={() => void save()}>{busy ? "儲存中…" : "儲存"}</button>
        <button className={btnGhost} disabled={busy} onClick={onCancel}>取消</button>
      </div>
    </li>
  );
}
