/**
 * lidarElevation.ts — LIDAR-Derived Invert Elevation Patcher
 * ===========================================================
 *
 * When the user switches the elevation source to "LIDAR" in the schematic
 * view, the Manning's simulation should use elevations derived from the
 * DEM tile rather than the manually-entered (attribute) invert_elev values.
 *
 * ## How it works
 *
 *   1. For each node, call `demTile.sampleElevationFt(lat, lng)` to get the
 *      ground surface elevation in feet (from the USGS 3DEP GeoTIFF).
 *
 *   2. Subtract the burial depth (default 4.0 ft) to get the estimated
 *      pipe invert elevation:
 *
 *        invert_elev = surface_elevation_ft - burial_depth_ft
 *
 *   3. Return a new node array — never mutate the originals.
 *
 * ## Limitations / notes
 *
 *   - If the DEM tile does not cover a node's location (sampleElevationFt
 *     returns null), the original invert_elev is kept unchanged.
 *   - Burial depth is a single scalar applied to all nodes. A future version
 *     could allow per-node burial depth stored in node.properties.
 *   - This is a preliminary estimate only — replace with field survey data
 *     (attribute elevation mode) for final design work.
 *
 * ## Usage
 *
 *   import { applyLidarElevations } from "@/lib/lidarElevation";
 *
 *   // In ProjectDetailClient, before running simulation in LIDAR mode:
 *   const patchedNodes = applyLidarElevations(nodes, demTile, 4.0);
 *   const result = runSimulation(patchedNodes, pipes);
 */

import type { DemTile } from "@/lib/demSampler";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Minimal node shape required by this function.
 * Matches the NetworkNode type from @/types/network but kept loose to avoid
 * a circular dependency.
 */
export interface ElevationPatchableNode {
  id: string;
  lat: number;
  lng: number;
  invert_elev?: number | null;
  rim_elev?: number | null;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default burial depth in feet.
 *
 * 4.0 ft is a reasonable default for Alaska sanitary sewer mains —
 * below the frost depth but not excessively deep. Engineers can override
 * this per project; per-node overrides are a future feature.
 */
export const DEFAULT_BURIAL_DEPTH_FT = 4.0;

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Returns a new array of nodes with `invert_elev` derived from the DEM tile.
 *
 * @param nodes          Original node array (not mutated).
 * @param demTile        Loaded DEM tile from `loadDemTile()`.
 * @param burialDepthFt  Depth from surface to pipe invert, in feet.
 *                       Defaults to DEFAULT_BURIAL_DEPTH_FT (4.0 ft).
 * @returns              New array where each node has LIDAR-derived invert_elev
 *                       if the DEM covers it, or the original value if not.
 */
export function applyLidarElevations<T extends ElevationPatchableNode>(
  nodes: T[],
  demTile: DemTile,
  burialDepthFt: number = DEFAULT_BURIAL_DEPTH_FT
): T[] {
  return nodes.map((node) => {
    // Sample surface elevation at this node's coordinates
    const surfaceElevFt = demTile.sampleElevationFt(node.lat, node.lng);

    if (surfaceElevFt === null) {
      // DEM doesn't cover this location — keep the stored invert_elev
      console.warn(
        `[SEWA] LIDAR: no DEM coverage at node ${node.id} ` +
        `(lat=${node.lat.toFixed(5)}, lng=${node.lng.toFixed(5)}) — ` +
        `falling back to attribute invert_elev=${node.invert_elev}`
      );
      return node;
    }

    // Compute LIDAR-derived invert elevation
    const lidarInvertElevFt = surfaceElevFt - burialDepthFt;

    // Return a shallow copy with the patched invert_elev.
    // Also update rim_elev to the DEM surface value so hydraulic grade
    // line (HGL) calculations have a consistent reference.
    return {
      ...node,
      invert_elev: lidarInvertElevFt,
      rim_elev: surfaceElevFt,
    };
  });
}

// ---------------------------------------------------------------------------
// Utility: summary stats for debugging / UI display
// ---------------------------------------------------------------------------

/**
 * Returns a brief stats string for the LIDAR patch operation, useful for
 * logging or displaying in the UI (e.g. "LIDAR: 12/14 nodes patched, 2 fallback").
 */
export function lidarPatchSummary(
  original: ElevationPatchableNode[],
  patched: ElevationPatchableNode[]
): string {
  let patchedCount = 0;
  let fallbackCount = 0;

  for (let i = 0; i < original.length; i++) {
    if (patched[i].invert_elev !== original[i].invert_elev) {
      patchedCount++;
    } else {
      fallbackCount++;
    }
  }

  return `LIDAR: ${patchedCount}/${original.length} nodes patched, ${fallbackCount} fallback`;
}
