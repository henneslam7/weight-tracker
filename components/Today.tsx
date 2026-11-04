"use client";

import { weeklyTrendKg } from "@/lib/calc";
import type { Plan } from "@/lib/calc";
import {
  goalMessage,
  greeting,
  gossipFor,
  say,
  trendMessage,
  WEIGHT_EMPTY,
  type Line,
} from "@/lib/copy";
import { formatShort, toDateStr } from "@/lib/date";
import { sumFood } from "@/lib/food";
import { dayLogFor, tasksFor, type History } from "@/lib/gamify";
import { etaLines, etaToTarget } from "@/lib/eta";
import type { StampState } from "@/lib/stamps";
import { effectiveTone, sensitiveKind, type SensitiveReason } from "@/lib/persona";
import type { FoodLog, MealType, Profile, UserPrefs, WeightLog } from "@/lib/types";
import { useState } from "react";
import IntakeProgress from "./IntakeProgress";
import ShareDialog from "./ShareDialog";
import { InstallBanner } from "./InstallButton";
import { Say } from "./Persona";
import Quests from "./Quests";
import { card, DISCLAIMER, infoBox } from "./ui";

interface Props {
  userId: string;
  profile: Profile;
  plan: Plan | null;
  planError: string | null;
  logs: WeightLog[]; // 升序
  foodToday: FoodLog[];
  exerciseBurned: number;
  prefs: UserPrefs;
  reason: SensitiveReason | null;
  history: History;
  stamps: StampState | null;
  cheatExtra: number;
  cheatReady: boolean;
  onGoWeight: () => void;
  onGoFood: () => void;
  onGoExercise: () => void;
  onChanged: () => void;
}

const MEAL_AFTER: [MealType, number][] = [["breakfast", 8], ["lunch", 12], ["dinner", 18]];
/** 而家應該記邊餐：已過時間而未記嘅最遲一餐，冇就第一個未記嘅 */
function nextMeal(hour: number, logged: ReadonlySet<MealType>): MealType {
  const due = MEAL_AFTER.filter(([m, h]) => hour >= h && !logged.has(m));
  if (due.length) return due[due.length - 1][0];
  return MEAL_AFTER.find(([m]) => !logged.has(m))?.[0] ?? "snack";
}

export default function Today({
  userId,
  profile,
  plan,
  planError,
  logs,
  foodToday,
  exerciseBurned,
  prefs,
  reason,
  history,
  stamps,
  cheatExtra,
  cheatReady,
  onGoWeight,
  onGoFood,
  onGoExercise,
  onChanged,
}: Props) {
  const [sharing, setSharing] = useState(false);
  const now = new Date();
  const today = toDateStr(now);
  const latest = logs.length ? logs[logs.length - 1] : null;
  const trend = weeklyTrendKg(logs);
  const goalLine = latest ? goalMessage(profile.goal, latest.weight_kg, profile.target_weight_kg) : null;

  const day = dayLogFor(history, today);
  const t = tasksFor(day);
  const stampTotal = stamps?.lifetime ?? 0;
  const eta = latest
    ? etaToTarget({
        goal: profile.goal,
        weightKg: latest.weight_kg,
        targetKg: profile.target_weight_kg,
        trendKgPerWeek: trend,
        tdee: plan ? plan.tdee : null,
        // 放縱日當日嘅上限唔係日常目標，扣返額外部分先算
        intakeKcal: plan ? plan.targetCalories - (plan.cheatExtraKcal ?? 0) : null,
        today,
      })
    : null;
  const etaText = eta ? etaLines(eta, today) : [];
  const tone = effectiveTone(prefs, reason);
  const sk = sensitiveKind(reason);
  const mealsToday = history.mealsByDate.get(today) ?? new Set<MealType>();

  // 今日點樣講：敏感時刻最優先，然後按未完成嘅任務
  let line: Line;
  let action: { label: string; go: () => void } | null = null;
  if (stamps?.cheatToday) line = say("cheat", "soft", today);
  else if (sk) line = say(sk, "soft", today);
  else if (t.done) line = say("allDone", tone, today);
  else if (!t.weight) {
    line = say("weight", tone, today);
    action = { label: "去上磅", go: onGoWeight };
  } else if (!t.meals) {
    line = say(nextMeal(now.getHours(), mealsToday), tone, today);
    action = { label: "去記低食咩", go: onGoFood };
  } else {
    line = say("move", tone, today);
    action = { label: "去記運動", go: onGoExercise };
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-2xl font-black text-teal-800">{greeting(now.getHours())}</p>
        <p className="text-sm text-stone-500">{formatShort(today)}</p>
      </div>

      <InstallBanner />

      <Say line={line}>
        {action && (
          <button
            onClick={action.go}
            className="mt-3 block w-full rounded-xl bg-teal-700 py-3 text-center text-lg font-bold text-white active:bg-teal-800"
          >
            {action.label}
          </button>
        )}
      </Say>

      {stamps?.cheatToday && plan && (
        <section className="rounded-2xl bg-gradient-to-br from-amber-100 to-rose-100 p-4 ring-1 ring-amber-200">
          <p className="text-lg font-black text-amber-900">🎉 今日係放縱日</p>
          <p className="mt-1 text-sm text-amber-900">
            今日基本上限 {Math.round(plan.targetCalories)} kcal{cheatExtra > 0 ? `（基本目標加咗 ${cheatExtra}）` : ""}。陳伯同歡嬸今日好好人，唔挑剔、唔 roast。
          </p>
        </section>
      )}

      <Quests
        userId={userId}
        day={day}
        stamps={stamps}
        stampTotal={stampTotal}
        cheatExtra={cheatExtra}
        cheatReady={cheatReady}
        onChanged={onChanged}
      />

      <section>
        <h2 className="mb-2 text-sm font-bold text-stone-600">今日街坊閒話</h2>
        <Say line={gossipFor(today)} tone="gossip" />
      </section>

      <section className={card}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-bold">今日食物</h2>
          <span className="flex gap-3 text-sm">
            <button className="font-semibold text-teal-800 underline" onClick={onGoFood}>
              AI 食咩好？
            </button>
            <button className="font-semibold text-teal-800 underline" onClick={onGoFood}>
              記錄食物
            </button>
          </span>
        </div>
        {planError && <p className={infoBox}>{planError}</p>}
        {!planError && !plan && <p className={infoBox}>記錄體重後，就會計出你嘅每日目標。</p>}
        {plan && <IntakeProgress plan={plan} totals={sumFood(foodToday)} exerciseBurned={exerciseBurned} />}
        {plan && (
          <button
            className="mt-3 w-full rounded-xl bg-teal-50 py-2.5 font-bold text-teal-800 ring-1 ring-teal-200 active:bg-teal-100"
            onClick={() => setSharing(true)}
          >
            分享今日（靚圖）
          </button>
        )}
        <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-3 text-sm">
          <span className="text-stone-500">今日運動 {exerciseBurned} kcal</span>
          <button className="font-semibold text-teal-800 underline" onClick={onGoExercise}>
            記錄運動
          </button>
        </div>
      </section>

      <section className={card}>
        <h2 className="mb-1 font-bold">體重</h2>
        {latest ? (
          <>
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-3xl font-bold">{latest.weight_kg}</span>
                <span className="ml-1 text-stone-500">kg</span>
                <div className="text-xs text-stone-400">{formatShort(latest.logged_on)}</div>
              </div>
              <div className="text-right text-sm text-stone-500">
                {trend !== null && <div>每週 {trend > 0 ? "+" : ""}{trend} kg</div>}
              </div>
            </div>
            {goalLine && <p className="mt-2 text-sm font-semibold text-teal-800">{goalLine}</p>}
            <p className="mt-1 text-sm text-stone-600">{trendMessage(profile.goal, trend)}</p>
            {etaText.length > 0 && (
              <div className="mt-2 space-y-1 rounded-xl bg-teal-50 p-3 text-sm text-teal-900">
                <p className="font-bold">幾時到目標？</p>
                {etaText.map((l) => (
                  <p key={l}>{l}</p>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-stone-500">{WEIGHT_EMPTY}</p>
        )}
      </section>

      <p className="text-xs text-stone-400">{DISCLAIMER}</p>
      {sharing && plan && (
        <ShareDialog today={today} plan={plan} foods={foodToday} exerciseBurned={exerciseBurned} onClose={() => setSharing(false)} />
      )}
    </div>
  );
}
