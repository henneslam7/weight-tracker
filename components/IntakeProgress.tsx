import { dayBudget } from "@/lib/budget";
import type { Plan } from "@/lib/calc";
import { intakeMessage } from "@/lib/copy";
import { EXERCISE_CREDIT_CAP } from "@/lib/exercise";
import type { Nutrition } from "@/lib/food";

function Bar({ label, value, target, unit }: { label: string; value: number; target: number; unit: string }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const over = value > target;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-slate-500">
        <span>{label}</span>
        <span>
          {Math.round(value)} / {target} {unit}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${over ? "bg-amber-400" : "bg-emerald-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

interface Props {
  plan: Plan;
  totals: Nutrition;
  /** 當日運動淨消耗 kcal（會按規則加返入上限） */
  exerciseBurned?: number;
}

/**
 * 已食 / 剩餘 calories 同 macros。上限 = 基本目標 + 運動加成。
 * 超標用琥珀色，唔用紅色，唔責備。
 */
export default function IntakeProgress({ plan, totals, exerciseBurned = 0 }: Props) {
  const b = dayBudget(plan, exerciseBurned);
  return (
    <div className="space-y-3">
      <div className="text-center">
        <div className="text-3xl font-bold text-emerald-600">
          {totals.calories}
          <span className="text-base font-normal text-slate-400"> / {b.calories} kcal</span>
        </div>
        <div className="text-sm text-slate-500">{intakeMessage(totals.calories, b.calories)}</div>
        {b.exerciseCredit > 0 && (
          <div className="mt-1 text-xs text-slate-400">
            基本目標 {b.baseCalories} ＋ 運動 {b.exerciseCredit} kcal
            {exerciseBurned > EXERCISE_CREDIT_CAP && `（每日最多加 ${EXERCISE_CREDIT_CAP}）`}
          </div>
        )}
      </div>
      <Bar label="Calories" value={totals.calories} target={b.calories} unit="kcal" />
      <Bar label="蛋白質" value={totals.protein_g} target={b.proteinG} unit="g" />
      <Bar label="碳水" value={totals.carbs_g} target={b.carbsG} unit="g" />
      <Bar label="脂肪" value={totals.fat_g} target={b.fatG} unit="g" />
    </div>
  );
}
