"use client";

import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import AuthForm from "@/components/AuthForm";
import Calculator from "@/components/Calculator";
import Exercise from "@/components/Exercise";
import Food from "@/components/Food";
import ProfileForm from "@/components/ProfileForm";
import Reminders from "@/components/Reminders";
import Today from "@/components/Today";
import Weight from "@/components/Weight";
import { computePlan } from "@/lib/calc";
import { LOADING_TEXT } from "@/lib/copy";
import { toDateStr } from "@/lib/date";
import { sumBurned } from "@/lib/exercise";
import { isMealType } from "@/lib/food";
import { getSupabase } from "@/lib/supabase";
import type { FoodLog, MealType, Profile, WeightLog } from "@/lib/types";

type Tab = "today" | "food" | "exercise" | "weight" | "calc" | "reminders";

const TABS: { id: Tab; label: string }[] = [
  { id: "today", label: "今日" },
  { id: "food", label: "食物" },
  { id: "exercise", label: "運動" },
  { id: "weight", label: "體重" },
  { id: "calc", label: "計算機" },
  { id: "reminders", label: "提醒" },
];

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [logs, setLogs] = useState<WeightLog[]>([]);
  const [foodToday, setFoodToday] = useState<FoodLog[]>([]);
  const [exerciseBurned, setExerciseBurned] = useState(0);
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
    const t = params.get("tab");
    if (
      t === "today" ||
      t === "food" ||
      t === "exercise" ||
      t === "weight" ||
      t === "calc" ||
      t === "reminders"
    ) {
      setTab(t);
    }
    const m = params.get("meal");
    if (isMealType(m)) setInitialMeal(m);
  }, []);

  const userId = session?.user.id ?? null;

  const load = useCallback(async () => {
    if (!userId) return;
    setLoadError(null);
    const supabase = getSupabase();
    const [p, w, f, x] = await Promise.all([
      supabase.from("profiles").select("*").maybeSingle(),
      supabase
        .from("weight_logs")
        .select("id, logged_on, weight_kg")
        .order("logged_on", { ascending: true }),
      supabase
        .from("food_logs")
        .select("id, logged_on, meal_type, name, quantity_text, calories, protein_g, carbs_g, fat_g, source")
        .eq("logged_on", toDateStr())
        .order("created_at", { ascending: true }),
      supabase.from("exercise_logs").select("calories").eq("logged_on", toDateStr()),
    ]);
    const err = p.error ?? w.error ?? f.error;
    if (err) {
      setLoadError(err.message);
    } else {
      setProfile(p.data as Profile | null);
      setLogs((w.data ?? []) as WeightLog[]);
      setFoodToday((f.data ?? []) as FoodLog[]);
      // 運動表未建立（未跑 schema_exercise.sql）就當冇運動，唔影響其他功能
      setExerciseBurned(x.error ? 0 : sumBurned(x.data ?? []));
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
      setDataReady(false);
    }
  }, [userId, load]);

  const latest = logs.length ? logs[logs.length - 1] : null;

  const planResult = useMemo(() => {
    if (!profile || !latest) return null;
    return computePlan({
      profile,
      weightKg: latest.weight_kg,
      today: toDateStr(),
    });
  }, [profile, latest]);

  const plan = planResult?.ok ? planResult.plan : null;
  const planError = planResult && !planResult.ok ? planResult.reason : null;

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

  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-28">
      {tab === "today" && (
        <Today
          profile={profile}
          plan={plan}
          planError={planError}
          logs={logs}
          foodToday={foodToday}
          exerciseBurned={exerciseBurned}
          onGoWeight={() => setTab("weight")}
          onGoFood={() => setTab("food")}
          onGoExercise={() => setTab("exercise")}
        />
      )}
      {tab === "exercise" && (
        <Exercise
          userId={session.user.id}
          plan={plan}
          weightKg={latest?.weight_kg ?? null}
          onChanged={() => void load()}
        />
      )}
      {tab === "food" && (
        <Food
          userId={session.user.id}
          plan={plan}
          initialMeal={initialMeal}
          onChanged={() => void load()}
        />
      )}
      {tab === "weight" && (
        <Weight
          userId={session.user.id}
          logs={logs}
          targetKg={profile.target_weight_kg}
          onChanged={() => void load()}
        />
      )}
      {tab === "calc" && (
        <Calculator
          profile={profile}
          plan={plan}
          planError={planError}
          weightKg={latest?.weight_kg ?? null}
          onEditProfile={() => setEditing(true)}
          onLogout={() => void logout()}
        />
      )}

      {tab === "reminders" && <Reminders userId={session.user.id} />}

      <nav className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`py-3.5 text-sm font-medium ${
                tab === t.id ? "text-emerald-600" : "text-slate-400"
              }`}
              aria-current={tab === t.id ? "page" : undefined}
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
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center text-slate-500">
      {children}
    </main>
  );
}
