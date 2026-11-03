// 食物 roast：叫 Gemini 即興寫，喺食物估算嗰次 call 順便攞（唔多食額度）。
// 輸出一定要過 lib/safety.ts；唔合格就退返用固定句子（lib/roast.ts）。

import { isSafeRoast } from "../safety.ts";
import type { Who } from "../types.ts";

export interface RoastRequest {
  tone: "neighbour" | "spicy";
  /** 今日仲剩幾多 kcal */
  remainingKcal: number;
}

export type RoastOutcome =
  | { state: "ai"; who: Who; text: string }
  | { state: "none" }       // Gemini 話呢餐冇乜好 roast
  | { state: "fallback" };  // 冇回傳或者唔安全 → 用固定句子

const TONE_DESC: Record<RoastRequest["tone"], string> = {
  neighbour: "街坊級：嘴賤但友善，輕輕笑一笑就夠。",
  spicy: "毒舌級：好直接、好毒、好搞笑，越誇張越好，但一定要守住下面嘅規則。",
};

export function roastPrompt(req: RoastRequest): string {
  return `

另外，請以香港街坊「陳伯」或「歡嬸」嘅口吻（你揀一個，roast_who 填 chan 或 foon），用地道廣東話寫一句 roast，笑用戶嗰餐食物同佢嗰一刻嘅衝動。
語氣強度：${TONE_DESC[req.tone]}
規則：
1. 只針對食物、份量同衝動。唔好評論用戶嘅身形、體重、樣貌、年齡、性別、健康。
2. 唔好講健康恐嚇（會病、會死、傷身體），唔好用「罪惡」「壞嘢」「垃圾食物」，唔好叫用戶少食或者唔食，亦唔好講要用運動補返。
3. 唔好粗口，唔好人身攻擊。笑嘅係嗰碗嘢同嗰種衝動。
4. 用書面粵語（嘅、咗、唔、冇、喺、哋、嘢、㗎、喎），唔好用普通話字詞。
5. 最多 50 字，一句或兩句，要好笑、有創意、似街坊講嘢。可以引用你估算嘅卡路里；用戶今日仲剩 ${Math.max(0, Math.round(req.remainingKcal))} 卡。
6. 如果呢餐清淡、健康或者冇乜好笑，roast 回傳空字串。
風格例子（只係風格參考，唔好照抄）：
- 珍珠奶茶加布甸？你諗住食咗間糖水舖呀？
- 汽水當水飲？水費都唔洗再交。
- 又係炸雞？佢哋成日同你講「再嚟多件」，你就真係聽。
- 出前一丁加午餐肉加蛋？陳伯活咗幾十年，都冇咁有創意。
- 你同甜品嘅關係，比你同記錄嘅關係穩定好多。`;
}

/** 食物估算 schema 加上 roast 兩個欄位 */
export function withRoastSchema<S extends { properties: Record<string, unknown>; required: readonly string[] }>(schema: S) {
  return {
    ...schema,
    properties: {
      ...schema.properties,
      roast_who: { type: "STRING", enum: ["chan", "foon"] },
      roast: { type: "STRING" },
    },
    required: [...schema.required, "roast_who", "roast"],
  };
}

/** 驗證 model 回傳嘅 roast。缺少或唔安全 → fallback（用固定句子）；空字串 → none */
export function parseRoast(raw: unknown): RoastOutcome {
  if (typeof raw !== "object" || raw === null) return { state: "fallback" };
  const { roast, roast_who } = raw as { roast?: unknown; roast_who?: unknown };
  if (typeof roast !== "string") return { state: "fallback" };
  const text = roast.trim();
  if (!text) return { state: "none" };
  if (!isSafeRoast(text)) return { state: "fallback" };
  return { state: "ai", who: roast_who === "foon" ? "foon" : "chan", text };
}
