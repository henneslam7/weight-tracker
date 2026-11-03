"use client";

import { useMemo, useState } from "react";
import { FORMULA_VERSION, PACE_LABEL, previewPaces, type Plan } from "@/lib/calc";
import { confidenceText, explainPlan, missingText, weeklyText } from "@/lib/explain";
import { legacyNumbers } from "@/lib/legacy";
import { isMissingColumn, rateFromPace } from "@/lib/profile-save";
import { getSupabase } from "@/lib/supabase";
import { toDateStr } from "@/lib/date";
import type { Pace, Profile } from "@/lib/types";
import { btnGhost, card, DISCLAIMER, errorBox, infoBox } from "./ui";

interface Props {
  userId: string;
  profile: Profile;
  plan: Plan | null;
  planError: string | null;
  weightKg: number | null;
  onEditProfile: () => void;
  onLogout: () => void;
  /** 改咗檔位／確認公式更新後，叫 parent 重新讀取 */
  onChanged: () => void;
}

const GOAL_TEXT = { lose: "減脂", maintain: "維持體重", gain: "增肌" } as const;
const STATUS_TEXT: Record<Plan["status"], string | null> = {
  ok: null,
  capped: "已按安全限制調整",
  blocked: "你自訂嘅數字冇被採用",
  requires_review: "需要專業評估",
};

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between py-2">
      <span className="text-slate-500">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}

export default function Calculator({
  userId,
  profile,
  plan,
  planError,
  weightKg,
  onEditProfile,
  onLogout,
  onChanged,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showWhy, setShowWhy] = useState(false);

  // formula_version === undefined：資料庫未跑 schema_tdee.sql（欄位唔存在）
  const columnMissing = profile.formula_version === undefined;
  const formulaStale = !columnMissing && profile.formula_version !== FORMULA_VERSION;

  const previews = useMemo(() => {
    if (!plan || !weightKg || profile.goal !== "lose") return null;
    return previewPaces({ profile, weightKg, today: toDateStr() });
  }, [plan, weightKg, profile]);

  const old = useMemo(() => {
    if (!formulaStale || !weightKg) return null;
    return legacyNumbers(profile, weightKg, toDateStr());
  }, [formulaStale, profile, weightKg]);

  const explain = useMemo(() => (plan ? explainPlan(plan, profile) : []), [plan, profile]);

  async function patch(fields: Record<string, unknown>, legacyFields?: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    try {
      const supabase = getSupabase();
      let { error } = await supabase.from("profiles").update(fields).eq("user_id", userId);
      if (error && isMissingColumn(error) && legacyFields) {
        ({ error } = await supabase.from("profiles").update(legacyFields).eq("user_id", userId));
      }
      if (error) throw error;
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "更新失敗，請再試。");
    } finally {
      setBusy(false);
    }
  }

  const choosePace = (p: Pace) =>
    patch(
      { pace: p, custom_kcal: null, weekly_rate_kg: rateFromPace(p), formula_version: FORMULA_VERSION, updated_at: new Date().toISOString() },
      { weekly_rate_kg: rateFromPace(p), updated_at: new Date().toISOString() },
    );
  const ackFormula = () => patch({ formula_version: FORMULA_VERSION });

  return (
    <div className="space-y-4">
      {formulaStale && plan && (
        <section className={`${card} space-y-2`}>
          <h2 className="font-semibold">計算方法已更新</h2>
          <p className="text-sm text-slate-600">
            我哋改用更細緻嘅活動量估算同更清楚嘅安全規則。你之前嘅記錄同體重完全冇改，只係每日目標嘅算法唔同。
          </p>
          {old && (
            <div className="divide-y divide-slate-100 rounded-xl bg-slate-50 px-3 text-sm">
              <Row k="每日消耗（舊 → 新）" v={`${old.tdee} → ${plan.tdee} kcal`} />
              <Row k="每日目標（舊 → 新）" v={`${old.targetCalories} → ${plan.targetCalories} kcal`} />
              <Row k="蛋白質（舊 → 新）" v={`${old.proteinG} → ${plan.macros.proteinG} g`} />
            </div>
          )}
          {plan.confidence === "low" && (
            <p className={infoBox}>
              你仲未填步數同工作性質，所以新估算信心偏低。
              <button className="ml-1 font-bold underline" onClick={onEditProfile}>補充資料</button>
            </p>
          )}
          <button className={btnGhost} onClick={ackFormula} disabled={busy}>明白喇</button>
        </section>
      )}
      {columnMissing && (
        <p className={infoBox}>
          資料庫未升級：新嘅活動問卷、速度檔位同安全篩查暫時儲存唔到。請喺 Supabase SQL Editor 執行 supabase/schema_tdee.sql 一次。
        </p>
      )}

      <section className={card}>
        <h2 className="mb-1 font-semibold">每日目標</h2>
        {planError && <p className={infoBox}>{planError}</p>}
        {!planError && !plan && (
          <p className={infoBox}>請先喺「體重」頁記錄體重，先計到目標。</p>
        )}
        {plan && (
          <>
            {STATUS_TEXT[plan.status] && (
              <p className="mt-1 inline-block rounded-full bg-amber-100 px-3 py-0.5 text-xs font-bold text-amber-900">
                {STATUS_TEXT[plan.status]}
              </p>
            )}
            <div className="my-3 text-center">
              <div className="text-4xl font-bold text-teal-700">
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
              <Row k="TDEE（每日總消耗，估算）" v={`約 ${plan.tdee} kcal`} />
              <Row k="合理範圍" v={`${plan.tdeeLow}–${plan.tdeeHigh} kcal`} />
              <Row k="估算信心" v={confidenceText(plan.confidence)} />
              <Row
                k={plan.dailyDeltaKcal <= 0 ? "每日赤字" : "每日盈餘"}
                v={`${Math.abs(plan.dailyDeltaKcal)} kcal${plan.deficitRatio > 0 ? `（約 ${Math.round(plan.deficitRatio * 1000) / 10}%）` : ""}`}
              />
              {profile.goal !== "maintain" && plan.dailyDeltaKcal !== 0 && (
                <Row k="預計每週變化" v={weeklyText(plan.weeklyRateKg)} />
              )}
            </div>

            {plan.missing.length > 0 && (
              <p className={`${infoBox} mt-3`}>
                補充「{missingText(plan.missing).join("、")}」，估算會更準。
                <button className="ml-1 font-bold underline" onClick={onEditProfile}>去填</button>
              </p>
            )}
            {plan.warnings.length > 0 && (
              <ul className={`${infoBox} mt-3 list-disc space-y-1 pl-8`}>
                {plan.warnings.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
            {plan.notes.length > 0 && (
              <ul className="mt-3 list-disc space-y-1 pl-6 text-sm text-slate-600">
                {plan.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}

            <button className="mt-3 text-sm font-bold text-teal-700 underline" onClick={() => setShowWhy((v) => !v)}>
              {showWhy ? "收埋計算方法" : "點解係呢個數？"}
            </button>
            {showWhy && (
              <ul className="mt-2 list-disc space-y-1.5 rounded-xl bg-slate-50 p-3 pl-7 text-sm text-slate-700">
                {explain.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {plan && previews && plan.status !== "requires_review" && (
        <section className={`${card} space-y-2`}>
          <h2 className="font-semibold">減脂速度</h2>
          <p className="text-xs text-slate-500">赤字愈大愈難持久。你可以隨時轉檔，轉咗之後所有數字即時更新。</p>
          {previews.map((pv) => {
            const active = plan.pace === pv.pace;
            return (
              <button
                key={pv.pace}
                disabled={busy || !pv.allowed || active}
                onClick={() => void choosePace(pv.pace)}
                className={`w-full rounded-xl px-3 py-2.5 text-left ring-1 disabled:opacity-60 ${
                  active ? "bg-teal-50 ring-2 ring-teal-700" : "bg-white ring-slate-300"
                }`}
              >
                <span className="font-semibold">{PACE_LABEL[pv.pace]}</span>
                {active && <span className="ml-2 text-xs font-bold text-teal-700">使用中</span>}
                <span className="mt-0.5 block text-sm text-slate-600">
                  {pv.allowed
                    ? `約 ${pv.targetCalories} kcal／日 · 赤字約 ${Math.round(pv.deficitRatio * 1000) / 10}% · ${weeklyText(pv.weeklyRateKg)}`
                    : "你而家唔適用（安全篩查、BMI 或年齡）"}
                </span>
              </button>
            );
          })}
          {err && <p className={errorBox}>{err}</p>}
        </section>
      )}

      <section className={card}>
        <h2 className="mb-1 font-semibold">個人資料</h2>
        <div className="divide-y divide-slate-100 text-sm">
          <Row k="性別" v={profile.sex === "male" ? "男" : "女"} />
          <Row k="身高" v={`${profile.height_cm} cm`} />
          {weightKg !== null && <Row k="最新體重" v={`${weightKg} kg`} />}
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
        公式：Mifflin-St Jeor ×活動倍率；1 kg 體重 ≈ 7700 kcal（只係粗略估算）。公式版本 {FORMULA_VERSION}。{DISCLAIMER}
      </p>
    </div>
  );
}
