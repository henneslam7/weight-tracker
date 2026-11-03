// AI 單一入口。日後換 model / provider，只改 lib/ai/ 入面。
import { callGemini, readConfig, type GeminiConfig } from "./gemini.ts";
import type { EstimateInput } from "./image.ts";
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

export const MAX_INPUT_CHARS = 300;

export async function estimateFood(
  input: string | EstimateInput,
  cfg: GeminiConfig = readConfig(),
): Promise<FoodItem[]> {
  return parseEstimate(await callGemini(cfg, input));
}
