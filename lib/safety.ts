// 文字安全同用字檢查。固定句子同 Gemini 即興 roast 都用同一套。
//
// AI 輸出唔可以盲信：Gemini 寫完之後先過呢度，唔合格就退返用固定句子。
// 注意：呢個係篩查（blocklist），唔係完美過濾，所以仲有「敏感時刻唔 roast」同「可以自己關」兩層保護。

/** 唔鬧身形、唔健康恐嚇、唔罪惡、唔叫人少食、唔補償 */
export const UNSAFE_RE =
  /肥|胖|瘦|醜|會死|會病|傷身|癌|罪惡|壞嘢|垃圾食物|補償|懲罰|少食|唔好食|唔准食|食咗要|要補返|運動補|餓|斷食|戒口/;

/** 粗口、人身攻擊 */
export const VULGAR_RE = /仆街|廢物|白痴|智障|蠢|笨|戇鳩|撚|屌|柒|他媽|媽的|死/;

/** 普通話常用、粵語書面唔用 */
export const MANDARIN = ["的", "這", "那", "沒", "們", "他", "她", "吧", "嗎", "了", "是", "還", "給", "很", "不", "什麼", "怎麼", "為什麼", "裡", "啥", "咱", "俺", "咋"];

/** 查唔到可靠出處或者唔夠自然（已避開）。「走甜」你話 OK，已經唔喺度。 */
export const UNVERIFIED = ["波波", "搭住心口", "眼尾掃到", "刀仔嘴", "被冷落"];

/** 含「是」「不」等字但係正宗粵語嘅詞，先剔走再檢查 */
export const ALLOWED_WORDS = ["利是", "是但", "唔係幾"];

/** 呢啲句子入面有「餓」等字，但係意思係鼓勵食嘢，唔算違規 */
const SAFE_PHRASES = ["減肥", "肚餓就食啲嘢先"];

function strip(text: string, words: readonly string[]): string {
  return words.reduce((acc, w) => acc.replaceAll(w, ""), text);
}

/** 返回違規嘅用字（普通話字詞、未證實用字） */
export function cantoneseOffenders(text: string): string[] {
  const t = strip(text, ALLOWED_WORDS);
  return [...MANDARIN, ...UNVERIFIED].filter((w) => t.includes(w));
}

/** 內容安全：冇身形／健康恐嚇／罪惡／補償／粗口 */
export function isSafeText(text: string): boolean {
  const t = strip(text, SAFE_PHRASES);
  return !UNSAFE_RE.test(t) && !VULGAR_RE.test(t);
}

export const ROAST_MIN = 6;
export const ROAST_MAX = 90;

/** Gemini 即興 roast 嘅最終檢查 */
export function isSafeRoast(text: string): boolean {
  const t = text.trim();
  if (t.length < ROAST_MIN || t.length > ROAST_MAX) return false;
  if (/[\n\r{}<>@]|https?:|www\./i.test(t)) return false;   // 唔准換行、模板殘留、連結
  if (!isSafeText(t)) return false;
  return cantoneseOffenders(t).length === 0;
}
