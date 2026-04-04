"use client";

import { NetworkNode, NetworkPipe, PipeMaterial, NodeType } from "@/types/network";

interface PropertiesPanelProps {
  selected: NetworkNode | NetworkPipe | null;
  selectedType: "node" | "pipe" | null;
  nodes: NetworkNode[];
  onUpdateNode: (id: string, updates: Partial<NetworkNode>) => void;
  onUpdatePipe: (id: string, updates: Partial<NetworkPipe>) => void;
  onDeleteNode: (id: string) => void;
  onDeletePipe: (id: string) => void;
  onClose: () => void;
  onFetchElevation?: (nodeId: string, lat: number, lng: number) => void;
  fetchingElevation?: boolean;
}

const NODE_TYPES: NodeType[] = ["manhole", "inlet", "outlet", "junction", "lift_station"];
const PIPE_MATERIALS: PipeMaterial[] = ["PVC", "RCP", "HDPE", "DI"];

export default function PropertiesPanel({
  selected,
  selectedType,
  nodes,
  onUpdateNode,
  onUpdatePipe,
  onDeleteNode,
  onDeletePipe,
  onClose,
  onFetchElevation,
  fetchingElevation,
}: PropertiesPanelProps) {
  if (!selected || !selectedType) return null;

  const isNode = selectedType === "node";
  const node = selected as NetworkNode;
  const pipe = selected as NetworkPipe;

  function calcPipeLength(): number | null {
    if (!isNode && pipe.from_node_id && pipe.to_node_id) {
      const from = nodes.find((n) => n.id === pipe.from_node_id);
      const to = nodes.find((n) => n.id === pipe.to_node_id);
      if (from && to) {
        const R = 20902230; // Earth radius in feet
        const lat1 = (from.lat * Math.PI) / 180;
        const lat2 = (to.lat * Math.PI) / 180;
        const dLat = ((to.lat - from.lat) * Math.PI) / 180;
        const dLng = ((to.lng - from.lng) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return Math.round(R * c * 100) / 100;
      }
    }
    return null;
  }

  async function handleDelete() {
    if (!selected) return;
    if (isNode) {
      onDeleteNode(selected.id);
    } else {
      onDeletePipe(selected.id);
    }
  }

  return (
    <div className="w-80 h-full bg-[#0d1526] border-l border-[#1e293b] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e293b]">
        <h2 className="text-sm font-semibold text-white">
          {isNode ? "Node Properties" : "Pipe Properties"}
        </h2>
        <button
          onClick={onClose}
          className="text-[#475569] hover:text-white transition-colors"
          aria-label="Close panel"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="3" x2="13" y2="13" />
            <line x1="13" y1="3" x2="3" y2="13" />
          </svg>
        </button>
      </div>

      {/* Fields */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Label */}
        <div>
          <label className="block text-xs text-[#94a3b8] mb-1.5">Label</label>
          <input
            type="text"
            className="bg-[#111827] border border-[#1e293b] rounded-lg px-3 py-2 text-white text-sm placeholder-[#475569] focus:outline-none focus:border-[#38bdf8] w-full"
            value={isNode ? node.label : pipe.label}
            placeholder="Enter label..."
            onChange={(e) => {
              if (isNode) onUpdateNode(node.id, { label: e.target.value });
              else onUpdatePipe(pipe.id, { label: e.target.value });
            }}
          />
        </div>

        {/* Type (nodes only) */}
        {isNode && (
          <div>
            <label className="block text-xs text-[#94a3b8] mb-1.5">Type</label>
            <select
              className="bg-[#111827] border border-[#1e293b] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#38bdf8] w-full"
              value={node.type}
              onChange={(e) => onUpdateNode(node.id, { type: e.target.value as NodeType })}
            >
              {NODE_TYPES.map((t) => (
                <option key={t} value={t}>{t.replace("_", " ")}</option>
              ))}
            </select>
          </div>
        )}

        {/* Elevations (nodes only) */}
        {isNode && (
          <>
            <div>
              <label className="block text-xs text-[#94a3b8] mb-1.5">Rim Elevation (ft)</label>
              {node.rim_elev != null && (
                <span className="text-xs text-[#38bdf8] ml-2">{node.rim_elev.toLocaleString()} ft</span>
              )}
              {onFetchElevation && (
                <button
                  onClick={() => onFetchElevation(node.id, node.lat, node.lng)}
                  disabled={fetchingElevation}
                  className="ml-2 text-xs px-2 py-0.5 rounded bg-[#1e293b] text-[#38bdf8] hover:bg-[#38bdf8]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {fetchingElevation ? "Fetching…" : "Fetch Elevation"}
                </button>
              )}
              <input
                type="number"
                step="0.01"
                className="bg-[#111827] border border-[#1e293b] rounded-lg px-3 py-2 text-white text-sm placeholder-[#475569] focus:outline-none focus:border-[#38bdf8] w-full mt-1.5"
                value={node.rim_elev ?? ""}
                placeholder="—"
                onChange={(e) =>
                  onUpdateNode(node.id, {
                    rim_elev: e.target.value === "" ? null : parseFloat(e.target.value),
                  })
                }
              />
            </div>
            <div>
              <label className="block text-xs text-[#94a3b8] mb-1.5">Invert Elevation (ft)</label>
              <input
                type="number"
                step="0.01"
                className="bg-[#111827] border border-[#1e293b] rounded-lg px-3 py-2 text-white text-sm placeholder-[#475569] focus:outline-none focus:border-[#38bdf8] w-full"
                value={node.invert_elev ?? ""}
                placeholder="—"
                onChange={(e) =>
                  onUpdateNode(node.id, {
                    invert_elev: e.target.value === "" ? null : parseFloat(e.target.value),
                  })
                }
              />
            </div>
          </>
        )}

        {/* Pipe-specific fields */}
        {!isNode && (
          <>
            <div>
              <label className="block text-xs text-[#94a3b8] mb-1.5">Diameter (in)</label>
              <input
                type="number"
                step="0.5"
                min="1"
                className="bg-[#111827] border border-[#1e293b] rounded-lg px-3 py-2 text-white text-sm placeholder-[#475569] focus:outline-none focus:border-[#38bdf8] w-full"
                value={pipe.diameter_in}
                onChange={(e) =>
                  onUpdatePipe(pipe.id, { diameter_in: parseFloat(e.target.value) || 8 })
                }
              />
            </div>

            <div>
              <label className="block text-xs text-[#94a3b8] mb-1.5">Material</label>
              <select
                className="bg-[#111827] border border-[#1e293b] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#38bdf8] w-full"
                value={pipe.material}
                onChange={(e) => onUpdatePipe(pipe.id, { material: e.target.value as PipeMaterial })}
              >
                {PIPE_MATERIALS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-[#94a3b8] mb-1.5">Length (ft)</label>
              <input
                type="number"
                step="0.1"
                className="bg-[#111827] border border-[#1e293b] rounded-lg px-3 py-2 text-white text-sm placeholder-[#475569] focus:outline-none focus:border-[#38bdf8] w-full"
                value={pipe.length_ft ?? ""}
                placeholder="Auto-calculated"
                onChange={(e) =>
                  onUpdatePipe(pipe.id, {
                    length_ft: e.target.value === "" ? null : parseFloat(e.target.value),
                  })
                }
              />
              {!pipe.length_ft && (
                <p className="text-xs text-[#475569] mt-1">
                  Auto: {calcPipeLength()?.toFixed(2) ?? "—"} ft
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs text-[#94a3b8] mb-1.5">Slope (%)</label>
              <input
                type="number"
                step="0.01"
                className="bg-[#111827] border border-[#1e293b] rounded-lg px-3 py-2 text-white text-sm placeholder-[#475569] focus:outline-none focus:border-[#38bdf8] w-full"
                value={pipe.slope_pct ?? ""}
                placeholder="—"
                onChange={(e) =>
                  onUpdatePipe(pipe.id, {
                    slope_pct: e.target.value === "" ? null : parseFloat(e.target.value),
                  })
                }
              />
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-[#1e293b]">
        <button
          onClick={handleDelete}
          className="w-full bg-transparent border border-red-500/40 text-red-400 font-semibold rounded-lg px-4 py-2 hover:bg-red-500/10 transition-colors text-sm"
        >
          Delete {isNode ? "Node" : "Pipe"}
        </button>
      </div>
    </div>
  );
}
