"use client";

import { useState } from "react";
import { cardProgress, levelFor, STAMPS_PER_CARD, tasksFor, type DayLog, MEALS_NEEDED } from "@/lib/gamify";
import { getSupabase } from "@/lib/supabase";
import { toDateStr } from "@/lib/date";
import { card, errorBox } from "./ui";

interface Props {
  userId: string;
  day: DayLog;
  stampTotal: number;
  onChanged: () => void;
}

function Row({ done, children, action }: { done: boolean; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-stone-100 py-3.5 last:border-0">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base ${
          done ? "bg-teal-600 text-white" : "border-[3px] border-stone-300"
        }`}
        aria-hidden="true"
      >
        {done ? "✓" : ""}
      </span>
      <span className={`flex-1 text-lg font-semibold ${done ? "text-stone-400 line-through" : ""}`}>{children}</span>
      {action}
    </div>
  );
}

/** 今日三樣 + 印花卡 + 街坊級數 */
export default function Quests({ userId, day, stampTotal, onChanged }: Props) {
  const t = tasksFor(day);
  const { filled, cardsDone } = cardProgress(stampTotal);
  const lv = levelFor(stampTotal);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rest() {
    setBusy(true);
    setError(null);
    const { error } = await getSupabase().from("exercise_logs").insert({
      user_id: userId,
      logged_on: toDateStr(),
      exercise_type: "rest",
      name: "休息日",
      duration_min: null,
      calories: 0,
      source: "manual",
    });
    setBusy(false);
    if (error) setError(error.message);
    else onChanged();
  }

  return (
    <div className="space-y-4">
      <section className={card}>
        <h2 className="mb-1 font-bold">今日三樣</h2>
        <Row done={t.weight}>上磅</Row>
        <Row done={t.meals}>
          記低食咩（{Math.min(day.meals, MEALS_NEEDED)} / {MEALS_NEEDED} 餐）
        </Row>
        <Row
          done={t.move}
          action={
            !t.move && (
              <button
                onClick={() => void rest()}
                disabled={busy}
                className="shrink-0 rounded-xl bg-amber-100 px-3 py-2 text-sm font-bold text-amber-900 active:bg-amber-200 disabled:opacity-50"
              >
                今日休息
              </button>
            )
          }
        >
          郁下，或者休息一日
        </Row>
        {error && <p className={`${errorBox} mt-2`}>{error}</p>}
      </section>

      <section className={card}>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-bold">印花卡</h2>
          <span className="text-sm text-stone-500">已集 {cardsDone} 張</span>
        </div>
        <div className="flex justify-between gap-1.5">
          {Array.from({ length: STAMPS_PER_CARD }, (_, i) => (
            <span
              key={i}
              className={`flex h-10 w-10 items-center justify-center rounded-full text-lg font-black ${
                i < filled
                  ? "bg-gradient-to-br from-yellow-300 to-amber-500 text-white shadow"
                  : "border-[3px] border-dashed border-stone-300 text-stone-300"
              }`}
            >
              {i < filled ? "✓" : i + 1}
            </span>
          ))}
        </div>
        <p className="mt-3 text-sm text-stone-600">
          集齊 7 個印花，陳伯同歡嬸請你飲茶（走糖）。休息日一樣有印花。
        </p>
        <p className="mt-2 text-sm font-semibold text-teal-800">
          街坊級數：{lv.name}
          {lv.next && (
            <span className="font-normal text-stone-500">　再 {lv.toNext} 個印花升「{lv.next.name}」</span>
          )}
        </p>
      </section>
    </div>
  );
}
