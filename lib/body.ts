// 身體組成（智能磅報告）：驗證、推算、前後比較、設定建議。純函數，唔靠 AI。
//
// 原則：
//  - 磅用嘅係生物電阻（BIA）估算，體脂有 3–5% 誤差，受水分、食飯、運動、時間影響 → 睇趨勢，唔睇單次。
//  - 磅嘅評語（「過高」「優」「肥胖」）係廠商意見，我哋唔跟，亦唔用嚟評論身形。
//  - 磅嘅 BMR 只做參考，唔影響 TDEE（用戶決定）。
//  - 設定建議只係「候選」：要用戶撳「採用」先會改，而且要過 validateProfile。
//  - 數字閾值係一般參考範圍（產品假設），唔係診斷。

import { calcBmi, validateProfile } from "./calc.ts";
import { diffDays, isValidDateStr } from "./date.ts";
import type { Profile, Sex } from "./types.ts";

export interface BodyScan {
  id?: string;
  measured_on: string;
  weight_kg: number;
  body_fat_pct: number | null;
  /** 去脂體重（kg） */
  lean_kg: number | null;
  /** 磅報嘅「肌肉量」（通常包含水分，唔等於純肌肉） */
  muscle_kg: number | null;
  skeletal_muscle_kg: number | null;
  water_pct: number | null;
  protein_pct: number | null;
  bone_kg: number | null;
  visceral_fat: number | null;
  bmr_kcal: number | null;
  body_age: number | null;
  bmi: number | null;
  heart_rate: number | null;
  source: "screenshot" | "manual";
}

export const SCAN_FIELDS = [
  "weight_kg", "body_fat_pct", "lean_kg", "muscle_kg", "skeletal_muscle_kg", "water_pct",
  "protein_pct", "bone_kg", "visceral_fat", "bmr_kcal", "body_age", "bmi", "heart_rate",
] as const;
export type ScanField = (typeof SCAN_FIELDS)[number];

/** 欄位合理範圍（超出 = 讀錯或者輸入錯） */
export const SCAN_RANGE: Record<ScanField, readonly [number, number]> = {
  weight_kg: [30, 300],
  body_fat_pct: [3, 65],
  lean_kg: [20, 200],
  muscle_kg: [10, 150],
  skeletal_muscle_kg: [8, 100],
  water_pct: [25, 80],
  protein_pct: [5, 35],
  bone_kg: [0.8, 8],
  visceral_fat: [1, 60],
  bmr_kcal: [600, 4500],
  body_age: [5, 99],
  bmi: [10, 70],
  heart_rate: [30, 220],
};

export const SCAN_LABEL: Record<ScanField, string> = {
  weight_kg: "體重 (kg)",
  body_fat_pct: "體脂率 (%)",
  lean_kg: "去脂體重 (kg)",
  muscle_kg: "肌肉量 (kg)",
  skeletal_muscle_kg: "骨骼肌量 (kg)",
  water_pct: "身體水分 (%)",
  protein_pct: "蛋白質率 (%)",
  bone_kg: "骨鹽量 (kg)",
  visceral_fat: "內臟脂肪等級",
  bmr_kcal: "磅報基礎代謝 (kcal)",
  body_age: "身體年齡",
  bmi: "BMI",
  heart_rate: "心率 (次／分鐘)",
};

// ───────────── 單位 ─────────────

export type WeightUnit = "kg" | "lb" | "jin";
/** 磅 app 有可能用 kg、磅（lb）或者斤（1 斤 = 0.5 kg） */
export function toKg(v: number, unit: WeightUnit): number {
  if (unit === "lb") return v * 0.45359237;
  if (unit === "jin") return v * 0.5;
  return v;
}
/** 要轉單位嘅欄位（重量類） */
export const WEIGHT_FIELDS: readonly ScanField[] = ["weight_kg", "lean_kg", "muscle_kg", "skeletal_muscle_kg", "bone_kg"];

// ───────────── 驗證 ─────────────

export interface ScanCheck {
  /** 一定要改正先儲存 */
  errors: string[];
  /** 提示（可能讀錯／輸入錯），唔阻止儲存 */
  warnings: string[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function checkScan(s: BodyScan, heightCm: number | null, today: string): ScanCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isValidDateStr(s.measured_on)) errors.push("日期唔正確。");
  else if (s.measured_on > today) errors.push("日期唔可以係未來。");
  for (const k of SCAN_FIELDS) {
    const v = s[k];
    if (v === null || v === undefined) {
      if (k === "weight_kg") errors.push("體重一定要有。");
      continue;
    }
    if (!Number.isFinite(v)) {
      errors.push(`${SCAN_LABEL[k]}唔係數字。`);
      continue;
    }
    const [lo, hi] = SCAN_RANGE[k];
    if (v < lo || v > hi) errors.push(`${SCAN_LABEL[k]}要喺 ${lo}–${hi} 之間。`);
  }
  if (errors.length) return { errors, warnings };

  const d = deriveScan(s, heightCm);
  if (s.lean_kg !== null && s.body_fat_pct !== null) {
    const impliedLean = s.weight_kg - (s.weight_kg * s.body_fat_pct) / 100;
    if (Math.abs(impliedLean - s.lean_kg) > 2.5) {
      warnings.push(`去脂體重 ${s.lean_kg} kg 同「體重 − 體脂」算出嘅 ${r1(impliedLean)} kg 差好遠，可能有欄位讀錯。`);
    }
  }
  if (s.lean_kg !== null && s.lean_kg > s.weight_kg) errors.push("去脂體重唔可以大過體重。");
  if (s.bmi !== null && d.bmi !== null && Math.abs(s.bmi - d.bmi) > 1.2) {
    warnings.push(`磅報 BMI ${s.bmi} 同按你身高算出嘅 ${d.bmi} 有差距：身高設定或者讀數可能唔啱。`);
  }
  if (s.muscle_kg !== null && s.muscle_kg > s.weight_kg) errors.push("肌肉量唔可以大過體重。");
  return { errors, warnings };
}

// ───────────── 推算 ─────────────

export interface DerivedScan {
  fatKg: number | null;
  leanKg: number | null;
  bmi: number | null;
}

export function deriveScan(s: BodyScan, heightCm: number | null): DerivedScan {
  const fatKg = s.body_fat_pct !== null ? r1((s.weight_kg * s.body_fat_pct) / 100) : null;
  const leanKg = s.lean_kg !== null ? s.lean_kg : fatKg !== null ? r1(s.weight_kg - fatKg) : null;
  const bmi = heightCm && heightCm > 0 ? r1(calcBmi(s.weight_kg, heightCm)) : null;
  return { fatKg, leanKg, bmi };
}

/** Katch-McArdle（磅報嘅 BMR 通常都係呢個公式）。只做參考對照，唔入 TDEE。 */
export function katchMcArdleBmr(leanKg: number): number {
  return Math.round(370 + 21.6 * leanKg);
}

export type FatBand = "low" | "typical" | "high";
/** 體脂一般參考範圍（產品假設，唔係診斷）：男 10–24%（40 歲或以上到 27%）、女 18–32%（40 歲或以上到 35%） */
export function fatBand(sex: Sex, pct: number, age: number | null): FatBand {
  const older = age !== null && age >= 40;
  const [lo, hi] = sex === "male" ? [10, older ? 27 : 24] : [18, older ? 35 : 32];
  return pct < lo ? "low" : pct > hi ? "high" : "typical";
}
export const FAT_BAND_TEXT: Record<FatBand, string> = { low: "偏低", typical: "一般範圍", high: "偏高" };

/** 現實啲嘅第一個目標體脂（產品假設）：男 20%、女 28% */
export const TARGET_FAT_PCT: Record<Sex, number> = { male: 20, female: 28 };

/** 保持去脂體重不變，去到目標體脂率嘅體重 */
export function weightAtFatPct(leanKg: number, fatPct: number): number {
  return r1(leanKg / (1 - fatPct / 100));
}

/** 如果去脂體重唔變，去到呢個體重嘅體脂率 */
export function impliedFatPct(leanKg: number, weightKg: number): number {
  return r1(((weightKg - leanKg) / weightKg) * 100);
}

// ───────────── 前後比較 ─────────────

export type ChangeKind = "noise" | "fat_loss" | "mixed_loss" | "lean_loss" | "recomp" | "lean_gain" | "fat_gain" | "no_data";

export interface ScanChange {
  kind: ChangeKind;
  days: number;
  dWeight: number;
  dFat: number | null;
  dLean: number | null;
  /** 體重變化入面有幾多係脂肪（0–1；減重時） */
  fatShare: number | null;
}

/** 磅嘅單次誤差大，細過呢個 kg 嘅變化當雜訊 */
export const NOISE_KG = 1.0;

export function compareScans(prev: BodyScan, cur: BodyScan, heightCm: number | null): ScanChange {
  const a = deriveScan(prev, heightCm);
  const b = deriveScan(cur, heightCm);
  const days = Math.max(0, diffDays(prev.measured_on, cur.measured_on));
  const dWeight = r1(cur.weight_kg - prev.weight_kg);
  const dFat = a.fatKg !== null && b.fatKg !== null ? r1(b.fatKg - a.fatKg) : null;
  const dLean = a.leanKg !== null && b.leanKg !== null ? r1(b.leanKg - a.leanKg) : null;
  const base = { days, dWeight, dFat, dLean };
  if (dFat === null || dLean === null) return { ...base, kind: "no_data", fatShare: null };

  if (Math.abs(dWeight) < NOISE_KG) {
    // 體重差唔多，但脂肪明顯減、去脂增 → 體態重組；否則雜訊
    if (dFat <= -1 && dLean >= 0.5) return { ...base, kind: "recomp", fatShare: null };
    return { ...base, kind: "noise", fatShare: null };
  }
  if (dWeight < 0) {
    const fatShare = Math.max(0, Math.min(1, dFat / dWeight)); // 兩個都係負數
    const kind: ChangeKind = fatShare >= 0.7 ? "fat_loss" : fatShare >= 0.4 ? "mixed_loss" : "lean_loss";
    return { ...base, kind, fatShare: Math.round(fatShare * 100) / 100 };
  }
  const leanShare = dLean / dWeight;
  return { ...base, kind: leanShare >= 0.5 ? "lean_gain" : "fat_gain", fatShare: null };
}

// ───────────── 設定建議（候選，要用戶撳「採用」）─────────────

export type SuggestionId = "target_weight" | "goal_recomp" | "goal_maintain" | "pace_gentle";

export interface SettingSuggestion {
  id: SuggestionId;
  title: string;
  current: string;
  suggested: string;
  /** 事實依據（我哋自己計，AI 只負責解釋） */
  facts: string[];
  /** 採用時要 update 嘅 profile 欄位 */
  patch: Partial<Profile>;
}

export interface SuggestInput {
  profile: Profile;
  scan: BodyScan;
  prev: BodyScan | null;
  today: string;
}

const GOAL_ZH: Record<Profile["goal"], string> = { lose: "減脂", maintain: "維持體重", gain: "增肌", recomp: "減脂＋增肌" };

function ageOf(profile: Profile, today: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(profile.birth_date);
  if (!m) return null;
  const [, y, mo, d] = m.map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - y - (tm < mo || (tm === mo && td < d) ? 1 : 0);
}

export function suggestSettings({ profile, scan, prev, today }: SuggestInput): SettingSuggestion[] {
  const out: SettingSuggestion[] = [];
  const d = deriveScan(scan, profile.height_cm);
  const age = ageOf(profile, today);
  const band = scan.body_fat_pct !== null ? fatBand(profile.sex, scan.body_fat_pct, age) : null;
  const trains = (profile.exercise_type === "resistance" || profile.exercise_type === "mixed") && (profile.exercise_sessions_per_week ?? 0) >= 2;
  const valid = (p: Partial<Profile>) =>
    validateProfile({ profile: { ...profile, ...p }, currentWeightKg: scan.weight_kg, today }) === null;

  // 1) 目標體重：按去脂體重推算現實目標（唔跟磅嘅 BMI 標準體重）
  if (profile.goal === "lose" && d.leanKg !== null) {
    const tw = Math.round(weightAtFatPct(d.leanKg, TARGET_FAT_PCT[profile.sex]));
    const cur = profile.target_weight_kg;
    if (tw < scan.weight_kg) {
      const implied = cur !== null ? impliedFatPct(d.leanKg, cur) : null;
      const tooLow = implied !== null && implied < (profile.sex === "male" ? 12 : 20);
      const tooHigh = implied !== null && implied > (profile.sex === "male" ? 26 : 34);
      if ((cur === null || Math.abs(cur - tw) >= 4 || tooLow || tooHigh) && valid({ target_weight_kg: tw })) {
        out.push({
          id: "target_weight",
          title: "目標體重",
          current: cur === null ? "未設定" : `${cur} kg`,
          suggested: `${tw} kg`,
          facts: [
            `去脂體重約 ${d.leanKg} kg；保持去脂體重不變，體脂去到 ${TARGET_FAT_PCT[profile.sex]}% 約係 ${tw} kg。`,
            ...(cur !== null && implied !== null ? [`你而家嘅目標 ${cur} kg，如果去脂體重唔變，體脂會係約 ${implied}%。`] : []),
            "磅報嘅「標準體重」只按 BMI 計，冇計肌肉，唔建議直接當目標。",
          ],
          patch: { target_weight_kg: tw },
        });
      }
    }
  }

  // 2) 體脂已經偏低 → 唔建議繼續減脂
  const veryLow = scan.body_fat_pct !== null && scan.body_fat_pct < (profile.sex === "male" ? 8 : 15);
  if (profile.goal === "lose" && (veryLow || (d.bmi !== null && d.bmi < 18.5)) && valid({ goal: "maintain" })) {
    out.push({
      id: "goal_maintain",
      title: "目標類型",
      current: GOAL_ZH[profile.goal],
      suggested: GOAL_ZH.maintain,
      facts: [`體脂率 ${scan.body_fat_pct ?? "—"}% 已經偏低，再減脂未必適合，建議先維持，並向醫生或註冊營養師查詢。`],
      patch: { goal: "maintain", target_weight_kg: null, weekly_rate_kg: null, pace: null, custom_kcal: null },
    });
  }

  // 3) BMI 偏高但體脂唔高 + 有重訓 → 體態重組更適合
  if (profile.goal === "lose" && band !== null && band !== "high" && d.bmi !== null && d.bmi >= 25 && trains) {
    out.push({
      id: "goal_recomp",
      title: "目標類型",
      current: GOAL_ZH.lose,
      suggested: GOAL_ZH.recomp,
      facts: [
        `BMI ${d.bmi}，但體脂率 ${scan.body_fat_pct}% 喺「${FAT_BAND_TEXT[band]}」；你每週有 ${profile.exercise_sessions_per_week} 次重訓。`,
        "BMI 唔分肌肉同脂肪，所以可能高估咗你需要減嘅分量。體態重組（輕微赤字＋高蛋白＋重訓）可能更啱。",
      ],
      patch: { goal: "recomp", target_weight_kg: null, weekly_rate_kg: null, pace: null, custom_kcal: null },
    });
  }

  // 4) 近排減重主要係去脂體重 → 放慢
  if (prev && profile.goal === "lose") {
    const ch = compareScans(prev, scan, profile.height_cm);
    if (ch.kind === "lean_loss" && profile.pace !== "gentle") {
      out.push({
        id: "pace_gentle",
        title: "減脂速度",
        current: profile.pace === "faster" ? "較進取" : profile.pace === "custom" ? "自訂" : "標準",
        suggested: "溫和",
        facts: [
          `對比 ${prev.measured_on}：體重 ${ch.dWeight} kg，其中去脂體重 ${ch.dLean} kg、脂肪 ${ch.dFat} kg（脂肪只佔約 ${Math.round((ch.fatShare ?? 0) * 100)}%）。`,
          "減得太快，身體會連肌肉一齊減。放慢少少，加返蛋白質同重訓，保住肌肉。",
          "磅嘅單次數字有誤差，建議再量一兩次確認。",
        ],
        patch: { pace: "gentle", custom_kcal: null, weekly_rate_kg: 0.25 },
      });
    }
  }
  return out;
}

// ───────────── 分析用嘅事實包（俾 AI 解釋；數字全部我哋計）─────────────

export interface BodyFacts {
  today: string;
  sex: Sex;
  age: number | null;
  goal: string;
  heightCm: number;
  scan: BodyScan & { fat_kg: number | null; lean_kg_used: number | null; bmi_calc: number | null };
  fatBand: string | null;
  bmiVsFat: string | null;
  scaleBmr: number | null;
  appBmr: number | null;
  katchBmr: number | null;
  change: ScanChange | null;
  prevDate: string | null;
  targetWeightFromFat: number | null;
  scanCount: number;
  suggestions: { id: SuggestionId; title: string; current: string; suggested: string }[];
}

export function buildFacts(a: {
  profile: Profile;
  scan: BodyScan;
  prev: BodyScan | null;
  today: string;
  scanCount: number;
  appBmr: number | null;
}): BodyFacts {
  const { profile, scan, prev, today } = a;
  const d = deriveScan(scan, profile.height_cm);
  const age = ageOf(profile, today);
  const band = scan.body_fat_pct !== null ? fatBand(profile.sex, scan.body_fat_pct, age) : null;
  const sugg = suggestSettings({ profile, scan, prev, today });
  let bmiVsFat: string | null = null;
  if (d.bmi !== null && band) {
    if (d.bmi >= 25 && band !== "high") bmiVsFat = "BMI 偏高，但體脂率唔高：BMI 可能高估咗脂肪";
    else if (d.bmi >= 25 && band === "high") bmiVsFat = "BMI 同體脂率都偏高";
    else if (d.bmi < 25 && band === "high") bmiVsFat = "BMI 正常，但體脂率偏高";
  }
  return {
    today,
    sex: profile.sex,
    age,
    goal: GOAL_ZH[profile.goal],
    heightCm: profile.height_cm,
    scan: { ...scan, fat_kg: d.fatKg, lean_kg_used: d.leanKg, bmi_calc: d.bmi },
    fatBand: band ? FAT_BAND_TEXT[band] : null,
    bmiVsFat,
    scaleBmr: scan.bmr_kcal,
    appBmr: a.appBmr,
    katchBmr: d.leanKg !== null ? katchMcArdleBmr(d.leanKg) : null,
    change: prev ? compareScans(prev, scan, profile.height_cm) : null,
    prevDate: prev?.measured_on ?? null,
    targetWeightFromFat: d.leanKg !== null ? weightAtFatPct(d.leanKg, TARGET_FAT_PCT[profile.sex]) : null,
    scanCount: a.scanCount,
    suggestions: sugg.map((s) => ({ id: s.id, title: s.title, current: s.current, suggested: s.suggested })),
  };
}
