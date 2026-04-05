"use client";

import { NetworkNode, NetworkPipe, PipeMaterial, NodeType } from "@/types/network";
import type { Facility, FacilityType } from "@/types/facility";
import { FACILITY_TYPE_LABELS } from "@/types/facility";

interface PropertiesPanelProps {
  selected: NetworkNode | NetworkPipe | null;
  selectedType?: "node" | "pipe" | "facility" | null;
  selectedFacility?: Facility | null;
  nodes: NetworkNode[];
  /** GeoJSON FeatureCollection — required for Grab LIDAR to work */
  boundaryGeoJSON?: object | null;
  onUpdateNode: (id: string, updates: Partial<NetworkNode>) => void;
  onUpdatePipe: (id: string, updates: Partial<NetworkPipe>) => void;
  onUpdateFacility?: (id: string, updates: Partial<Facility>) => void;
  onDeleteNode: (id: string) => void;
  onDeletePipe: (id: string) => void;
  onDeleteFacility?: (id: string) => void;
  onClose: () => void;
  onFetchElevation?: (nodeId: string, lat: number, lng: number) => void;
  fetchingElevation?: boolean;
  onGrabLidar?: (nodeId: string, lat: number, lng: number) => void;
  grabbingLidar?: boolean;
  onAutoSlope?: (pipeId: string) => void;
}

const NODE_TYPES: NodeType[] = ["manhole", "inlet", "outlet", "junction", "lift_station"];
const NODE_TYPE_LABELS: Record<NodeType, string> = {
  manhole: "Manhole",
  inlet: "Inlet",
  outlet: "Outlet",
  junction: "Junction",
  lift_station: "Lift Station",
};
const PIPE_MATERIALS: PipeMaterial[] = ["PVC", "RCP", "HDPE", "DI"];
const FACILITY_TYPES: FacilityType[] = ["wwtp", "lift_station", "cso", "sso", "outfall", "other"];

export default function PropertiesPanel({
  selected,
  selectedType,
  selectedFacility,
  nodes,
  boundaryGeoJSON,
  onUpdateNode,
  onUpdatePipe,
  onUpdateFacility,
  onDeleteNode,
  onDeletePipe,
  onDeleteFacility,
  onClose,
  onFetchElevation,
  fetchingElevation,
  onGrabLidar,
  grabbingLidar,
  onAutoSlope,
}: PropertiesPanelProps) {
  // Facility panel takes priority over node/pipe panel
  if (selectedType === 'facility' && selectedFacility) {
    return <FacilityPanel facility={selectedFacility} onUpdate={onUpdateFacility} onDelete={onDeleteFacility} onClose={onClose} />;
  }

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
                <option key={t} value={t}>{NODE_TYPE_LABELS[t]}</option>
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
              {onGrabLidar && (
                <button
                  onClick={() => onGrabLidar(node.id, node.lat, node.lng)}
                  disabled={grabbingLidar}
                  title={!boundaryGeoJSON ? "Import a boundary polygon first" : undefined}
                  className="mt-1 w-full rounded text-xs px-3 py-1.5 bg-[#111827] border border-[#1e293b] text-[#94a3b8] hover:border-[#38bdf8]/50 hover:text-[#38bdf8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {grabbingLidar ? "Sampling LIDAR…" : "Grab Elevation from LIDAR"}
                </button>
              )}
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
              {onAutoSlope && (
                <button
                  onClick={() => onAutoSlope(pipe.id)}
                  className="mt-1 w-full rounded text-xs px-3 py-1.5 bg-[#111827] border border-[#1e293b] text-[#94a3b8] hover:border-[#f97316]/50 hover:text-[#f97316] transition-colors"
                >
                  Auto-Calculate Slope
                </button>
              )}
            </div>
          </>
        )}

        {/* Comments — shared for nodes and pipes */}
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

// ── Facility Panel ────────────────────────────────────────────────────────────────

interface FacilityPanelProps {
  facility: Facility;
  onUpdate?: (id: string, updates: Partial<Facility>) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

function FacilityPanel({ facility, onUpdate, onDelete, onClose }: FacilityPanelProps) {
  async function handleDelete() {
    if (!onDelete) return;
    if (window.confirm(`Delete facility ${facility.facility_id}? This cannot be undone.`)) {
      onDelete(facility.id);
    }
  }

  const comments = (facility.properties?.comments as string) ?? '';

  return (
    <div className="w-80 h-full bg-[#0d1526] border-l border-[#1e293b] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e293b]">
        <h2 className="text-sm font-semibold text-white">Facility Properties</h2>
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
        {/* Facility ID — locked */}
        <div>
          <label className="block text-xs text-[#94a3b8] mb-1.5">Facility ID</label>
          <input
            type="text"
            value={facility.facility_id}
            disabled
            className="w-full rounded bg-[#1e293b]/50 border border-[#1e293b] text-[#475569] text-sm px-3 py-2 cursor-not-allowed"
          />
          <p className="text-xs text-[#475569] mt-1">System-generated — cannot be edited</p>
        </div>

        {/* Name */}
        <div>
          <label className="block text-xs text-[#94a3b8] mb-1.5">Name</label>
          <input
            type="text"
            className="bg-[#111827] border border-[#1e293b] rounded-lg px-3 py-2 text-white text-sm placeholder-[#475569] focus:outline-none focus:border-[#38bdf8] w-full"
            value={facility.name}
            placeholder="Facility name…"
            onChange={(e) => onUpdate?.(facility.id, { name: e.target.value })}
          />
        </div>

        {/* Type */}
        <div>
          <label className="block text-xs text-[#94a3b8] mb-1.5">Type</label>
          <select
            className="bg-[#111827] border border-[#1e293b] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#38bdf8] w-full"
            value={facility.facility_type}
            onChange={(e) => onUpdate?.(facility.id, { facility_type: e.target.value as FacilityType })}
          >
            {FACILITY_TYPES.map((t) => (
              <option key={t} value={t}>{FACILITY_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>

        {/* Coordinates */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-[#94a3b8] mb-1.5">Latitude</label>
            <input
              type="number"
              step="0.000001"
              className="bg-[#111827] border border-[#1e293b] rounded-lg px-3 py-2 text-white text-sm placeholder-[#475569] focus:outline-none focus:border-[#38bdf8] w-full"
              value={facility.lat}
              onChange={(e) => onUpdate?.(facility.id, { lat: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div>
            <label className="block text-xs text-[#94a3b8] mb-1.5">Longitude</label>
            <input
              type="number"
              step="0.000001"
              className="bg-[#111827] border border-[#1e293b] rounded-lg px-3 py-2 text-white text-sm placeholder-[#475569] focus:outline-none focus:border-[#38bdf8] w-full"
              value={facility.lng}
              onChange={(e) => onUpdate?.(facility.id, { lng: parseFloat(e.target.value) || 0 })}
            />
          </div>
        </div>

        {/* Capacity */}
        <div>
          <p className="text-xs text-[#94a3b8] font-medium mb-2">Capacity</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-[#475569] mb-1">cfs</label>
              <input
                type="number"
                step="0.1"
                min="0"
                className="bg-[#111827] border border-[#1e293b] rounded-lg px-3 py-2 text-white text-sm placeholder-[#475569] focus:outline-none focus:border-[#38bdf8] w-full"
                value={facility.capacity_cfs ?? ""}
                placeholder="—"
                onChange={(e) =>
                  onUpdate?.(facility.id, {
                    capacity_cfs: e.target.value === "" ? null : parseFloat(e.target.value),
                  })
                }
              />
            </div>
            <div>
              <label className="block text-xs text-[#475569] mb-1">mgd</label>
              <input
                type="number"
                step="0.1"
                min="0"
                className="bg-[#111827] border border-[#1e293b] rounded-lg px-3 py-2 text-white text-sm placeholder-[#475569] focus:outline-none focus:border-[#38bdf8] w-full"
                value={facility.capacity_mgd ?? ""}
                placeholder="—"
                onChange={(e) =>
                  onUpdate?.(facility.id, {
                    capacity_mgd: e.target.value === "" ? null : parseFloat(e.target.value),
                  })
                }
              />
            </div>
          </div>
        </div>

        {/* Allocated */}
        <div>
          <p className="text-xs text-[#94a3b8] font-medium mb-2">Allocated</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-[#475569] mb-1">cfs</label>
              <input
                type="number"
                step="0.1"
                min="0"
                className="bg-[#111827] border border-[#1e293b] rounded-lg px-3 py-2 text-white text-sm placeholder-[#475569] focus:outline-none focus:border-[#38bdf8] w-full"
                value={facility.allocated_cfs}
                onChange={(e) =>
                  onUpdate?.(facility.id, { allocated_cfs: parseFloat(e.target.value) || 0 })
                }
              />
            </div>
            <div>
              <label className="block text-xs text-[#475569] mb-1">mgd</label>
              <input
                type="number"
                step="0.1"
                min="0"
                className="bg-[#111827] border border-[#1e293b] rounded-lg px-3 py-2 text-white text-sm placeholder-[#475569] focus:outline-none focus:border-[#38bdf8] w-full"
                value={facility.allocated_mgd}
                onChange={(e) =>
                  onUpdate?.(facility.id, { allocated_mgd: parseFloat(e.target.value) || 0 })
                }
              />
            </div>
          </div>
        </div>

        {/* Remaining — read-only */}
        <div>
          <p className="text-xs text-[#94a3b8] font-medium mb-2">Remaining</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-[#475569] mb-1">cfs</label>
              <input
                type="text"
                readOnly
                className="bg-[#1e293b]/30 border border-[#1e293b] rounded-lg px-3 py-2 text-[#38bdf8] text-sm w-full cursor-default"
                value={facility.remaining_cfs.toFixed(2)}
              />
            </div>
            <div>
              <label className="block text-xs text-[#475569] mb-1">mgd</label>
              <input
                type="text"
                readOnly
                className="bg-[#1e293b]/30 border border-[#1e293b] rounded-lg px-3 py-2 text-[#38bdf8] text-sm w-full cursor-default"
                value={facility.remaining_mgd.toFixed(2)}
              />
            </div>
          </div>
        </div>

        {/* Comments */}
        <div>
          <label className="block text-xs text-[#94a3b8] mb-1.5">Comments</label>
          <textarea
            rows={3}
            maxLength={1000}
            className="bg-[#111827] border border-[#1e293b] rounded-lg px-3 py-2 text-white text-sm placeholder-[#475569] focus:outline-none focus:border-[#38bdf8] w-full resize-none"
            value={comments}
            placeholder="Add notes…"
            onChange={(e) =>
              onUpdate?.(facility.id, {
                properties: { ...facility.properties, comments: e.target.value },
              })
            }
          />
          <p className="text-xs text-[#475569] mt-0.5 text-right">{comments.length}/1000</p>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-[#1e293b]">
        <button
          onClick={handleDelete}
          className="w-full bg-transparent border border-red-500/40 text-red-400 font-semibold rounded-lg px-4 py-2 hover:bg-red-500/10 transition-colors text-sm"
        >
          Delete Facility
        </button>
      </div>
    </div>
  );
}
