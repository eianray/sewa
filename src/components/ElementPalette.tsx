"use client";

import { DrawMode, NodeType, BasemapType, LayerVisibility } from "@/types/network";
import { NODE_COLORS } from "@/types/network";
import ImportPanel from "@/components/ImportPanel";
import type { FeatureCollection, Feature, GeoJsonProperties } from "geojson";
import type { NetworkNode, NetworkPipe } from "@/types/network";

interface ElementPaletteProps {
  drawMode: DrawMode;
  nodeTypeToAdd: NodeType | null;
  layerVisibility: LayerVisibility;
  basemap: BasemapType;
  /** Label of the currently loaded boundary, if any. */
  boundaryLabel: string | null;
  /** All existing nodes for label→ID lookups during pipe imports. */
  nodes: NetworkNode[];
  onDrawModeChange: (mode: DrawMode) => void;
  onNodeTypeToAdd: (type: NodeType | null) => void;
  onLayerVisibilityChange: (layers: LayerVisibility) => void;
  onBasemapChange: (basemap: BasemapType) => void;
  onImportNodes: (nodes: NetworkNode[]) => void;
  onImportPipes: (pipes: NetworkPipe[]) => void;
  onImportBoundary: (fc: FeatureCollection, label: string) => void;
  onClearBoundary: () => void;
  projectId: string;
}

const NODE_TYPE_LABELS: Record<NodeType, string> = {
  manhole: "Manhole",
  inlet: "Inlet",
  outlet: "Outlet",
  junction: "Junction",
  lift_station: "Lift Station",
};

const BASEMAP_OPTIONS: { value: BasemapType; label: string; group: string }[] = [
  // OpenStreetMap
  { value: "street",           label: "OSM Street",       group: "OpenStreetMap" },
  { value: "topo",             label: "OSM Topo",          group: "OpenStreetMap" },
  // Esri
  { value: "satellite",        label: "Esri Satellite",    group: "Esri" },
  { value: "esri_topo",        label: "Esri Topo",         group: "Esri" },
  { value: "esri_terrain",     label: "Esri Terrain",      group: "Esri" },
  { value: "esri_natgeo",      label: "Esri NatGeo",       group: "Esri" },
  { value: "esri_street",      label: "Esri Street",       group: "Esri" },
  // USGS
  { value: "usgs_imagery",     label: "USGS Imagery",      group: "USGS" },
  { value: "usgs_topo",        label: "USGS Topo",         group: "USGS" },
  // Stadia / Stamen
  { value: "stamen_terrain",   label: "Stamen Terrain",    group: "Stamen" },
  { value: "stamen_watercolor",label: "Stamen Watercolor", group: "Stamen" },
];

export default function ElementPalette({
  drawMode,
  nodeTypeToAdd,
  layerVisibility,
  basemap,
  boundaryLabel,
  nodes,
  onDrawModeChange,
  onNodeTypeToAdd,
  onLayerVisibilityChange,
  onBasemapChange,
  onImportNodes,
  onImportPipes,
  onImportBoundary,
  onClearBoundary,
  projectId,
}: ElementPaletteProps) {
  function handleNodeTypeClick(type: NodeType) {
    if (nodeTypeToAdd === type) {
      onNodeTypeToAdd(null);
      onDrawModeChange("none");
    } else {
      onNodeTypeToAdd(type);
      onDrawModeChange("node");
    }
  }

  function handleDrawPipe() {
    if (drawMode === "pipe") {
      onDrawModeChange("none");
      onNodeTypeToAdd(null);
    } else {
      onDrawModeChange("pipe");
      onNodeTypeToAdd(null);
    }
  }

  return (
    <aside className="w-[280px] h-full bg-[#0d1526] border-r border-[#1e293b] flex flex-col overflow-y-auto">
      {/* Add Element */}
      <div className="p-4 border-b border-[#1e293b]">
        <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-3">
          Add Element
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(NODE_COLORS) as NodeType[]).map((type) => {
            const isActive = nodeTypeToAdd === type && drawMode === "node";
            return (
              <button
                key={type}
                onClick={() => handleNodeTypeClick(type)}
                className={`flex flex-col items-center gap-1.5 rounded-lg px-3 py-3 text-xs font-medium transition-all ${
                  isActive
                    ? "bg-[#38bdf8]/20 border border-[#38bdf8] text-white"
                    : "bg-[#111827] border border-[#1e293b] text-[#94a3b8] hover:border-[#475569] hover:text-white"
                }`}
              >
                <span
                  className="w-4 h-4 rounded-full border-2"
                  style={{ backgroundColor: isActive ? NODE_COLORS[type] : "transparent", borderColor: NODE_COLORS[type] }}
                />
                <span className="text-center leading-tight">
                  {NODE_TYPE_LABELS[type].split(" ")[0]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Draw Pipe button */}
        <button
          onClick={handleDrawPipe}
          className={`mt-2 w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
            drawMode === "pipe"
              ? "bg-[#38bdf8] text-[#0a0f1e]"
              : "bg-[#111827] border border-[#1e293b] text-[#94a3b8] hover:border-[#475569] hover:text-white"
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="2" y1="8" x2="14" y2="8" />
            <polyline points="10,4 14,8 10,12" />
          </svg>
          Draw Pipe
        </button>
      </div>

      {/* Layers */}
      <div className="p-4 flex-1">
        <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-3">
          Layers
        </h3>
        <div className="space-y-2">
          {/* Layer toggles */}
          {(["nodes", "pipes", "labels"] as const).map((layer) => {
            const isOn = layerVisibility[layer];
            return (
              <button
                key={layer}
                onClick={() =>
                  onLayerVisibilityChange({ ...layerVisibility, [layer]: !isOn })
                }
                className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all ${
                  isOn
                    ? "bg-[#38bdf8]/10 text-[#38bdf8]"
                    : "bg-[#111827] text-[#94a3b8] hover:text-white"
                }`}
              >
                <span
                  className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                    isOn ? "bg-[#38bdf8] border-[#38bdf8]" : "border-[#475569]"
                  }`}
                >
                  {isOn && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2">
                      <polyline points="1.5,5 4,7.5 8.5,2.5" />
                    </svg>
                  )}
                </span>
                <span className="capitalize">{layer}</span>
              </button>
            );
          })}

          {/* Basemap selector — dropdown; too many options for inline buttons */}
          <div className="pt-3">
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
      </div>

      {/* Draw mode indicator */}
      {drawMode !== "none" && (
        <div className="p-4 border-t border-[#1e293b]">
          <div className="bg-[#38bdf8]/10 border border-[#38bdf8]/30 rounded-lg px-3 py-2 text-xs text-[#38bdf8] text-center">
            {drawMode === "node" && nodeTypeToAdd
              ? `Placing ${NODE_TYPE_LABELS[nodeTypeToAdd]}…`
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

      {/* ── Import Data (Nodes / Pipes / Basins) ────────────────────────── */}
      <ImportPanel
        projectId={projectId}
        nodes={nodes}
        onImportNodes={onImportNodes}
        onImportPipes={onImportPipes}
        onImportBoundary={onImportBoundary}
        onClearBoundary={onClearBoundary}
        boundaryLabel={boundaryLabel}
      />
    </aside>
  );
}
