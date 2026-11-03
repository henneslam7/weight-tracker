import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 只限 server（cron）用。SUPABASE_SERVICE_ROLE_KEY 即係 Supabase 嘅 Secret key，
 * 會繞過 RLS。永遠唔可以有 NEXT_PUBLIC_ 前綴，亦唔可以出現喺前端 code。
 */
export function createAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("缺少 SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
