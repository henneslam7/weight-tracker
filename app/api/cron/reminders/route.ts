import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { nowInZone } from "@/lib/date";
import { DEFAULT_SETTINGS, decideReminders, type ReminderSettings } from "@/lib/reminders";
import { createAdmin } from "@/lib/server/admin";
import { sendPush } from "@/lib/server/push";
import type { MealType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const m = /^Bearer (.+)$/i.exec(req.headers.get("authorization") ?? "");
  if (!m) return false;
  const a = createHash("sha256").update(m[1]).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

async function run(req: Request) {
  if (!authorized(req)) return json({ error: "unauthorized" }, 401);

  const admin = createAdmin();
  const { date, time } = nowInZone();

  const { data: rows, error } = await admin.from("reminder_settings").select("*");
  if (error) return json({ error: "server" }, 500);

  let sent = 0;
  let skipped = 0;

  for (const row of rows ?? []) {
    const userId = row.user_id as string;
    const settings: ReminderSettings = { ...DEFAULT_SETTINGS };
    for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof ReminderSettings)[]) {
      if (row[k] !== undefined && row[k] !== null) {
        (settings[k] as unknown) =
          typeof DEFAULT_SETTINGS[k] === "string" ? String(row[k]).slice(0, 5) : row[k];
      }
    }

    const [subsR, weightR, foodR, lastWR, lastFR, sentR] = await Promise.all([
      admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId),
      admin.from("weight_logs").select("id").eq("user_id", userId).eq("logged_on", date).limit(1),
      admin.from("food_logs").select("meal_type").eq("user_id", userId).eq("logged_on", date),
      admin.from("weight_logs").select("logged_on").eq("user_id", userId)
        .order("logged_on", { ascending: false }).limit(1),
      admin.from("food_logs").select("logged_on").eq("user_id", userId)
        .order("logged_on", { ascending: false }).limit(1),
      admin.from("reminder_log").select("kind").eq("user_id", userId).eq("sent_on", date),
    ]);

    const subs = subsR.data ?? [];
    if (subs.length === 0) {
      skipped++;
      continue;
    }

    const lastDates = [lastWR.data?.[0]?.logged_on, lastFR.data?.[0]?.logged_on].filter(
      (d): d is string => typeof d === "string",
    );
    const lastLogDate = lastDates.length ? lastDates.sort().at(-1)! : null;

    const due = decideReminders({
      nowDate: date,
      nowTime: time,
      settings,
      weightLoggedToday: (weightR.data?.length ?? 0) > 0,
      mealsLoggedToday: new Set((foodR.data ?? []).map((f) => f.meal_type as MealType)),
      lastLogDate,
      sentToday: new Set((sentR.data ?? []).map((r) => r.kind as string)),
    });

    for (const d of due) {
      // 先「佔位」再發送：unique(user_id, kind, sent_on) 防止同時兩次 cron 重複發
      const claim = await admin
        .from("reminder_log")
        .upsert({ user_id: userId, kind: d.kind, sent_on: date }, {
          onConflict: "user_id,kind,sent_on",
          ignoreDuplicates: true,
        })
        .select("id");
      if (claim.error || !claim.data || claim.data.length === 0) continue;

      let ok = 0;
      let failed = 0;
      for (const s of subs) {
        const r = await sendPush(s, { title: d.title, body: d.body, url: d.url, tag: d.kind });
        if (r === "ok") ok++;
        else if (r === "gone") await admin.from("push_subscriptions").delete().eq("id", s.id);
        else failed++;
      }
      if (ok > 0) sent++;
      else if (failed > 0) {
        // 全部暫時失敗：放返個位，下一輪（window 內）再試
        await admin.from("reminder_log").delete().eq("id", claim.data[0].id);
      }
    }
  }

  return json({ ok: true, date, time, users: rows?.length ?? 0, sent, skipped });
}

export async function POST(req: Request) {
  try {
    return await run(req);
  } catch {
    console.error("[cron] failed");
    return json({ error: "server" }, 500);
  }
}

export async function GET(req: Request) {
  return POST(req);
}
