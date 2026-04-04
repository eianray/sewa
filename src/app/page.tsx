"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const [session, setSession] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session?.user?.email ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session?.user?.email ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setMessage(`Error: ${error.message}`);
    } else {
      setMessage("Check your email for the magic link!");
    }
    setLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (session) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] text-white flex flex-col">
        {/* Top bar */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-[#1e293b]">
          <div className="flex items-center gap-3">
            <span className="text-[#38bdf8] font-bold text-lg">SEWA</span>
            <span className="text-[#475569] text-sm">Sewer &amp; Water Analysis</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-[#94a3b8]">{session}</span>
            <button
              onClick={handleLogout}
              className="text-sm text-[#94a3b8] hover:text-white transition-colors"
            >
              Sign out
            </button>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-[#38bdf8] mb-2">
              Welcome to SEWA
            </h1>
            <p className="text-[#94a3b8]">
              Authenticated as {session}
            </p>
            <p className="text-[#475569] text-sm mt-4">
              Phase A — shell complete. Phase B is next.
            </p>
          </div>
        </main>
      </div>
    );
  }

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
              Enter your email to receive a magic link
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
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-lg bg-[#38bdf8] text-[#0a0f1e] font-semibold hover:bg-[#0ea5e9] transition-colors disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send Magic Link"}
            </button>
          </form>

          {message && (
            <p className="text-center text-sm text-[#f87171]">{message}</p>
          )}
        </div>
      </main>
    </div>
  );
}
