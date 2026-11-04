"use client";

import { useMemo, useState } from "react";
import { STEP_LABEL } from "@/lib/activity";
import {
  ageOn,
  FORMULA_VERSION,
  isSenior,
  MIN_CALORIES,
  PACE_LABEL,
  previewPaces,
  SENIOR,
  validateProfile,
  weeklyGoalAdvice,
  computePlan,
} from "@/lib/calc";
import { toDateStr } from "@/lib/date";
import { isMissingColumn, legacyLevelFromSteps, legacyRow, rateFromPace } from "@/lib/profile-save";
import { questionsFor, screenRisk, type Answer } from "@/lib/screening";
import { getSupabase } from "@/lib/supabase";
import type {
  ExerciseInSteps,
  ExerciseKind,
  Goal,
  Intensity,
  Pace,
  Profile,
  Sex,
  StepCoverage,
  StepSource,
  StepsRange,
  WorkActivity,
} from "@/lib/types";
import { btnGhost, btnPrimary, card, DISCLAIMER, errorBox, infoBox, input, label } from "./ui";

const STEP_OPTIONS: StepsRange[] = ["lt3000", "3000_4999", "5000_6999", "7000_9999", "gte10000", "unknown"];
const WORK_OPTIONS: { value: WorkActivity; text: string }[] = [
  { value: "mostly_sitting", text: "大部分時間坐低（辦公室、電腦）" },
  { value: "mixed", text: "坐企行混合" },
  { value: "standing_walking", text: "大部分時間企或行（零售、服務業）" },
  { value: "manual_labor", text: "體力勞動（搬運、地盤）" },
  { value: "unknown", text: "唔肯定" },
];
const EXERCISE_OPTIONS: { value: ExerciseKind; text: string }[] = [
  { value: "none", text: "冇固定運動" },
  { value: "resistance", text: "重量訓練" },
  { value: "cardio", text: "帶氧（跑步、游水、單車、行山）" },
  { value: "mixed", text: "混合" },
  { value: "other", text: "第啲" },
];
const INTENSITY_OPTIONS: { value: Intensity; text: string }[] = [
  { value: "light", text: "輕鬆（可以傾偈）" },
  { value: "moderate", text: "中等（傾得到但有啲喘）" },
  { value: "vigorous", text: "吃力（只講得到短句）" },
];
const ANSWER_TEXT: Record<Answer, string> = { no: "冇", yes: "有", prefer_not: "唔想答" };

const GOAL_OPTIONS: { value: Goal; text: string }[] = [
  { value: "lose", text: "減脂" },
  { value: "recomp", text: "減脂＋增肌" },
  { value: "maintain", text: "維持體重" },
  { value: "gain", text: "增肌" },
];

interface Props {
  userId: string;
  initial: Profile | null;
  /** 已有體重記錄嘅話，唔需要再問現時體重 */
  hasWeight: boolean;
  /** 用嚟檢查目標體重 */
  latestWeightKg: number | null;
  onSaved: () => void;
  onCancel?: () => void;
}

export default function ProfileForm({
  userId,
  initial,
  hasWeight,
  latestWeightKg,
  onSaved,
  onCancel,
}: Props) {
  const [sex, setSex] = useState<Sex>(initial?.sex ?? "male");
  const [birth, setBirth] = useState(initial?.birth_date ?? "");
  const [height, setHeight] = useState(initial ? String(initial.height_cm) : "");
  const [weight, setWeight] = useState("");
  // ── 活動量問卷（舊資料冇呢啲欄位：steps 預設「唔清楚」，提醒用戶補充）──
  const [stepsRange, setStepsRange] = useState<StepsRange>(initial?.steps_range ?? "unknown");
  const [meanSteps, setMeanSteps] = useState(initial?.mean_steps_28d ? String(initial.mean_steps_28d) : "");
  const [stepSource, setStepSource] = useState<StepSource>(initial?.step_source ?? "manual");
  const [stepCoverage, setStepCoverage] = useState<StepCoverage>(initial?.step_coverage ?? "medium");
  const [work, setWork] = useState<WorkActivity>(initial?.work_activity ?? "unknown");
  const [exType, setExType] = useState<ExerciseKind>(initial?.exercise_type ?? "none");
  const [exSessions, setExSessions] = useState(String(initial?.exercise_sessions_per_week ?? 3));
  const [exMinutes, setExMinutes] = useState(String(initial?.exercise_minutes ?? 45));
  const [exIntensity, setExIntensity] = useState<Intensity | "">(initial?.exercise_intensity ?? "");
  const [exInSteps, setExInSteps] = useState<ExerciseInSteps>(initial?.exercise_included_in_steps ?? "unknown");
  // ── 速度檔位 ──
  const [pace, setPace] = useState<Pace>(initial?.pace ?? "standard");
  const [customKcal, setCustomKcal] = useState(initial?.custom_kcal ? String(initial.custom_kcal) : "");
  const [wantKg, setWantKg] = useState("");
  // ── 安全篩查（只儲存結果，唔儲存答案）──
  const [answers, setAnswers] = useState<Record<string, Answer | undefined>>(() => {
    if (initial?.risk_review !== "clear") return {};
    const a: Record<string, Answer> = {};
    for (const q of questionsFor(initial.sex)) a[q.id] = "no";
    return a;
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [goal, setGoal] = useState<Goal>(initial?.goal ?? "lose");
  const [target, setTarget] = useState(
    initial?.target_weight_kg ? String(initial.target_weight_kg) : "",
  );
  const [rate, setRate] = useState(String(initial?.weekly_rate_kg ?? 0.5));
  const [seniorAck, setSeniorAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ageNow = /^\d{4}-\d{2}-\d{2}$/.test(birth) ? ageOn(birth, toDateStr()) : null;
  const senior = ageNow !== null && isSenior(ageNow);
  const seniorLoseGain = senior && goal !== "maintain";
  const rateOptions = [0.25, 0.5];
  const effectiveRate = rateOptions.includes(Number(rate)) ? rate : "0.5";

  const screened = useMemo(() => screenRisk(sex, answers), [sex, answers]);
  // 上次結果係「需要評估」而今次未重答 → 維持「需要評估」，唔可以靜靜雞變安全
  const riskReview =
    screened === "not_assessed" && initial?.risk_review === "needs_review" ? "needs_review" : screened;

  const draft: Profile | null = useMemo(() => {
    const h = Number(height);
    if (!(h > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(birth)) return null;
    return buildProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sex, birth, height, stepsRange, meanSteps, stepSource, stepCoverage, work, exType, exSessions, exMinutes, exIntensity, exInSteps, goal, target, pace, customKcal, effectiveRate, riskReview]);

  const weightForPlan = hasWeight ? latestWeightKg : weight === "" ? null : Number(weight);
  const previews = useMemo(() => {
    if (!draft || goal !== "lose" || !weightForPlan) return null;
    return previewPaces({ profile: draft, weightKg: weightForPlan, today: toDateStr() });
  }, [draft, goal, weightForPlan]);

  // 「想每週減 X kg」→ 反推 kcal，檢查安全，並提醒估算唔係保證（只係換算，唔會自動採用）
  const advice = useMemo(() => {
    const kg = Number(wantKg);
    if (!draft || !weightForPlan || !(kg > 0) || kg > 3) return null;
    const r = computePlan({ profile: draft, weightKg: weightForPlan, today: toDateStr() });
    if (!r.ok) return null;
    return weeklyGoalAdvice({ tdee: r.plan.tdee, kgPerWeek: kg, sex, senior: r.plan.senior, review: riskReview });
  }, [draft, weightForPlan, wantKg, sex, riskReview]);

  function buildProfile(): Profile {
    const steps = meanSteps === "" ? null : Math.round(Number(meanSteps));
    const hasEx = exType !== "none";
    return {
      sex,
      birth_date: birth,
      height_cm: Number(height),
      activity_level: legacyLevelFromSteps(stepsRange),
      goal,
      target_weight_kg: goal === "lose" || goal === "gain" ? Number(target) : null,
      weekly_rate_kg: goal === "lose" ? rateFromPace(pace) : goal === "gain" ? Number(effectiveRate) : null,
      steps_range: stepsRange,
      mean_steps_28d: steps !== null && steps > 0 ? steps : null,
      step_source: steps !== null && steps > 0 ? stepSource : null,
      step_coverage: steps !== null && steps > 0 ? stepCoverage : null,
      work_activity: work,
      exercise_type: exType,
      exercise_sessions_per_week: hasEx ? Math.round(Number(exSessions) || 0) : null,
      exercise_minutes: hasEx ? Math.round(Number(exMinutes) || 0) : null,
      exercise_intensity: hasEx && exIntensity ? exIntensity : null,
      exercise_included_in_steps: hasEx ? exInSteps : null,
      pace: goal === "lose" ? pace : null,
      custom_kcal: goal === "lose" && pace === "custom" && customKcal !== "" ? Math.round(Number(customKcal)) : null,
      risk_review: riskReview,
      formula_version: FORMULA_VERSION,
    };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const today = toDateStr();
    const profile = buildProfile();
    const currentWeight = hasWeight
      ? latestWeightKg
      : weight === ""
        ? null
        : Number(weight);

    if (!hasWeight && currentWeight === null) {
      setError("請輸入現時體重。");
      return;
    }
    if (seniorLoseGain && !seniorAck) {
      setError("請先剔「我知道減重前應該先問醫生」，先可以繼續。");
      return;
    }
    const problem = validateProfile({ profile, currentWeightKg: currentWeight, today });
    if (problem) {
      setError(problem);
      return;
    }

    setBusy(true);
    let legacyOnly = false;
    try {
      const supabase = getSupabase();
      const now = new Date().toISOString();
      let { error: pErr } = await supabase
        .from("profiles")
        .upsert(
          { user_id: userId, ...profile, activity_updated_at: now, updated_at: now },
          { onConflict: "user_id" },
        );
      if (pErr && isMissingColumn(pErr)) {
        // 資料庫未跑 schema_tdee.sql：只儲存舊欄位，app 照常運作（低信心估算）
        legacyOnly = true;
        ({ error: pErr } = await supabase
          .from("profiles")
          .upsert({ user_id: userId, ...legacyRow(profile), updated_at: now }, { onConflict: "user_id" }));
      }
      if (pErr) throw pErr;

      if (!hasWeight && currentWeight !== null) {
        const { error: wErr } = await supabase
          .from("weight_logs")
          .upsert(
            { user_id: userId, logged_on: today, weight_kg: currentWeight },
            { onConflict: "user_id,logged_on" },
          );
        if (wErr) throw wErr;
      }
      if (legacyOnly) {
        setNotice(
          "已儲存基本資料。但資料庫未升級，新嘅活動問卷、速度檔位同安全篩查未能儲存，估算會較粗略。請喺 Supabase SQL Editor 執行 supabase/schema_tdee.sql 之後再儲存一次。",
        );
        return;
      }
      onSaved();
    } catch (err) {
      const e = err as { code?: string; message?: string } | null;
      if (e?.code === "23514" && goal === "recomp") {
        setError("資料庫未支援「減脂＋增肌」。請喺 Supabase SQL Editor 執行 supabase/schema_recomp.sql 一次，再儲存。");
      } else {
        setError(e?.message ? e.message : "儲存失敗，請再試。");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-6">
      <h1 className="text-2xl font-bold">{initial ? "修改個人資料" : "設定個人資料"}</h1>
      <p className="text-sm text-slate-500">
        呢啲資料用嚟計算你每日嘅 calories 同營養目標。只供 18 歲或以上使用。
      </p>
      <form onSubmit={submit} className={`${card} space-y-4`}>
        <div>
          <span className={label}>性別</span>
          <div className="grid grid-cols-2 gap-2">
            {(["male", "female"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSex(s)}
                className={`rounded-xl px-3 py-2.5 ring-1 ${
                  sex === s
                    ? "bg-teal-700 text-white ring-teal-700"
                    : "bg-white text-slate-700 ring-slate-300"
                }`}
              >
                {s === "male" ? "男" : "女"}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={label} htmlFor="birth">出生日期</label>
          <input
            id="birth"
            type="date"
            required
            max={toDateStr()}
            className={input}
            value={birth}
            onChange={(e) => setBirth(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="height">身高（厘米）</label>
            <input
              id="height"
              type="number"
              inputMode="decimal"
              step="0.1"
              required
              className={input}
              value={height}
              onChange={(e) => setHeight(e.target.value)}
            />
          </div>
          {!hasWeight && (
            <div>
              <label className={label} htmlFor="weight">現時體重（公斤）</label>
              <input
                id="weight"
                type="number"
                inputMode="decimal"
                step="0.1"
                required
                className={input}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
            </div>
          )}
        </div>

        <fieldset className="space-y-3 rounded-xl bg-slate-50 p-3">
          <legend className="px-1 text-sm font-bold text-slate-700">日常活動量</legend>
          {initial && !initial.steps_range && (
            <p className={infoBox}>
              你之前只揀咗一個活動級別，估算好粗略。填寫下面幾條問題，TDEE 會準啲，亦會顯示範圍同信心。
            </p>
          )}
          <div>
            <label className={label} htmlFor="steps">平均每日步數（過去 4 星期，睇手機健康 app）</label>
            <select id="steps" className={input} value={stepsRange} onChange={(e) => setStepsRange(e.target.value as StepsRange)}>
              {STEP_OPTIONS.map((r) => (
                <option key={r} value={r}>{STEP_LABEL[r]}</option>
              ))}
            </select>
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer text-slate-500">我有確實數字（可選，更準）</summary>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <div>
                <label className={label} htmlFor="mean">4 週平均步數</label>
                <input id="mean" type="number" inputMode="numeric" min={0} max={60000} className={input} value={meanSteps} onChange={(e) => setMeanSteps(e.target.value)} />
              </div>
              <div>
                <label className={label} htmlFor="src">來源</label>
                <select id="src" className={input} value={stepSource} onChange={(e) => setStepSource(e.target.value as StepSource)}>
                  <option value="device">手機／手錶</option>
                  <option value="manual">自己記</option>
                  <option value="estimate">估計</option>
                </select>
              </div>
              <div>
                <label className={label} htmlFor="cov">有帶身上</label>
                <select id="cov" className={input} value={stepCoverage} onChange={(e) => setStepCoverage(e.target.value as StepCoverage)}>
                  <option value="high">成日</option>
                  <option value="medium">間中唔帶</option>
                  <option value="low">好多時唔帶</option>
                </select>
              </div>
            </div>
          </details>
          <div>
            <label className={label} htmlFor="work">工作性質</label>
            <select id="work" className={input} value={work} onChange={(e) => setWork(e.target.value as WorkActivity)}>
              {WORK_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.text}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="ex">固定運動</label>
            <select id="ex" className={input} value={exType} onChange={(e) => setExType(e.target.value as ExerciseKind)}>
              {EXERCISE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.text}</option>
              ))}
            </select>
          </div>
          {exType !== "none" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label} htmlFor="exs">每週幾次</label>
                  <input id="exs" type="number" inputMode="numeric" min={0} max={14} className={input} value={exSessions} onChange={(e) => setExSessions(e.target.value)} />
                </div>
                <div>
                  <label className={label} htmlFor="exm">每次幾分鐘</label>
                  <input id="exm" type="number" inputMode="numeric" min={0} max={300} className={input} value={exMinutes} onChange={(e) => setExMinutes(e.target.value)} />
                </div>
              </div>
              <div>
                <label className={label} htmlFor="exi">強度</label>
                <select id="exi" className={input} value={exIntensity} onChange={(e) => setExIntensity(e.target.value as Intensity | "")}>
                  <option value="">唔肯定（當中等，信心較低）</option>
                  {INTENSITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.text}</option>
                  ))}
                </select>
              </div>
              {(exType === "cardio" || exType === "mixed") && (
                <div>
                  <label className={label} htmlFor="exin">呢啲運動有冇已計入上面嘅每日步數？</label>
                  <select id="exin" className={input} value={exInSteps} onChange={(e) => setExInSteps(e.target.value as ExerciseInSteps)}>
                    <option value="yes">有（唔會重複計）</option>
                    <option value="no">冇</option>
                    <option value="unknown">唔肯定</option>
                  </select>
                </div>
              )}
              <p className="text-xs text-slate-500">之後喺「運動」頁記錄嘅額外運動，會另外加返入當日上限，同呢度固定運動分開。</p>
            </div>
          )}
        </fieldset>

        <div>
          <span className={label}>目標</span>
          <div className="grid grid-cols-2 gap-2">
            {GOAL_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setGoal(o.value)}
                className={`rounded-xl px-2 py-2.5 ring-1 ${
                  goal === o.value
                    ? "bg-teal-700 text-white ring-teal-700"
                    : "bg-white text-slate-700 ring-slate-300"
                }`}
              >
                {o.text}
              </button>
            ))}
          </div>
        </div>

        {(goal === "lose" || goal === "gain") && (
          <div>
            <label className={label} htmlFor="target">目標體重（公斤）</label>
            <input
              id="target"
              type="number"
              inputMode="decimal"
              step="0.1"
              required
              className={input}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </div>
        )}

        {goal === "recomp" && (
          <div className="space-y-2 rounded-xl bg-teal-50 p-3 text-sm text-teal-900">
            <p className="font-bold">減脂＋增肌（體態重組）</p>
            <p>
              每日只輕微少食約 5%，配合高蛋白同重量訓練。體重通常變化好細，主要睇腰圍、相同力量有冇進步。
              新手、少運動一段時間再返嚟、或者有啲脂肪嘅人，效果最明顯。
            </p>
            {!(exType === "resistance" || exType === "mixed") && (
              <p className="font-semibold text-amber-800">
                你上面「固定運動」未揀重量訓練。冇重訓嘅話，效果會有限，建議揀「減脂」或「維持體重」。
              </p>
            )}
          </div>
        )}

        {goal === "gain" && (
          <div>
            <label className={label} htmlFor="rate">每週速度</label>
            <select id="rate" className={input} value={effectiveRate} onChange={(e) => setRate(e.target.value)}>
              {rateOptions.map((r) => (
                <option key={r} value={r}>{r} kg／週</option>
              ))}
            </select>
          </div>
        )}

        {goal === "lose" && (
          <div className="space-y-2">
            <span className={label}>減脂速度（每日少食幾多）</span>
            {(["gentle", "standard", "faster"] as const).map((p) => {
              const pv = previews?.find((x) => x.pace === p);
              const disabled = pv ? !pv.allowed : false;
              return (
                <button
                  key={p}
                  type="button"
                  disabled={disabled}
                  onClick={() => setPace(p)}
                  className={`w-full rounded-xl px-3 py-2.5 text-left ring-1 disabled:opacity-40 ${
                    pace === p ? "bg-teal-50 ring-2 ring-teal-700" : "bg-white ring-slate-300"
                  }`}
                >
                  <span className="font-semibold">{PACE_LABEL[p]}</span>
                  <span className="ml-2 text-xs text-slate-500">
                    {p === "gentle" ? "赤字約 10–15%（易維持）" : p === "standard" ? "赤字約 15–20%（優先推薦）" : "赤字約 20–25%（要監察）"}
                  </span>
                  {pv && (
                    <span className="mt-0.5 block text-sm text-slate-600">
                      {disabled
                        ? "你而家唔適用（未完成安全篩查，或 65 歲或以上）"
                        : `約 ${pv.targetCalories} kcal／日 · 約減 ${Math.abs(Math.round(pv.weeklyRateKg * 20) / 20).toFixed(2)} kg／週`}
                    </span>
                  )}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setPace("custom")}
              className={`w-full rounded-xl px-3 py-2.5 text-left ring-1 ${pace === "custom" ? "bg-teal-50 ring-2 ring-teal-700" : "bg-white ring-slate-300"}`}
            >
              <span className="font-semibold">自訂 kcal</span>
              <span className="ml-2 text-xs text-slate-500">自己決定，但唔安全會擋</span>
            </button>
            {pace === "custom" && (
              <div>
                <input
                  type="number"
                  inputMode="numeric"
                  aria-label="自訂每日 kcal"
                  placeholder={`最少 ${MIN_CALORIES[sex]} kcal`}
                  className={input}
                  value={customKcal}
                  onChange={(e) => setCustomKcal(e.target.value)}
                />
                <p className="mt-1 text-xs text-slate-500">
                  唔會靜靜雞幫你改數字：低過 {MIN_CALORIES[sex]} kcal 下限、{senior ? `超過 65 歲或以上嘅 ${Math.round(SENIOR.maxDeficitRatio * 100)}% 上限、` : "赤字超過 25% 而未通過安全小篩查、"}會直接話你知冇被採用。赤字愈大，愈要留意飢餓、疲倦同睡眠。
                </p>
                <div className="mt-2 rounded-xl bg-slate-50 p-3">
                  <label className={label} htmlFor="wantkg">想每週減幾多 kg？（只用嚟換算 kcal）</label>
                  <input id="wantkg" type="number" inputMode="decimal" step="0.1" min={0.1} max={3} className={input} value={wantKg} onChange={(e) => setWantKg(e.target.value)} />
                  {advice && (
                    <div className="mt-2 space-y-1 text-sm">
                      <p className="font-semibold">
                        約要每日食 {advice.intakeKcal} kcal（赤字約 {advice.deficitPct}%）
                        {advice.allowed ? "" : "：唔可以採用"}
                      </p>
                      {advice.messages.map((m) => (
                        <p key={m} className="text-slate-600">{m}</p>
                      ))}
                      {advice.allowed && (
                        <button type="button" className="font-bold text-teal-700 underline" onClick={() => setCustomKcal(String(advice.intakeKcal))}>
                          用呢個 kcal
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <fieldset className="space-y-2 rounded-xl bg-slate-50 p-3">
          <legend className="px-1 text-sm font-bold text-slate-700">安全小篩查</legend>
          <p className="text-xs text-slate-500">
            只用嚟決定可唔可以提供減脂速度。我哋只記錄結果（通過／需要評估），唔會儲存你嘅答案。
          </p>
          {questionsFor(sex).map((q) => (
            <div key={q.id} className="space-y-1">
              <p className="text-sm">{q.text}</p>
              <div className="grid grid-cols-3 gap-2">
                {(["no", "yes", "prefer_not"] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAnswers((cur) => ({ ...cur, [q.id]: a }))}
                    className={`rounded-lg px-2 py-1.5 text-sm ring-1 ${
                      answers[q.id] === a ? "bg-teal-700 text-white ring-teal-700" : "bg-white text-slate-700 ring-slate-300"
                    }`}
                  >
                    {ANSWER_TEXT[a]}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {riskReview === "needs_review" && (
            <p className={infoBox}>
              建議先同醫生或註冊營養師傾。呢個 app 會顯示維持體重嘅熱量，但唔會提供減脂赤字。
            </p>
          )}
          {riskReview === "not_assessed" && (
            <p className="text-xs text-slate-500">未答完：可以先儲存，但「進取」檔位要答完先開放。</p>
          )}
        </fieldset>

        {seniorLoseGain && (
          <div className="space-y-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-bold">65 歲或以上，要特別小心</p>
            <p>
              為咗保護你，我哋用較保守嘅設定：每日赤字最多 TDEE 嘅 {Math.round(SENIOR.maxDeficitRatio * 100)}%、每週最多 {SENIOR.rateMax} kg、蛋白質按 {SENIOR.proteinGPerKg} g/kg 計、目標體重 BMI 唔低過 {SENIOR.minTargetBmi}。
              呢啲係設計預設，唔係醫療意見。
            </p>
            <label className="flex items-start gap-2 font-semibold">
              <input type="checkbox" className="mt-1 h-5 w-5 accent-teal-700" checked={seniorAck} onChange={(e) => setSeniorAck(e.target.checked)} />
              我知道減重前應該先問醫生或註冊營養師
            </label>
          </div>
        )}
        {error && <p className={errorBox}>{error}</p>}
        {notice && (
          <div className="space-y-2">
            <p className={infoBox}>{notice}</p>
            <button type="button" className={btnGhost} onClick={onSaved}>返回</button>
          </div>
        )}
        <button className={btnPrimary} disabled={busy || notice !== null}>
          {busy ? "儲存中…" : "儲存"}
        </button>
        {onCancel && (
          <button type="button" className={btnGhost} onClick={onCancel}>
            取消
          </button>
        )}
      </form>
      <p className="text-xs text-slate-400">{DISCLAIMER}</p>
    </main>
  );
}
