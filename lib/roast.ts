// 食物 roast：陳伯同歡嬸對你食嘅嘢「毒舌」。
//
// 規則：
//  - 笑嘅係嗰碗嘢同你嗰一刻嘅衝動，唔係你嘅身形、體重、樣貌。
//  - 唔講健康恐嚇（食咗會病），唔講罪惡（壞嘢），唔叫人少食，唔講「食咗要補返」。
//  - 溫柔語氣、關咗食物 roast、敏感時刻（見 persona.ts）一律唔 roast。
//  - 只係針對「記錄之後／食之前」嘅一句話，唔會阻止你記低。

import { pick, type Line } from "./copy.ts";
import type { Tone } from "./types.ts";

export interface RoastItem {
  name: string;
  calories: number;
}

export interface RoastInput {
  items: readonly RoastItem[];
  /** 今日仲剩幾多 kcal（> 0 先會 roast；超標屬敏感時刻） */
  remainingKcal: number;
  tone: Tone;
  enabled: boolean;
  seed: string;
}

interface Rule {
  id: string;
  re: RegExp;
  neighbour: Line[];
  spicy: Line[];
}
const C = (text: string): Line => ({ who: "chan", text });
const F = (text: string): Line => ({ who: "foon", text });

export const RULES: readonly Rule[] = [
  {
    id: "milktea",
    re: /珍珠|奶茶|手搖|奶蓋|黑糖/,
    neighbour: [F("珍珠奶茶？杯嘢啲糖，歡嬸睇完都要定定神。記低先。")],
    spicy: [
      F("珍珠奶茶加布甸？你諗住食咗間糖水舖呀？"),
      C("又係手搖？你同間舖啲店員，熟過同我哋街坊。"),
      F("又手搖？你張八達通，係咪專門畀手搖舖交租？"),
    ],
  },
  {
    id: "fried",
    re: /炸|薯條|雞翼|雞髀/,
    neighbour: [C("又炸嘢？你個胃同你講過幾次喇。記低先。")],
    spicy: [
      F("又係炸雞？佢哋成日同你講「再嚟多件」，你就真係聽。你同佢哋咩關係，講出嚟聽下。"),
      C("炸雞配薯條？陳伯活咗幾十年，都冇咁有默契嘅組合。"),
      C("炸嘢食得咁有信心？你對佢哋嘅忠誠，用喺記錄上面幾好。"),
    ],
  },
  {
    id: "sweet",
    re: /蛋撻|蛋糕|甜品|雪糕|朱古力|班戟|布甸|糖水|甜甜圈/,
    neighbour: [F("甜品都有份？記低先，唔好當歡嬸冇睇到。")],
    spicy: [
      C("蛋糕配奶茶？你嘅甜品檔期，排得比我個行程仲密。"),
      F("又係甜品？你同甜品係咪簽咗長約？"),
      C("你同甜品嘅關係，比你同記錄嘅關係穩定好多。"),
    ],
  },
  {
    id: "instant",
    re: /出前一丁|即食麵|公仔麵|杯麵|午餐肉/,
    neighbour: [C("出前一丁？陳伯我當年都食，但係我而家識記錄。")],
    spicy: [
      C("出前一丁加午餐肉加蛋？陳伯活咗幾十年，都冇咁有創意。"),
      F("宵夜即食麵？你個廚房係咪淨係得個滾水壺？"),
      C("宵夜食即食麵，陳伯當年都試過，但係我冇你咁理直氣壯。"),
    ],
  },
  {
    id: "bbq",
    re: /燒烤|串燒|BBQ|燒肉/i,
    neighbour: [F("燒烤呀？有排場喎。記低先，我哋睇下點安排。")],
    spicy: [
      C("夜晚燒烤？黃生都冇你咁有勇氣。"),
      F("燒烤檔個老闆，係咪識你個名㗎喇？"),
      C("燒烤？你班朋友揀你做總指揮，係咪因為你最識食？"),
    ],
  },
  {
    id: "soda",
    re: /汽水|可樂|雪碧|七喜|果汁/,
    neighbour: [C("汽水呀？飲得開心，記低咗先。")],
    spicy: [
      F("汽水當水飲？水費都唔洗再交。"),
      C("可樂配炸雞，你係咪睇完個廣告就即刻照做？"),
      F("汽水大過水？你同水有啲誤會，要搵人調解。"),
    ],
  },
  {
    id: "fastfood",
    re: /漢堡|薄餅|pizza|麥當勞|快餐/i,
    neighbour: [F("快餐呀？方便嘛，我明。記低先。")],
    spicy: [
      C("又快餐？個外賣員識你嘅地址，過你自己屋企人。"),
      F("薄餅叫咗兩個？你係咪預咗朋友嚟，定係預咗自己？"),
      F("快餐叫埋 set？你個外賣 app 嘅「常用」欄，大概淨返你一個人。"),
    ],
  },
];

export const GENERIC = {
  neighbour: [C("呢餐 {kcal} 卡，今日仲剩 {rem}。記低先，我哋睇下點安排。")],
  spicy: [
    F("呢餐 {kcal} 卡？你今日嘅預算，你當自助餐用呀？"),
    C("{kcal} 卡一餐，今日仲剩 {rem}。你係咪以為個預算係無底洞？"),
    F("{kcal} 卡？你今日個預算，你係咪當成利是封，一次過派晒？"),
  ],
};

/** 一餐「大」到值得講一句：單項 ≥ 700，或者成餐 ≥ 剩餘一半 */
export function isBigMeal(totalKcal: number, maxItemKcal: number, remainingKcal: number): boolean {
  return maxItemKcal >= 700 || (remainingKcal > 0 && totalKcal >= remainingKcal * 0.5);
}

function fill(l: Line, kcal: number, rem: number): Line {
  return { who: l.who, text: l.text.replace("{kcal}", String(Math.round(kcal))).replace("{rem}", String(Math.round(rem))) };
}

export interface RoastResult {
  line: Line;
  /** 撞中邊條規則（generic = 只係因為大餐） */
  rule: string;
}

/** 回傳 null = 唔 roast */
export function foodRoast(input: RoastInput): RoastResult | null {
  const { items, remainingKcal, tone, enabled, seed } = input;
  if (!enabled || tone === "soft" || items.length === 0 || remainingKcal <= 0) return null;
  const names = items.map((i) => i.name).join(" ");
  const total = items.reduce((s, i) => s + i.calories, 0);
  const maxItem = Math.max(...items.map((i) => i.calories));
  const key: "neighbour" | "spicy" = tone === "spicy" ? "spicy" : "neighbour";

  const rule = RULES.find((r) => r.re.test(names));
  if (rule) return { line: fill(pick(rule[key], `${seed}:${rule.id}`), total, remainingKcal), rule: rule.id };
  if (isBigMeal(total, maxItem, remainingKcal)) {
    return { line: fill(pick(GENERIC[key], `${seed}:generic`), total, remainingKcal), rule: "generic" };
  }
  return null;
}
