"use client";

import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import AuthForm from "@/components/AuthForm";
import Calculator from "@/components/Calculator";
import Exercise from "@/components/Exercise";
import Food from "@/components/Food";
import PersonaSettings from "@/components/PersonaSettings";
import ProfileForm from "@/components/ProfileForm";
import Reminders from "@/components/Reminders";
import Today from "@/components/Today";
import Weight from "@/components/Weight";
import { dayBudget } from "@/lib/budget";
import { ageOn, computePlan, weeklyTrendKg } from "@/lib/calc";
import { LOADING_TEXT } from "@/lib/copy";
import { addDays, diffDays, toDateStr } from "@/lib/date";
import { sumBurned } from "@/lib/exercise";
import { isMealType, sumFood } from "@/lib/food";
import type { History } from "@/lib/gamify";
import { normalizePrefs, sensitiveReason } from "@/lib/persona";
import { applyCheat, cheatExtraKcal, stampState, type CheatRow } from "@/lib/stamps";
import { getSupabase } from "@/lib/supabase";
import type { FoodLog, MealType, Profile, UserPrefs, WeightLog } from "@/lib/types";

type Tab = "today" | "food" | "exercise" | "weight" | "calc" | "reminders" | "more";

const TABS: { id: Tab; label: string }[] = [
  { id: "today", label: "今日" },
  { id: "food", label: "食物" },
  { id: "exercise", label: "運動" },
  { id: "weight", label: "體重" },
  { id: "calc", label: "計算機" },
  { id: "reminders", label: "設定" },
];
/** 長者模式：只剩四個掣，其餘收埋喺「更多」 */
const ELDER_TABS: { id: Tab; label: string }[] = [
  { id: "today", label: "今日" },
  { id: "food", label: "食物" },
  { id: "weight", label: "體重" },
  { id: "more", label: "更多" },
];
const VALID_TABS: Tab[] = ["today", "food", "exercise", "weight", "calc", "reminders", "more"];
const HISTORY_DAYS = 120;

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [logs, setLogs] = useState<WeightLog[]>([]);
  const [foodToday, setFoodToday] = useState<FoodLog[]>([]);
  const [exerciseBurned, setExerciseBurned] = useState(0);
  const [foodHistory, setFoodHistory] = useState<{ logged_on: string; meal_type: MealType; calories: number }[]>([]);
  const [moveHistory, setMoveHistory] = useState<{ logged_on: string; calories: number }[]>([]);
  const [cheatRows, setCheatRows] = useState<CheatRow[]>([]);
  /** cheat_days 表存在（已跑 schema_cheat.sql）先可以領放縱日 */
  const [cheatReady, setCheatReady] = useState(false);
  const [prefsRow, setPrefsRow] = useState<Partial<UserPrefs> | null>(null);
  const [initialMeal, setInitialMeal] = useState<MealType | null>(null);
  const [dataReady, setDataReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("today");
  const [editing, setEditing] = useState(false);

  // Auth session
  useEffect(() => {
    let supabase;
    try {
      supabase = getSupabase();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
      setAuthReady(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // 通知深層連結：/?tab=food&meal=lunch
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab") as Tab | null;
    if (t && VALID_TABS.includes(t)) setTab(t);
    const m = params.get("meal");
    if (isMealType(m)) setInitialMeal(m);
  }, []);

  const userId = session?.user.id ?? null;

  const load = useCallback(async () => {
    if (!userId) return;
    setLoadError(null);
    const supabase = getSupabase();
    const today = toDateStr();
    const from = addDays(today, -HISTORY_DAYS);
    const [p, w, f, x, fh, xh, pr, ch] = await Promise.all([
      supabase.from("profiles").select("*").maybeSingle(),
      supabase.from("weight_logs").select("id, logged_on, weight_kg").order("logged_on", { ascending: true }),
      supabase
        .from("food_logs")
        .select("id, logged_on, meal_type, name, quantity_text, calories, protein_g, carbs_g, fat_g, source")
        .eq("logged_on", today)
        .order("created_at", { ascending: true }),
      supabase.from("exercise_logs").select("calories").eq("logged_on", today),
      supabase.from("food_logs").select("logged_on, meal_type, calories").gte("logged_on", from),
      supabase.from("exercise_logs").select("logged_on, calories").gte("logged_on", from),
      supabase.from("user_prefs").select("*").maybeSingle(),
      supabase.from("cheat_days").select("cheat_on, stamps_through"),
    ]);
    const err = p.error ?? w.error ?? f.error ?? fh.error;
    if (err) {
      setLoadError(err.message);
    } else {
      setProfile(p.data as Profile | null);
      setLogs((w.data ?? []) as WeightLog[]);
      setFoodToday((f.data ?? []) as FoodLog[]);
      setFoodHistory((fh.data ?? []) as { logged_on: string; meal_type: MealType; calories: number }[]);
      // 運動表／設定表未建立（未跑對應 SQL）就用預設，唔影響其他功能
      setExerciseBurned(x.error ? 0 : sumBurned(x.data ?? []));
      setMoveHistory(xh.error ? [] : ((xh.data ?? []) as { logged_on: string; calories: number }[]));
      // 放縱日表未建立（未跑 schema_cheat.sql）：印花照計，只係領取唔到
      setCheatReady(!ch.error);
      setCheatRows(ch.error ? [] : ((ch.data ?? []) as CheatRow[]));
      setPrefsRow(pr.error ? null : (pr.data as Partial<UserPrefs> | null));
    }
    setDataReady(true);
  }, [userId]);

  useEffect(() => {
    if (userId) {
      setDataReady(false);
      void load();
    } else {
      setProfile(null);
      setLogs([]);
      setFoodToday([]);
      setExerciseBurned(0);
      setFoodHistory([]);
      setMoveHistory([]);
      setCheatRows([]);
      setCheatReady(false);
      setPrefsRow(null);
      setDataReady(false);
    }
  }, [userId, load]);

  const latest = logs.length ? logs[logs.length - 1] : null;
  const today = toDateStr();
  const age = profile ? ageOn(profile.birth_date, today) : null;
  const prefs = useMemo(() => normalizePrefs(prefsRow, age), [prefsRow, age]);

  // 長者模式：字大啲
  useEffect(() => {
    document.documentElement.classList.toggle("elder", prefs.elder_mode);
    return () => document.documentElement.classList.remove("elder");
  }, [prefs.elder_mode]);

  const planResult = useMemo(() => {
    if (!profile || !latest) return null;
    return computePlan({ profile, weightKg: latest.weight_kg, today: toDateStr() });
  }, [profile, latest]);
  const basePlan = planResult?.ok ? planResult.plan : null;
  const planError = planResult && !planResult.ok ? planResult.reason : null;

  const history: History = useMemo(() => {
    const mealsByDate = new Map<string, Set<MealType>>();
    const kcalByDate = new Map<string, number>();
    const burnedByDate = new Map<string, number>();
    for (const r of foodHistory) {
      const s = mealsByDate.get(r.logged_on) ?? new Set<MealType>();
      s.add(r.meal_type);
      mealsByDate.set(r.logged_on, s);
      kcalByDate.set(r.logged_on, (kcalByDate.get(r.logged_on) ?? 0) + (Number(r.calories) || 0));
    }
    for (const r of moveHistory) {
      burnedByDate.set(r.logged_on, (burnedByDate.get(r.logged_on) ?? 0) + (Number(r.calories) || 0));
    }
    return {
      weightDates: new Set(logs.map((l) => l.logged_on)),
      mealsByDate,
      moveDates: new Set(moveHistory.map((r) => r.logged_on)),
      kcalByDate,
      burnedByDate,
    };
  }, [logs, foodHistory, moveHistory]);

  // 印花（要三樣齊 ＋ 食量唔超上限）同放縱日。放縱日當日，全 app 用加咗額外 kcal 嘅計劃。
  const stamps = useMemo(
    () => (basePlan ? stampState({ history, plan: basePlan, today, rows: cheatRows }) : null),
    [history, basePlan, today, cheatRows],
  );
  const cheatExtra = basePlan ? cheatExtraKcal(basePlan) : 0;
  const plan = basePlan && stamps?.cheatToday ? applyCheat(basePlan, cheatExtra) : basePlan;

  // 敏感時刻（食得太少、減得太快、超標、隔咗幾日先返嚟、65 歲或以上）：一律溫柔，唔 roast
  const eaten = useMemo(() => sumFood(foodToday), [foodToday]);
  const budgetKcal = plan ? dayBudget(plan, exerciseBurned).calories : 0;
  const reason = useMemo(() => {
    if (!profile) return null;
    const past = [...history.weightDates, ...history.mealsByDate.keys(), ...history.moveDates].filter((d) => d < today);
    const last = past.length ? past.sort().at(-1)! : null;
    return sensitiveReason({
      age,
      goal: profile.goal,
      hour: new Date().getHours(),
      eatenKcal: eaten.calories,
      budgetKcal,
      trendKgPerWeek: weeklyTrendKg(logs),
      daysSinceLastLog: last ? diffDays(last, today) : null,
      cheatToday: stamps?.cheatToday ?? false,
    });
  }, [profile, history, today, age, eaten.calories, budgetKcal, logs, stamps?.cheatToday]);
  const remainingKcal = plan ? budgetKcal - eaten.calories : null;

  async function logout() {
    await getSupabase().auth.signOut();
    setEditing(false);
    setTab("today");
  }

  if (!authReady) return <Centered>{LOADING_TEXT}</Centered>;
  if (!session) {
    return loadError ? <Centered>{loadError}</Centered> : <AuthForm />;
  }
  if (!dataReady) return <Centered>{LOADING_TEXT}</Centered>;
  if (loadError) {
    return (
      <Centered>
        <p>載入資料失敗：{loadError}</p>
        <button className="mt-3 underline" onClick={() => void load()}>
          再試
        </button>
      </Centered>
    );
  }

  if (!profile || editing) {
    return (
      <ProfileForm
        userId={session.user.id}
        initial={profile}
        hasWeight={logs.length > 0}
        latestWeightKg={latest?.weight_kg ?? null}
        onSaved={async () => {
          await load();
          setEditing(false);
        }}
        onCancel={profile ? () => setEditing(false) : undefined}
      />
    );
  }

  const tabs = prefs.elder_mode ? ELDER_TABS : TABS;
  const navActive: Tab =
    prefs.elder_mode && (tab === "exercise" || tab === "calc" || tab === "reminders") ? "more" : tab;
  const uid = session.user.id;

  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-28">
      {tab === "today" && (
        <Today
          userId={uid}
          profile={profile}
          plan={plan}
          planError={planError}
          logs={logs}
          foodToday={foodToday}
          exerciseBurned={exerciseBurned}
          prefs={prefs}
          reason={reason}
          history={history}
          stamps={stamps}
          cheatExtra={cheatExtra}
          cheatReady={cheatReady}
          onGoWeight={() => setTab("weight")}
          onGoFood={() => setTab("food")}
          onGoExercise={() => setTab("exercise")}
          onChanged={() => void load()}
        />
      )}
      {tab === "exercise" && (
        <Exercise userId={uid} plan={plan} weightKg={latest?.weight_kg ?? null} onChanged={() => void load()} />
      )}
      {tab === "food" && (
        <Food
          userId={uid}
          plan={plan}
          initialMeal={initialMeal}
          prefs={prefs}
          reason={reason}
          remainingKcal={remainingKcal}
          onChanged={() => void load()}
        />
      )}
      {tab === "weight" && (
        <Weight userId={uid} logs={logs} targetKg={profile.target_weight_kg} onChanged={() => void load()} />
      )}
      {tab === "calc" && (
        <Calculator
          userId={uid}
          onChanged={() => void load()}
          profile={profile}
          plan={basePlan}
          trendKgPerWeek={weeklyTrendKg(logs)}
          planError={planError}
          weightKg={latest?.weight_kg ?? null}
          onEditProfile={() => setEditing(true)}
          onLogout={() => void logout()}
        />
      )}
      {tab === "reminders" && (
        <div className="space-y-4">
          <PersonaSettings userId={uid} prefs={prefs} age={age} onSaved={(p) => setPrefsRow(p)} />
          <Reminders userId={uid} />
        </div>
      )}
      {tab === "more" && (
        <div className="space-y-3">
          <h1 className="text-2xl font-black text-teal-800">更多</h1>
          {(
            [
              ["exercise", "運動", "記低今日郁咗幾多"],
              ["calc", "計算機", "每日目標、個人資料、登出"],
              ["reminders", "設定", "陳伯歡嬸語氣、提醒時間"],
            ] as const
          ).map(([id, name, desc]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="w-full rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-stone-200 active:bg-stone-50"
            >
              <span className="block text-xl font-bold">{name}</span>
              <span className="block text-stone-500">{desc}</span>
            </button>
          ))}
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className={`mx-auto grid max-w-md ${tabs.length === 4 ? "grid-cols-4" : "grid-cols-6"}`}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`py-3.5 text-sm font-bold ${navActive === t.id ? "text-teal-800" : "text-stone-500"}`}
              aria-current={navActive === t.id ? "page" : undefined}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center text-stone-500">
      {children}
    </main>
  );
}
