"use client";

import { weeklyTrendKg } from "@/lib/calc";
import type { Plan } from "@/lib/calc";
import {
  goalMessage,
  greeting,
  trendMessage,
  WEIGHT_EMPTY,
  WEIGHT_NOT_LOGGED,
} from "@/lib/copy";
import { formatShort, toDateStr } from "@/lib/date";
import type { Profile, WeightLog } from "@/lib/types";
import { card, DISCLAIMER, infoBox } from "./ui";

interface Props {
  profile: Profile;
  plan: Plan | null;
  planError: string | null;
  logs: WeightLog[]; // 升序
  onGoWeight: () => void;
}

export default function Today({ profile, plan, planError, logs, onGoWeight }: Props) {
  const now = new Date();
  const today = toDateStr(now);
  const latest = logs.length ? logs[logs.length - 1] : null;
  const loggedToday = latest?.logged_on === today;
  const trend = weeklyTrendKg(logs);
  const goalLine = latest
    ? goalMessage(profile.goal, latest.weight_kg, profile.target_weight_kg)
    : null;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-lg font-semibold text-emerald-600">{greeting(now.getHours())}</p>
        <p className="text-sm text-slate-500">{formatShort(today)}</p>
      </div>

      {!loggedToday && (
        <button
          onClick={onGoWeight}
          className="w-full rounded-2xl bg-emerald-500 p-4 text-left text-white active:bg-emerald-600"
        >
          <div className="font-semibold">{WEIGHT_NOT_LOGGED.title}</div>
          <div className="text-sm text-emerald-50">{WEIGHT_NOT_LOGGED.sub}</div>
        </button>
      )}

      <section className={card}>
        <h2 className="mb-1 font-semibold">今日目標</h2>
        {planError && <p className={infoBox}>{planError}</p>}
        {!planError && !plan && (
          <p className={infoBox}>記錄體重後，就會計出你嘅每日目標。</p>
        )}
        {plan && (
          <>
            <div className="my-2 text-center">
              <div className="text-4xl font-bold text-emerald-600">
                {plan.targetCalories}
              </div>
              <div className="text-sm text-slate-500">kcal</div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-xl bg-slate-50 p-2">
                <div className="font-semibold">{plan.macros.proteinG} g</div>
                <div className="text-xs text-slate-500">蛋白質</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-2">
                <div className="font-semibold">{plan.macros.carbsG} g</div>
                <div className="text-xs text-slate-500">碳水</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-2">
                <div className="font-semibold">{plan.macros.fatG} g</div>
                <div className="text-xs text-slate-500">脂肪</div>
              </div>
            </div>
          </>
        )}
      </section>

      <section className={card}>
        <h2 className="mb-1 font-semibold">體重</h2>
        {latest ? (
          <>
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-3xl font-bold">{latest.weight_kg}</span>
                <span className="ml-1 text-slate-500">kg</span>
                <div className="text-xs text-slate-400">{formatShort(latest.logged_on)}</div>
              </div>
              <div className="text-right text-sm text-slate-500">
                {trend !== null && (
                  <div>每週 {trend > 0 ? "+" : ""}{trend} kg</div>
                )}
              </div>
            </div>
            {goalLine && (
              <p className="mt-2 text-sm font-medium text-emerald-700">{goalLine}</p>
            )}
            <p className="mt-1 text-sm text-slate-500">
              {trendMessage(profile.goal, trend)}
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-400">{WEIGHT_EMPTY}</p>
        )}
      </section>

      <p className="text-xs text-slate-400">{DISCLAIMER}</p>
    </div>
  );
}
