// VAPID 公開 key 嘅清理、驗證同轉換。瀏覽器同 server 共用。
//
// 公開 key = 65 bytes（P-256 未壓縮點，第一個 byte 係 0x04），用 base64url 表示 = 87 個字元。
// Vercel 環境變數常見問題：貼上時帶咗尾部空格／換行／引號，令 atob() 報「The string contains invalid characters」。

export const VAPID_PUBLIC_LENGTH = 87;

/** 去走空白、前後引號、結尾 =，將 + / 轉做 URL-safe 嘅 - _ */
export function cleanVapidKey(raw: string): string {
  return raw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, "")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/** 有問題就回傳講明邊度唔啱嘅訊息；冇問題回傳 null */
export function vapidKeyProblem(raw: string | undefined): string | null {
  if (!raw || !raw.trim()) return "未設定 NEXT_PUBLIC_VAPID_PUBLIC_KEY。";
  const k = cleanVapidKey(raw);
  const bad = k.match(/[^A-Za-z0-9_-]/);
  if (bad) {
    return `VAPID 公開 key 入面有唔合法字元「${bad[0]}」。請喺 Vercel 重新複製貼上（唔好有空格、引號或者中文字），然後 Redeploy。`;
  }
  if (k.length !== VAPID_PUBLIC_LENGTH) {
    return `VAPID 公開 key 長度唔啱：收到 ${k.length} 個字元，應該係 ${VAPID_PUBLIC_LENGTH} 個。可能貼少咗或者貼多咗，請重新複製成串。`;
  }
  const bytes = vapidKeyToBytes(raw);
  if (bytes.length !== 65 || bytes[0] !== 4) {
    return "VAPID 公開 key 唔係有效嘅 P-256 公開 key（解碼後應該係 65 bytes，頭一個 byte 係 4）。請用 `npx web-push generate-vapid-keys` 生成嘅 Public Key。";
  }
  return null;
}

/** base64url → bytes（先清理） */
export function vapidKeyToBytes(raw: string): Uint8Array<ArrayBuffer> {
  const k = cleanVapidKey(raw);
  const std = k.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (k.length % 4)) % 4);
  const bin = atob(std);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
