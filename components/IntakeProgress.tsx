import type { Plan } from "@/lib/calc";
import { intakeMessage } from "@/lib/copy";
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

/** 已食 / 剩餘 calories 同 macros。超標用琥珀色，唔用紅色，唔責備。 */
export default function IntakeProgress({ plan, totals }: { plan: Plan; totals: Nutrition }) {
  const target = plan.targetCalories;
  return (
    <div className="space-y-3">
      <div className="text-center">
        <div className="text-3xl font-bold text-emerald-600">
          {totals.calories}
          <span className="text-base font-normal text-slate-400"> / {target} kcal</span>
        </div>
        <div className="text-sm text-slate-500">{intakeMessage(totals.calories, target)}</div>
      </div>
      <Bar label="Calories" value={totals.calories} target={target} unit="kcal" />
      <Bar label="蛋白質" value={totals.protein_g} target={plan.macros.proteinG} unit="g" />
      <Bar label="碳水" value={totals.carbs_g} target={plan.macros.carbsG} unit="g" />
      <Bar label="脂肪" value={totals.fat_g} target={plan.macros.fatG} unit="g" />
    </div>
  );
}
