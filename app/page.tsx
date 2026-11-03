"use client";

import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import AuthForm from "@/components/AuthForm";
import Calculator from "@/components/Calculator";
import ProfileForm from "@/components/ProfileForm";
import Today from "@/components/Today";
import Weight from "@/components/Weight";
import { computePlan } from "@/lib/calc";
import { LOADING_TEXT } from "@/lib/copy";
import { toDateStr } from "@/lib/date";
import { getSupabase } from "@/lib/supabase";
import type { Profile, WeightLog } from "@/lib/types";

type Tab = "today" | "weight" | "calc";

const TABS: { id: Tab; label: string }[] = [
  { id: "today", label: "今日" },
  { id: "weight", label: "體重" },
  { id: "calc", label: "計算機" },
];

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [logs, setLogs] = useState<WeightLog[]>([]);
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

  const userId = session?.user.id ?? null;

  const load = useCallback(async () => {
    if (!userId) return;
    setLoadError(null);
    const supabase = getSupabase();
    const [p, w] = await Promise.all([
      supabase.from("profiles").select("*").maybeSingle(),
      supabase
        .from("weight_logs")
        .select("id, logged_on, weight_kg")
        .order("logged_on", { ascending: true }),
    ]);
    if (p.error || w.error) {
      setLoadError((p.error ?? w.error)!.message);
    } else {
      setProfile(p.data as Profile | null);
      setLogs((w.data ?? []) as WeightLog[]);
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
          onGoWeight={() => setTab("weight")}
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

      <nav className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-3">
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
