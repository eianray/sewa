"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState("Verifying...");

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data: { session }, error }) => {
        if (error) {
          setStatus(`Error: ${error.message}`);
          return;
        }
        if (session) {
          setStatus("Authenticated! Redirecting...");
          setTimeout(() => router.push("/"), 1000);
        } else {
          setStatus("No session found. Please try logging in again.");
        }
      })
      .catch((err) => setStatus(`Unexpected error: ${err}`));
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0f1e] text-white">
      <div className="text-center">
        <p className="text-[#38bdf8] text-lg">{status}</p>
      </div>
    </div>
  );
}
