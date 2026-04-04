"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const [session, setSession] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        // Already logged in — redirect to dashboard
        window.location.href = "/dashboard";
        return;
      }
      setSession(null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        window.location.href = "/dashboard";
      } else {
        setSession(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setMessage(`Error: ${error.message}`);
    } else {
      window.location.href = "/dashboard";
    }
    setLoading(false);
  };

  if (session) return null; // Redirecting

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-[#1e293b]">
        <div className="flex items-center gap-3">
          <span className="text-[#38bdf8] font-bold text-lg">SEWA</span>
          <span className="text-[#475569] text-sm">Sewer &amp; Water Analysis</span>
        </div>
      </header>

      {/* Login form */}
      <main className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-sm p-8 space-y-6">
          <div className="text-center">
            <h1 className="text-xl font-bold text-white">Sign in to SEWA</h1>
            <p className="text-[#94a3b8] text-sm mt-1">
              Enter your credentials to access your account
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full px-4 py-3 rounded-lg bg-[#111827] border border-[#1e293b] text-white placeholder-[#475569] focus:outline-none focus:border-[#38bdf8]"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              minLength={6}
              className="w-full px-4 py-3 rounded-lg bg-[#111827] border border-[#1e293b] text-white placeholder-[#475569] focus:outline-none focus:border-[#38bdf8]"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-lg bg-[#38bdf8] text-[#0a0f1e] font-semibold hover:bg-[#0ea5e9] transition-colors disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          {message && (
            <p className="text-center text-sm text-red-400">{message}</p>
          )}
        </div>
      </main>
    </div>
  );
}
