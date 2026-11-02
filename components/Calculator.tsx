"use client";

import type { Plan } from "@/lib/calc";
import type { Profile } from "@/lib/types";
import { btnGhost, card, DISCLAIMER, infoBox } from "./ui";

interface Props {
  profile: Profile;
  plan: Plan | null;
  planError: string | null;
  weightKg: number | null;
  onEditProfile: () => void;
  onLogout: () => void;
}

const GOAL_TEXT = { lose: "減脂", maintain: "維持體重", gain: "增肌" } as const;
const ACTIVITY_TEXT = {
  sedentary: "極少運動",
  light: "輕度",
  moderate: "中度",
  active: "高度",
  very_active: "極高",
} as const;

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between py-2">
      <span className="text-slate-500">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}

export default function Calculator({
  profile,
  plan,
  planError,
  weightKg,
  onEditProfile,
  onLogout,
}: Props) {
  return (
    <div className="space-y-4">
      <section className={card}>
        <h2 className="mb-1 font-semibold">每日目標</h2>
        {planError && <p className={infoBox}>{planError}</p>}
        {!planError && !plan && (
          <p className={infoBox}>請先喺「體重」頁記錄體重，先計到目標。</p>
        )}
        {plan && (
          <>
            <div className="my-3 text-center">
              <div className="text-4xl font-bold text-emerald-600">
                {plan.targetCalories}
              </div>
              <div className="text-sm text-slate-500">kcal ／ 日</div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                ["蛋白質", plan.macros.proteinG],
                ["碳水", plan.macros.carbsG],
                ["脂肪", plan.macros.fatG],
              ].map(([name, g]) => (
                <div key={name} className="rounded-xl bg-slate-50 p-2">
                  <div className="text-lg font-semibold">{g} g</div>
                  <div className="text-xs text-slate-500">{name}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 divide-y divide-slate-100 text-sm">
              <Row k="BMR（基礎代謝）" v={`${plan.bmr} kcal`} />
              <Row k="TDEE（每日總消耗）" v={`${plan.tdee} kcal`} />
              <Row
                k={plan.dailyDeltaKcal <= 0 ? "每日赤字" : "每日盈餘"}
                v={`${Math.abs(plan.dailyDeltaKcal)} kcal`}
              />
              {profile.goal !== "maintain" && (
                <Row
                  k="預計每週變化"
                  v={`${plan.weeklyRateKg > 0 ? "+" : ""}${plan.weeklyRateKg} kg`}
                />
              )}
            </div>
            {plan.notes.length > 0 && (
              <ul className={`${infoBox} mt-3 list-disc space-y-1 pl-8`}>
                {plan.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section className={card}>
        <h2 className="mb-1 font-semibold">個人資料</h2>
        <div className="divide-y divide-slate-100 text-sm">
          <Row k="性別" v={profile.sex === "male" ? "男" : "女"} />
          <Row k="身高" v={`${profile.height_cm} cm`} />
          {weightKg !== null && <Row k="最新體重" v={`${weightKg} kg`} />}
          <Row k="活動量" v={ACTIVITY_TEXT[profile.activity_level]} />
          <Row k="目標" v={GOAL_TEXT[profile.goal]} />
          {profile.target_weight_kg !== null && (
            <Row k="目標體重" v={`${profile.target_weight_kg} kg`} />
          )}
        </div>
        <div className="mt-3 space-y-2">
          <button className={btnGhost} onClick={onEditProfile}>修改個人資料</button>
          <button className={btnGhost} onClick={onLogout}>登出</button>
        </div>
      </section>

      <p className="text-xs text-slate-400">
        公式：Mifflin-St Jeor；1 kg 體重 ≈ 7700 kcal。{DISCLAIMER}
      </p>
    </div>
  );
}
