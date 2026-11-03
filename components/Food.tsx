"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Plan } from "@/lib/calc";
import { FOOD_EMPTY } from "@/lib/copy";
import { addDays, formatShort, toDateStr } from "@/lib/date";
import { defaultMealType, MEAL_LABEL, MEAL_TYPES, sumFood } from "@/lib/food";
import { getSupabase } from "@/lib/supabase";
import type { FoodLog, MealType } from "@/lib/types";
import FoodAdd from "./FoodAdd";
import IntakeProgress from "./IntakeProgress";
import { btnPrimary, card, DISCLAIMER, errorBox } from "./ui";

interface Props {
  userId: string;
  plan: Plan | null;
  initialMeal: MealType | null;
  /** 改動後通知父層重新載入「今日」食物 */
  onChanged: () => void;
}

export default function Food({ userId, plan, initialMeal, onChanged }: Props) {
  const today = toDateStr();
  const [date, setDate] = useState(today);
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meal, setMeal] = useState<MealType>(initialMeal ?? defaultMealType(new Date().getHours()));
  const [adding, setAdding] = useState(initialMeal !== null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error } = await getSupabase()
      .from("food_logs")
      .select("id, logged_on, meal_type, name, quantity_text, calories, protein_g, carbs_g, fat_g, source")
      .eq("logged_on", date)
      .order("created_at", { ascending: true });
    if (error) setError(error.message);
    else setLogs((data ?? []) as FoodLog[]);
    setLoading(false);
  }, [date]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const totals = useMemo(() => sumFood(logs), [logs]);

  async function remove(id: string) {
    if (!window.confirm("確定刪除呢個記錄？")) return;
    const { error } = await getSupabase().from("food_logs").delete().eq("id", id);
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
            <button className="text-xs text-emerald-600 underline" onClick={() => setDate(today)}>
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
        {plan ? (
          <IntakeProgress plan={plan} totals={totals} />
        ) : (
          <p className="text-sm text-slate-500">
            已食 {totals.calories} kcal。記錄體重後會顯示每日目標進度。
          </p>
        )}
      </section>

      {error && <p className={errorBox}>{error}</p>}

      {adding ? (
        <section className={card}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">記錄食物</h2>
            <button className="text-sm text-slate-400 underline" onClick={() => setAdding(false)}>
              收埋
            </button>
          </div>
          <FoodAdd
            userId={userId}
            date={date}
            meal={meal}
            onMealChange={setMeal}
            onAdded={() => {
              void load();
              onChanged();
            }}
          />
        </section>
      ) : (
        <button className={btnPrimary} onClick={() => setAdding(true)}>
          ＋ 記錄食物
        </button>
      )}

      <section className={card}>
        {loading ? (
          <p className="text-sm text-slate-400">載入中…</p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-slate-400">{isToday ? FOOD_EMPTY : "呢日冇食物記錄。"}</p>
        ) : (
          <div className="space-y-4">
            {MEAL_TYPES.map((m) => {
              const items = logs.filter((l) => l.meal_type === m);
              if (items.length === 0) return null;
              const sub = sumFood(items);
              return (
                <div key={m}>
                  <div className="mb-1 flex justify-between text-sm font-semibold">
                    <span>{MEAL_LABEL[m]}</span>
                    <span className="font-normal text-slate-500">{sub.calories} kcal</span>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {items.map((l) => (
                      <li key={l.id} className="flex items-center justify-between gap-2 py-2">
                        <div className="min-w-0">
                          <div className="truncate">
                            {l.name}
                            {l.source === "ai" && (
                              <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-700">AI 估算</span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400">
                            {l.quantity_text ? `${l.quantity_text} · ` : ""}P {l.protein_g} · C {l.carbs_g} · F {l.fat_g}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <span className="font-medium">{l.calories}</span>
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
                </div>
              );
            })}
          </div>
        )}
      </section>

      <p className="text-xs text-slate-400">{DISCLAIMER}</p>
    </div>
  );
}
