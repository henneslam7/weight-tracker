"use client";

import { useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { btnPrimary, card, errorBox, infoBox, input, label } from "./ui";

export default function AuthForm() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const supabase = getSupabase();
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) {
          setMessage("已發送確認電郵，請撳電郵入面嘅連結後再登入。");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "發生錯誤，請再試。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-emerald-600">Fit AI</h1>
        <p className="mt-1 text-sm text-slate-500">你嘅個人健身助手</p>
      </div>
      <form onSubmit={submit} className={`${card} space-y-4`}>
        <div>
          <label className={label} htmlFor="email">電郵</label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            className={input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className={label} htmlFor="password">密碼</label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className={input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode === "signup" && (
            <p className="mt-1 text-xs text-slate-500">至少 8 個字元。</p>
          )}
        </div>
        {error && <p className={errorBox}>{error}</p>}
        {message && <p className={infoBox}>{message}</p>}
        <button className={btnPrimary} disabled={busy}>
          {busy ? "請稍候…" : mode === "login" ? "登入" : "註冊"}
        </button>
        <button
          type="button"
          className="w-full text-sm text-slate-500 underline"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError(null);
            setMessage(null);
          }}
        >
          {mode === "login" ? "未有帳戶？註冊" : "已有帳戶？登入"}
        </button>
      </form>
    </main>
  );
}
