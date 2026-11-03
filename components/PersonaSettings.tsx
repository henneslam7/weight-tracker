"use client";

import { useState } from "react";
import { say } from "@/lib/copy";
import { isSenior } from "@/lib/calc";
import { getSupabase } from "@/lib/supabase";
import type { Tone, UserPrefs } from "@/lib/types";
import { Say } from "./Persona";
import { btnPrimary, card, errorBox, infoBox } from "./ui";

interface Props {
  userId: string;
  prefs: UserPrefs;
  age: number | null;
  onSaved: (p: UserPrefs) => void;
}

const TONES: { id: Tone; name: string; desc: string }[] = [
  { id: "soft", name: "溫柔", desc: "淨係鼓勵，冇毒舌" },
  { id: "neighbour", name: "街坊", desc: "預設。有啲嘴賤，但係幫你" },
  { id: "spicy", name: "毒舌", desc: "更加直接，食物都 roast" },
];

function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-center justify-between gap-3 py-2.5">
      <span>
        <span className="block font-semibold">{label}</span>
        {hint && <span className="block text-sm text-stone-500">{hint}</span>}
      </span>
      <input type="checkbox" className="h-6 w-6 shrink-0 accent-teal-700" checked={on} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export default function PersonaSettings({ userId, prefs, age, onSaved }: Props) {
  const [p, setP] = useState<UserPrefs>(prefs);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const senior = age !== null && isSenior(age);

  async function save() {
    setBusy(true);
    setError(null);
    setMsg(null);
    const { error: dbErr } = await getSupabase()
      .from("user_prefs")
      .upsert({ user_id: userId, ...p, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    setBusy(false);
    if (dbErr) {
      setError(
        dbErr.code === "PGRST205" || /user_prefs/.test(dbErr.message)
          ? "未建立設定表，請先喺 Supabase 執行 schema_persona.sql。"
          : dbErr.message,
      );
      return;
    }
    onSaved(p);
    setMsg("已儲存。");
  }

  return (
    <section className={`${card} space-y-3`}>
      <h2 className="font-bold">陳伯同歡嬸點樣講嘢</h2>
      {senior && (
        <p className={infoBox}>你屬 65 歲或以上，陳伯同歡嬸會一直用溫柔語氣，唔會 roast 食物。</p>
      )}
      <div className="space-y-2">
        {TONES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setP({ ...p, tone: t.id })}
            className={`w-full rounded-2xl p-3 text-left ring-2 ${
              p.tone === t.id ? "bg-teal-50 ring-teal-600" : "bg-white ring-stone-200"
            }`}
          >
            <span className="font-bold">{t.name}</span>
            <span className="ml-2 text-sm text-stone-500">{t.desc}</span>
          </button>
        ))}
      </div>
      <div className="pointer-events-none">
        <Say line={say("evening", p.tone, "preview")} />
      </div>
      <div className="divide-y divide-stone-100">
        <Toggle
          on={p.food_roast && p.tone !== "soft"}
          onChange={(v) => setP({ ...p, food_roast: v })}
          label="食物 roast"
          hint="記錄食物時，陳伯歡嬸會笑你嗰碗嘢。食得太少、減得太快、超標嗰日會自動停。"
        />
        <Toggle
          on={p.elder_mode}
          onChange={(v) => setP({ ...p, elder_mode: v })}
          label="長者模式"
          hint="字更大，只剩今日、食物、體重同更多四個掣。"
        />
      </div>
      {error && <p className={errorBox}>{error}</p>}
      {msg && <p className="rounded-xl bg-teal-50 p-3 text-sm text-teal-800">{msg}</p>}
      <button className={btnPrimary} disabled={busy} onClick={() => void save()}>
        {busy ? "儲存中…" : "儲存"}
      </button>
    </section>
  );
}
