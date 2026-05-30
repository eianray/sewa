"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { DrawMode, NodeType, BasemapType, LayerVisibility } from "@/types/network";
import type { FeatureCollection } from "geojson";
import type { NetworkNode, NetworkPipe } from "@/types/network";

type LayerKey = "pipes" | "junctions" | "tanks" | "reservoirs";

interface ShpPoint   { type: "Point";    lng: number; lat: number; }
interface ShpLine    { type: "PolyLine";  coords: [number, number][]; }
interface ShpPolygon { type: "Polygon";   coords: [number, number][]; }
type ShpGeom = ShpPoint | ShpLine | ShpPolygon;

interface ShpResult {
  geometries: ShpGeom[];
  records: Record<string, unknown>[];
}

function guessMapping<T extends Record<string, unknown>>(
  headers: string[],
  targets: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [target, hint] of Object.entries(targets)) {
    const lc = headers.map((h) => h.toLowerCase());
    const idx = lc.findIndex((h) => h.includes(hint.toLowerCase()));
    result[target] = idx >= 0 ? headers[idx] : "";
  }
  return result;
}

async function parseShpZip(buffer: ArrayBuffer): Promise<ShpResult> {
  const shpjs = (await import("shpjs")).default;
  const geojson = await shpjs.parseZip(buffer) as GeoJSON.FeatureCollection;
  const geometries: ShpGeom[] = [];
  const records: Record<string, unknown>[] = [];
  for (const feature of geojson.features) {
    const g = feature.geometry as GeoJSON.Point | GeoJSON.LineString | GeoJSON.Polygon;
    const props = feature.properties ?? {};
    if (g.type === "Point") {
      geometries.push({ type: "Point", lng: g.coordinates[0], lat: g.coordinates[1] });
    } else if (g.type === "LineString") {
      geometries.push({ type: "PolyLine", coords: g.coordinates as [number, number][] });
    } else if (g.type === "Polygon") {
      geometries.push({ type: "Polygon", coords: g.coordinates[0] as [number, number][] });
    }
    records.push(props);
  }
  return { geometries, records };
}

const LAYER_META: Record<LayerKey, { label: string; color: string }> = {
  pipes:      { label: "Pipes",       color: "#f97316" },
  junctions:  { label: "Junctions",  color: "#38bdf8" },
  tanks:      { label: "Tanks",       color: "#a855f7" },
  reservoirs: { label: "Reservoirs",  color: "#22c55e" },
};

interface ElementPaletteProps {
  drawMode: DrawMode;
  nodeTypeToAdd: NodeType | null;
  pipeTypeToAdd: NodeType;
  layerVisibility: LayerVisibility;
  basemap?: BasemapType;
  boundaryLabel: string | null;
  nodes: NetworkNode[];
  pipes: NetworkPipe[];
  onDrawModeChange: (mode: DrawMode) => void;
  onNodeTypeToAdd: (type: NodeType | null) => void;
  onPipeTypeToAdd: (type: NodeType) => void;
  onLayerVisibilityChange: (layers: LayerVisibility) => void;
  onBasemapChange?: (basemap: BasemapType) => void;
  onAppendNodes: (nodes: NetworkNode[]) => void;
  onAppendPipes: (pipes: NetworkPipe[]) => void;
  onImportBoundary: (fc: FeatureCollection, label: string) => void;
  onClearBoundary: () => void;
  projectId: string;
}

const NODE_TYPE_LABELS: Record<NodeType, string> = {
  junction: "Junction",
  reservoir: "Reservoir",
  tank: "Tank",
};

export default function ElementPalette({
  drawMode,
  nodeTypeToAdd,
  pipeTypeToAdd,
  layerVisibility,
  basemap,
  boundaryLabel,
  nodes,
  pipes,
  onDrawModeChange,
  onNodeTypeToAdd,
  onPipeTypeToAdd,
  onLayerVisibilityChange,
  onBasemapChange,
  onAppendNodes,
  onAppendPipes,
  onImportBoundary,
  onClearBoundary,
}: ElementPaletteProps) {
  const [menuOpen, setMenuOpen] = useState<LayerKey | null>(null);
  const [mappingOpen, setMappingOpen] = useState<LayerKey | null>(null);
  const [shpData, setShpData] = useState<ShpResult | null>(null);
  const [pendingLayer, setPendingLayer] = useState<LayerKey | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [appendError, setAppendError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const handleFile = useCallback(async (layer: LayerKey, file: File) => {
    setAppendError(null);
    try {
      const buffer = await file.arrayBuffer();
      const data = await parseShpZip(buffer);
      setShpData(data);
      setPendingLayer(layer);
      const sample = data.records[0] ?? {};
      const headers = Object.keys(sample);
      let auto: Record<string, string> = {};
      if (layer === "junctions" || layer === "tanks" || layer === "reservoirs") {
        auto = guessMapping(headers, { label: "label", x: "x", y: "y", elevation: "elev", demand_gpm: "demand" });
      } else if (layer === "pipes") {
        auto = guessMapping(headers, { from_node: "from", to_node: "to", label: "label", diam_in: "diam", length_ft: "length", material: "material" });
      }
      setMapping(auto);
      setMappingOpen(layer);
    } catch (err) {
      setAppendError("Parse error: " + (err instanceof Error ? err.message : String(err)));
    }
  }, [onImportBoundary]);

  const commitAppend = useCallback(() => {
    if (!shpData || !pendingLayer) return;
    setMappingOpen(null);
    try {
      if (pendingLayer === "junctions" || pendingLayer === "tanks" || pendingLayer === "reservoirs") {
        const nodeType: NodeType = pendingLayer === "reservoirs" ? "reservoir" : pendingLayer === "tanks" ? "tank" : "junction";
        const imported = shpData.geometries
          .filter((g): g is ShpPoint => g.type === "Point")
          .map((g, i) => {
            const rec = shpData.records[i] ?? {};
            const lbl = mapping.label ? String(rec[mapping.label] ?? "") : "";
            return {
              id: "", project_id: "", user_id: "",
              type: nodeType,
              x: g.lng, y: g.lat,
              label: lbl || ("N" + (i + 1)),
              elevation: mapping.elevation ? Number(rec[mapping.elevation]) ?? null : null,
              demand_gpm: mapping.demand_gpm ? Number(rec[mapping.demand_gpm]) ?? null : null,
              hazen_williams_C: null,
              properties: {},
              created_at: "",
            } as unknown as NetworkNode;
          });
        if (imported.length) onAppendNodes(imported);
      } else if (pendingLayer === "pipes") {
        const nodeByLabel: Record<string, NetworkNode> = {};
        nodes.forEach((n) => { nodeByLabel[n.label] = n; });
        const imported: NetworkPipe[] = [];
        for (let i = 0; i < shpData.geometries.length; i++) {
          const geom = shpData.geometries[i];
          if (geom.type !== "PolyLine") continue;
          const rec = shpData.records[i] ?? {};
          const fromLbl = mapping.from_node ? String(rec[mapping.from_node] ?? "") : "";
          const toLbl   = mapping.to_node   ? String(rec[mapping.to_node]   ?? "") : "";
          const fromNode = nodeByLabel[fromLbl];
          const toNode   = nodeByLabel[toLbl];
          if (!fromNode || !toNode) continue;
          const [lng1] = geom.coords[0];
          const [lng2] = geom.coords[geom.coords.length - 1];
          const lbl = mapping.label ? String(rec[mapping.label] ?? (fromLbl + "-" + toLbl)) : (fromLbl + "-" + toLbl);
          imported.push({
            id: "", project_id: "", user_id: "",
            label: lbl,
            from_node_id: fromNode.id,
            to_node_id: toNode.id,
            diameter_in: mapping.diam_in ? Number(rec[mapping.diam_in]) || 12 : 12,
            length_ft: mapping.length_ft ? Number(rec[mapping.length_ft]) ?? null : null,
            hazen_williams_C: null,
            material: (mapping.material ? String(rec[mapping.material] ?? "PVC") : "PVC") as NetworkPipe["material"],
            installation_year: null,
            properties: {},
            created_at: "",
          });
        }
        if (imported.length) onAppendPipes(imported);
      }
    } catch (err) {
      setAppendError(String(err));
    } finally {
      setShpData(null);
      setPendingLayer(null);
    }
  }, [shpData, pendingLayer, mapping, nodes, onAppendNodes, onAppendPipes]);

  const counts: Record<LayerKey, number> = {
    pipes:      pipes.length,
    junctions:  nodes.filter((n) => n.type === "junction").length,
    tanks:      nodes.filter((n) => n.type === "tank").length,
    reservoirs: nodes.filter((n) => n.type === "reservoir").length,
  };

  const LAYER_KEYS: LayerKey[] = ["pipes", "junctions", "tanks", "reservoirs"];

  return (
    <aside className="w-52 flex flex-col bg-[#0d1117] border-l border-[#1e293b] h-full overflow-y-auto">

      {/* Draw Tools */}
      <div className="p-4 border-b border-[#1e293b]">
        <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-2">
          Add Node
        </h3>
        <div className="grid grid-cols-2 gap-1 mb-3">
          {(Object.keys(NODE_TYPE_LABELS) as NodeType[]).map((nt) => {
            const active = drawMode === "node" && nodeTypeToAdd === nt;
            const color = nt === "reservoir" ? "#22c55e" : nt === "tank" ? "#a855f7" : "#38bdf8";
            return (
              <button
                key={nt}
                onClick={() => {
                  if (active) { onDrawModeChange("none"); onNodeTypeToAdd(null); }
                  else { onNodeTypeToAdd(nt); onDrawModeChange("node"); }
                }}
                style={active ? { backgroundColor: color, color: "#0d1117" } : { borderLeft: "3px solid " + color }}
                className={"text-xs rounded px-2 py-1.5 text-left transition-colors truncate border border-transparent " +
                  (active ? "font-semibold" : "bg-[#1e293b] text-[#e2e8f0] hover:bg-[#334155]")}
                title={NODE_TYPE_LABELS[nt]}
              >
                {NODE_TYPE_LABELS[nt]}
              </button>
            );
          })}
        </div>

        <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-2">
          Draw Pipe
        </h3>
        <button
          onClick={() => {
            if (drawMode === "pipe") onDrawModeChange("none");
            else onDrawModeChange("pipe");
          }}
          style={drawMode === "pipe" ? { backgroundColor: "#f97316", color: "#0d1117" } : { borderLeft: "3px solid #f97316" }}
          className={"w-full text-xs rounded px-2 py-1.5 text-left transition-colors border border-transparent " +
            (drawMode === "pipe" ? "font-semibold" : "bg-[#1e293b] text-[#e2e8f0] hover:bg-[#334155]")}
        >
          Pipe
        </button>
      </div>

      {/* Layers */}
      <div className="p-4 flex-1">
        <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-3">
          Layers
        </h3>
        <div className="space-y-1">
          {LAYER_KEYS.map((layer) => {
            const meta  = LAYER_META[layer];
            const isOn  = layerVisibility[layer] ?? true;
            const count = counts[layer];
            return (
              <div
                key={layer}
                className={"flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all " +
                  (isOn ? "bg-[#1e293b] text-white" : "bg-[#111827] text-[#94a3b8]")}
              >
                <button
                  onClick={() => onLayerVisibilityChange({ ...layerVisibility, [layer]: !isOn })}
                  title={isOn ? "Hide layer" : "Show layer"}
                >
                  <span className={"w-4 h-4 rounded border inline-flex items-center justify-center transition-colors " +
                    (isOn ? "border-[#38bdf8] bg-[#38bdf8]" : "border-[#475569]")}>
                    {isOn && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2">
                        <polyline points="1.5,5 4,7.5 8.5,2.5" />
                      </svg>
                    )}
                  </span>
                </button>
                <span className="flex-1 truncate">{meta.label}</span>
                {count > 0 && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-white/70">{count}</span>
                )}
                <div className="relative flex-shrink-0">
                  <div ref={layer === menuOpen ? menuRef : undefined}>
                    <button
                      onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === layer ? null : layer); }}
                      className="w-6 h-6 rounded hover:bg-white/10 flex items-center justify-center text-[#94a3b8] hover:text-white transition-colors"
                      title="Layer options"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                        <circle cx="3"  cy="7" r="1.2" /><circle cx="7"  cy="7" r="1.2" /><circle cx="11" cy="7" r="1.2" />
                      </svg>
                    </button>
                    {menuOpen === layer && (
                      <div className="absolute right-0 top-full mt-1 z-50 w-44 bg-[#1e293b] border border-[#334155] rounded-lg shadow-xl overflow-hidden">
                        <button
                          onClick={() => {
                            setMenuOpen(null);
                            const input = document.getElementById("append-" + layer) as HTMLInputElement;
                            if (input) input.click();
                          }}
                          className="w-full px-3 py-2 text-left text-xs text-[#e2e8f0] hover:bg-white/10 flex items-center gap-2"
                        >
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M6 1v7M3 5l3 3 3-3M1 10h10" />
                          </svg>
                          Append Data
                        </button>
                        <button
                          onClick={() => {
                            setMenuOpen(null);
                            window.dispatchEvent(new CustomEvent("aquaflow:clear-layer:" + layer));
                          }}
                          className="w-full px-3 py-2 text-left text-xs text-red-400 hover:bg-white/10 flex items-center gap-2"
                        >
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M2 3h8M4 3V2h4v1M5 5v4M7 5v4M2 3l1 7h6l1-7" />
                          </svg>
                          Clear Layer
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Draw mode banner */}
      {drawMode !== "none" && (
        <div className="p-4 border-t border-[#1e293b]">
          <div className="bg-[#38bdf8]/10 border border-[#38bdf8]/30 rounded-lg px-3 py-2 text-xs text-[#38bdf8] text-center">
            {drawMode === "node" && nodeTypeToAdd ? "Placing " + NODE_TYPE_LABELS[nodeTypeToAdd] + "…" : drawMode === "pipe" ? "Click 2 nodes to draw pipe" : ""}
            <button onClick={() => { onDrawModeChange("none"); onNodeTypeToAdd(null); }} className="ml-2 underline hover:no-underline">Cancel</button>
          </div>
        </div>
      )}

      {/* Hidden file inputs */}
      {(["pipes", "junctions", "tanks", "reservoirs"] as LayerKey[]).map((layer) => (
        <input
          key={layer}
          id={"append-" + layer}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(layer, file);
            e.target.value = "";
          }}
        />
      ))}

      {/* Field mapping modal */}
      {mappingOpen && shpData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60">
          <div className="bg-[#0d1117] border border-[#334155] rounded-xl w-96 max-h-[80vh] overflow-y-auto shadow-2xl">
            <div className="p-4 border-b border-[#1e293b]">
              <h2 className="text-sm font-semibold text-white">Map Fields — {LAYER_META[mappingOpen].label}</h2>
              <p className="text-xs text-[#94a3b8] mt-1">{shpData.records.length} record{shpData.records.length !== 1 ? "s" : ""} found</p>
            </div>
            <div className="p-4 space-y-3">
              {Object.entries(
                mappingOpen === "pipes"
                  ? { from_node: "From Node", to_node: "To Node", label: "Pipe Label", diam_in: "Diameter (in)", length_ft: "Length (ft)", material: "Material" }
                  : { label: "Node Label", x: "X / Easting", y: "Y / Northing", elevation: "Elevation (ft)", demand_gpm: "Demand (GPM)" }
              ).map(([target, hint]) => (
                <div key={target} className="flex items-center gap-2">
                  <span className="text-xs text-[#94a3b8] w-28 flex-shrink-0">{hint}</span>
                  <select
                    value={mapping[target] ?? ""}
                    onChange={(e) => setMapping((m) => ({ ...m, [target]: e.target.value }))}
                    className="flex-1 rounded px-2 py-1 text-xs bg-[#111827] text-[#e2e8f0] border border-[#334155] focus:outline-none focus:border-[#38bdf8]"
                  >
                    <option value="">— skip —</option>
                    {Object.keys(shpData.records[0] ?? {}).map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
              ))}
              {appendError && <p className="text-xs text-red-400">{appendError}</p>}
            </div>
            <div className="p-4 border-t border-[#1e293b] flex gap-2 justify-end">
              <button onClick={() => { setMappingOpen(null); setShpData(null); setPendingLayer(null); }} className="px-3 py-1.5 text-xs rounded text-[#94a3b8] hover:text-white hover:bg-white/10 transition-colors">Cancel</button>
              <button onClick={commitAppend} className="px-3 py-1.5 text-xs rounded bg-[#38bdf8] text-[#0d1117] font-medium hover:bg-[#0ea5e9] transition-colors">
                Import {shpData.records.length} Record{shpData.records.length !== 1 ? "s" : ""}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}