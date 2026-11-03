import { AiError } from "./errors.ts";

export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
/** 解碼後最大大細。前端會先壓縮，正常細過 500KB。 */
export const MAX_IMAGE_BYTES = 1_500_000;

export interface ImageInput {
  mimeType: string;
  /** base64，唔包 data: 前綴 */
  data: string;
}

export interface EstimateInput {
  text: string;
  image?: ImageInput;
}

function matchesMagic(mime: string, b: Uint8Array): boolean {
  if (mime === "image/jpeg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (mime === "image/png") {
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v);
  }
  if (mime === "image/webp") {
    const tag = (o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
    return b.length > 12 && tag(0) === "RIFF" && tag(8) === "WEBP";
  }
  return false;
}

/**
 * 驗證 client 傳上嚟嘅相片：格式白名單、大細上限、檔頭同宣稱嘅 mime 相符。
 * 唔合格 throw AiError("image")。
 */
export function validateImage(img: unknown): ImageInput {
  const bad = () => new AiError("image", "相片格式或大細唔啱");
  if (typeof img !== "object" || img === null) throw bad();
  const { mimeType, data } = img as Record<string, unknown>;
  if (typeof mimeType !== "string" || typeof data !== "string") throw bad();
  if (!(ALLOWED_MIME as readonly string[]).includes(mimeType)) throw bad();
  // base64 長度上限（4/3 倍）先擋，避免解碼超大字串
  if (data.length === 0 || data.length > Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 8) throw bad();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw bad();
  const bytes = Buffer.from(data, "base64");
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) throw bad();
  if (!matchesMagic(mimeType, bytes)) throw bad();
  return { mimeType, data };
}
