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
  const [pickDate, setPickDate] = useState("");

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

  /** 用一張庫存券：揀日子（今日或將來）。同一日只可以一張。 */
  async function useCredit(id: string, date: string) {
    setBusy(true);
    setError(null);
    const { error } = await getSupabase().from("cheat_days").update({ cheat_on: date }).eq("id", id).is("cheat_on", null);
    setBusy(false);
    if (error) setError(error.code === "23505" ? "嗰日已經係放縱日喇，揀第日。" : error.message);
    else onChanged();
  }

  /** 取消預約（將來嘅日子）：券退返庫存 */
  async function cancelScheduled(id: string) {
    setBusy(true);
    setError(null);
    const { error } = await getSupabase().from("cheat_days").update({ cheat_on: null }).eq("id", id);
    setBusy(false);
    if (error) setError(error.message);
    else onChanged();
  }

  const filled = stamps?.progress ?? 0;
  const pending = !!stamps?.today.onTrack;
  const bankedCredit = stamps?.banked[0];
  const todayStr = toDateStr();

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
          <span className="text-sm text-stone-500">已用 {stamps?.used ?? 0} 張放縱日券</span>
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
          每日「三樣做晒 ＋ 食量唔超上限」就蓋一個章。每集齊 {STAMPS_FOR_CHEAT} 個，自動賺 1 張放縱日券，儲起，冇數量上限、冇期限，幾時用都得。
          用券嗰日，上限{cheatExtra > 0 ? `加 ${cheatExtra} kcal` : "維持原本"}（最多去到你嘅維持量，唔會變盈餘，唔會影響減重太多），陳伯同歡嬸當日好好人，唔挑剔。休息日一樣有印花。
        </p>
        {stamps && <p className="mt-1 text-xs text-stone-500">仲差 {STAMPS_FOR_CHEAT - filled} 個印花賺下一張。印花只計到尋日，今日要過咗夜晚先蓋。</p>}

        {stamps?.cheatToday && <p className="mt-3 rounded-xl bg-amber-100 p-3 font-bold text-amber-900">🎉 今日係放縱日，慢慢食，食得開心。</p>}

        {stamps && (
          <div className="mt-3 space-y-3 rounded-xl bg-teal-50 p-3">
            <p className="font-bold text-teal-900">🎟️ 放縱日券庫存：{stamps.credits} 張</p>

            {stamps.credits > 0 && !cheatReady && (
              <p className="text-sm text-amber-800">資料庫未升級，用唔到券。請喺 Supabase SQL Editor 執行 supabase/schema_cheat.sql 一次。</p>
            )}
            {stamps.credits > 0 && cheatReady && !bankedCredit && (
              <p className="text-sm text-teal-900">券入緊庫存，等一陣或者重新開 app 就見到。</p>
            )}

            {cheatReady && bankedCredit && (
              <div className="space-y-2">
                <button
                  disabled={busy || stamps.cheatToday}
                  onClick={() => void useCredit(bankedCredit.id!, todayStr)}
                  className="w-full rounded-xl bg-teal-700 py-2.5 font-bold text-white active:bg-teal-800 disabled:opacity-50"
                >
                  {stamps.cheatToday ? "今日已經係放縱日" : "今日用"}
                </button>
                <div className="flex gap-2">
                  <input
                    type="date"
                    aria-label="揀放縱日日子"
                    min={todayStr}
                    value={pickDate}
                    onChange={(e) => setPickDate(e.target.value)}
                    className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2"
                  />
                  <button
                    disabled={busy || !pickDate || pickDate < todayStr}
                    onClick={() => void useCredit(bankedCredit.id!, pickDate)}
                    className="shrink-0 rounded-xl bg-white px-4 py-2 font-bold text-teal-800 ring-1 ring-teal-300 active:bg-teal-100 disabled:opacity-50"
                  >
                    預約呢日
                  </button>
                </div>
                <p className="text-xs text-stone-500">想幾時用都得：今日，或者將來任何一日（例如生日、聚餐）。預約咗未到嘅日子可以取消，券會退返庫存。</p>
              </div>
            )}

            {stamps.scheduled.length > 0 && (
              <ul className="space-y-1 text-sm">
                {stamps.scheduled.map((r) => (
                  <li key={r.id ?? r.cheat_on} className="flex items-center justify-between rounded-lg bg-white px-3 py-2">
                    <span>🎉 已預約：{formatShort(r.cheat_on!)}</span>
                    {r.id && (
                      <button disabled={busy} onClick={() => void cancelScheduled(r.id!)} className="font-semibold text-teal-800 underline">
                        取消
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
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
