// AI 單一入口。日後換 model / provider，只改 lib/ai/ 入面。
import { buildRequestBody, callGemini, generateJson, readConfig, type GeminiConfig } from "./gemini.ts";
import type { EstimateInput } from "./image.ts";
import { parseRoast, type RoastOutcome, type RoastRequest } from "./roastai.ts";
import { parseEstimate, type FoodItem } from "./schema.ts";

export { AiError } from "./errors.ts";
export {
  canSuggest,
  MAX_PREF_CHARS,
  mealMaxKcal,
  noSuggestNote,
  suggestMeals,
  type MealSuggestion,
  type SuggestMode,
} from "./suggest.ts";
export type { FoodItem } from "./schema.ts";
export { validateImage, MAX_IMAGE_BYTES, type EstimateInput, type ImageInput } from "./image.ts";

export type { RoastOutcome, RoastRequest } from "./roastai.ts";

export const MAX_INPUT_CHARS = 300;

export async function estimateFood(
  input: string | EstimateInput,
  cfg: GeminiConfig = readConfig(),
): Promise<FoodItem[]> {
  return parseEstimate(await callGemini(cfg, input));
}

/** 食物估算 + 即興 roast（同一次 call，唔多食額度）。冇食物就唔 roast。 */
export async function estimateFoodWithRoast(
  input: string | EstimateInput,
  roast: RoastRequest,
  cfg: GeminiConfig = readConfig(),
  fetchImpl: typeof fetch = fetch,
): Promise<{ items: FoodItem[]; roast: RoastOutcome }> {
  const raw = await generateJson(cfg, buildRequestBody(input, roast), fetchImpl);
  const items = parseEstimate(raw);
  return { items, roast: items.length === 0 ? { state: "none" } : parseRoast(raw) };
}
