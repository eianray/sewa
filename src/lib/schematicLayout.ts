/**
 * schematicLayout.ts — Hierarchical Subway-Map Layout for Sewer Networks
 * ==========================================================================
 *
 * Lays out a sewer pipe network as a clean, readable "subway map" — nodes in
 * horizontal bands by upstream depth, pipes as straight connectors between them.
 *
 * ## Why Hierarchical?
 *
 * Sewer networks are directed acyclic graphs (DAGs). Flow is strictly
 * downstream: every pipe carries water from its upstream node toward its
 * downstream node, ultimately to the outlet. This directionality is the
 * key to a readable schematic.
 *
 * ## The BFS-Upstream Algorithm
 *
 * Traditional BFS traverses from a root following edges in their direction.
 * Here we INVERT the graph: treat the outlet as the root and traverse
 * *upstream* (follow from_node ← to_node instead of from → to_node).
 *
 *   Downstream direction (real flow):  Manhole A ──→ Manhole B ──→ Outlet
 *   Upstream traversal (our BFS):      Manhole A ←── Manhole B ←── Outlet
 *
 * This assigns depth = "how many pipe steps is this node from the outlet?"
 *
 * ## Layout Rules
 *
 *   - Column (x): determined by depth level (outlet = 0, next = 1, etc.)
 *   - Row (y): within each column, nodes are stacked top-to-bottom in
 *     deterministic order (sorted by upstream tributary name, or by angle
 *     from the outlet for the first level).
 *   - Column width: fixed at 180px per depth level
 *   - Row height: fixed at 100px per node within a band
 *   - Pipe connectors: straight horizontal-then-vertical (H-V) Manhattan paths
 *
 * ## Schematic vs. Geographic View
 *
 *   - Geographic view: nodes at real lat/lng — spatial accuracy, readable map
 *   - Schematic view: nodes at computed x/y — topological clarity, readable graph
 *
 * Both views share the SAME underlying data. The schematic is a derived
 * visualization, not a separate data model.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A network node from the SEWA Supabase database. */
export interface NetworkNode {
  id: string;
  label: string;
  type: string;
  lat?: number | null;
  lng?: number | null;
  invert_elev?: number | null;
  rim_elev?: number | null;
}

/** A network pipe from the SEWA Supabase database. */
export interface NetworkPipe {
  id: string;
  label: string;
  from_node_id: string | null;
  to_node_id: string | null;
  diameter_in?: number | null;
  slope_pct?: number | null;
  material?: string | null;
}

/**
 * A node positioned in the schematic layout with computed x/y coordinates
 * and metadata about its position in the hierarchy.
 */
export interface SchematicNode {
  /** The source node object. */
  node: NetworkNode;
  /**
   * Computed x coordinate in the schematic SVG canvas.
   * Equals depth × COLUMN_WIDTH.
   */
  x: number;
  /**
   * Computed y coordinate in the schematic SVG canvas.
   * Equals row index within depth band × ROW_HEIGHT.
   */
  y: number;
  /**
   * Depth level — how many pipe steps this node is from the outlet.
   * Outlet = 0. One pipe upstream = 1. Two pipes upstream = 2. etc.
   */
  depth: number;
  /**
   * All pipes that originate from this node (flow leaves this node).
   * Used to draw pipe connectors from this node to its upstream neighbors.
   */
  outgoingPipes: NetworkPipe[];
}

/**
 * A pipe connector in the schematic with computed endpoint coordinates.
 * Draw as an orthogonal Manhattan path: horizontal first, then vertical.
 */
export interface SchematicPipe {
  /** The source pipe object. */
  pipe: NetworkPipe;
  /** Start x of the connector line. */
  x1: number;
  /** Start y of the connector line. */
  y1: number;
  /** End x of the connector line. */
  x2: number;
  /** End y of the connector line. */
  y2: number;
  /**
   * Midpoint x of the connector — where the "elbow" bend is.
   * The H-V path goes: (x1,y1) → (midX, y1) → (midX, y2) → (x2, y2)
   */
  midX: number;
  /** Midpoint y of the connector elbow. */
  midY: number;
}

/** Complete schematic layout output for a single project network. */
export interface SchematicLayout {
  /** All nodes with computed x/y positions. */
  nodes: SchematicNode[];
  /** All pipes with computed endpoint coordinates. */
  pipes: SchematicPipe[];
  /** Width of the entire schematic canvas in pixels. */
  width: number;
  /** Height of the entire schematic canvas in pixels. */
  height: number;
}

// ---------------------------------------------------------------------------
// Layout Constants
// ---------------------------------------------------------------------------

/** Horizontal spacing between depth columns (pixels). */
export const COLUMN_WIDTH = 180;
/** Vertical spacing between rows within a depth band (pixels). */
export const ROW_HEIGHT = 110;
/** Radius of the node circle in the schematic SVG (pixels). */
export const NODE_RADIUS = 20;
/** Horizontal padding on the left/right edges of the canvas (pixels). */
export const PADDING_X = 40;
/** Vertical padding on the top/bottom edges of the canvas (pixels). */
export const PADDING_Y = 40;

// ---------------------------------------------------------------------------
// Core Layout Algorithm
// ---------------------------------------------------------------------------

/**
 * Computes a hierarchical schematic layout for a sewer pipe network.
 *
 * Call this when the user switches to Schematic View. The result is
 * stable (same network always produces the same layout) but is NOT
 * persisted — it is recomputed on each view switch.
 *
 * @param nodes - All NetworkNode objects for the project
 * @param pipes - All NetworkPipe objects for the project
 * @returns SchematicLayout with positioned nodes and pipe connectors
 */
export function computeSchematicLayout(
  nodes: NetworkNode[],
  pipes: NetworkPipe[]
): SchematicLayout {
  // -----------------------------------------------------------------------
  // Step 1: Find the outlet node(s)
  //
  // The outlet is the sink of the network — the node that has no
  // downstream pipe (no pipe where its ID appears as to_node).
  //
  // Strategy: find nodes that NEVER appear as to_node in any pipe.
  // If multiple exist (rare), use the one with type='outlet', else
  // use the first one found.
  // -----------------------------------------------------------------------
  const nodeIds = new Set(nodes.map((n) => n.id));

  const outletCandidates = nodes.filter((n) => {
    // A node is a potential outlet if NO pipe has it as the downstream end
    return !pipes.some((p) => p.to_node_id === n.id);
  });

  // Prefer explicit outlet type, then fall back to first candidate
  const outletNode =
    outletCandidates.find((n) => n.type === "outlet") ??
    outletCandidates[0] ??
    null;

  // -----------------------------------------------------------------------
  // Step 2: BFS upstream from the outlet to assign depth levels
  //
  // We INVERT the graph for traversal: starting from the outlet,
  // we follow pipes BACKWARD (from to_node → from_node) to find
  // all upstream nodes.
  //
  // The number of steps from the outlet = the node's depth.
  // -----------------------------------------------------------------------
  // depthMap: nodeId → depth (0 = outlet)
  const depthMap = new Map<string, number>();
  if (outletNode) {
    depthMap.set(outletNode.id, 0);

    // BFS queue: [nodeId, depth]
    const queue: Array<[string, number]> = [[outletNode.id, 0]];
    const visited = new Set<string>([outletNode.id]);

    while (queue.length > 0) {
      const [currentId, depth] = queue.shift()!;

      // Find all pipes where this node is the UPSTREAM end
      // (i.e., this node is the from_node — water flows FROM here TO to_node)
      // Wait — for upstream BFS, we want to go AGAINST the flow direction.
      // If pipe: Manhole A → Manhole B (A is from, B is to)
      // Then from B we go to A: upstream of B = A
      const upstreamPipes = pipes.filter((p) => p.from_node_id === currentId);

      for (const pipe of upstreamPipes) {
        if (!pipe.to_node_id) continue;
        if (visited.has(pipe.to_node_id)) continue;
        if (!nodeIds.has(pipe.to_node_id)) continue;

        const nextDepth = depth + 1;
        depthMap.set(pipe.to_node_id, nextDepth);
        visited.add(pipe.to_node_id);
        queue.push([pipe.to_node_id, nextDepth]);
      }
    }
  }

  // Assign depth 0 to any unreached nodes (isolated nodes get their own band)
  for (const node of nodes) {
    if (!depthMap.has(node.id)) {
      depthMap.set(node.id, 0);
    }
  }

  // -----------------------------------------------------------------------
  // Step 3: Group nodes by depth level
  // -----------------------------------------------------------------------
  const nodesByDepth = new Map<number, NetworkNode[]>();
  for (const node of nodes) {
    const depth = depthMap.get(node.id) ?? 0;
    if (!nodesByDepth.has(depth)) nodesByDepth.set(depth, []);
    nodesByDepth.get(depth)!.push(node);
  }

  // Sort nodes within each depth band deterministically by label
  for (const band of nodesByDepth.values()) {
    band.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }

  // -----------------------------------------------------------------------
  // Step 4: Assign x/y coordinates to each node
  //
  // x = depth × COLUMN_WIDTH + PADDING_X
  // y = (row index within band) × ROW_HEIGHT + PADDING_Y
  // -----------------------------------------------------------------------
  const schematicNodes: SchematicNode[] = [];

  for (const node of nodes) {
    const depth = depthMap.get(node.id) ?? 0;
    const band = nodesByDepth.get(depth) ?? [];
    const rowIndex = band.indexOf(node);

    const x = depth * COLUMN_WIDTH + PADDING_X;
    const y = rowIndex * ROW_HEIGHT + PADDING_Y;

    // Find all pipes that ORIGINATE from this node (outgoing = flowing to upstream)
    const outgoingPipes = pipes.filter((p) => p.from_node_id === node.id);

    schematicNodes.push({ node, x, y, depth, outgoingPipes });
  }

  // -----------------------------------------------------------------------
  // Step 5: Compute pipe connector endpoints
  //
  // Manhattan H-V path: from (x1,y1) → (midX, y1) → (midX, y2) → (x2, y2)
  // The elbow midpoint (midX, midY) is at (x2, y1).
  // -----------------------------------------------------------------------
  const schematicPipes: SchematicPipe[] = [];

  for (const pipe of pipes) {
    if (!pipe.from_node_id || !pipe.to_node_id) continue;

    const fromSch = schematicNodes.find((s) => s.node.id === pipe.from_node_id);
    const toSch = schematicNodes.find((s) => s.node.id === pipe.to_node_id);
    if (!fromSch || !toSch) continue;

    // Pipe flows from from-node (upstream) to to-node (downstream).
    // In the schematic: FROM node on the right, TO node on the left (going left).
    // x1,y1 = right side of from-node; x2,y2 = left side of to-node
    const x1 = fromSch.x + NODE_RADIUS;   // right edge of upstream node
    const y1 = fromSch.y;                  // center-Y of upstream node
    const x2 = toSch.x - NODE_RADIUS;      // left edge of downstream node
    const y2 = toSch.y;                     // center-Y of downstream node

    // Elbow at (x2, y1) — horizontal from right side of upstream node,
    // then vertical down/up to left side of downstream node
    const midX = x2;
    const midY = y1;

    schematicPipes.push({ pipe, x1, y1, x2, y2, midX, midY });
  }

  // -----------------------------------------------------------------------
  // Step 6: Compute total canvas dimensions
  //
  // Width = max depth × COLUMN_WIDTH + last-band-row-count × ROW_HEIGHT + padding
  // -----------------------------------------------------------------------
  const maxDepth = Math.max(...Array.from(nodesByDepth.keys()), 0);
  const maxRowsInBand = Math.max(...Array.from(nodesByDepth.values()).map((b) => b.length), 0);

  const width = (maxDepth + 1) * COLUMN_WIDTH + PADDING_X * 2;
  const height = maxRowsInBand * ROW_HEIGHT + PADDING_Y * 2;

  return { nodes: schematicNodes, pipes: schematicPipes, width, height };
}
