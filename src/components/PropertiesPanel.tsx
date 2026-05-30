"use client";

import { NetworkNode, NetworkPipe, NodeType } from "@/types/network";

interface PropertiesPanelProps {
  selected: NetworkNode | NetworkPipe | null;
  selectedType?: "node" | "pipe" | null;
  nodes: NetworkNode[];
  boundaryGeoJSON?: object | null;
  onUpdateNode: (id: string, updates: Partial<NetworkNode>) => void;
  onUpdatePipe: (id: string, updates: Partial<NetworkPipe>) => void;
  onDeleteNode: (id: string) => void;
  onDeletePipe: (id: string) => void;
  onClose: () => void;
  onAutoLength?: (pipeId: string) => void;
}

const NODE_TYPE_LABELS: Record<NodeType, string> = {
  junction: "Junction",
  reservoir: "Reservoir",
  tank: "Tank",
};

export default function PropertiesPanel({
  selected,
  selectedType,
  nodes,
  onUpdateNode,
  onUpdatePipe,
  onDeleteNode,
  onDeletePipe,
  onClose,
  onAutoLength,
}: PropertiesPanelProps) {
  if (!selected || !selectedType) {
    return (
      <div className="w-80 flex-shrink-0 bg-[#0d1117] border-l border-[#1e293b] h-full flex flex-col">
        <div className="p-4 border-b border-[#1e293b]">
          <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider">Properties</h3>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-[#475569] px-6 text-center">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="16" cy="16" r="12" />
            <path d="M16 11v6M16 21v1" strokeLinecap="round" />
          </svg>
          <p className="text-xs">Select a node or pipe on the map to view and edit its properties.</p>
        </div>
      </div>
    );
  }

  const isNode = selectedType === "node";
  const node = selected as NetworkNode;
  const pipe = selected as NetworkPipe;

  function calcPipeLength(): number | null {
    if (!isNode && pipe.from_node_id && pipe.to_node_id) {
      const from = nodes.find((n) => n.id === pipe.from_node_id);
      const to = nodes.find((n) => n.id === pipe.to_node_id);
      if (from && to) {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        return Math.sqrt(dx * dx + dy * dy);
      }
    }
    return null;
  }

  async function handleDelete() {
    if (!selected) return;
    if (isNode) onDeleteNode(selected.id);
    else onDeletePipe(selected.id);
  }

  return (
    <div className="w-80 h-full bg-[#0d1526] border-l border-[#1e293b] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e293b]">
        <h2 className="text-sm font-semibold text-white">
          {isNode ? "Node Properties" : "Pipe Properties"}
        </h2>
        <button onClick={onClose} className="text-[#475569] hover:text-white transition-colors" aria-label="Close panel">
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
              {(Object.keys(NODE_TYPE_LABELS) as NodeType[]).map((t) => (
                <option key={t} value={t}>{NODE_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
        )}

        {/* Elevation (nodes only) */}
        {isNode && (
          <div>
            <label className="block text-xs text-[#94a3b8] mb-1.5">Ground Elevation (ft NAVD88)</label>
            <input
              type="number"
              step="0.01"
              className="bg-[#111827] border border-[#1e293b] rounded-lg px-3 py-2 text-white text-sm placeholder-[#475569] focus:outline-none focus:border-[#38bdf8] w-full"
              value={node.elevation ?? ""}
              placeholder="—"
              onChange={(e) =>
                onUpdateNode(node.id, {
                  elevation: e.target.value === "" ? null : parseFloat(e.target.value),
                })
              }
            />
          </div>
        )}

        {/* Demand (junctions only) */}
        {isNode && node.type === "junction" && (
          <div>
            <label className="block text-xs text-[#94a3b8] mb-1.5">Demand (GPM)</label>
            <input
              type="number"
              step="0.1"
              className="bg-[#111827] border border-[#1e293b] rounded-lg px-3 py-2 text-white text-sm placeholder-[#475569] focus:outline-none focus:border-[#38bdf8] w-full"
              value={node.demand_gpm ?? ""}
              placeholder="—"
              onChange={(e) =>
                onUpdateNode(node.id, {
                  demand_gpm: e.target.value === "" ? null : parseFloat(e.target.value),
                })
              }
            />
          </div>
        )}

        {/* Hazen-Williams C-factor (junctions) */}
        {isNode && node.type === "junction" && (
          <div>
            <label className="block text-xs text-[#94a3b8] mb-1.5">Hazen-Williams C</label>
            <input
              type="number"
              step="1"
              className="bg-[#111827] border border-[#1e293b] rounded-lg px-3 py-2 text-white text-sm placeholder-[#475569] focus:outline-none focus:border-[#38bdf8] w-full"
              value={node.hazen_williams_C ?? ""}
              placeholder="—"
              onChange={(e) =>
                onUpdateNode(node.id, {
                  hazen_williams_C: e.target.value === "" ? null : parseFloat(e.target.value),
                })
              }
            />
          </div>
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
                onChange={(e) => onUpdatePipe(pipe.id, { material: e.target.value as NetworkPipe["material"] })}
              >
                {(["PVC", "HDPE", "DIP", "Concrete", "Steel", "Cast_Iron"] as const).map((m) => (
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
              {onAutoLength && (
                <button
                  onClick={() => onAutoLength(pipe.id)}
                  className="mt-1 w-full rounded text-xs px-3 py-1.5 bg-[#111827] border border-[#1e293b] text-[#94a3b8] hover:border-[#f97316]/50 hover:text-[#f97316] transition-colors"
                >
                  Auto-Calculate from Coordinates
                </button>
              )}
            </div>

            <div>
              <label className="block text-xs text-[#94a3b8] mb-1.5">Hazen-Williams C</label>
              <input
                type="number"
                step="1"
                className="bg-[#111827] border border-[#1e293b] rounded-lg px-3 py-2 text-white text-sm placeholder-[#475569] focus:outline-none focus:border-[#38bdf8] w-full"
                value={pipe.hazen_williams_C ?? ""}
                placeholder="—"
                onChange={(e) =>
                  onUpdatePipe(pipe.id, {
                    hazen_williams_C: e.target.value === "" ? null : parseFloat(e.target.value),
                  })
                }
              />
            </div>

            <div>
              <label className="block text-xs text-[#94a3b8] mb-1.5">Installation Year</label>
              <input
                type="number"
                step="1"
                min="1900"
                max="2100"
                className="bg-[#111827] border border-[#1e293b] rounded-lg px-3 py-2 text-white text-sm placeholder-[#475569] focus:outline-none focus:border-[#38bdf8] w-full"
                value={pipe.installation_year ?? ""}
                placeholder="—"
                onChange={(e) =>
                  onUpdatePipe(pipe.id, {
                    installation_year: e.target.value === "" ? null : parseInt(e.target.value),
                  })
                }
              />
            </div>
          </>
        )}

        {/* Comments */}
        <div>
          <label className="block text-xs text-[#94a3b8] mb-1.5">Comments</label>
          <textarea
            rows={3}
            maxLength={1000}
            className="bg-[#111827] border border-[#1e293b] rounded-lg px-3 py-2 text-white text-sm placeholder-[#475569] focus:outline-none focus:border-[#38bdf8] w-full resize-none"
            value={(selected.properties?.comments as string) ?? ""}
            placeholder="Add notes…"
            onChange={(e) => {
              const comments = e.target.value;
              if (isNode) {
                onUpdateNode(node.id, { properties: { ...node.properties, comments } });
              } else {
                onUpdatePipe(pipe.id, { properties: { ...pipe.properties, comments } });
              }
            }}
          />
          <p className="text-xs text-[#475569] mt-0.5 text-right">
            {((selected.properties?.comments as string) ?? "").length}/1000
          </p>
        </div>
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