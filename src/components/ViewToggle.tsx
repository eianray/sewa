/**
 * ViewToggle.tsx — View Mode + Elevation Source Toggle Controls
 * =============================================================
 *
 * Two pairs of pill-style toggle buttons displayed at the top of the map canvas:
 *
 *   [ GIS View | Schematic View ]     [ Attribute Elev | LIDAR Elev ]
 *                                      ↑ only shown in Schematic View
 *
 * ## View Modes
 *
 *   GIS View — the default. Shows the real geographic Leaflet map with nodes
 *   and pipes at their actual lat/lng coordinates. Editing is allowed here.
 *
 *   Schematic View — a read-only SVG "subway map" showing the same network
 *   arranged by upstream depth. No editing allowed.
 *
 * ## Elevation Sources
 *
 *   Attribute Elevation — uses the invert_elev values stored in the database
 *   (entered manually by the engineer or auto-fetched from USGS EPQS per node).
 *   This is the accurate as-built or design invert.
 *
 *   LIDAR Elevation — derives invert_elev from the DEM tile (fetched from
 *   USGS 3DEP on boundary import) using a fixed burial depth offset:
 *     invert_elev = DEM_surface_elevation - burial_depth_ft
 *   Useful for preliminary estimates before field survey data is available.
 *
 * ## Props / Usage
 *
 *   <ViewToggle
 *     viewMode={viewMode}                 // "gis" | "schematic"
 *     onViewModeChange={setViewMode}
 *     elevationSource={elevationSource}   // "attribute" | "lidar"
 *     onElevationSourceChange={setElevationSource}
 *     hasDemTile={!!demTile}             // show LIDAR option only if DEM is loaded
 *   />
 */

import React from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Which map/schematic view is currently shown. */
export type ViewMode = "gis" | "schematic";

/**
 * Which elevation source is used for schematic simulations.
 * Only relevant when viewMode === "schematic".
 */
export type ElevationSource = "attribute" | "lidar";

export interface ViewToggleProps {
  /** Current view mode. */
  viewMode: ViewMode;
  /** Called when the user switches view mode. */
  onViewModeChange: (mode: ViewMode) => void;
  /** Current elevation source (attribute data vs DEM-derived). */
  elevationSource: ElevationSource;
  /** Called when the user switches elevation source. */
  onElevationSourceChange: (source: ElevationSource) => void;
  /**
   * Whether a DEM tile has been loaded for this project.
   * If false, the LIDAR option is shown but disabled with a tooltip.
   */
  hasDemTile: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Toggle buttons for switching between GIS/Schematic views and
 * Attribute/LIDAR elevation sources.
 *
 * Designed to overlay the top-left corner of the map/schematic canvas.
 * Absolutely positioned — parent must be relative.
 */
export default function ViewToggle({
  viewMode,
  onViewModeChange,
  elevationSource,
  onElevationSourceChange,
  hasDemTile,
}: ViewToggleProps) {
  return (
    <div className="absolute top-3 left-3 z-[1000] flex flex-col gap-2 pointer-events-auto">

      {/* ------------------------------------------------------------------ */}
      {/* View mode toggle: GIS View ↔ Schematic View                        */}
      {/* ------------------------------------------------------------------ */}
      <div
        className="flex rounded-md overflow-hidden border border-[#334155] shadow-lg"
        role="group"
        aria-label="View mode"
      >
        <ToggleButton
          label="GIS View"
          active={viewMode === "gis"}
          onClick={() => onViewModeChange("gis")}
          title="Edit nodes and pipes on the geographic map"
          icon="🗺️"
        />
        <ToggleButton
          label="Schematic"
          active={viewMode === "schematic"}
          onClick={() => onViewModeChange("schematic")}
          title="Read-only subway-map view of network topology"
          icon="📐"
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Elevation source toggle — only visible in Schematic View           */}
      {/* ------------------------------------------------------------------ */}
      {viewMode === "schematic" && (
        <div
          className="flex rounded-md overflow-hidden border border-[#334155] shadow-lg"
          role="group"
          aria-label="Elevation source"
        >
          <ToggleButton
            label="Attribute"
            active={elevationSource === "attribute"}
            onClick={() => onElevationSourceChange("attribute")}
            title="Use engineer-entered invert elevations from the database"
            icon="✏️"
          />
          <ToggleButton
            label="LIDAR"
            active={elevationSource === "lidar"}
            disabled={!hasDemTile}
            onClick={() => {
              if (hasDemTile) onElevationSourceChange("lidar");
            }}
            title={
              hasDemTile
                ? "Use DEM-derived elevations (surface elevation minus burial depth)"
                : "Import a project boundary first to load the DEM tile"
            }
            icon="🛰️"
          />
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Schematic mode reminder                                             */}
      {/* ------------------------------------------------------------------ */}
      {viewMode === "schematic" && (
        <div className="text-[10px] text-amber-400/80 bg-[#1e293b]/90 px-2 py-1 rounded border border-amber-500/20 max-w-[160px] leading-tight">
          Read-only — switch to GIS View to edit
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-Component: Individual toggle button
// ---------------------------------------------------------------------------

interface ToggleButtonProps {
  /** Button label text. */
  label: string;
  /** Whether this button is currently selected/active. */
  active: boolean;
  /** Click handler. */
  onClick: () => void;
  /** HTML title attribute for tooltip. */
  title: string;
  /** Optional emoji icon prefix. */
  icon?: string;
  /** Whether the button is disabled (grayed out, non-clickable). */
  disabled?: boolean;
}

function ToggleButton({
  label,
  active,
  onClick,
  title,
  icon,
  disabled = false,
}: ToggleButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={[
        "flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition-colors",
        "border-r border-[#334155] last:border-r-0",
        active
          ? "bg-[#0066ff] text-white"
          : disabled
          ? "bg-[#1e293b] text-slate-600 cursor-not-allowed"
          : "bg-[#1e293b] text-slate-400 hover:text-white hover:bg-[#263348] cursor-pointer",
      ].join(" ")}
    >
      {icon && <span className="text-[11px]">{icon}</span>}
      {label}
    </button>
  );
}
