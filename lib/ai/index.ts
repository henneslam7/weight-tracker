// AI 單一入口。日後換 model / provider，只改 lib/ai/ 入面。
import { callGemini, readConfig, type GeminiConfig } from "./gemini.ts";
import { parseEstimate, type FoodItem } from "./schema.ts";

export { AiError } from "./errors.ts";
export type { FoodItem } from "./schema.ts";

export const MAX_INPUT_CHARS = 300;

export async function estimateFood(
  text: string,
  cfg: GeminiConfig = readConfig(),
): Promise<FoodItem[]> {
  return parseEstimate(await callGemini(cfg, text));
}
