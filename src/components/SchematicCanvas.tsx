/**
 * SchematicCanvas.tsx — Read-Only SVG Schematic View
 * ===================================================
 *
 * Renders the sewer pipe network as a "subway map" — nodes in horizontal
 * bands by upstream depth (computed by schematicLayout.ts), pipes as
 * orthogonal H-V polylines with flow direction arrows.
 *
 * ## What this component does
 *   - Computes layout from nodes + pipes via computeSchematicLayout()
 *   - Renders an <svg> with pan (drag) and zoom (scroll wheel)
 *   - Draws pipe connectors as SVG <polyline> elements (H-V Manhattan paths)
 *   - Draws nodes as <circle> elements with type-based coloring
 *   - Draws simulation status overlays (green/amber/red badges on pipes)
 *   - Draws flow direction arrows on each pipe mid-segment
 *
 * ## What this component does NOT do
 *   - No node/pipe editing (read-only)
 *   - No Leaflet (pure SVG)
 *   - No DOM purging — uses a root <svg> element, not an HTML container
 *
 * ## Pan & Zoom
 *
 * Implemented via a root <g> group that is transformed with:
 *   transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}
 *
 * pan: { x: number, y: number } — current translation offset
 * zoom: number — current scale (1 = 100%)
 *
 * Mouse events:
 *   onMouseDown: start pan drag
 *   onMouseMove: update pan.x/pan.y while dragging
 *   onWheel: zoom in/out centered on cursor position
 *   onMouseUp / onMouseLeave: end drag
 *
 * Zoom range: 0.25× to 4×
 * Zoom formula: newZoom = clamp(zoom * (1 + deltaY * -0.001), 0.25, 4)
 */

import React, { useCallback, useRef, useState } from "react";
import {
  computeSchematicLayout,
  SchematicNode,
  SchematicPipe,
  NODE_RADIUS,
  COLUMN_WIDTH,
  ROW_HEIGHT,
} from "@/lib/schematicLayout";
import type { NetworkNode, NetworkPipe } from "@/types/network";
import type { SimulationResult } from "@/lib/simulation";

// ---------------------------------------------------------------------------
// Color Constants
// ---------------------------------------------------------------------------

/** Fill color for each node type. */
const NODE_COLORS: Record<string, string> = {
  outlet: "#22c55e",      // green
  lift_station: "#f97316", // orange
  manhole: "#3b82f6",      // blue
  junction: "#8b5cf6",     // purple
  inlet: "#06b6d4",        // cyan
  default: "#6b7280",     // gray
};

/** Stroke color for pipes based on simulation status. */
const PIPE_STATUS_COLORS = {
  ok: "#22c55e",
  warning: "#f59e0b",
  error: "#ef4444",
  unrun: "#6b7280",
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SchematicCanvasProps {
  /** All network nodes from the DB. */
  nodes: NetworkNode[];
  /** All network pipes from the DB. */
  pipes: NetworkPipe[];
  /**
   * Optional simulation result from runSimulation().
   * If provided, pipes and nodes are colored by their status.
   * If omitted, all elements use their default/neutral color.
   */
  simulationResult?: SimulationResult | null;
  /** Width of the SVG viewport in pixels. */
  width?: number;
  /** Height of the SVG viewport in pixels. */
  height?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the SVG fill color for a node type. */
function nodeColor(type: string): string {
  return NODE_COLORS[type.toLowerCase()] ?? NODE_COLORS.default;
}

/**
 * Returns the SVG stroke color for a pipe based on simulation status.
 * If no simulation result is present, returns the unrun color.
 */
function pipeColor(
  pipeId: string,
  simulationResult: SimulationResult | null | undefined
): string {
  if (!simulationResult) return PIPE_STATUS_COLORS.unrun;
  const found = simulationResult.pipe_results.find((r) => r.pipe_id === pipeId);
  if (!found) return PIPE_STATUS_COLORS.unrun;
  return PIPE_STATUS_COLORS[found.status] ?? PIPE_STATUS_COLORS.unrun;
}

/**
 * Returns the SVG dasharray for a pipe based on simulation status.
 * Warning pipes get a dashed stroke. Others are solid.
 */
function pipeDashArray(
  pipeId: string,
  simulationResult: SimulationResult | null | undefined
): string {
  if (!simulationResult) return "";
  const found = simulationResult.pipe_results.find((r) => r.pipe_id === pipeId);
  if (found?.status === "warning") return "6 3";
  return "";
}

// ---------------------------------------------------------------------------
// Sub-Components
// ---------------------------------------------------------------------------

/** Renders a single node circle in the schematic. */
function SchematicNodeEl({ sn }: { sn: SchematicNode }) {
  const color = nodeColor(sn.node.type);
  return (
    <g transform={`translate(${sn.x} ${sn.y})`}>
      {/* Outer ring — rim elevation indicator */}
      <circle r={NODE_RADIUS + 4} fill="none" stroke={color} strokeWidth={1.5} opacity={0.4} />
      {/* Main node circle */}
      <circle r={NODE_RADIUS} fill={color} opacity={0.85} />
      {/* Type icon — first letter of node type, white, centered */}
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fill="white"
        fontSize={11}
        fontWeight={600}
        fontFamily="system-ui, sans-serif"
        pointerEvents="none"
      >
        {sn.node.type === "outlet" ? "O" :
         sn.node.type === "lift_station" ? "LS" :
         sn.node.type === "manhole" ? "M" :
         sn.node.type === "inlet" ? "I" : "J"}
      </text>
      {/* Node label below */}
      <text
        y={NODE_RADIUS + 14}
        textAnchor="middle"
        fill="#94a3b8"
        fontSize={10}
        fontFamily="system-ui, sans-serif"
        pointerEvents="none"
      >
        {sn.node.label}
      </text>
    </g>
  );
}

/**
 * Renders a single pipe as an orthogonal H-V polyline with a flow arrow.
 * The path goes: (x1, y1) → (midX, y1) → (midX, y2) → (x2, y2)
 * The arrow is drawn at the midpoint of the vertical segment.
 */
function SchematicPipeEl({
  sp,
  color,
  dashArray,
}: {
  sp: SchematicPipe;
  color: string;
  dashArray: string;
}) {
  // The H-V Manhattan path
  const path = `M ${sp.x1} ${sp.y1} L ${sp.midX} ${sp.midY} L ${sp.x2} ${sp.y2}`;
  // Arrow head: small triangle at the vertical segment midpoint, pointing down
  const arrowY = (sp.midY + sp.y2) / 2;
  const arrowSize = 6;
  const arrowPoints = `${sp.midX},${arrowY - arrowSize} ${sp.midX - arrowSize / 2},${arrowY + arrowSize / 2} ${sp.midX + arrowSize / 2},${arrowY + arrowSize / 2}`;

  return (
    <g>
      {/* Shadow/padding hit area — invisible thick line for easier hover */}
      <path d={path} fill="none" stroke="transparent" strokeWidth={12} />
      {/* Visible pipe */}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeDasharray={dashArray}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Flow direction arrow — small filled triangle */}
      <polygon points={arrowPoints} fill={color} opacity={0.8} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function SchematicCanvas({
  nodes,
  pipes,
  simulationResult,
  width = 900,
  height = 600,
}: SchematicCanvasProps) {
  // -------------------------------------------------------------------------
  // Compute layout
  // -------------------------------------------------------------------------
  const layout = computeSchematicLayout(nodes, pipes);

  // -------------------------------------------------------------------------
  // Pan & Zoom state
  // -------------------------------------------------------------------------
  const [pan, setPan] = useState({ x: 60, y: 40 });
  const [zoom, setZoom] = useState(1);
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const onMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    isDragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!isDragging.current) return;
      const dx = e.clientX - lastPos.current.x;
      const dy = e.clientY - lastPos.current.y;
      lastPos.current = { x: e.clientX, y: e.clientY };
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
    },
    []
  );

  const onMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const onWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const delta = e.deltaY;
    setZoom((z) => {
      const newZoom = z * (1 + delta * -0.001);
      return Math.max(0.25, Math.min(4, newZoom));
    });
  }, []);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="relative w-full h-full bg-[#0d1526] overflow-hidden select-none">
      {/* Subtle grid background */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `
            linear-gradient(#334155 1px, transparent 1px),
            linear-gradient(90deg, #334155 1px, transparent 1px)
          `,
          backgroundSize: `${COLUMN_WIDTH * zoom}px ${ROW_HEIGHT * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      />
      <svg
        width="100%"
        height="100%"
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
      >
        <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
          {/* Pipe connectors — rendered below nodes so circles overlap line ends */}
          {layout.pipes.map((sp) => (
            <SchematicPipeEl
              key={sp.pipe.id}
              sp={sp}
              color={pipeColor(sp.pipe.id, simulationResult)}
              dashArray={pipeDashArray(sp.pipe.id, simulationResult)}
            />
          ))}
          {/* Node circles */}
          {layout.nodes.map((sn) => (
            <SchematicNodeEl key={sn.node.id} sn={sn} />
          ))}
        </g>
      </svg>
      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1">
        <button
          onClick={() => setZoom((z) => Math.min(4, z * 1.2))}
          className="w-8 h-8 bg-[#1e293b] text-white rounded text-lg leading-none hover:bg-[#334155] transition-colors"
        >
          +
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(0.25, z / 1.2))}
          className="w-8 h-8 bg-[#1e293b] text-white rounded text-lg leading-none hover:bg-[#334155] transition-colors"
        >
          −
        </button>
        <button
          onClick={() => { setZoom(1); setPan({ x: 60, y: 40 }); }}
          className="w-8 h-8 bg-[#1e293b] text-white rounded text-xs hover:bg-[#334155] transition-colors"
        >
          R
        </button>
      </div>
      {/* Depth legend */}
      <div className="absolute top-4 left-4 text-xs text-slate-400 space-y-1">
        <div className="font-semibold text-slate-300 mb-2">Depth</div>
        {Array.from({ length: Math.max(5, Math.ceil(layout.width / COLUMN_WIDTH)) })
          .map((_, i) => i)
          .slice(0, 6)
          .map((d) => (
            <div key={d} className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded-full border border-slate-600 flex items-center justify-center text-[9px]"
              >
                {d}
              </div>
              <span>{d === 0 ? "Outlet" : `${d} step${d > 1 ? "s" : ""} upstream`}</span>
            </div>
          ))}
      </div>
    </div>
  );
}
