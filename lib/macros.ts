// 三大營養素分配。P×4 + C×4 + F×9 必須等於（或幾乎等於）目標熱量，誤差 ≤ MACRO_TOLERANCE_KCAL。

export const MACRO_TOLERANCE_KCAL = 10;
/** 碳水低過呢個就先調整蛋白質／脂肪（產品預設，待營養專業審核） */
export const MIN_CARB_G = 100;
export const MIN_FAT_G = 30;

export const macroKcal = (proteinG: number, carbG: number, fatG: number) => 4 * proteinG + 4 * carbG + 9 * fatG;

export interface MacroInput {
  /** 目標熱量（已取整） */
  targetKcal: number;
  /** 計蛋白質用嘅體重（現時／目標），由 caller 決定同記錄 */
  basisWeightKg: number;
  proteinPerKg: number;
  /** 蛋白質下限（碳水不足而要調整時，最少留到呢個） */
  minProteinPerKg: number;
  fatRatio: number;
}

export interface MacroResult {
  proteinG: number;
  fatG: number;
  carbsG: number;
  /** 實際用咗幾多 g/kg */
  proteinPerKg: number;
  /** 三大營養素換算總熱量 */
  kcal: number;
  notes: string[];
  /** false = 熱量太少，配唔到合理組合（caller 應該擋住） */
  ok: boolean;
}

export function allocateMacros(i: MacroInput): MacroResult {
  const notes: string[] = [];
  const t = Math.round(i.targetKcal);
  const w = i.basisWeightKg;
  let p = Math.round(i.proteinPerKg * w);
  let f = Math.round((t * i.fatRatio) / 9);
  const minP = Math.round(i.minProteinPerKg * w);
  const minF = Math.max(MIN_FAT_G, Math.round(0.5 * w));

  const carbs = () => (t - 4 * p - 9 * f) / 4;

  // 碳水太少：先減蛋白質（最少留到下限），再減脂肪（最少留到下限）
  if (carbs() < MIN_CARB_G && p > minP) {
    const need = Math.ceil((MIN_CARB_G - carbs()) * 4 / 4);        // 每減 1 g 蛋白質，碳水可以加 1 g
    p = Math.max(minP, p - need);
    notes.push("碳水偏低，已調整蛋白質目標（仍然唔低過建議下限）。");
  }
  if (carbs() < MIN_CARB_G && f > minF) {
    const need = Math.ceil(((MIN_CARB_G - carbs()) * 4) / 9);
    f = Math.max(minF, f - need);
    notes.push("碳水仍然偏低，已調整脂肪目標（仍然唔低過下限）。");
  }
  if (carbs() < 0) {
    return { proteinG: p, fatG: f, carbsG: 0, proteinPerKg: p / w, kcal: macroKcal(p, 0, f), notes: [...notes, "目標熱量太低，配唔到合理嘅營養素組合。"], ok: false };
  }

  const c = Math.round(carbs());
  return { proteinG: p, fatG: f, carbsG: c, proteinPerKg: Math.round((p / w) * 100) / 100, kcal: macroKcal(p, c, f), notes, ok: true };
}

/**
 * 檢查一組宏量係咪合理（任何入口：手動編輯、API、匯入都應該用）。
 * 回傳錯誤訊息；null = 通過。
 */
export function checkMacros(i: { targetKcal: number; proteinG: number; carbsG: number; fatG: number }): string | null {
  const { targetKcal: t, proteinG: p, carbsG: c, fatG: f } = i;
  if (![t, p, c, f].every((n) => Number.isFinite(n))) return "營養素數字唔正確。";
  if (p < 0 || c < 0 || f < 0) return "營養素唔可以係負數。";
  if (4 * p + 9 * f > t + MACRO_TOLERANCE_KCAL) return "蛋白質加脂肪已經超過目標熱量，配置唔可能成立。";
  const diff = macroKcal(p, c, f) - t;
  if (Math.abs(diff) > MACRO_TOLERANCE_KCAL) return `三大營養素加埋同目標熱量差 ${Math.round(diff)} kcal（容許 ±${MACRO_TOLERANCE_KCAL}）。`;
  return null;
}

export type Macro = "protein" | "carbs" | "fat";

/**
 * 用戶鎖定某啲營養素（克數）之後，用未鎖嘅嚟配平總熱量（需求 §4.4）。
 * 鎖咗全部 3 項、或者配唔平（要負數）→ ok = false，並講明原因；唔會暗中改動已鎖定嘅克數。
 * 配平用嘅營養素：只剩 1 項未鎖 → 由佢吸收；剩 2 項 → 脂肪保持原樣，碳水吸收。
 */
export function rebalanceMacros(i: {
  targetKcal: number;
  protein: number;
  carbs: number;
  fat: number;
  locked: readonly Macro[];
}): { ok: boolean; protein: number; carbs: number; fat: number; kcal: number; reason: string | null } {
  const t = Math.round(i.targetKcal);
  let { protein: p, carbs: c, fat: f } = i;
  const free = (["protein", "carbs", "fat"] as const).filter((m) => !i.locked.includes(m));
  const fail = (reason: string) => ({ ok: false, protein: p, carbs: c, fat: f, kcal: macroKcal(p, c, f), reason });
  if (free.length === 0) {
    const err = checkMacros({ targetKcal: t, proteinG: p, carbsG: c, fatG: f });
    return err ? fail(`三項都鎖定咗，但${err}`) : { ok: true, protein: p, carbs: c, fat: f, kcal: macroKcal(p, c, f), reason: null };
  }
  const absorb = free.includes("carbs") ? "carbs" : free[0];
  if (absorb === "carbs") c = (t - 4 * p - 9 * f) / 4;
  else if (absorb === "protein") p = (t - 4 * c - 9 * f) / 4;
  else f = (t - 4 * p - 4 * c) / 9;
  const v = absorb === "carbs" ? c : absorb === "protein" ? p : f;
  if (v < 0) {
    return fail("你鎖定嘅營養素已經超過目標熱量，配唔平。請減少鎖定嘅克數，或者提高目標熱量。");
  }
  p = Math.round(p); c = Math.round(c); f = Math.round(f);
  return { ok: true, protein: p, carbs: c, fat: f, kcal: macroKcal(p, c, f), reason: null };
}
