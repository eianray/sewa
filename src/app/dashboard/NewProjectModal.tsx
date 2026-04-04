"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Project } from "@/types/project";

interface NewProjectModalProps {
  userId: string;
  onClose: () => void;
  onCreated: (project: Project) => void;
}

export default function NewProjectModal({ userId, onClose, onCreated }: NewProjectModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);

    const { data, error: err } = await supabase
      .from("projects")
      .insert({ name: name.trim(), description: description.trim() || null, user_id: userId })
      .select()
      .single();

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    onCreated(data as Project);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(10,15,30,0.85)", backdropFilter: "blur(8px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[#0d1526] border border-[#1e293b] rounded-2xl p-8 w-full max-w-md">
        <h2 className="text-xl font-bold text-white mb-6">New Project</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-[#94a3b8] mb-2">Project Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Downtown Sewer Analysis"
              required
              className="bg-[#111827] border border-[#1e293b] rounded-lg px-4 py-3 text-white placeholder-[#475569] focus:outline-none focus:border-[#38bdf8] w-full"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm text-[#94a3b8] mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              rows={3}
              className="bg-[#111827] border border-[#1e293b] rounded-lg px-4 py-3 text-white placeholder-[#475569] focus:outline-none focus:border-[#38bdf8] w-full resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-3">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 rounded-lg border border-[#1e293b] text-[#94a3b8] hover:text-white hover:border-[#475569] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="flex-1 py-2.5 px-4 rounded-lg bg-[#38bdf8] text-[#0a0f1e] font-semibold hover:bg-[#0ea5e9] transition-colors disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
