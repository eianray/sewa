"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { Project } from "@/types/project";
import NewProjectModal from "./NewProjectModal";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function Dashboard() {
  const [session, setSession] = useState<{ user: { id: string; email?: string } } | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        window.location.href = "/";
        return;
      }
      setSession(data.session as { user: { id: string; email?: string } });
      fetchProjects(data.session.user.id);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) window.location.href = "/";
    });

    return () => subscription.unsubscribe();
  }, []);

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function fetchProjects(userId: string) {
    setLoading(true);
    setDbError(null);
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      if (error.message.includes("does not exist") || error.code === "42P01") {
        setDbError("Database not configured yet — run the schema SQL to get started.");
      } else {
        setDbError(error.message);
      }
      setLoading(false);
      return;
    }
    setProjects((data as Project[]) || []);
    setLoading(false);
  }

  async function handleDelete(projectId: string) {
    setMenuOpenId(null);
    const { error } = await supabase.from("projects").delete().eq("id", projectId);
    if (!error) {
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  const email = session?.user?.email ?? "";

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-[#1e293b]">
        <div className="flex items-center gap-3">
          <span className="text-[#38bdf8] font-bold text-lg tracking-wide">SEWA</span>
          <span className="text-[#475569] text-sm hidden sm:inline">Sewer &amp; Water Analysis</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-[#94a3b8] hidden sm:block">{email}</span>
          <button
            onClick={handleSignOut}
            className="text-sm text-[#94a3b8] hover:text-white transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 px-6 py-8 max-w-7xl mx-auto w-full">
        {/* Page header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Projects</h1>
            <p className="text-sm text-[#94a3b8] mt-1">
              {loading ? "Loading..." : `${projects.length} project${projects.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="bg-[#38bdf8] text-[#0a0f1e] font-semibold rounded-lg px-4 py-2 hover:bg-[#0ea5e9] transition-colors flex items-center gap-2"
          >
            <span>+</span>
            <span>New Project</span>
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-[#38bdf8] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* DB Error */}
        {!loading && dbError && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="bg-[#0d1526] border border-[#1e293b] rounded-xl p-8 max-w-md">
              <div className="text-4xl mb-4">⚠️</div>
              <h3 className="text-lg font-semibold text-white mb-2">Database Not Configured</h3>
              <p className="text-[#94a3b8] text-sm">{dbError}</p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && !dbError && projects.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="bg-[#0d1526] border border-[#1e293b] rounded-xl p-12 max-w-md">
              <div className="text-4xl mb-4">📋</div>
              <h3 className="text-lg font-semibold text-white mb-2">No projects yet</h3>
              <p className="text-[#94a3b8] text-sm mb-6">
                Create your first project to start analyzing sewer and water systems.
              </p>
              <button
                onClick={() => setShowModal(true)}
                className="bg-[#38bdf8] text-[#0a0f1e] font-semibold rounded-lg px-6 py-2.5 hover:bg-[#0ea5e9] transition-colors"
              >
                New Project
              </button>
            </div>
          </div>
        )}

        {/* Project grid */}
        {!loading && !dbError && projects.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map((project) => (
              <div
                key={project.id}
                className="bg-[#0d1526] border border-[#1e293b] rounded-xl p-5 flex flex-col"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <h3 className="font-semibold text-white text-base leading-tight">{project.name}</h3>
                  <div className="relative" ref={menuOpenId === project.id ? menuRef : undefined}>
                    <button
                      onClick={() => setMenuOpenId(menuOpenId === project.id ? null : project.id)}
                      className="text-[#475569] hover:text-white transition-colors p-1 rounded"
                      aria-label="Project menu"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <circle cx="8" cy="3" r="1.5" />
                        <circle cx="8" cy="8" r="1.5" />
                        <circle cx="8" cy="13" r="1.5" />
                      </svg>
                    </button>
                    {menuOpenId === project.id && (
                      <div className="absolute right-0 top-8 z-10 bg-[#111827] border border-[#1e293b] rounded-lg shadow-xl py-1 min-w-[120px]">
                        <button
                          onClick={() => handleDelete(project.id)}
                          className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-[#1e293b] transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <p className="text-sm text-[#94a3b8] flex-1 mb-4 line-clamp-3">
                  {project.description || <span className="italic text-[#475569]">No description</span>}
                </p>

                <div className="flex items-center justify-between mt-auto pt-3 border-t border-[#1e293b]">
                  <span className="text-xs text-[#475569]">{formatDate(project.created_at)}</span>
                  <button
                    onClick={() => {
                      /* TODO: open project */
                    }}
                    className="text-sm text-[#38bdf8] hover:text-[#0ea5e9] font-medium transition-colors"
                  >
                    Open →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal */}
      {showModal && session && (
        <NewProjectModal
          userId={session.user.id}
          onClose={() => setShowModal(false)}
          onCreated={(project) => {
            setProjects((prev) => [project, ...prev]);
          }}
        />
      )}
    </div>
  );
}
