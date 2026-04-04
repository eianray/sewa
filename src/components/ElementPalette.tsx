"use client";

import { DrawMode, NodeType, BasemapType, LayerVisibility } from "@/types/network";
import { NODE_COLORS } from "@/types/network";
import ImportButton from "@/components/ImportButton";
import type { FeatureCollection } from "geojson";

interface ElementPaletteProps {
  drawMode: DrawMode;
  nodeTypeToAdd: NodeType | null;
  layerVisibility: LayerVisibility;
  basemap: BasemapType;
  /** M4: Label of the currently loaded boundary, if any. */
  currentLabel: string | null;
  onDrawModeChange: (mode: DrawMode) => void;
  onNodeTypeToAdd: (type: NodeType | null) => void;
  onLayerVisibilityChange: (layers: LayerVisibility) => void;
  onBasemapChange: (basemap: BasemapType) => void;
  /** M4: Called when a shapefile/GeoJSON is successfully parsed. */
  onImportBoundary: (fc: FeatureCollection, label: string) => void;
  /** M4: Called when the user clears the current boundary. */
  onClearBoundary: () => void;
}

const NODE_TYPE_LABELS: Record<NodeType, string> = {
  manhole: "Manhole",
  inlet: "Inlet",
  outlet: "Outlet",
  junction: "Junction",
  lift_station: "Lift Station",
};

const BASEMAP_OPTIONS: { value: BasemapType; label: string }[] = [
  { value: "street", label: "Street" },
  { value: "satellite", label: "Satellite" },
  { value: "topo", label: "Topo" },
];

export default function ElementPalette({
  drawMode,
  nodeTypeToAdd,
  layerVisibility,
  basemap,
  currentLabel,
  onDrawModeChange,
  onNodeTypeToAdd,
  onLayerVisibilityChange,
  onBasemapChange,
  onImportBoundary,
  onClearBoundary,
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

          {/* Basemap selector */}
          <div className="pt-3">
            <p className="text-xs text-[#94a3b8] mb-2">Basemap</p>
            <div className="flex gap-1">
              {BASEMAP_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => onBasemapChange(opt.value)}
                  className={`flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors ${
                    basemap === opt.value
                      ? "bg-[#38bdf8] text-[#0a0f1e]"
                      : "bg-[#111827] text-[#94a3b8] hover:text-white border border-[#1e293b]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
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

      {/* ── M4: Boundary Import ─────────────────────────────────────── */}
      {/* Pinned to the bottom of the sidebar via mt-auto */}
      <div className="mt-auto border-t border-[#1e293b] pt-4">
        <ImportButton
          currentLabel={currentLabel}
          onImport={onImportBoundary}
          onClear={onClearBoundary}
        />
      </div>
    </aside>
  );
}
