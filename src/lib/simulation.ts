/**
 * Manning's Steady-State Sewer Simulation Engine
 * ===============================================
 * Performs a steady-state hydraulic analysis of a sanitary sewer pipe network
 * using Manning's equation for full-pipe flow capacity.
 *
 * ## Manning's Equation (Imperial)
 *
 *   Q = (1.486 / n) × A × R^(2/3) × S^(1/2)
 *
 * Where:
 *   - Q  = Discharge (flow) in cubic feet per second (cfs)
 *   - n  = Manning's roughness coefficient (dimensionless)
 *   - A  = Cross-sectional area of the pipe (ft²)
 *   - R  = Hydraulic radius = A / wetted perimeter (ft)
 *         For a circular pipe flowing FULL, R = d/4 (derived below)
 *   - S  = Slope of the energy grade line (ft/ft) = slope_pct / 100
 *
 * ## Hydraulic Radius Derivation (Circular Pipe, Full Flow)
 *
 *   For a circular pipe with diameter d:
 *     Wetted perimeter (P) = π × d          (circumference of the pipe wall in contact with water)
 *     Cross-sectional area (A) = π × (d/2)² = π × d² / 4
 *     Hydraulic radius (R) = A / P = (π × d² / 4) / (π × d) = d / 4
 *
 * ## Design Flow Convention
 *
 * Gravity sanitary sewers are conventionally designed at HALF of full-pipe capacity
 * (d/D = 0.5, i.e., half-full). This provides freeboard for future flows and
 * accounts for non-uniform flow conditions in real networks. Therefore:
 *
 *   Q_design = 0.5 × Q_full
 *   V_design = 0.5 × V_full   (because A is constant — same pipe, same depth ratio)
 *
 * ## Velocity Thresholds (Standard Engineering Practice)
 *
 *   - Minimum (self-cleansing): 2.0 fps — prevents solids deposition
 *   - Maximum (protective):       10.0 fps — prevents pipe abrasion damage
 *
 * ## Manning's n Values (Typical Sanitary Sewer Materials)
 *
 *   PVC  = 0.013  (polyvinyl chloride, smooth interior)
 *   RCP  = 0.013  (reinforced concrete pipe)
 *   HDPE = 0.011  (high-density polyethylene, corrugated exterior / smooth interior)
 *   DI   = 0.012  (ductile iron pipe)
 *   Default = 0.013
 *
 * ## Unit Conversion Notes
 *
 * The equation uses IMPERIAL units throughout:
 *   - Diameter input: inches  → convert to feet: d_ft = diameter_in / 12
 *   - Slope input:    percent → convert to ft/ft: S = slope_pct / 100
 *   - Output: Q in cfs, V in fps
 *
 * The constant 1.486 is the conversion factor that makes the equation work
 * in imperial units (it is derived from g^(1/2) where g = 32.2 ft/s²).
 */

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

/** A network node loaded from the SEWA Supabase database. */
export interface NetworkNode {
  id: string;
  label: string;
  type: string;
  lat: number;
  lng: number;
  /** Rim elevation in feet (ground surface). Optional — USGS-sourced. */
  rim_elev?: number | null;
  /** Invert elevation in feet (pipe outlet inside the manhole). Optional. */
  invert_elev?: number | null;
}

/** A network pipe/link loaded from the SEWA Supabase database. */
export interface NetworkPipe {
  id: string;
  label: string;
  /** ID of the upstream node (start of pipe). null if unconnected. */
  from_node_id: string | null;
  /** ID of the downstream node (end of pipe). null if unconnected. */
  to_node_id: string | null;
  /** Inside diameter of the pipe in inches. */
  diameter_in?: number | null;
  /** Pipe slope as a percentage (e.g., 1.5 means 1.5%). */
  slope_pct?: number | null;
  /** Pipe length in feet (not used in Manning's calc but stored for reference). */
  length_ft?: number | null;
  /** Pipe material — used to select Manning's n coefficient. */
  material?: string | null;
}

/**
 * Hydraulic results for a single pipe in the network.
 * Includes both full-pipe capacity and half-full design flow values.
 */
export interface PipeResult {
  pipe_id: string;
  label: string;
  /** Pipe inside diameter in inches. */
  diameter_in: number;
  /** Pipe slope as a percent. null if missing from DB. */
  slope_pct: number | null;
  /** Pipe length in feet. null if not recorded. */
  length_ft: number | null;
  /** Pipe material string. */
  material: string;
  /** Full-pipe flow capacity in cfs ( Manning's at d/D = 1.0 ). */
  q_full_cfs: number;
  /** Mean velocity at full-pipe flow in fps. */
  v_full_fps: number;
  /** Design flow in cfs = 0.5 × q_full (half-full convention). */
  q_design_cfs: number;
  /** Mean velocity at design flow in fps = 0.5 × v_full. */
  v_design_fps: number;
  /** Overall status for the pipe. */
  status: "ok" | "warning" | "error";
  /** Human-readable notes explaining any warnings or errors. */
  notes: string[];
}

/**
 * Connectivity and elevation status for a single node.
 */
export interface NodeResult {
  node_id: string;
  label: string;
  /** Node type string (e.g., "manhole", "lift_station"). */
  type: string;
  /** Rim elevation in feet. null if not set. */
  rim_elev: number | null;
  /** Invert elevation in feet. null if not set. */
  invert_elev: number | null;
  /** Number of pipes physically connected to this node. */
  connected_pipes: number;
  status: "ok" | "warning" | "error";
  notes: string[];
}

/** A single warning or validation message raised during the simulation. */
export interface SimulationWarning {
  /** What kind of element the warning pertains to. */
  type: "pipe" | "node" | "network";
  /** ID of the element, or null for network-level warnings. */
  id: string | null;
  /** Human-readable warning message. */
  message: string;
}

/** High-level summary statistics for the entire simulation run. */
export interface SimulationSummary {
  total_pipes: number;
  total_nodes: number;
  pipes_ok: number;
  pipes_warning: number;
  pipes_error: number;
  nodes_ok: number;
  nodes_warning: number;
  /** Minimum design velocity across all pipes in fps. 0 if no valid pipes. */
  min_velocity_fps: number;
  /** Maximum design velocity across all pipes in fps. 0 if no valid pipes. */
  max_velocity_fps: number;
  /** Arithmetic mean design velocity across all pipes in fps. 0 if no valid pipes. */
  avg_velocity_fps: number;
}

/**
 * Complete output of a single simulation run.
 * Contains per-element results, summary statistics, and all validation warnings.
 */
export interface SimulationResult {
  summary: SimulationSummary;
  pipe_results: PipeResult[];
  node_results: NodeResult[];
  warnings: SimulationWarning[];
}

// ---------------------------------------------------------------------------
// Manning's n Lookup Table
// ---------------------------------------------------------------------------

/**
 * Manning's roughness coefficient (n) for common sanitary sewer pipe materials.
 * Values are industry-standard from ASCE/WEF Pipe Design Guides and
 * USDOT/NOAA engineering references.
 *
 * Key principle: smaller n → smoother pipe interior → higher capacity at
 * the same slope and diameter.
 *
 *   HDPE (0.011) > DI (0.012) > PVC/RCP (0.013)
 *
 * HDPE has the lowest n because its interior wall is essentially smooth plastic.
 * RCP and PVC both have smooth cement/mortar or plastic interiors — same n.
 * DI has a slightly higher n due to its metal interior roughness.
 */
const MANNING_N: Record<string, number> = {
  PVC: 0.013,
  RCP: 0.013,
  HDPE: 0.011,
  DI: 0.012,
};

/**
 * Returns the Manning's n coefficient for a given material string.
 * Falls back to 0.013 (PVC/RCP default) if the material is unknown.
 *
 * @param material - The pipe material name (case-insensitive lookup)
 * @returns Manning's roughness coefficient (dimensionless)
 */
function getManningN(material: string): number {
  return MANNING_N[material.toUpperCase()] ?? 0.013;
}

// ---------------------------------------------------------------------------
// Main Simulation Function
// ---------------------------------------------------------------------------

/**
 * Runs a Manning's steady-state hydraulic simulation over the given
 * pipe network and returns per-element results, summary stats, and warnings.
 *
 * ## Algorithm Overview
 *
 * 1. **Pipe loop**: For each pipe in the network:
 *    a. Validate: check for missing/negative slope, zero diameter, unconnected ends.
 *    b. Compute geometric properties: diameter → area, hydraulic radius.
 *    c. Compute full-pipe Q and V via Manning's equation.
 *    d. Derive design flow = 0.5 × Q_full (half-full convention).
 *    e. Check velocity against self-cleansing (min 2 fps) and excess (max 10 fps).
 *    f. Classify status: ok / warning / error.
 *
 * 2. **Node loop**: For each node:
 *    a. Count how many pipes are connected to it.
 *    b. Flag isolated nodes (connected_pipes === 0) as warnings.
 *
 * 3. **Summary**: Aggregate pipe and node counts and status breakdowns,
 *    plus min / max / avg design velocity across the network.
 *
 * ## What This Does NOT Do (Out of Scope for M3)
 *
 * - Does NOT trace flow paths or compute upstream catchment areas
 * - Does NOT model partial-depth (partially-filled pipe) flow
 * - Does NOT account for pipe network topology to compute tributary flows
 * - Is NOT a time-series or dynamic simulation
 *
 * All of the above are appropriate for M4/M5.
 *
 * @param nodes - Array of NetworkNode objects from the DB
 * @param pipes - Array of NetworkPipe objects from the DB
 * @returns SimulationResult containing all results, warnings, and summary
 */
export function runSimulation(nodes: NetworkNode[], pipes: NetworkPipe[]): SimulationResult {
  const warnings: SimulationWarning[] = [];
  const pipeResults: PipeResult[] = [];
  const nodeResults: NodeResult[] = [];

  // Build a lookup map from node ID → node object for O(1) access
  const nodeMap = new Map<string, NetworkNode>(nodes.map((n) => [n.id, n]));

  // -------------------------------------------------------------------------
  // Connectivity pass — count how many pipes touch each node
  // This is used later to identify isolated nodes.
  // -------------------------------------------------------------------------
  const connectedPipeCount = new Map<string, number>();
  nodes.forEach((n) => connectedPipeCount.set(n.id, 0));

  // -------------------------------------------------------------------------
  // PIPE PROCESSING LOOP
  // -------------------------------------------------------------------------
  for (const pipe of pipes) {
    const notes: string[] = [];
    let status: "ok" | "warning" | "error" = "ok";

    // -----------------------------------------------------------------------
    // Step 1: Connectivity validation
    // A pipe must have both a from_node and to_node to be part of the network.
    // If either is null, the pipe end is "floating" — flag as a warning.
    // Also increment the connected-pipe counter for each valid endpoint.
    // -----------------------------------------------------------------------
    if (!pipe.from_node_id || !pipe.to_node_id) {
      warnings.push({
        type: "pipe",
        id: pipe.id,
        message: `Pipe "${pipe.label}": Unconnected pipe end — cannot hydraulically analyze`,
      });
      notes.push("Unconnected pipe end");
      status = "warning";
    } else {
      // Increment the connected-pipe counter for both endpoint nodes
      connectedPipeCount.set(
        pipe.from_node_id,
        (connectedPipeCount.get(pipe.from_node_id) ?? 0) + 1
      );
      connectedPipeCount.set(
        pipe.to_node_id,
        (connectedPipeCount.get(pipe.to_node_id) ?? 0) + 1
      );
    }

    // -----------------------------------------------------------------------
    // Step 2: Read and validate pipe physical properties
    // -----------------------------------------------------------------------
    // Default to 0 so we can detect "missing" values distinctly from "0.0"
    const diameter_in = pipe.diameter_in ?? 0;
    const slope_pct = pipe.slope_pct ?? null;
    const length_ft = pipe.length_ft ?? null;
    const material = pipe.material ?? "PVC";
    const n = getManningN(material);

    // --- Slope validation ---
    // Slope is required for Manning's equation. No slope = no hydraulic analysis.
    if (slope_pct === null || slope_pct === undefined) {
      warnings.push({
        type: "pipe",
        id: pipe.id,
        message: `Pipe "${pipe.label}": Missing slope — cannot compute capacity`,
      });
      notes.push("Missing slope");
      status = "error";

      // Record zero results and skip Manning's math since slope is undefined
      pipeResults.push({
        pipe_id: pipe.id,
        label: pipe.label,
        diameter_in,
        slope_pct,
        length_ft,
        material,
        q_full_cfs: 0,
        v_full_fps: 0,
        q_design_cfs: 0,
        v_design_fps: 0,
        status: "error",
        notes,
      });
      continue;
    }

    // Negative slope is physically impossible for a gravity sewer (would imply
    // the pipe is flowing uphill). Flag as error.
    if (slope_pct < 0) {
      warnings.push({
        type: "pipe",
        id: pipe.id,
        message: `Pipe "${pipe.label}": Negative slope (${slope_pct.toFixed(3)}%) — invalid`,
      });
      notes.push("Negative slope");
      status = "error";

      pipeResults.push({
        pipe_id: pipe.id,
        label: pipe.label,
        diameter_in,
        slope_pct,
        length_ft,
        material,
        q_full_cfs: 0,
        v_full_fps: 0,
        q_design_cfs: 0,
        v_design_fps: 0,
        status: "error",
        notes,
      });
      continue;
    }

    // Zero or missing diameter — cannot compute area.
    if (diameter_in <= 0) {
      warnings.push({
        type: "pipe",
        id: pipe.id,
        message: `Pipe "${pipe.label}": Missing or zero diameter — cannot compute capacity`,
      });
      notes.push("Missing diameter");
      status = "error";

      pipeResults.push({
        pipe_id: pipe.id,
        label: pipe.label,
        diameter_in,
        slope_pct,
        length_ft,
        material,
        q_full_cfs: 0,
        v_full_fps: 0,
        q_design_cfs: 0,
        v_design_fps: 0,
        status: "error",
        notes,
      });
      continue;
    }

    // -----------------------------------------------------------------------
    // Step 3: Manning's Equation Calculations
    //
    // Geometry for a circular pipe:
    //   d_ft          = diameter_in / 12             (convert in → ft)
    //   A (area)      = π × (d_ft / 2)²              (area of a circle)
    //                  = π × d_ft² / 4
    //   R (hyd. radius) = d_ft / 4                   (A / P where P = π × d_ft)
    //   S (slope)     = slope_pct / 100              (convert % → ft/ft)
    //
    // Manning's imperial: Q (cfs) = (1.486 / n) × A × R^(2/3) × S^(1/2)
    //   The 1.486 constant converts the metric Manning formula to imperial units.
    //   It is derived from: k × g^(1/2) where k ≈ 1.486 (US customary) or 1.0 (SI).
    // -----------------------------------------------------------------------

    // Convert diameter from inches to feet
    const d_ft = diameter_in / 12;

    // Cross-sectional area of the pipe bore in square feet
    // Formula: A = π × r²  where r = d_ft / 2
    const area_ft2 = Math.PI * Math.pow(d_ft / 2, 2);

    // Hydraulic radius for a full-flowing circular pipe: R = A / P = d / 4
    // This is the key geometric simplification that makes Manning's tractable.
    // Derivation: A = πd²/4, P = πd  →  R = (πd²/4) / (πd) = d/4
    const R_ft = d_ft / 4;

    // Convert slope from percent (e.g., 1.5%) to decimal ft/ft (e.g., 0.015 ft/ft)
    const S_ft_per_ft = slope_pct / 100;

    // Manning's full-pipe capacity in cfs
    // Q = (1.486 / n) × A × R^(2/3) × S^(1/2)
    const q_full_cfs =
      (1.486 / n) *
      area_ft2 *
      Math.pow(R_ft, 2 / 3) *
      Math.pow(S_ft_per_ft, 1 / 2);

    // Full-pipe mean velocity: V = Q / A  (definition of mean velocity)
    const v_full_fps = q_full_cfs / area_ft2;

    // Design flow is conventionally set at half-full (d/D = 0.5):
    //   At half-full, the flow depth equals the radius, so the cross-sectional
    //   area of flow equals exactly half of the full cross-section (A/2).
    //   Therefore Q_design = 0.5 × Q_full.
    //   Because A is the same at both conditions (same full pipe), V also halves:
    //   V_design = Q_design / A = (0.5 × Q_full) / A = 0.5 × V_full.
    const q_design_cfs = q_full_cfs * 0.5;
    const v_design_fps = v_full_fps * 0.5;

    // -----------------------------------------------------------------------
    // Step 4: Velocity threshold checks
    //
    // Self-cleansing velocity (min 2 fps):
    //   Pipes flowing below ~2 fps cannot transport settleable solids, leading
    //   to solids accumulation, sulfide generation, and odour problems.
    //   This is the primary design constraint for low-slope sewers.
    //
    // Excessive velocity (max 10 fps):
    //   Velocities above ~10 fps cause abrasive wear on the pipe interior
    //   (especially at bends, joints, and appurtenances), shortening its
    //   design life. This is the primary upper limit.
    // -----------------------------------------------------------------------
    if (v_design_fps < 2) {
      notes.push("Self-cleansing velocity not met (min 2 fps)");
      status = "warning";
      warnings.push({
        type: "pipe",
        id: pipe.id,
        message:
          `Pipe "${pipe.label}": Velocity ${v_design_fps.toFixed(2)} fps ` +
          `below self-cleansing threshold (2 fps)`,
      });
    }

    if (v_design_fps > 10) {
      notes.push("Excessive velocity (max 10 fps)");
      status = "warning";
      warnings.push({
        type: "pipe",
        id: pipe.id,
        message:
          `Pipe "${pipe.label}": Velocity ${v_design_fps.toFixed(2)} fps ` +
          `exceeds maximum (10 fps) — risk of pipe abrasion`,
      });
    }

    // -----------------------------------------------------------------------
    // Step 5: Final status determination
    // Status is "ok" only if no errors or warnings were raised.
    // -----------------------------------------------------------------------
    // Final status: only "ok" if no warnings were raised (notes.length === 0).
    // If notes is non-empty, status is already set to "warning" above.
    if (notes.length === 0) {
      status = "ok";
    }

    pipeResults.push({
      pipe_id: pipe.id,
      label: pipe.label,
      diameter_in,
      slope_pct,
      length_ft,
      material,
      q_full_cfs,
      v_full_fps,
      q_design_cfs,
      v_design_fps,
      status,
      notes,
    });
  }

  // -------------------------------------------------------------------------
  // NODE PROCESSING LOOP
  // -------------------------------------------------------------------------
  for (const node of nodes) {
    const notes: string[] = [];
    let status: "ok" | "warning" | "error" = "ok";
    const connected = connectedPipeCount.get(node.id) ?? 0;

    // An "isolated" node has zero connected pipes — it cannot convey flow.
    // This is almost always a data entry error or a partially-drawn network.
    if (connected === 0) {
      notes.push("Isolated node — no connected pipes");
      status = "warning";
      warnings.push({
        type: "node",
        id: node.id,
        message: `Node "${node.label}": Isolated node with no connected pipes`,
      });
    }

    nodeResults.push({
      node_id: node.id,
      label: node.label,
      type: node.type,
      rim_elev: node.rim_elev ?? null,
      invert_elev: node.invert_elev ?? null,
      connected_pipes: connected,
      status,
      notes,
    });
  }

  // -------------------------------------------------------------------------
  // SUMMARY COMPUTATION
  // -------------------------------------------------------------------------
  const pipes_ok = pipeResults.filter((r) => r.status === "ok").length;
  const pipes_warning = pipeResults.filter((r) => r.status === "warning").length;
  const pipes_error = pipeResults.filter((r) => r.status === "error").length;
  const nodes_ok = nodeResults.filter((r) => r.status === "ok").length;
  const nodes_warning = nodeResults.filter((r) => r.status === "warning").length;

  // Collect all non-zero design velocities for min/max/avg calculations.
  // Pipes with errors have v_design_fps = 0 but are excluded so they don't
  // artificially deflate the minimum.
  const validVelocities = pipeResults
    .map((r) => r.v_design_fps)
    .filter((v) => v > 0);

  const min_velocity_fps =
    validVelocities.length > 0 ? Math.min(...validVelocities) : 0;
  const max_velocity_fps =
    validVelocities.length > 0 ? Math.max(...validVelocities) : 0;
  const avg_velocity_fps =
    validVelocities.length > 0
      ? validVelocities.reduce((sum, v) => sum + v, 0) / validVelocities.length
      : 0;

  const summary: SimulationSummary = {
    total_pipes: pipes.length,
    total_nodes: nodes.length,
    pipes_ok,
    pipes_warning,
    pipes_error,
    nodes_ok,
    nodes_warning,
    min_velocity_fps,
    max_velocity_fps,
    avg_velocity_fps,
  };

  return { summary, pipe_results: pipeResults, node_results: nodeResults, warnings };
}
