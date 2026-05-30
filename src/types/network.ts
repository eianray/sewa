// Water distribution network types

export type NodeType = "junction" | "reservoir" | "tank";

export type DrawMode = "none" | "node" | "pipe";
export type BasemapType =
  | "street" | "satellite" | "topo"
  | "esri_topo" | "esri_terrain" | "esri_natgeo" | "esri_street"
  | "usgs_imagery" | "usgs_topo"
  | "stamen_terrain" | "stamen_watercolor";
export type LayerVisibility = {
  pipes: boolean;
  junctions: boolean;
  tanks: boolean;
  reservoirs: boolean;
};
export const NODE_COLORS: Record<NodeType, string> = {
  junction: "#38bdf8",
  tank: "#a855f7",
  reservoir: "#22c55e",
};

export interface NetworkNode {
  id: string;
  project_id: string;
  user_id: string;
  type: NodeType;
  label: string;
  x: number;           // easting (state plane or UTM)
  y: number;           // northing (state plane or UTM)
  elevation: number | null;  // NAVD88 ft
  demand_gpm: number | null;
  hazen_williams_C: number | null;
  properties: Record<string, unknown>;
  created_at: string;
}

export type PipeMaterial = "PVC" | "HDPE" | "DIP" | "Concrete" | "Steel" | "Cast_Iron";

export interface NetworkPipe {
  id: string;
  project_id: string;
  user_id: string;
  label: string;
  from_node_id: string | null;
  to_node_id: string | null;
  diameter_in: number;
  length_ft: number | null;
  hazen_williams_C: number | null;
  material: PipeMaterial;
  installation_year: number | null;
  properties: Record<string, unknown>;
  created_at: string;
}

// DB fetch helpers

import { supabase } from "@/lib/supabase";

export async function fetchNodes(projectId: string) {
  const { data } = await supabase
    .from("network_nodes")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  return (data ?? []) as NetworkNode[];
}

export async function fetchPipes(projectId: string) {
  const { data } = await supabase
    .from("network_pipes")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  return (data ?? []) as NetworkPipe[];
}

export async function insertNode(node: Omit<NetworkNode, "id" | "created_at">) {
  const { data } = await supabase
    .from("network_nodes")
    .insert(node)
    .select()
    .single();
  return data as NetworkNode;
}

export async function insertPipe(pipe: Omit<NetworkPipe, "id" | "created_at">) {
  const { data } = await supabase
    .from("network_pipes")
    .insert(pipe)
    .select()
    .single();
  return data as NetworkPipe;
}

export async function updateNode(id: string, updates: Partial<NetworkNode>) {
  const { data } = await supabase
    .from("network_nodes")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  return data as NetworkNode;
}

export async function updatePipe(id: string, updates: Partial<NetworkPipe>) {
  const { data } = await supabase
    .from("network_pipes")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  return data as NetworkPipe;
}

export async function deleteNode(id: string) {
  await supabase.from("network_nodes").delete().eq("id", id);
}

export async function deletePipe(id: string) {
  await supabase.from("network_pipes").delete().eq("id", id);
}