export type NodeType = "manhole" | "inlet" | "outlet" | "junction" | "lift_station";

export interface NetworkNode {
  id: string;
  project_id: string;
  user_id: string;
  type: NodeType;
  label: string;
  lat: number;
  lng: number;
  invert_elev: number | null;
  rim_elev: number | null;
  properties: Record<string, unknown>;
  created_at: string;
}

export type PipeMaterial = "PVC" | "RCP" | "HDPE" | "DI";

export interface NetworkPipe {
  id: string;
  project_id: string;
  user_id: string;
  label: string;
  from_node_id: string | null;
  to_node_id: string | null;
  diameter_in: number;
  length_ft: number | null;
  slope_pct: number | null;
  material: PipeMaterial;
  properties: Record<string, unknown>;
  created_at: string;
}

export type DrawMode = "none" | "node" | "pipe";
export type BasemapType =
  | "street"
  | "satellite"
  | "topo"
  | "esri_topo"
  | "esri_terrain"
  | "esri_natgeo"
  | "esri_street"
  | "usgs_imagery"
  | "usgs_topo"
  | "stamen_terrain"
  | "stamen_watercolor";

export interface LayerVisibility {
  nodes: boolean;
  pipes: boolean;
  labels: boolean;
}

export const NODE_COLORS: Record<NodeType, string> = {
  manhole: "#6b7280",
  inlet: "#3b82f6",
  outlet: "#ef4444",
  junction: "#eab308",
  lift_station: "#a855f7",
};
