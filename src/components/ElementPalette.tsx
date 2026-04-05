"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { DrawMode, NodeType, BasemapType, LayerVisibility } from "@/types/network";
import FacilityPalette from "@/components/FacilityPalette";
import type { FeatureCollection } from "geojson";
import type { NetworkNode, NetworkPipe } from "@/types/network";
import type { Facility } from "@/types/facility";

// ─── Types ───────────────────────────────────────────────────────────────────

type LayerKey = "nodes" | "pipes" | "basins" | "facilities";

interface ShpPoint   { type: "Point";    lng: number; lat: number; }
interface ShpLine    { type: "PolyLine";  coords: [number, number][]; }
interface ShpPolygon { type: "Polygon";   coords: [number, number][]; }
type ShpGeom = ShpPoint | ShpLine | ShpPolygon;

interface ShpResult {
  geometries: ShpGeom[];
  records: Record<string, unknown>[];
}

// ─── Field mapping helpers ────────────────────────────────────────────────────

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

// ─── Shapefile parser — uses shpjs directly ──────────────────────────────────

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
    } else if ((g as GeoJSON.Geometry).type) {
      throw new Error("Unsupported geometry: " + (g as GeoJSON.Geometry).type);
    }
    records.push(props);
  }

  return { geometries, records };
}

// ─── Layer metadata ───────────────────────────────────────────────────────────

const LAYER_META: Record<LayerKey, { label: string; color: string }> = {
  nodes:      { label: "Nodes",      color: "#38bdf8" },
  pipes:      { label: "Pipes",      color: "#f97316" },
  basins:     { label: "Basins",     color: "#22c55e" },
  facilities: { label: "Facilities", color: "#a855f7" },
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface ElementPaletteProps {
  drawMode: DrawMode;
  nodeTypeToAdd: NodeType | null;
  layerVisibility: LayerVisibility;
  basemap: BasemapType;
  boundaryLabel: string | null;
  nodes: NetworkNode[];
  pipes: NetworkPipe[];
  facilities?: Facility[];
  onDrawModeChange: (mode: DrawMode) => void;
  onNodeTypeToAdd: (type: NodeType | null) => void;
  onLayerVisibilityChange: (layers: LayerVisibility) => void;
  onBasemapChange: (basemap: BasemapType) => void;
  /** Append node records (partial — handleImportNodes adds db fields) */
  onAppendNodes: (nodes: NetworkNode[]) => void;
  /** Append pipe records (partial) */
  onAppendPipes: (pipes: NetworkPipe[]) => void;
  onImportBoundary: (fc: FeatureCollection, label: string) => void;
  onClearBoundary: () => void;
  onAppendFacilities?: (facilities: Facility[]) => void;
  projectId: string;
}

// ─── Component ─────────────────────────────────────────────────────────────────

const NODE_TYPE_LABELS: Record<NodeType, string> = {
  manhole: "Manhole",
  inlet: "Inlet",
  outlet: "Outlet",
  junction: "Junction",
  lift_station: "Lift Station",
};

const BASEMAP_OPTIONS: { value: BasemapType; label: string; group: string }[] = [
  { value: "street",             label: "OSM Street",        group: "OpenStreetMap" },
  { value: "topo",              label: "OSM Topo",          group: "OpenStreetMap" },
  { value: "satellite",         label: "Esri Satellite",    group: "Esri" },
  { value: "esri_topo",         label: "Esri Topo",         group: "Esri" },
  { value: "esri_terrain",      label: "Esri Terrain",      group: "Esri" },
  { value: "esri_natgeo",       label: "Esri NatGeo",       group: "Esri" },
  { value: "esri_street",       label: "Esri Street",       group: "Esri" },
  { value: "usgs_imagery",      label: "USGS Imagery",      group: "USGS" },
  { value: "usgs_topo",         label: "USGS Topo",         group: "USGS" },
  { value: "stamen_terrain",     label: "Stamen Terrain",    group: "Stamen" },
  { value: "stamen_watercolor", label: "Stamen Watercolor", group: "Stamen" },
];

export default function ElementPalette({
  drawMode,
  nodeTypeToAdd,
  layerVisibility,
  basemap,
  boundaryLabel,
  nodes,
  pipes,
  facilities,
  onDrawModeChange,
  onNodeTypeToAdd,
  onLayerVisibilityChange,
  onBasemapChange,
  onAppendNodes,
  onAppendPipes,
  onImportBoundary,
  onClearBoundary,
  onAppendFacilities,
}: ElementPaletteProps) {
  const [menuOpen, setMenuOpen] = useState<LayerKey | null>(null);
  const [mappingOpen, setMappingOpen] = useState<LayerKey | null>(null);
  const [shpData, setShpData] = useState<ShpResult | null>(null);
  const [pendingLayer, setPendingLayer] = useState<LayerKey | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [appendError, setAppendError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  // ── File handler ────────────────────────────────────────────────────────────

  const handleFile = useCallback(async (layer: LayerKey, file: File) => {
    setAppendError(null);
    try {
      const buffer = await file.arrayBuffer();
      const data = await parseShpZip(buffer);

      // Basins: no field mapping — just take the first polygon and replace boundary
      if (layer === "basins") {
        const geom = data.geometries.find((g) => g.type === "Polygon") as ShpPolygon | undefined;
        if (!geom) throw new Error("No polygon found in shapefile");
        const fc: FeatureCollection = {
          type: "FeatureCollection",
          features: [{
            type: "Feature",
            geometry: { type: "Polygon", coordinates: [geom.coords] },
            properties: { label: file.name.replace(/\.zip$/i, "") },
          }],
        };
        onImportBoundary(fc, file.name.replace(/\.zip$/i, ""));
        return;
      }

      setShpData(data);
      setPendingLayer(layer);

      const sample = data.records[0] ?? {};
      const headers = Object.keys(sample);
      let auto: Record<string, string> = {};

      if (layer === "nodes") {
        auto = guessMapping(headers, {
          label: "label", lat: "lat", lng: "lng",
          rim_elev: "rim", invert_elev: "invert",
        });
      } else if (layer === "pipes") {
        auto = guessMapping(headers, {
          from_node: "from", to_node: "to",
          diam_in: "diam", length_ft: "length", slope_pct: "slope", material: "material",
        });
      } else if (layer === "facilities") {
        auto = guessMapping(headers, {
          name: "name", fac_type: "type", cap_cfs: "cap_cfs", cap_mgd: "cap_mgd",
        });
      }

      setMapping(auto);
      setMappingOpen(layer);
    } catch (err) {
      setAppendError("Parse error: " + (err instanceof Error ? err.message : String(err)));
    }
  }, [onImportBoundary]);

  // ── Commit append after field mapping ──────────────────────────────────────

  const commitAppend = useCallback(() => {
    if (!shpData || !pendingLayer) return;
    setMappingOpen(null);

    try {
      if (pendingLayer === "nodes") {
        const imported = shpData.geometries
          .filter((g): g is ShpPoint => g.type === "Point")
          .map((g, i) => {
            const rec = shpData.records[i] ?? {};
            const lbl = mapping.label ? String(rec[mapping.label] ?? "") : "";
            const label = lbl || ("N" + (i + 1));
            // Cast to NetworkNode — db fields added by handleImportNodes
            return {
              id: "", project_id: "", user_id: "",
              type: "manhole" as NodeType,
              lat: g.lat, lng: g.lng,
              label,
              rim_elev: mapping.rim_elev ? Number(rec[mapping.rim_elev]) ?? null : null,
              invert_elev: mapping.invert_elev ? Number(rec[mapping.invert_elev]) ?? null : null,
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
          const [lng1, lat1] = geom.coords[0];
          const [lng2, lat2] = geom.coords[geom.coords.length - 1];
          const lbl = mapping.label ? String(rec[mapping.label] ?? (fromLbl + "-" + toLbl)) : (fromLbl + "-" + toLbl);
          imported.push({
            id: "", project_id: "", user_id: "",
            label: lbl,
            from_node_id: fromNode.id,
            to_node_id: toNode.id,
            diameter_in: mapping.diam_in ? Number(rec[mapping.diam_in]) || 12 : 12,
            length_ft: mapping.length_ft ? Number(rec[mapping.length_ft]) ?? null : null,
            slope_pct: mapping.slope_pct ? Number(rec[mapping.slope_pct]) ?? null : null,
            material: (mapping.material ? String(rec[mapping.material] ?? "PVC") : "PVC") as NetworkPipe["material"],
            properties: {},
            created_at: "",
          });
        }
        if (imported.length) onAppendPipes(imported);

      } else if (pendingLayer === "facilities" && onAppendFacilities) {
        const imported: Facility[] = shpData.geometries
          .filter((g): g is ShpPoint => g.type === "Point")
          .map((g, i) => {
            const rec = shpData.records[i] ?? {};
            const capCfs = mapping.cap_cfs ? Number(rec[mapping.cap_cfs]) || 0 : 0;
            const capMgd = mapping.cap_mgd ? Number(rec[mapping.cap_mgd]) || 0 : 0;
            return {
              id: "",
              facility_id: "",
              project_id: "",
              user_id: "",
              name: mapping.name ? String(rec[mapping.name] ?? "") : "",
              facility_type: (mapping.fac_type ? String(rec[mapping.fac_type] ?? "wwtp") : "wwtp") as Facility["facility_type"],
              lat: g.lat,
              lng: g.lng,
              capacity_cfs: capCfs,
              capacity_mgd: capMgd,
              allocated_cfs: 0,
              allocated_mgd: 0,
              remaining_cfs: capCfs,
              remaining_mgd: capMgd,
              properties: {},
              created_at: "",
            } as unknown as Facility;
          });
        if (imported.length) onAppendFacilities(imported);

      }
    } catch (err) {
      setAppendError(String(err));
    } finally {
      setShpData(null);
      setPendingLayer(null);
    }
  }, [shpData, pendingLayer, mapping, nodes, onAppendNodes, onAppendPipes, onImportBoundary, onAppendFacilities]);

  // ─── Counts ─────────────────────────────────────────────────────────────────

  const counts: Record<LayerKey, number> = {
    nodes:      nodes.length,
    pipes:      pipes.length,
    basins:     boundaryLabel ? 1 : 0,
    facilities: facilities?.length ?? 0,
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  const LAYER_KEYS: LayerKey[] = ["nodes", "pipes", "basins", "facilities"];

  return (
    <aside className="w-52 flex flex-col bg-[#0d1117] border-l border-[#1e293b] h-full overflow-y-auto">

      {/* ── Layers ─────────────────────────────────────────────────────── */}
      <div className="p-4 flex-1">
        <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-3">
          Layers
        </h3>

        <div className="space-y-1">
          {LAYER_KEYS.map((layer) => {
            const meta  = LAYER_META[layer];
            const isOn  = layerVisibility[layer];
            const count = counts[layer];
            return (
              <div
                key={layer}
                className={"flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all " + (
                  isOn ? "bg-[#1e293b] text-white" : "bg-[#111827] text-[#94a3b8]"
                )}
              >
                {/* Checkbox */}
                <button
                  onClick={() => onLayerVisibilityChange({ ...layerVisibility, [layer]: !isOn })}
                  title={isOn ? "Hide layer" : "Show layer"}
                >
                  <span
                    className={"w-4 h-4 rounded border inline-flex items-center justify-center transition-colors " +
                      (isOn ? "border-[" + meta.color + "] bg-[" + meta.color + "]" : "border-[#475569]")
                    }
                  >
                    {isOn && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2">
                        <polyline points="1.5,5 4,7.5 8.5,2.5" />
                      </svg>
                    )}
                  </span>
                </button>

                {/* Label + count */}
                <span className="flex-1 truncate" style={{ color: isOn ? meta.color : undefined }}>
                  {meta.label}
                </span>
                {count > 0 && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-white/70">
                    {count}
                  </span>
                )}

                {/* ⋯ Ellipsis menu */}
                <div className="relative flex-shrink-0">
                  <div ref={layer === menuOpen ? menuRef : undefined}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen(menuOpen === layer ? null : layer);
                      }}
                      className="w-6 h-6 rounded hover:bg-white/10 flex items-center justify-center text-[#94a3b8] hover:text-white transition-colors"
                      title="Layer options"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                        <circle cx="3"  cy="7" r="1.2" />
                        <circle cx="7"  cy="7" r="1.2" />
                        <circle cx="11" cy="7" r="1.2" />
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
                          {layer === "basins" ? "Replace Boundary" : "Append Data"}
                        </button>
                        <button
                          onClick={() => {
                            setMenuOpen(null);
                            if (layer === "basins") {
                              onClearBoundary();
                            } else {
                              window.dispatchEvent(new CustomEvent("sewa:clear-layer:" + layer));
                            }
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

        {/* Basemap */}
        <div className="pt-4">
          <p className="text-xs text-[#94a3b8] mb-2">Basemap</p>
          <select
            value={basemap}
            onChange={(e) => onBasemapChange(e.target.value as BasemapType)}
            className="w-full rounded px-2 py-1.5 text-xs font-medium bg-[#111827] text-[#e2e8f0] border border-[#1e293b] focus:outline-none focus:border-[#38bdf8] cursor-pointer"
          >
            {["OpenStreetMap", "Esri", "USGS", "Stamen"].map((group) => (
              <optgroup key={group} label={group}>
                {BASEMAP_OPTIONS.filter((o) => o.group === group).map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      {/* Draw mode banner */}
      {drawMode !== "none" && (
        <div className="p-4 border-t border-[#1e293b]">
          <div className="bg-[#38bdf8]/10 border border-[#38bdf8]/30 rounded-lg px-3 py-2 text-xs text-[#38bdf8] text-center">
            {drawMode === "node" && nodeTypeToAdd
              ? "Placing " + NODE_TYPE_LABELS[nodeTypeToAdd] + "…"
              : drawMode === "pipe"
              ? "Drawing pipe: click 2 nodes"
              : ""}
            <button
              onClick={() => { onDrawModeChange("none"); onNodeTypeToAdd(null); }}
              className="ml-2 underline hover:no-underline"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Facilities */}
      <FacilityPalette
        facilities={facilities ?? []}
        onAddFacilityClick={() => onDrawModeChange("facility")}
        onFacilityAdd={() => {}}
      />

      {/* ── Hidden file inputs ─────────────────────────────────────────── */}
      {(["nodes", "pipes", "basins", "facilities"] as LayerKey[]).map((layer) => (
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

      {/* ── Field mapping modal ────────────────────────────────────────── */}
      {mappingOpen && shpData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60">
          <div className="bg-[#0d1117] border border-[#334155] rounded-xl w-96 max-h-[80vh] overflow-y-auto shadow-2xl">
            <div className="p-4 border-b border-[#1e293b]">
              <h2 className="text-sm font-semibold text-white">
                Map Fields — {LAYER_META[mappingOpen].label}
              </h2>
              <p className="text-xs text-[#94a3b8] mt-1">
                {shpData.records.length} record{shpData.records.length !== 1 ? "s" : ""} found
              </p>
            </div>

            <div className="p-4 space-y-3">
              {Object.entries(
                mappingOpen === "nodes"
                  ? { label: "Node Label", lat: "Latitude", lng: "Longitude", rim_elev: "Rim Elevation", invert_elev: "Invert Elevation" }
                  : mappingOpen === "pipes"
                  ? { from_node: "From Node", to_node: "To Node", label: "Pipe Label", diam_in: "Diameter (in)", length_ft: "Length (ft)", slope_pct: "Slope (%)", material: "Material" }
                  : mappingOpen === "facilities"
                  ? { name: "Facility Name", fac_type: "Type", cap_cfs: "Capacity (CFS)", cap_mgd: "Capacity (MGD)" }
                  : {}
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

              {appendError && (
                <p className="text-xs text-red-400">{appendError}</p>
              )}
            </div>

            <div className="p-4 border-t border-[#1e293b] flex gap-2 justify-end">
              <button
                onClick={() => { setMappingOpen(null); setShpData(null); setPendingLayer(null); }}
                className="px-3 py-1.5 text-xs rounded text-[#94a3b8] hover:text-white hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={commitAppend}
                className="px-3 py-1.5 text-xs rounded bg-[#38bdf8] text-[#0d1117] font-medium hover:bg-[#0ea5e9] transition-colors"
              >
                Import {shpData.records.length} Record{shpData.records.length !== 1 ? "s" : ""}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
