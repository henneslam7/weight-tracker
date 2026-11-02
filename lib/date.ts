// 日期一律用本地日期 YYYY-MM-DD。
// 唔用 toISOString()：佢轉 UTC，香港凌晨會差一日。

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function toDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toUtcMs(s: string): number {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** b - a，單位：日（用 UTC 計，避開夏令時間影響） */
export function diffDays(a: string, b: string): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / 86_400_000);
}

export function addDays(s: string, n: number): string {
  const [y, m, d] = s.split("-").map(Number);
  return toDateStr(new Date(y, m - 1, d + n));
}

export function isValidDateStr(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** 顯示用，例如 11月2日 */
export function formatShort(s: string): string {
  const [, m, d] = s.split("-").map(Number);
  return `${m}月${d}日`;
}
