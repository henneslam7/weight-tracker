import { getSupabase } from "./supabase.ts";

/** 帶住登入 token 呼叫自己嘅 API route（server 會驗證，RLS 先會生效） */
export async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(path, { ...init, headers });
}
