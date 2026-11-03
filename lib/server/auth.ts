import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export interface AuthContext {
  /** 用用戶 token 建立，RLS 會生效 */
  supabase: SupabaseClient;
  user: User;
}

/** 驗證 Authorization: Bearer <access_token>。驗證唔到回傳 null（route 回 401）。 */
export async function authenticate(req: Request): Promise<AuthContext | null> {
  const match = /^Bearer (.+)$/i.exec(req.headers.get("authorization") ?? "");
  if (!match) return null;
  const token = match[1];

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { supabase, user: data.user };
}
