"use client";

/**
 * SimulationPanel — Bottom Drawer Component
 * ==========================================
 *
 * Renders the steady-state simulation results in a slide-up bottom drawer.
 * The panel is hidden (height 0) when closed and expands to a fixed 18 rem
 * (288 px) when opened. Inside the panel:
 *
 *   1. Header — title, optional timestamp, close button
 *   2. Summary chips — aggregate counts of pipes/nodes by status
 *   3. Scrollable pipe-results table — one row per pipe with hydraulic values
 *   4. Warnings list — expandable list of all validation warnings, if any
 *
 * The panel is controlled entirely by props passed from ProjectDetailClient:
 *   - result  : SimulationResult | null  — null while loading or before first run
 *   - loading : boolean            — true while the async supabase save + run executes
 *   - show    : boolean            — true when the user has clicked "Run Analysis"
 *   - onClose : () => void         — hides the panel; does NOT clear result
 *
 * ## Colour / Badge Semantics
 *
 *   ok      → green (#22c55e) — pipe passes all checks
 *   warning → amber (#f59e0b) — pipe passes hydraulically but misses a guideline
 *                             (e.g., V < 2 fps or V > 10 fps)
 *   error   → red            — pipe cannot be analysed (missing slope, etc.)
 *
 * ## Design Choices
 *
 *   - Fixed height (not flexible) so the table never grows off-screen
 *   - "sticky" table header so column labels remain visible while scrolling
 *   - No elevation/fetch data here — pure display only
 *   - Timestamps shown in local browser time (toLocaleTimeString)
 */

import type { SimulationResult } from "@/lib/simulation";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Renders a small coloured pill/badge showing the status of a pipe or node.
 *
 * @param status - One of "ok", "warning", "error"
 */
function StatusBadge({ status }: { status: "ok" | "warning" | "error" }) {
  // Maps guerreys → Tailwind colour classes and display labels
  const styles = {
    ok:      "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
    warning: "bg-amber-500/15    text-amber-400    border border-amber-500/30",
    error:   "bg-red-500/15      text-red-400      border border-red-500/30",
  };
  const labels = { ok: "✓ OK", warning: "⚠ Warn", error: "✗ Err" };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface SimulationPanelProps {
  /**
   * The full simulation result object.
   * Is `null` before the first run completes and after the panel is closed.
   */
  result: SimulationResult | null;

  /**
   * True while the async runSimulation() call + Supabase INSERT is in-flight.
   * Shows an animated spinner and "Running analysis…" message instead of results.
   */
  loading: boolean;

  /**
   * True when the panel should be visible (user clicked "Run Analysis").
   * Parent is responsible for managing this state.
   */
  show: boolean;

  /** Called when the user clicks the × close button. */
  onClose: () => void;
}

export default function SimulationPanel({ result, loading, show, onClose }: SimulationPanelProps) {
  // Hidden state — render nothing so it doesn't occupy DOM space
  if (!show) return null;

  // -------------------------------------------------------------------------
  // Loading State
  // Displayed while the parent component is awaiting the simulation result
  // from runSimulation() and the Supabase INSERT for persistence.
  // -------------------------------------------------------------------------
  if (loading) {
    return (
      <div
        className="fixed bottom-0 left-0 right-0 z-[2000] flex items-center justify-center"
        style={{ height: "18rem", backgroundColor: "#0d1526", borderTop: "1px solid #1e293b" }}
      >
        {/* Animated spinner (CSS-only, no library) */}
        <div
          className="w-5 h-5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin"
          aria-hidden="true"
        />
        <span className="ml-3 text-slate-400 text-sm">Running analysis…</span>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Results State — guaranteed non-null when loading is false
  // -------------------------------------------------------------------------
  if (!result) return null;

  // Convenience aliases for the three sub-objects
  const { summary, pipe_results, warnings } = result;

  return (
    <div
      /** Fixed to the viewport bottom; full width; above the map canvas (z 2000) */
      className="fixed bottom-0 left-0 right-0 z-[2000] flex flex-col"
      style={{ height: "18rem", maxHeight: "40vh" }}
    >
      <div
        className="flex flex-col h-full overflow-hidden bg-[#0d152a]"
        style={{ borderTop: "1px solid #1e293b" }}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-5 py-3 flex-shrink-0"
          style={{ borderBottom: "1px solid #1e293b" }}
        >
          <div className="flex items-center gap-4">
            {/* Section title */}
            <h2 className="text-white font-semibold text-sm tracking-wide">
              Analysis Results
            </h2>

            {/* Optional timestamp — only shown after a run (not before first run) */}
            {result && (
              <span className="text-slate-500 text-xs">
                {new Date().toLocaleTimeString()}
              </span>
            )}
          </div>

          {/* Close (×) button */}
          <button
            onClick={onClose}
            aria-label="Close analysis panel"
            className="text-slate-500 hover:text-white transition-colors text-lg leading-none
                       w-6 h-6 flex items-center justify-center rounded"
          >
            ×
          </button>
        </div>

        {/* ── Summary Chips ─────────────────────────────────────────────── */}
        {/*
          Summary chips give the engineer an instant at-a-glance health readout
          before they dive into the detailed table. We show:
            - Total pipes in the network
            - Pipes with OK status (green)
            - Combined warning count (pipes + nodes)
            - Combined error count (pipes only — nodes don't produce errors in M3)
            - Average design velocity across the network
        */}
        <div className="flex items-center gap-2 px-5 py-2.5 flex-shrink-0 overflow-x-auto">
          {/* Total pipe count */}
          <div className="flex items-center gap-2 rounded-full px-3.5 py-1.5" style={{ backgroundColor: "#1e293b", border: "1px solid #1e293b" }}>
            <span className="text-slate-400 text-xs">Total Pipes</span>
            <span className="text-white text-xs font-bold">{summary.total_pipes}</span>
          </div>

          {/* Pipes OK */}
          <div className="flex items-center gap-2 rounded-full px-3.5 py-1.5" style={{ backgroundColor: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)" }}>
            <span className="text-emerald-400 text-xs">✓ OK</span>
            <span className="text-emerald-400 text-xs font-bold">{summary.pipes_ok}</span>
          </div>

          {/* Combined warning count (pipe + node warnings) */}
          {summary.pipes_warning + summary.nodes_warning > 0 && (
            <div className="flex items-center gap-2 rounded-full px-3.5 py-1.5" style={{ backgroundColor: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)" }}>
              <span className="text-amber-400 text-xs">⚠ Warnings</span>
              <span className="text-amber-400 text-xs font-bold">
                {summary.pipes_warning + summary.nodes_warning}
              </span>
            </div>
          )}

          {/* Error count — only shown if there are errors */}
          {summary.pipes_error > 0 && (
            <div className="flex items-center gap-2 rounded-full px-3.5 py-1.5" style={{ backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)" }}>
              <span className="text-red-400 text-xs">✗ Errors</span>
              <span className="text-red-400 text-xs font-bold">{summary.pipes_error}</span>
            </div>
          )}

          {/* Average design velocity — only shown if there is at least one pipe */}
          {summary.avg_velocity_fps > 0 && (
            <div className="flex items-center gap-2 rounded-full px-3.5 py-1.5" style={{ backgroundColor: "#1e293b", border: "1px solid #1e293b" }}>
              <span className="text-slate-400 text-xs">Avg V</span>
              <span className="text-white text-xs font-bold">
                {summary.avg_velocity_fps.toFixed(2)} fps
              </span>
            </div>
          )}

          {/* Min / max velocity range */}
          {summary.avg_velocity_fps > 0 && (
            <div className="flex items-center gap-2 rounded-full px-3.5 py-1.5" style={{ backgroundColor: "#1e293b", border: "1px solid #1e293b" }}>
              <span className="text-slate-400 text-xs">Range</span>
              <span className="text-white text-xs font-bold">
                {summary.min_velocity_fps.toFixed(1)}–{summary.max_velocity_fps.toFixed(1)} fps
              </span>
            </div>
          )}
        </div>

        {/* ── Pipe Results Table ─────────────────────────────────────────── */}
        {/*
          The table is the primary engineering deliverable of the simulation.
          Columns shown:
            - Pipe Label    : user-assigned name
            - Dia (in)      : inside diameter in inches
            - Slope (%)     : pipe slope as a percentage (3 decimal places for precision)
            - Q Full (cfs)  : full-pipe capacity from Manning's equation
            - V Full (fps)  : full-pipe velocity
            - V Design (fps): half-full velocity = 0.5 × V_full (shown in status context)
            - Status       : ok / warning / error badge

          The table header is sticky so it remains visible while scrolling through
          many pipes. This is critical for usability on projects with 50+ pipes.
        */}
        <div className="flex-1 overflow-y-auto px-5 pb-3">
          <table className="w-full text-xs">
            <colgroup>
              {/*
                Column width proportions — label gets most space,
                numeric columns are right-aligned and narrow.
              */}
              <col style={{ width: "25%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "25%" }} />
            </colgroup>

            {/* Sticky table header — stays at top while scrolling */}
            <thead className="sticky top-0 z-10" style={{ backgroundColor: "#0d152a" }}>
              <tr style={{ borderBottom: "1px solid #1e293b" }}>
                {["Pipe", "Dia (in)", "Slope (%)", "Q Full (cfs)", "V Full (fps)", "Status / Notes"].map((col) => (
                  <th
                    key={col}
                    className={`text-left pb-2 font-medium text-slate-500 ${col === "Pipe" ? "" : "text-right"}`}
                    style={{ paddingRight: col === "Pipe" ? "1rem" : "1rem", paddingBottom: "0.5rem" }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {pipe_results.map((pr) => (
                <tr
                  key={pr.pipe_id}
                  /**
                   * Subtle row highlight on hover to aid line tracing.
                   * Error rows get a very faint red background to stand out.
                   */
                  className="transition-colors"
                  style={{
                    borderBottom: "1px solid rgba(30,41,59,0.5)",
                    backgroundColor: pr.status === "error" ? "rgba(239,68,68,0.04)" : undefined,
                  }}
                >
                  {/* Pipe label — bold so it's easy to read on a map */}
                  <td className="py-1.5 pr-4 text-white font-medium">{pr.label}</td>

                  {/* Diameter in inches */}
                  <td className="py-1.5 pr-4 text-right text-slate-400">
                    {pr.diameter_in > 0 ? pr.diameter_in : "—"}
                  </td>

                  {/* Slope as percent — 3 decimal places for precision on low slopes */}
                  <td className="py-1.5 pr-4 text-right text-slate-400">
                    {pr.slope_pct !== null ? pr.slope_pct.toFixed(3) : "—"}
                  </td>

                  {/* Full-pipe capacity in cfs */}
                  <td className="py-1.5 pr-4 text-right text-slate-400">
                    {pr.q_full_cfs > 0 ? pr.q_full_cfs.toFixed(3) : "—"}
                  </td>

                  {/* Full-pipe velocity in fps */}
                  <td className="py-1.5 pr-4 text-right text-slate-400">
                    {pr.v_full_fps > 0 ? pr.v_full_fps.toFixed(2) : "—"}
                  </td>

                  {/* Status badge + notes column */}
                  <td className="py-1.5 flex flex-col gap-1">
                    <StatusBadge status={pr.status} />
                    {pr.notes.length > 0 && (
                      <span className={`text-xs ${pr.status === "error" ? "text-red-400" : "text-amber-400"}`}>
                        {pr.notes.join(" · ")}
                      </span>
                    )}
                  </td>
                </tr>
              ))}

              {/* Empty state — shown when the network has no pipes */}
              {pipe_results.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No pipes in this project. Add pipes to run an analysis.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── Warnings List ──────────────────────────────────────────────── */}
        {/*
          Displayed below the table only when there are warnings or errors.
          Provides a concise textual summary of all issues found, grouped by type.
          This is the actionable output — the engineer can read the list to
          understand what needs to be fixed before re-running.
        */}
        {warnings.length > 0 && (
          <div
            className="flex-shrink-0 px-5 py-2 overflow-y-auto"
            style={{ borderTop: "1px solid #1e293b", maxHeight: "5rem" }}
          >
            <p className="text-xs text-slate-500 mb-1.5 font-medium uppercase tracking-wider">
              Issues ({warnings.length})
            </p>
            <div className="flex flex-col gap-0.5">
              {warnings.map((w, i) => (
                <p
                  key={i}
                  /**
                   * Error-type messages get a red dot; warning-type get amber.
                   * This makes it easy to scan for critical issues first.
                   */
                  className={`text-xs ${
                    w.type === "pipe" && w.message.includes("Missing") || w.type === "pipe" && w.message.includes("Negative")
                      ? "text-red-400"
                      : "text-amber-400"
                  }`}
                >
                  {w.type === "pipe" ? "⚠" : w.type === "node" ? "⚠" : "ℹ"}{" "}
                  {w.message}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
