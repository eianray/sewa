import type { FeatureCollection } from "geojson";

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  /** M4: GeoJSON FeatureCollection defining the project boundary polygon. */
  boundary_geojson?: FeatureCollection | null;
  /** M4: Human-readable label for the boundary (derived from uploaded filename). */
  boundary_label?: string | null;
  /** M5: Base64 or URL of the DEM tile stored for this project. */
  dem_tile?: string | null;
}
