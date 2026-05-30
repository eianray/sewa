export type PipeMaterial = "PVC" | "HDPE" | "DIP" | "Concrete" | "Steel" | "Cast_Iron";

export interface PipeResult {
  pipe_id: string;
  flow_gpm: number;
  velocity_fps: number;
  headloss_ft_per_1000ft: number;
  status: "ok" | "warning" | "error";
}

export interface NodeResult {
  node_id: string;
  pressure_psi: number;
  elevation_ft: number;
  demand_gpm: number;
  status: "ok" | "warning" | "error";
}

export interface SteadyStateResult {
  pipes: PipeResult[];
  nodes: NodeResult[];
  summary: {
    total_pipes: number;
    total_nodes: number;
    pipes_over_velocity: number;
    nodes_under_pressure: number;
  };
}

export interface PumpCurve {
  points: Array<{ gpm: number; head_ft: number }>;
}
