import webpush from "web-push";

let configured = false;

function configure() {
  if (configured) return;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !subject) throw new Error("缺少 VAPID 環境變數");
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
}

export interface PushSub {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

/** ok = 成功；gone = 訂閱已失效（要刪走）；error = 暫時失敗 */
export type SendResult = "ok" | "gone" | "error";

export async function sendPush(sub: PushSub, payload: PushPayload): Promise<SendResult> {
  configure();
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 3600 },
    );
    return "ok";
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    if (code === 404 || code === 410) return "gone";
    console.error(`[push] send failed ${code ?? ""}`);
    return "error";
  }
}
