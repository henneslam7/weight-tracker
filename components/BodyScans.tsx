"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { authedFetch } from "@/lib/api";
import { checkScan, compareScans, deriveScan, SCAN_FIELDS, SCAN_LABEL, type BodyScan, type ChangeKind, type ScanField, type SettingSuggestion } from "@/lib/body";
import { validateProfile } from "@/lib/calc";
import { formatShort, toDateStr } from "@/lib/date";
import { prepareScreenshot } from "@/lib/image-client";
import { isMissingColumn } from "@/lib/profile-save";
import { getSupabase } from "@/lib/supabase";
import type { BodyNarrative } from "@/lib/ai/body";
import type { Profile } from "@/lib/types";
import { Avatar } from "./Persona";
import { btnGhost, btnPrimary, card, errorBox, infoBox, input, label } from "./ui";

interface Props {
  userId: string;
  profile: Profile;
  /** 儲存體重／套用設定後叫父層重新讀取 */
  onChanged: () => void;
}

interface StoredAnalysis {
  narrative: BodyNarrative;
  suggestions: SettingSuggestion[];
  note: string | null;
}
type Row = BodyScan & { id: string; analysis: StoredAnalysis | null; analysis_at: string | null };

const COLS = `id, measured_on, ${SCAN_FIELDS.join(", ")}, source, analysis, analysis_at`;
const CHANGE_TEXT: Record<ChangeKind, string> = {
  noise: "變化細過 1 kg，屬正常浮動",
  fat_loss: "主要減咗脂肪",
  mixed_loss: "脂肪同去脂體重都有減",
  lean_loss: "去脂體重減得較多，要留意",
  recomp: "脂肪減、去脂增（體態重組跡象）",
  lean_gain: "主要增咗去脂體重",
  fat_gain: "增加嘅多數係脂肪",
  no_data: "資料唔夠比較",
};
const PRIVACY =
  "截圖只會傳送畀 Google Gemini 讀出數字，唔會儲存（只儲存你確認後嘅數字）。請先用遮蓋或者裁走你嘅名同頭像都得。AI 讀錯嘅機會有，請逐項確認。";

type Form = { measured_on: string } & Record<ScanField, string>;
const emptyForm = (): Form => ({ measured_on: toDateStr(), ...(Object.fromEntries(SCAN_FIELDS.map((k) => [k, ""])) as Record<ScanField, string>) });

const toNum = (v: string): number | null => (v.trim() === "" ? null : Number(v));

/** 身體組成（智能磅報告）：截圖讀數字 → 你確認 → 儲存 → 分析同設定建議（要你撳「採用」） */
export default function BodyScans({ userId, profile, onChanged }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [missingTable, setMissingTable] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [source, setSource] = useState<BodyScan["source"]>("manual");
  const [alsoWeight, setAlsoWeight] = useState(true);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [analysing, setAnalysing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [applied, setApplied] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const { data, error } = await getSupabase().from("body_scans").select(COLS).order("measured_on", { ascending: false }).limit(12);
    if (error) {
      // 表未建立（未跑 schema_body.sql）
      setMissingTable(true);
      setRows([]);
    } else {
      setMissingTable(false);
      setRows((data ?? []) as unknown as Row[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const today = toDateStr();

  async function onFile(file: File | null) {
    if (!file) return;
    setError(null);
    setNotice(null);
    setReading(true);
    try {
      const img = await prepareScreenshot(file);
      URL.revokeObjectURL(img.previewUrl);
      const res = await authedFetch("/api/ai/body-scan", { method: "POST", body: JSON.stringify({ image: { mimeType: img.mimeType, data: img.data } }) });
      const out = (await res.json()) as { message?: string; fields?: Partial<Record<ScanField, number>>; measuredOn?: string | null; dropped?: ScanField[] };
      if (!res.ok) throw new Error(out.message ?? "讀取失敗，請手動輸入。");
      const f = emptyForm();
      for (const k of SCAN_FIELDS) if (out.fields?.[k] !== undefined) f[k] = String(out.fields[k]);
      if (out.measuredOn) f.measured_on = out.measuredOn;
      setForm(f);
      setSource("screenshot");
      const dropped = out.dropped?.length ? `有 ${out.dropped.length} 項讀出嘅數字太離譜，已留空，請自己填：${out.dropped.map((k) => SCAN_LABEL[k]).join("、")}。` : "";
      setNotice(`已讀出數字。請逐項核對再儲存（AI 可能讀錯）。${dropped}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "讀取失敗，請手動輸入。");
    } finally {
      setReading(false);
    }
  }

  const draft: BodyScan | null = useMemo(() => {
    if (!form) return null;
    const n = (k: ScanField) => toNum(form[k]);
    return {
      measured_on: form.measured_on,
      weight_kg: n("weight_kg") ?? NaN,
      body_fat_pct: n("body_fat_pct"),
      lean_kg: n("lean_kg"),
      muscle_kg: n("muscle_kg"),
      skeletal_muscle_kg: n("skeletal_muscle_kg"),
      water_pct: n("water_pct"),
      protein_pct: n("protein_pct"),
      bone_kg: n("bone_kg"),
      visceral_fat: n("visceral_fat"),
      bmr_kcal: n("bmr_kcal"),
      body_age: n("body_age"),
      bmi: n("bmi"),
      heart_rate: n("heart_rate"),
      source,
    };
  }, [form, source]);
  const check = useMemo(() => (draft ? checkScan(draft, profile.height_cm, today) : null), [draft, profile.height_cm, today]);

  async function save() {
    if (!draft || !check || check.errors.length) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = getSupabase();
      const { data, error: e } = await supabase
        .from("body_scans")
        .upsert({ user_id: userId, ...draft, analysis: null, analysis_at: null }, { onConflict: "user_id,measured_on" })
        .select("id")
        .single();
      if (e) throw e;
      if (alsoWeight) {
        const { error: wErr } = await supabase
          .from("weight_logs")
          .upsert({ user_id: userId, logged_on: draft.measured_on, weight_kg: draft.weight_kg }, { onConflict: "user_id,logged_on" });
        if (wErr) throw wErr;
        onChanged();
      }
      setForm(null);
      setNotice("已儲存。幫你分析緊…");
      await load();
      if (data?.id) void analyse(data.id as string);
    } catch (e) {
      const m = (e as { message?: string })?.message;
      setError(m ?? "儲存失敗，請再試。");
    } finally {
      setBusy(false);
    }
  }

  async function analyse(id: string) {
    setAnalysing(id);
    setError(null);
    try {
      const res = await authedFetch("/api/ai/body-analysis", { method: "POST", body: JSON.stringify({ scanId: id }) });
      const out = (await res.json()) as StoredAnalysis & { message?: string };
      if (!res.ok) throw new Error(out.message ?? "分析失敗，請再試。");
      const stored: StoredAnalysis = { narrative: out.narrative, suggestions: out.suggestions, note: out.note ?? null };
      await getSupabase().from("body_scans").update({ analysis: stored, analysis_at: new Date().toISOString() }).eq("id", id);
      setNotice(null);
      setOpen(id);
      await load();
    } catch (e) {
      setNotice(null);
      setError(e instanceof Error ? e.message : "分析失敗，請再試。");
    } finally {
      setAnalysing(null);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("確定刪除呢次身體組成記錄？（體重記錄唔會刪）")) return;
    const { error: e } = await getSupabase().from("body_scans").delete().eq("id", id);
    if (e) setError(e.message);
    else await load();
  }

  /** 採用設定建議：先驗證，再 update profile（新欄位未建立就只改舊欄位） */
  async function apply(s: SettingSuggestion, scan: Row) {
    setError(null);
    const problem = validateProfile({ profile: { ...profile, ...s.patch }, currentWeightKg: scan.weight_kg, today });
    if (problem) {
      setError(problem);
      return;
    }
    const now = new Date().toISOString();
    const supabase = getSupabase();
    let { error: e } = await supabase.from("profiles").update({ ...s.patch, updated_at: now }).eq("user_id", userId);
    if (e && isMissingColumn(e)) {
      const legacy: Record<string, unknown> = {};
      for (const k of ["goal", "target_weight_kg", "weekly_rate_kg"] as const) if (k in s.patch) legacy[k] = s.patch[k] ?? null;
      ({ error: e } = await supabase.from("profiles").update({ ...legacy, updated_at: now }).eq("user_id", userId));
    }
    if (e) {
      setError(e.message);
      return;
    }
    setApplied((cur) => new Set(cur).add(`${scan.id}:${s.id}`));
    onChanged();
  }

  const setF = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((cur) => (cur ? { ...cur, [k]: e.target.value } : cur));

  if (loading) return null;
  if (missingTable) {
    return (
      <section className={card}>
        <h2 className="font-semibold">身體組成（智能磅報告）</h2>
        <p className={`${infoBox} mt-2`}>資料庫未升級，用唔到呢個功能。請喺 Supabase SQL Editor 執行 supabase/schema_body.sql 一次。</p>
      </section>
    );
  }

  return (
    <section className={`${card} space-y-3`}>
      <div>
        <h2 className="font-semibold">身體組成（智能磅報告）</h2>
        <p className="text-sm text-slate-500">
          上載磅 app 截圖，AI 讀出數字，分析你嘅脂肪同去脂體重變化，並建議有冇設定值得更新。你確認先會改。
        </p>
      </div>

      {!form && (
        <div className="space-y-2">
          <label className="block w-full cursor-pointer rounded-xl bg-teal-700 px-4 py-3 text-center font-semibold text-white active:bg-teal-800">
            {reading ? "讀緊截圖…" : "上載磅報告截圖"}
            <input type="file" accept="image/*" className="hidden" disabled={reading} onChange={(e) => { void onFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
          </label>
          <button
            className={btnGhost}
            onClick={() => { setForm(emptyForm()); setSource("manual"); setNotice(null); setError(null); }}
          >
            手動輸入
          </button>
          <p className="text-xs text-slate-500">{PRIVACY}</p>
        </div>
      )}

      {notice && <p className={infoBox}>{notice}</p>}
      {error && <p className={errorBox}>{error}</p>}

      {form && check && (
        <div className="space-y-3 rounded-xl bg-slate-50 p-3">
          <div>
            <label className={label} htmlFor="bs-date">量度日期</label>
            <input id="bs-date" type="date" max={today} className={input} value={form.measured_on} onChange={setF("measured_on")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {SCAN_FIELDS.map((k) => (
              <div key={k}>
                <label className={label} htmlFor={`bs-${k}`}>{SCAN_LABEL[k]}{k === "weight_kg" ? " *" : ""}</label>
                <input id={`bs-${k}`} type="number" inputMode="decimal" step="0.1" className={input} value={form[k]} onChange={setF(k)} />
              </div>
            ))}
          </div>
          {check.errors.map((m) => <p key={m} className={errorBox}>{m}</p>)}
          {check.warnings.map((m) => <p key={m} className={infoBox}>{m}</p>)}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-teal-700" checked={alsoWeight} onChange={(e) => setAlsoWeight(e.target.checked)} />
            同時將呢個體重記入「體重」記錄（同日會覆蓋）
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button className={btnPrimary} disabled={busy || check.errors.length > 0} onClick={() => void save()}>{busy ? "儲存中…" : "確認並儲存"}</button>
            <button className={btnGhost} disabled={busy} onClick={() => setForm(null)}>取消</button>
          </div>
        </div>
      )}

      {rows.length === 0 && !form && <p className="text-sm text-slate-400">仲未有記錄。第一次記錄之後，再量幾次先睇到趨勢。</p>}

      <ul className="space-y-2">
        {rows.map((r, i) => {
          const d = deriveScan(r, profile.height_cm);
          const older = rows[i + 1];
          const ch = older ? compareScans(older, r, profile.height_cm) : null;
          const a = r.analysis;
          return (
            <li key={r.id} className="rounded-xl ring-1 ring-slate-200">
              <button className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
                <span>
                  <span className="font-semibold">{formatShort(r.measured_on)}</span>
                  <span className="ml-2 text-sm text-slate-600">{r.weight_kg} kg{r.body_fat_pct !== null ? ` · 體脂 ${r.body_fat_pct}%` : ""}</span>
                </span>
                <span className="text-xs text-slate-400">{open === r.id ? "收埋" : "睇詳情"}</span>
              </button>
              {open === r.id && (
                <div className="space-y-3 border-t border-slate-100 px-3 py-3 text-sm">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {d.fatKg !== null && <span>脂肪：{d.fatKg} kg</span>}
                    {d.leanKg !== null && <span>去脂體重：{d.leanKg} kg</span>}
                    {SCAN_FIELDS.filter((k) => !["weight_kg", "body_fat_pct", "lean_kg"].includes(k) && r[k] !== null).map((k) => (
                      <span key={k}>{SCAN_LABEL[k]}：{r[k]}</span>
                    ))}
                  </div>
                  {ch && ch.kind !== "no_data" && (
                    <p className="rounded-lg bg-slate-50 p-2">
                      對比 {formatShort(older.measured_on)}：體重 {ch.dWeight > 0 ? "+" : ""}{ch.dWeight} kg
                      {ch.dFat !== null ? `，脂肪 ${ch.dFat > 0 ? "+" : ""}${ch.dFat} kg` : ""}
                      {ch.dLean !== null ? `，去脂 ${ch.dLean > 0 ? "+" : ""}${ch.dLean} kg` : ""}。{CHANGE_TEXT[ch.kind]}。
                    </p>
                  )}

                  {!a && (
                    <button className={btnPrimary} disabled={analysing !== null} onClick={() => void analyse(r.id)}>
                      {analysing === r.id ? "分析緊…" : "AI 分析"}
                    </button>
                  )}

                  {a && (
                    <div className="space-y-3">
                      {a.note && <p className={infoBox}>{a.note}</p>}
                      <p className="font-medium leading-relaxed">{a.narrative.summary}</p>
                      <ul className="list-disc space-y-1 pl-5 text-slate-700">
                        {a.narrative.highlights.map((h) => <li key={h}>{h}</li>)}
                      </ul>

                      {a.suggestions.length > 0 && (
                        <div className="space-y-2">
                          <p className="font-bold text-teal-800">設定建議（你撳「採用」先會改）</p>
                          {a.suggestions.map((s) => {
                            const done = applied.has(`${r.id}:${s.id}`);
                            return (
                              <div key={s.id} className="space-y-1.5 rounded-xl bg-teal-50 p-3">
                                <p className="font-semibold">{s.title}：{s.current} → <span className="text-teal-800">{s.suggested}</span></p>
                                {a.narrative.notes[s.id] && <p>{a.narrative.notes[s.id]}</p>}
                                <ul className="list-disc space-y-0.5 pl-5 text-xs text-slate-600">
                                  {s.facts.map((f) => <li key={f}>{f}</li>)}
                                </ul>
                                <button
                                  className="w-full rounded-lg bg-teal-700 py-2 font-bold text-white active:bg-teal-800 disabled:opacity-50"
                                  disabled={done}
                                  onClick={() => void apply(s, r)}
                                >
                                  {done ? "已採用" : "採用"}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <p className="text-xs text-slate-500">{a.narrative.caution}</p>
                      <div className={`flex items-center gap-3 rounded-xl bg-amber-50 p-2 ${a.narrative.who === "chan" ? "flex-row-reverse" : ""}`}>
                        <Avatar who={a.narrative.who} size={40} />
                        <p className="flex-1 text-sm">{a.narrative.closing}</p>
                      </div>
                      <button className="text-xs text-slate-400 underline" disabled={analysing !== null} onClick={() => void analyse(r.id)}>
                        {analysing === r.id ? "分析緊…" : "重新分析（用 1 次 AI）"}
                      </button>
                    </div>
                  )}
                  <button className="text-xs text-slate-400 underline" onClick={() => void remove(r.id)}>刪除呢次記錄</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-slate-400">家用磅量體脂有誤差（受水分、食飯、運動、時間影響），睇趨勢唔好睇單次。磅 app 嘅評語（例如「過高」）係廠商意見；呢個分析唔係診斷，有疑問請問醫生或註冊營養師。</p>
    </section>
  );
}
