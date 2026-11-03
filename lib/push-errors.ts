// 推送流程嘅錯誤處理：轉做人話、加 timeout。瀏覽器同測試共用。

/** 將錯誤轉做人話（唔好直接掟英文，亦唔好顯示 [object Object]） */
export function friendlyPushError(e: unknown): string {
  let name = "";
  let msg = "";
  let code = "";
  if (e instanceof Error) {
    name = e.name;
    msg = e.message;
  } else if (e && typeof e === "object") {
    const o = e as { name?: unknown; message?: unknown; code?: unknown };   // Supabase 嘅錯誤係 plain object
    name = String(o.name ?? "");
    msg = String(o.message ?? "");
    code = String(o.code ?? "");
  } else {
    msg = String(e ?? "");
  }
  if (name === "InvalidCharacterError" || /invalid characters?|not correctly encoded/i.test(msg)) {
    return "推送金鑰（VAPID）格式有問題，瀏覽器解碼唔到。請檢查 Vercel 嘅 NEXT_PUBLIC_VAPID_PUBLIC_KEY 有冇多咗空格、引號或者換行，重新貼上再 Redeploy。";
  }
  if (name === "NotAllowedError") return "未獲得通知權限。請喺 iPhone 設定 → 通知 → 食咗飯未 開啟。";
  if (name === "TimeoutError") return `${msg}。請確認係由主畫面開 app（iOS 16.4 或以上），然後再撳一次。`;
  if (name === "AbortError" || name === "InvalidStateError") return "推送服務暫時連唔到，請稍後再試，或者重新由主畫面開啟 app。";
  if (code === "PGRST205" || code === "42P01" || /push_subscriptions/.test(msg)) {
    return "未建立推送訂閱表，請先喺 Supabase 執行 schema_phase2.sql，然後再試。";
  }
  if (code === "42501" || /row-level security/i.test(msg)) return "冇權限儲存訂閱，請登出再登入後再試。";
  return msg || "開啟通知失敗";
}

export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(Object.assign(new Error(label), { name: "TimeoutError" })), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (err) => { clearTimeout(t); reject(err); },
    );
  });
}
