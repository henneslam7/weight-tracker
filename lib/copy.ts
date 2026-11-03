// 所有文案集中喺呢度：陳伯同歡嬸兩個街坊嘅講嘢。
//
// 規則：
//  1. 可以 roast：藉口、拖延、做 show、買咗年卡唔去，同你同某啲食物嘅「孽緣」。
//  2. 唔鬧身形、體重、樣貌、年齡、性別。唔講健康恐嚇、罪惡感，唔叫人少食，亦唔講「食咗要補返」。
//  3. 敏感時刻（食得太少、減得太快、超標、返嚟）一律用溫柔語氣。
//  4. 安全限制、免責聲明用認真語氣，唔玩嘢（見 components/ui.ts DISCLAIMER）。
//  5. 用書面粵語：嘅、咗、唔、冇、喺、哋、啲、嘢、㗎、喎。唔用普通話字詞（scripts/test-cantonese.ts 會檢查）。

import type { Goal, MealType, Tone, Who } from "./types.ts";

export const APP_NAME = "食咗飯未";
export const APP_SHORT_NAME = "食咗飯未";
export const TAGLINE = "陳伯歡嬸日日睇住你，記低食咩先算數";
export const LOADING_TEXT = "陳伯同歡嬸出緊嚟…";

export const WHO_NAME: Record<Who, string> = { chan: "陳伯", foon: "歡嬸" };
export const WHO_AVATAR: Record<Who, string> = { chan: "/avatars/chan.png", foon: "/avatars/foon.png" };

export interface Line {
  who: Who;
  text: string;
}
const C = (text: string): Line => ({ who: "chan", text });
const F = (text: string): Line => ({ who: "foon", text });

/** 用種子揀一句，同一日同一種情況顯示一致 */
export function pick<T>(list: readonly T[], seed: string): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return list[h % list.length];
}

export function greeting(hour: number): string {
  return hour < 5 ? "夜深喇，仲未瞓？" : "食咗飯未呀？";
}

// ───────────── 情境對白 ─────────────

export type Kind =
  | "weight" | "breakfast" | "lunch" | "dinner" | "snack"
  | "move" | "rest" | "evening" | "inactive"
  | "allDone" | "stamp" | "goal"
  | "over" | "low" | "fast" | "welcomeBack";

type Lines = Partial<Record<Tone, Line[]>>;

/** 呢啲情境屬於「敏感時刻」，任何語氣強度都只用溫柔版 */
export const SENSITIVE_KINDS: readonly Kind[] = ["over", "low", "fast", "welcomeBack"];

const LINES: Record<Kind, Lines> = {
  weight: {
    soft: [F("早晨！得閒就上個磅啦，唔使急，記低就得。"), C("個磅等咗你一陣喇，得閒嚟打個招呼。")],
    neighbour: [
      F("個磅企咗成晚喇。隔離李太日日話減肥，連磅都唔敢上。你唔同㗎，快啲上！"),
      C("我同歡嬸賭咗十蚊，賭你今日會上磅。唔好令我輸。"),
    ],
    spicy: [
      F("又唔上磅？你同個磅拍咗拖定分咗手，講清楚。"),
      C("後生，數字唔會呃人。你避得一日，避唔到一世。上磅，記低先講。"),
    ],
  },
  breakfast: {
    soft: [F("早餐食咗未呀？食咗就記低，赤字先計得準。"), C("早餐記一記，慢慢嚟，唔使急。")],
    neighbour: [
      F("早餐食咗咩呀？飛砂走奶定咖啡？記低先，歡嬸先知點幫你計赤字。"),
      C("早餐都要記㗎。我當年朝朝食完都記低，所以先咁精神。"),
    ],
    spicy: [
      F("早餐食咗又唔記？你以為我睇唔到呀？歡嬸望一眼就知你食咗乜。"),
      C("朝早都瞓醒喇，仲唔記低？快啲，我等緊睇你今日有幾認真。"),
    ],
  },
  lunch: {
    soft: [F("午餐時間喇，食咗就記低，赤字先計得準。"), C("午餐慢慢食，食完記一記就得。")],
    neighbour: [
      F("午市套餐跟嘅奶茶都要記呀。你以為歡嬸睇唔到？"),
      C("午餐食咩呀？叉燒飯定沙律都好，記低先算數，守住赤字。"),
    ],
    spicy: [
      F("午餐跟餐嘅凍檸茶、多士、蛋撻，樣樣都要記，歡嬸望一眼就知你食咗乜。"),
      C("午餐記低未？我同歡嬸又賭咗十蚊喇，唔好令我輸。"),
    ],
  },
  dinner: {
    soft: [F("收工喇？晚餐食咗就記低，慢慢嚟。"), C("晚餐記一記，今日就差唔多完成喇。")],
    neighbour: [
      F("收工喇！晚餐食咩呀？甜品都要記，歡嬸望一眼就知。"),
      C("後生，晚餐食完唔記，聽日你自己都唔記得食過咩。"),
    ],
    spicy: [
      F("晚餐點咗咩呀？甜品、飲品、宵夜，統統報上嚟，歡嬸一樣一樣數。"),
      C("食咗又唔記？你呢種做法，同買咗年卡唔去嗰啲人冇分別。"),
    ],
  },
  snack: {
    soft: [F("有食小食就記一記，唔使有壓力。")],
    neighbour: [F("小食都要記呀，記得越齊，計得越準。")],
    spicy: [C("下午茶都食咗？記低佢，唔好當我哋冇睇到。")],
  },
  move: {
    soft: [C("今日郁一郁，或者休息一日都得。")],
    neighbour: [
      C("今日郁咗未？行下街市都算數。休息都得，我哋批准。"),
      F("唔好成日坐喺度，起身行兩步。"),
    ],
    spicy: [
      C("公園打太極嘅何伯，七十幾歲都出咗街。你呢？"),
      F("年卡買咗未去？今日行一轉，唔好學黃生。"),
    ],
  },
  rest: {
    soft: [C("休息都算數，印花照蓋。")],
    neighbour: [
      C("今日休息？批准。連做運動都要放假，你以為你係鐵人？"),
      F("休息都算數，印花照蓋。你話我哋偷懶？我哋冇講過。"),
    ],
  },
  evening: {
    soft: [F("夜晚喇，今日有啲未記，補返就得，唔使急。")],
    neighbour: [
      F("夜晚喇，今日仲有幾樣未記。補返先瞓，有記錄先計得準赤字。"),
      C("聽日聽日，聽日同今日有咩分別？記低佢先。"),
    ],
    spicy: [
      C("又「聽日先記」？我聽咗成個月。算啦，你而家仲開住個 app，仲有救，記低先。"),
      F("我同陳伯賭咗十蚊，賭你今晚瞓之前會記齊。唔好令我輸。"),
    ],
  },
  inactive: {
    soft: [F("好耐冇見喎，得閒飲茶呀？返嚟記一筆就得。")],
    neighbour: [
      F("失蹤人口返嚟喇？黃生都問起你。記一筆先講。"),
      C("成幾日冇見你，我同歡嬸都諗過報警。記一筆先，唔使解釋。"),
    ],
  },
  allDone: {
    soft: [C("今日三樣齊，多謝你，休息吓啦。")],
    neighbour: [
      C("今日三樣齊！我就話你得㗎。請你飲杯茶，記得走糖。"),
      F("做得好。歡嬸今日冇嘢挑剔，真係難得。"),
    ],
    spicy: [
      F("今日三樣齊？奇怪，我預備咗好多嘢想講，而家冇得講喇。"),
      C("算你啱。陳伯服你，今日。"),
    ],
  },
  stamp: {
    soft: [C("七個印花齊！你而家係我哋條街嘅熟客。"), F("集齊一張印花卡喇，請你飲茶（走糖）。")],
  },
  goal: {
    soft: [C("目標達成！我就話你得㗎。陳伯請你飲茶，記得走糖走冰。"), F("做到喇！歡嬸今日冇嘢可以講，真係第一次。")],
  },
  // ── 敏感時刻：只用溫柔 ──
  over: {
    soft: [F("今日食得開心喎。唔緊要，記低咗就得，聽日照常。"), C("邊個冇試過？記低咗就當冇事，聽日再嚟。")],
  },
  low: {
    soft: [F("今日食得有啲少喎。唔緊要，肚餓就食啲嘢先，記低咗就得。"), C("食好先至有力氣。有嘢食就記低，唔使諗太多。")],
  },
  fast: {
    soft: [F("近排跌得有啲快喎。食夠、瞓夠先係正經，有需要就同醫生或註冊營養師傾下。")],
  },
  welcomeBack: {
    soft: [F("返嚟就好喇，咩都唔使講。由今日開始記就得。"), C("歡迎返嚟，由今日再嚟過。")],
  },
};

/** 按語氣揀一句。冇對應語氣就退返街坊，再退返溫柔。敏感情境永遠用溫柔。 */
export function say(kind: Kind, tone: Tone, seed: string): Line {
  const t: Tone = SENSITIVE_KINDS.includes(kind) ? "soft" : tone;
  const set = LINES[kind][t] ?? LINES[kind].neighbour ?? LINES[kind].soft!;
  return pick(set, `${seed}:${kind}:${t}`);
}

export function allLines(): Line[] {
  return Object.values(LINES).flatMap((l) => Object.values(l).flat() as Line[]);
}

// ───────────── 提醒（通知）─────────────

export type ReminderKind = "weight" | MealType | "evening" | "inactive";

/** 通知用：揀一句 + 講嘢嘅人。inactive 最多用街坊級，唔會毒舌。 */
export function reminderLine(kind: ReminderKind, tone: Tone, seed: string): Line {
  const k: Kind = kind;
  const t: Tone = kind === "inactive" && tone === "spicy" ? "neighbour" : tone;
  return say(k, t, seed);
}

// ───────────── 今日街坊閒話 ─────────────

const GOSSIP: Line[] = [
  F("十八樓個後生話星期一開始，開始咗七個星期一。我唔識佢，但我肯定佢冇記錄。你唔好學佢呀。"),
  C("對面黃生買咗健身年卡，去咗兩次就消失。年卡冇罪，係人懶。你今日記咗未？"),
  F("李太日日話減肥，日日喺樓下同人傾偈傾兩個鐘。我話佢嘅減肥，淨係用嘴。你唔同，你有記錄。"),
  C("何伯朝朝喺公園打太極，落雨都照打。我同你講，肯持之以恆先係本事。"),
  F("隔離單位嗰位話下個月開始運動，已經話咗三個月。我都唔知佢個月曆係咪壞咗。"),
  C("我當年一日行成萬步。而家？行去街市都要坐低歇。所以我先要你好好保持。"),
  F("聽講樓下新搬嚟嗰個，用咗三日就開始教人點樣減肥。我話佢，先記滿七日再講。"),
  C("黃生話佢食咩都冇事。我話，你有冇記錄過呀？冇記錄嘅人，講嘅都係感覺。"),
  F("茶餐廳個阿姐同我講，成日有人話「聽日開始」。我話，聽日係最長嘅一日。"),
  C("我同歡嬸賭咗十蚊，賭你今日記得齊。輸咗我請飲茶，贏咗你要請。"),
  F("有人話記錄好煩。我話，打麻雀都肯記數，記低食咩有咩難？"),
  C("後生，記錄唔係為咗畀我哋睇，係為咗你自己。但係我哋會睇㗎。"),
  F("巴士站排隊嗰個話佢冇時間記錄。三十秒都冇？佢睇手機睇咗半粒鐘。"),
  C("新嚟嗰位阿 Sir 話佢好忙，所以冇時間運動。我見佢日日準時食下午茶。"),
];
export function gossipFor(date: string): Line {
  return pick(GOSSIP, date);
}
export function allGossip(): Line[] {
  return GOSSIP;
}

// ───────────── 體重 ─────────────

export const WEIGHT_NOT_LOGGED = {
  title: "今日未上磅",
  sub: "歡嬸問：個磅等緊你，幾時上？",
};
export const WEIGHT_EMPTY = "未有記錄。第一步最難，上個磅先。";
export const WEIGHT_NEED_MORE = "多記幾日體重，陳伯同歡嬸先睇得出你係咪認真。";

const SAVED_MESSAGES = [
  "記低咗，陳伯點咗下頭。",
  "已記錄，歡嬸今日冇嘢挑剔。",
  "搞掂！呢筆數，陳伯幫你記住。",
] as const;
export function savedMessage(seed: string): string {
  return pick(SAVED_MESSAGES, seed);
}

/** 每週趨勢（kg/週，負數 = 下降）對應嘅一句話 */
export function trendMessage(goal: Goal, trend: number | null): string {
  if (trend === null) return WEIGHT_NEED_MORE;
  if (goal === "lose" && trend < -1) return LINES.fast.soft![0].text;   // 減得太快：認真提醒
  if (goal === "lose") {
    if (trend <= -0.1) return "趨勢向下，陳伯話：有進步，繼續。";
    if (trend < 0.1) return "體重企穩，繼續保持習慣就得，唔使心急。";
    return "今個星期上咗少少，唔緊要，繼續記錄，唔好放棄。";
  }
  if (goal === "gain") {
    if (trend >= 0.1) return "肌肉儲緊，趨勢正確！";
    return "增肌要耐性：食夠、練夠、瞓夠。";
  }
  if (Math.abs(trend) <= 0.2) return "好穩定，繼續保持。";
  return "有少少浮動，留意飲食同作息就得。";
}

/** 距離目標 */
export function goalMessage(goal: Goal, weightKg: number, targetKg: number | null): string | null {
  if (targetKg === null || goal === "maintain") return null;
  const reached = goal === "lose" ? weightKg <= targetKg : weightKg >= targetKg;
  if (reached) return "目標達成！陳伯我就話你得㗎。";
  const dist = Math.round(Math.abs(weightKg - targetKg) * 10) / 10;
  return `距離目標仲有 ${dist} kg，陳伯同歡嬸睇住你。`;
}

// ───────────── 食物 ─────────────

export const FOOD_EMPTY = "今日未記錄食物。歡嬸問：食咗飯未呀？";

/** 今日攝取 vs 目標。超標只講事實同鼓勵，唔責備、唔叫人少食。 */
export function intakeMessage(eaten: number, target: number): string {
  if (eaten <= 0) return "未記錄任何食物";
  if (eaten <= target) return `仲有 ${Math.round(target - eaten)} kcal 可以食`;
  return `今日多咗 ${Math.round(eaten - target)} kcal，唔緊要，記低咗就得，聽日照常`;
}

export const AI_ESTIMATE_NOTE =
  "AI 估算，份量同 calories 可能有出入。請逐項檢查，改啱先儲存。";
export const PHOTO_NOTE =
  "相片只會傳送畀 Google Gemini 估算，唔會儲存喺你嘅 app 或 database。相片估份量誤差會較大，請逐項檢查。";
