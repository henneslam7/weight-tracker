import { NextResponse } from "next/server";
import { APP_NAME } from "@/lib/copy";
import { authenticate } from "@/lib/server/auth";
import { sendPush } from "@/lib/server/push";

export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** 發一個測試通知俾已登入用戶自己嘅所有裝置 */
export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth) return json({ error: "unauthorized", message: "請重新登入" }, 401);

  // 用用戶 token 讀，RLS 保證只讀到自己嘅訂閱
  const { data: subs, error } = await auth.supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth");
  if (error) return json({ error: "server", message: "讀取訂閱失敗" }, 500);
  if (!subs || subs.length === 0) {
    return json({ error: "no_subscription", message: "未有已訂閱嘅裝置，請先開啟通知" }, 404);
  }

  let sent = 0;
  let failed = 0;
  try {
    for (const s of subs) {
      const r = await sendPush(s, {
        title: APP_NAME,
        body: "測試成功！以後陳伯同歡嬸會喺度提醒你記低食咩。",
        url: "/",
        tag: "test",
      });
      if (r === "ok") sent++;
      else {
        failed++;
        if (r === "gone") await auth.supabase.from("push_subscriptions").delete().eq("id", s.id);
      }
    }
  } catch {
    return json({ error: "config", message: "推送未設定好（VAPID 環境變數）" }, 503);
  }
  return json({ sent, failed });
}
