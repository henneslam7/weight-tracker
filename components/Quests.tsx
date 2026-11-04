"use client";

import { useState } from "react";
import { levelFor, MEALS_NEEDED, tasksFor, type DayLog } from "@/lib/gamify";
import { STAMPS_FOR_CHEAT, type StampState } from "@/lib/stamps";
import { addDays, formatShort, toDateStr } from "@/lib/date";
import { getSupabase } from "@/lib/supabase";
import { card, errorBox } from "./ui";

interface Props {
  userId: string;
  day: DayLog;
  stamps: StampState | null;
  /** 歷來印花（街坊級數） */
  stampTotal: number;
  /** 放縱日會加幾多 kcal */
  cheatExtra: number;
  /** 資料庫有 cheat_days 表（已跑 schema_cheat.sql） */
  cheatReady: boolean;
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

/** 今日三樣 + 印花卡（三樣齊 ＋ 食量唔超上限）+ 放縱日 + 街坊級數 */
export default function Quests({ userId, day, stamps, stampTotal, cheatExtra, cheatReady, onChanged }: Props) {
  const t = tasksFor(day);
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

  async function redeem(when: "today" | "tomorrow") {
    if (!stamps?.canRedeem || !stamps.stampsThrough) return;
    setBusy(true);
    setError(null);
    const today = toDateStr();
    const { error } = await getSupabase().from("cheat_days").insert({
      user_id: userId,
      cheat_on: when === "today" ? today : addDays(today, 1),
      stamps_through: stamps.stampsThrough,
    });
    setBusy(false);
    if (error) setError(error.code === "23505" ? "嗰日已經係放縱日。" : error.message);
    else onChanged();
  }

  const filled = Math.min(STAMPS_FOR_CHEAT, stamps?.count ?? 0);
  const pending = !!stamps?.today.onTrack && filled < STAMPS_FOR_CHEAT;

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
        {stamps && !stamps.cheatToday && (
          <p className="mt-2 text-sm text-stone-600">
            蓋章仲要：今日食量唔超上限（
            <span className={stamps.today.withinBudget ? "font-bold text-teal-700" : "font-bold text-amber-700"}>
              {stamps.today.eaten} / {stamps.today.budget} kcal
            </span>
            ）。夜晚過咗先正式蓋章。
          </p>
        )}
        {error && <p className={`${errorBox} mt-2`}>{error}</p>}
      </section>

      <section className={card}>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-bold">印花卡</h2>
          <span className="text-sm text-stone-500">已領 {stamps?.redeemed ?? 0} 次放縱日</span>
        </div>
        <div className="flex justify-between gap-1.5">
          {Array.from({ length: STAMPS_FOR_CHEAT }, (_, i) => {
            const done = i < filled;
            const isPending = pending && i === filled;
            return (
              <span
                key={i}
                title={isPending ? "今日暫定（夜晚過咗先正式蓋章）" : undefined}
                className={`flex h-10 w-10 items-center justify-center rounded-full text-lg font-black ${
                  done
                    ? "bg-gradient-to-br from-yellow-300 to-amber-500 text-white shadow"
                    : isPending
                      ? "border-[3px] border-dashed border-amber-400 text-amber-500"
                      : "border-[3px] border-dashed border-stone-300 text-stone-300"
                }`}
              >
                {done ? "✓" : isPending ? "今" : i + 1}
              </span>
            );
          })}
        </div>
        <p className="mt-3 text-sm text-stone-600">
          每日「三樣做晒 ＋ 食量唔超上限」就蓋一個章。集齊 {STAMPS_FOR_CHEAT} 個，可以領一日放縱日：當日上限
          {cheatExtra > 0 ? `加 ${cheatExtra} kcal` : "維持原本"}（最多去到你嘅維持量，唔會變盈餘，唔會影響減重太多），陳伯同歡嬸當日好好人，唔挑剔。休息日一樣有印花。
        </p>

        {stamps?.cheatToday && <p className="mt-3 rounded-xl bg-amber-100 p-3 font-bold text-amber-900">🎉 今日係放縱日，慢慢食，食得開心。</p>}
        {stamps?.cheatUpcoming && !stamps.cheatToday && (
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">
            放縱日已預約：{formatShort(stamps.cheatUpcoming)}。
          </p>
        )}

        {stamps?.canRedeem && (
          <div className="mt-3 space-y-2 rounded-xl bg-teal-50 p-3">
            <p className="font-bold text-teal-900">集齊 {STAMPS_FOR_CHEAT} 個印花喇！領取放縱日：</p>
            {cheatReady ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  disabled={busy || stamps.cheatToday}
                  onClick={() => void redeem("today")}
                  className="rounded-xl bg-teal-700 py-2.5 font-bold text-white active:bg-teal-800 disabled:opacity-50"
                >
                  今日用
                </button>
                <button
                  disabled={busy || !!stamps.cheatUpcoming}
                  onClick={() => void redeem("tomorrow")}
                  className="rounded-xl bg-white py-2.5 font-bold text-teal-800 ring-1 ring-teal-300 active:bg-teal-100 disabled:opacity-50"
                >
                  聽日用
                </button>
              </div>
            ) : (
              <p className="text-sm text-amber-800">
                資料庫未升級，領取唔到。請喺 Supabase SQL Editor 執行 supabase/schema_cheat.sql 一次。
              </p>
            )}
          </div>
        )}
        {stamps && !stamps.canRedeem && (
          <p className="mt-2 text-xs text-stone-500">
            仲差 {STAMPS_FOR_CHEAT - filled} 個印花。印花只計到尋日，今日要過咗夜晚先蓋。
          </p>
        )}
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
