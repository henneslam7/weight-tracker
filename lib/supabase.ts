import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Phase 1：純 client-side，session 存 localStorage。資料靠 RLS 保護。
// 只用 anon key。永遠唔好喺前端用 service_role key。

let client: SupabaseClient | null = null;

/** 延遲建立，build / prerender 期間唔會因為冇 env 而爆。 */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "缺少 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY，請檢查 .env.local。",
    );
  }
  client = createClient(url, key);
  return client;
}
