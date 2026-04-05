"use client";

/**
 * ProjectDetailClient — Main Project Editor Page
 * ================================================
 *
 * Renders the SEWA project editor: map canvas, element palette, properties
 * panel, and — with M3 — the simulation panel and "Run Analysis" control.
 *
 * ## M3 Simulation Integration
 *
 * When the user clicks "Run Analysis" the following steps occur:
 *
 *   1. `runSimulation(nodes, pipes)` is called synchronously in the browser.
 *      This runs Manning's steady-state equation over the in-memory network.
 *
 *   2. The `SimulationResult` is saved to Supabase `simulation_results` so
 *      that results are persisted and can be revisited (future M4/multi-run
 *      comparison work will use this table).
 *
 *   3. The `SimulationPanel` bottom drawer is opened with the result object.
 *
 * State variables added for M3:
 *   - simResult   : SimulationResult | null
 *   - simLoading  : boolean  (true during the runSimulation + Supabase INSERT)
 *   - showSimPanel: boolean  (true when the drawer should be visible)
 *
 * The simulation is a **pure client-side computation** — no serverless
 * function, no external API call beyond the Supabase metadata write.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";
import { fetchPointElevation } from "@/lib/elevation";
import { checkMeridianHealth } from "@/lib/meridian";
import { runSimulation } from "@/lib/simulation";
import type { SimulationResult } from "@/lib/simulation";
import type { Project } from "@/types/project";
import type { NetworkNode, NetworkPipe, NodeType, DrawMode, BasemapType, LayerVisibility } from "@/types/network";
import ElementPalette from "@/components/ElementPalette";
import PropertiesPanel from "@/components/PropertiesPanel";
import SimulationPanel from "@/components/SimulationPanel";
import type L from "leaflet";
import type { FeatureCollection } from "geojson";
import { loadDemTile } from "@/lib/demSampler";
import type { DemTile } from "@/lib/demSampler";
import ViewToggle from "@/components/ViewToggle";
import type { ViewMode, ElevationSource } from "@/components/ViewToggle";
const SchematicCanvas = dynamic(() => import("@/components/SchematicCanvas"), { ssr: false });

// Disable SSR for MapCanvas — Leaflet requires the browser DOM and Window object.
// Dynamic import with { ssr: false } prevents Next.js from trying to render
// this component on the server (which would fail).
const MapCanvas = dynamic(() => import("@/components/MapCanvas"), { ssr: false });

interface ProjectDetailClientProps {
  /** The UUID of the project being edited, passed from the Next.js page route. */
  projectId: string;
}

export default function ProjectDetailClient({ projectId }: ProjectDetailClientProps) {
  // -------------------------------------------------------------------------
  // Core state
  // -------------------------------------------------------------------------

  /** Auth session — null until Supabase confirms the user is logged in. */
  const [session, setSession] = useState<{ user: { id: string } } | null>(null);

  /** The project metadata record fetched from `projects`. */
  const [project, setProject] = useState<Project | null>(null);

  /**
   * All network nodes belonging to this project, fetched from `network_nodes`.
   * Kept in React state so the map, properties panel, and simulation can all
   * read the same up-to-date data without refetching.
   */
  const [nodes, setNodes] = useState<NetworkNode[]>([]);

  /**
   * All network pipes belonging to this project, fetched from `network_pipes`.
   * @see nodes
   */
  const [pipes, setPipes] = useState<NetworkPipe[]>([]);

  /** True while the initial data fetch (project + nodes + pipes) is in-flight. */
  const [loading, setLoading] = useState(true);

  // -------------------------------------------------------------------------
  // Save-status indicator
  // -------------------------------------------------------------------------

  /**
   * Reflects whether the current in-memory state has been saved to Supabase.
   * Toggled to `false` on any mutation; automatically set back to `true`
   * after a 1.5-second debounce delay (giving the next DB write time to flush).
   */
  const [saved, setSaved] = useState(true);

  /**
   * Reference to the active debounce timer so it can be cancelled if the
   * user makes another mutation before the 1.5 s window expires.
   */
  const [savedTimer, setSavedTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  // -------------------------------------------------------------------------
  // Drawing / selection state
  // -------------------------------------------------------------------------

  /** Current drawing mode: "none" | "node" | "pipe" */
  const [drawMode, setDrawMode] = useState<DrawMode>("none");

  /**
   * The node type to place when drawMode === "node".
   * Set by clicking a node-type button in the ElementPalette.
   */
  const [nodeTypeToAdd, setNodeTypeToAdd] = useState<NodeType | null>(null);

  /** Visibility toggles for each map layer (nodes, pipes, basins, facilities). */
  const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>({
    nodes: true,
    pipes: true,
    basins: true,
    facilities: true,
  });

  /** Active base map tile set: "street" | "satellite" | "terrain" */
  const [basemap, setBasemap] = useState<BasemapType>("street");

  /**
   * The element (node or pipe) currently selected in the map.
   * Triggers the PropertiesPanel to open for that element.
   */
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /**
   * Discriminator for `selectedId` — tells the PropertiesPanel whether to
   * treat the selected element as a node or a pipe when rendering the form.
   */
  const [selectedType, setSelectedType] = useState<"node" | "pipe" | null>(null);

  // Two-node-click pipe drawing: user clicks FROM node, then TO node → pipe created.
  const [pipeFromNodeId, setPipeFromNodeId] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // M2: Meridian health indicator
  // -------------------------------------------------------------------------

  /** Meridian API health: "checking" (on mount), "ok", or "offline". */
  const [meridianStatus, setMeridianStatus] = useState<"ok" | "offline" | "checking">("checking");

  /**
   * Node ID currently having its elevation fetched from USGS.
   * Used to show a loading spinner on the relevant PropertiesPanel field.
   */
  const [fetchingElevationNodeId, setFetchingElevationNodeId] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // M3: Simulation state
  // -------------------------------------------------------------------------

  /**
   * The most recent simulation result object.
   * Persists after the panel is closed so the user can re-open it without
   * re-running the simulation (until the network is modified).
   */
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);

  /**
   * True while runSimulation() is executing AND the Supabase INSERT is pending.
   * Controls the "Running analysis…" loading UI in SimulationPanel.
   */
  const [simLoading, setSimLoading] = useState(false);

  /**
   * Controls visibility of the SimulationPanel bottom drawer.
   * Set to true when the user clicks "Run Analysis"; set to false when
   * they click the × close button (does NOT clear simResult).
   */
  const [showSimPanel, setShowSimPanel] = useState(false);

  // --------------------------------------------------------------------------
  // M4: Boundary GeoJSON state
  // --------------------------------------------------------------------------

  /** The parsed GeoJSON FeatureCollection for the project boundary polygon. */
  const [boundaryGeoJSON, setBoundaryGeoJSON] = useState<FeatureCollection | null>(null);

  /** Human-readable label for the current boundary (derived from filename). */
  const [boundaryLabel, setBoundaryLabel] = useState<string | null>(null);

  /**
   * The loaded DEM tile for this project. Fetched once when a boundary is
   * imported and stored in component state. Used by SchematicCanvas to
   * derive LIDAR elevations for each node.
   */
  const [demTile, setDemTile] = useState<DemTile | null>(null);

  /** Which view is currently shown: geographic GIS map, or topology schematic. */
  const [viewMode, setViewMode] = useState<ViewMode>("gis");

  /** Which elevation source is used for schematic simulations. */
  const [elevationSource, setElevationSource] = useState<ElevationSource>("attribute");

  // --------------------------------------------------------------------------
  // Map reference
  // --------------------------------------------------------------------------

  /**
   * Reference to the underlying Leaflet Map instance.
   * Stored here so the zoom-in / zoom-out buttons in the header can
   * manipulate the map without prop-drilling or a context provider.
   */
  const mapRef = useRef<L.Map | null>(null);

  // -------------------------------------------------------------------------
  // Effects
  // -------------------------------------------------------------------------

  /**
   * On mount: check Meridian API health and store the result in meridianStatus.
   * Runs once — no dependency array changes after initial mount.
   */
  useEffect(() => {
    checkMeridianHealth().then((ok) => setMeridianStatus(ok ? "ok" : "offline"));
  }, []);

  /**
   * On mount: verify the user is authenticated, then load all project data.
   *
   * If Supabase reports no active session, the user is immediately redirected
   * to the landing page (/) — they cannot edit without being logged in.
   *
   * Three tables are fetched in parallel via Promise.all for performance:
   *   1. `projects`      — project metadata (name, created_at, etc.)
   *   2. `network_nodes` — all nodes for this project (filtered by user_id)
   *   3. `network_pipes` — all pipes for this project (filtered by user_id)
   */
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        window.location.href = "/";
        return;
      }
      setSession(data.session as { user: { id: string } });
      fetchData(data.session.user.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  /**
   * Fetches all project data from Supabase in parallel.
   *
   * @param userId — The authenticated user's UUID, used for RLS-filtered queries
   */
  async function fetchData(userId: string) {
    setLoading(true);
    const [{ data: proj }, { data: nodeData }, { data: pipeData }] = await Promise.all([
      // Fetch the single project record
      supabase.from("projects").select("*").eq("id", projectId).single(),
      // Fetch all nodes for this project owned by this user
      supabase.from("network_nodes").select("*").eq("project_id", projectId).eq("user_id", userId),
      // Fetch all pipes for this project owned by this user
      supabase.from("network_pipes").select("*").eq("project_id", projectId).eq("user_id", userId),
    ]);

    if (proj) setProject(proj as Project);
    const loadedNodes = (nodeData as NetworkNode[]) || [];
    setNodes(loadedNodes);
    setPipes((pipeData as NetworkPipe[]) || []);

    // M4: Load saved boundary from the project row
    const projRecord = proj as Project | null;
    if (projRecord?.boundary_geojson) {
      setBoundaryGeoJSON(projRecord.boundary_geojson as FeatureCollection);
    }
    if (projRecord?.boundary_label) {
      setBoundaryLabel(projRecord.boundary_label);
    }

    setLoading(false);

    // Auto-center the map on the project's existing data.
    // Wait one tick for the map to mount, then fly to content.
    setTimeout(() => {
      const map = mapRef.current;
      if (!map) return;
      if (loadedNodes.length > 0) {
        // Compute centroid of all nodes and fly there at a reasonable zoom.
        const avgLat = loadedNodes.reduce((s, n) => s + n.lat, 0) / loadedNodes.length;
        const avgLng = loadedNodes.reduce((s, n) => s + n.lng, 0) / loadedNodes.length;
        map.setView([avgLat, avgLng], 14);
      }
      // Note: if no nodes exist but a boundary is loaded, MapCanvas handles
      // auto-fitting via its own boundaryGeoJSON useEffect.
    }, 100);
  }

  // -------------------------------------------------------------------------
  // Save-status helpers
  // -------------------------------------------------------------------------

  /**
   * Marks the project as having unsaved changes.
   * Called after every mutation (node/pipe insert, update, delete).
   * Starts a 1.5-second debounce timer; if another mutation arrives before
   * the timer fires, the timer is cancelled and a new one starts, ensuring
   * we don't show a spurious "Saved" flash between rapid edits.
   */
  function markUnsaved() {
    setSaved(false);
    if (savedTimer) clearTimeout(savedTimer);
    const t = setTimeout(() => setSaved(true), 1500);
    setSavedTimer(t);
  }

  // -------------------------------------------------------------------------
  // Elevation fetching (M2)
  // -------------------------------------------------------------------------

  /**
   * Fetches the ground elevation for a given lat/lng from the USGS Elevation API,
   * then derives a default invert elevation (assumes ~4 ft of cover from rim
   * to pipe obvert/invert) and persists both values to Supabase.
   *
   * The 4 ft cover assumption is a common design默认值 for sanitary sewer
   * manholes: rim at ground surface, invert roughly 4 ft below rim at outlet.
   *
   * @param nodeId — Primary key of the node to update
   * @param lat    — Latitude of the node (for USGS API call)
   * @param lng    — Longitude of the node (for USGS API call)
   */
  async function fetchAndApplyElevation(nodeId: string, lat: number, lng: number) {
    setFetchingElevationNodeId(nodeId);
    const elev = await fetchPointElevation(lat, lng);

    if (elev !== null) {
      // Default invert: 4 ft of ground cover below the rim
      const invert = elev - 4.0;

      // Persist to Supabase
      await supabase
        .from("network_nodes")
        .update({ rim_elev: elev, invert_elev: invert })
        .eq("id", nodeId);

      // Update React state so the PropertiesPanel reflects the new values immediately
      setNodes((prev) =>
        prev.map((n) => (n.id === nodeId ? { ...n, rim_elev: elev, invert_elev: invert } : n))
      );
    }

    setFetchingElevationNodeId(null);
  }

  // --------------------------------------------------------------------------
  // M4: Boundary import / clear
  // --------------------------------------------------------------------------

  /**
   * Called by ImportButton when the user successfully selects a file.
   * Saves boundary_geojson + boundary_label to Supabase and updates
   * local state so the map re-renders the polygon.
   *
   * @param fc    - Parsed GeoJSON FeatureCollection from parseUploadedFile()
   * @param label - Human-readable label derived from the source filename
   */
  const handleImportBoundary = useCallback(
    async (fc: FeatureCollection, label: string) => {
      setBoundaryGeoJSON(fc);
      setBoundaryLabel(label);

      // Persist to Supabase so the boundary survives page refreshes
      const { error } = await supabase
        .from("projects")
        .update({
          boundary_geojson: fc as unknown as Record<string, unknown>,
          boundary_label: label,
        })
        .eq("id", projectId);

      if (error) {
        console.error("[SEWA] Failed to save boundary to Supabase:", error.message);
      }

      // ── Fetch DEM tile for this boundary ──────────────────────────────
      // Compute a bounding box from the feature collection's coordinates,
      // then load a GeoTIFF tile from USGS 3DEP covering the project area.
      // This tile is cached in state and reused for all LIDAR elevation lookups.
      try {
        const coords: number[][] = [];
        fc.features.forEach((f) => {
          if (f.geometry.type === "Polygon") {
            f.geometry.coordinates[0].forEach((c) => coords.push(c as number[]));
          } else if (f.geometry.type === "MultiPolygon") {
            f.geometry.coordinates.forEach((poly) =>
              poly[0].forEach((c) => coords.push(c as number[]))
            );
          }
        });
        if (coords.length > 0) {
          const lngs = coords.map((c) => c[0]);
          const lats = coords.map((c) => c[1]);
          const bbox = {
            minLng: Math.min(...lngs) - 0.01,
            minLat: Math.min(...lats) - 0.01,
            maxLng: Math.max(...lngs) + 0.01,
            maxLat: Math.max(...lats) + 0.01,
          };
          const tile = await loadDemTile(bbox);
          setDemTile(tile);
          if (tile) {
            console.log("[SEWA] DEM tile loaded for boundary bbox:", bbox);
          } else {
            console.warn("[SEWA] DEM tile load returned null — LIDAR mode unavailable");
          }
        }
      } catch (err) {
        console.error("[SEWA] DEM tile fetch failed:", err);
      }

      markUnsaved();
    },
    [projectId]
  );

  /**
   * Called by ImportButton when the user clicks × to remove the boundary.
   * Sets both fields to null in Supabase and local state.
   */
  const handleClearBoundary = useCallback(async () => {
    setBoundaryGeoJSON(null);
    setBoundaryLabel(null);

    const { error } = await supabase
      .from("projects")
      .update({ boundary_geojson: null, boundary_label: null })
      .eq("id", projectId);

    if (error) {
      console.error("[SEWA] Failed to clear boundary in Supabase:", error.message);
    }

    markUnsaved();
  }, [projectId]);

  // --------------------------------------------------------------------------
  // M5: Shapefile import — Nodes (from ImportPanel)
  // --------------------------------------------------------------------------
  const handleImportNodes = useCallback(async (importedNodes: NetworkNode[]) => {
    if (!session) return;
    const userId = session.user.id;
    const inserts = importedNodes.map((n) => ({ ...n, user_id: userId }));
    const { data, error } = await supabase
      .from("network_nodes")
      .insert(inserts)
      .select();
    if (error) {
      console.error("[SEWA] handleImportNodes error:", error.message);
      return;
    }
    if (data) setNodes((prev) => [...prev, ...(data as NetworkNode[])]);
    markUnsaved();
  }, [session, supabase, projectId]);

  // --------------------------------------------------------------------------
  // M5: Shapefile import — Pipes (from ImportPanel)
  //
  // Pipes imported from shapefile reference nodes by label (from_node_label /
  // to_node_label). We look up the current nodes array to resolve labels → IDs.
  // Pipes referencing node labels not yet in the project are skipped with a warning.
  // --------------------------------------------------------------------------
  const handleImportPipes = useCallback(async (importedPipes: (NetworkPipe & {
    from_node_label?: string;
    to_node_label?: string;
  })[]) => {
    if (!session) return;
    const userId = session.user.id;
    // Build label → id lookup from current nodes
    const labelToId = new Map<string, string>();
    nodes.forEach((n) => labelToId.set(n.label, n.id));

    const skipped: string[] = [];
    const inserts = importedPipes
      .map((p) => {
        const fromId = labelToId.get(p.from_node_label ?? "");
        const toId = labelToId.get(p.to_node_label ?? "");
        if (!fromId || !toId) {
          skipped.push(p.label);
          return null;
        }
        return { ...p, user_id: userId, from_node_id: fromId, to_node_id: toId };
      })
      .filter(Boolean) as NetworkPipe[];

    if (skipped.length > 0) {
      console.warn(`[SEWA] handleImportPipes: skipped ${skipped.length} pipes with unresolved node labels:`, skipped.join(", "));
    }
    if (!inserts.length) return;

    const { data, error } = await supabase
      .from("network_pipes")
      .insert(inserts)
      .select();
    if (error) {
      console.error("[SEWA] handleImportPipes error:", error.message);
      return;
    }
    if (data) setPipes((prev) => [...prev, ...(data as NetworkPipe[])]);
    markUnsaved();
  }, [session, supabase, projectId, nodes]);

  // --------------------------------------------------------------------------
  // M3: Simulation runner
  // --------------------------------------------------------------------------

  /**
   * Triggers a Manning's steady-state simulation run:
   *
   *   1. Sets simLoading = true (opens the spinner in SimulationPanel)
   *   2. Calls runSimulation(nodes, pipes) synchronously in the browser
   *   3. Saves the result to `simulation_results` in Supabase for persistence
   *   4. Stores the result in React state (opens SimulationPanel with results)
   *   5. Sets simLoading = false
   *
   * The Supabase insert is fire-and-forget — if it fails, we still show the
   * results to the user (they can see the error toast in the console).
   * The simulation itself cannot fail; runSimulation() always returns a
   * valid result object, even on empty or malformed networks.
   */
  const handleRunAnalysis = useCallback(async () => {
    if (!session) return;
    setSimLoading(true);
    setShowSimPanel(true);

    // Step 1: Optionally patch node elevations from LIDAR before simulation.
    // When the user has selected "LIDAR" elevation source AND a DEM tile is
    // loaded, replace each node's invert_elev with (DEM_surface - burial_depth).
    // This allows rapid preliminary analysis without field survey data.
    // Falls back to attribute elevation if DEM doesn't cover a node's location.
    let simNodes = nodes;
    if (elevationSource === "lidar" && demTile) {
      const { applyLidarElevations, lidarPatchSummary } = await import("@/lib/lidarElevation");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      simNodes = applyLidarElevations(nodes as any[], demTile) as typeof nodes;
      console.log("[SEWA] handleRunAnalysis:", lidarPatchSummary(nodes as any[], simNodes as any[]));
    }

    // Step 2: Run Manning's equation synchronously in the browser.
    // This is a pure function with no side effects — safe to call any number of times.
    const result = runSimulation(simNodes, pipes);

    // Step 2: Persist the result to Supabase so it survives page refreshes
    // and can be compared against future runs (M4: historical run comparison).
    // The `run_at` column is auto-populated by the DB default (now()).
    const { error } = await supabase.from("simulation_results").insert({
      project_id: projectId,
      user_id: session.user.id,
      summary: result.summary,
      pipe_results: result.pipe_results,
      node_results: result.node_results,
      warnings: result.warnings,
    });

    if (error) {
      // Log but don't block — the user can still see and act on the results.
      console.error("[SEWA] Failed to save simulation result to Supabase:", error.message);
    }

    // Step 3: Store in React state to drive the SimulationPanel UI
    setSimResult(result);
    setSimLoading(false);
  }, [session, nodes, pipes, projectId, elevationSource, demTile]);

  // -------------------------------------------------------------------------
  // Map interaction handlers
  // -------------------------------------------------------------------------

  /**
   * Handles clicks on the map canvas.
   *
   * In "node" draw mode: creates a new node at the clicked lat/lng, then
   * automatically fetches USGS elevation for it (M2 behaviour).
   * In all other modes: ignored.
   *
   * @param lat - Latitude of the click (Leaflet mouse event provides this)
   * @param lng - Longitude of the click
   */
  const handleMapClick = useCallback(
    async (lat: number, lng: number) => {
      // In pipe mode, map-canvas clicks are ignored — user must click node markers.
      if (!session || drawMode === "pipe") return;
      if (drawMode !== "node" || !nodeTypeToAdd) return;

      const { data, error } = await supabase
        .from("network_nodes")
        .insert({
          project_id: projectId,
          user_id: session.user.id,
          type: nodeTypeToAdd,
          lat,
          lng,
          label: "",
        })
        .select()
        .single();

      if (!error && data) {
        const newNode = data as NetworkNode;

        // Add to React state so the map immediately renders the new node
        setNodes((prev) => [...prev, newNode]);

        // M2: Automatically fetch USGS elevation for the newly placed node
        fetchAndApplyElevation(newNode.id, lat, lng);
      }

      markUnsaved();
    },
    [session, drawMode, nodeTypeToAdd, projectId]
  );

  /**
   * Handles clicks on individual node markers in the Leaflet map.
   * In pipe-draw mode the user draws with L.Draw.Polyline (handlePolylineDrawn);
   * in node mode we place a new node; in default mode we select the node.
   *
   * @param node  - The NetworkNode that was clicked
   * @param _e    - The Leaflet mouse event (underscore-prefixed: intentionally unused)
   */
  /**
   * leaflet-draw completed a polyline — create pipes between each consecutive
     // Reset pipeFromNodeId when leaving pipe mode
  useEffect(() => {
    if (drawMode !== "pipe") setPipeFromNodeId(null);
  }, [drawMode]);

  /**
   * Handles clicks on individual node markers in the Leaflet map.
   *
   * Pipe-draw mode (two-node-click flow):
   *   1st click → records FROM node (glowing cyan ring shown on that node)
   *   2nd click (different node) → inserts pipe, exits pipe mode
   *   2nd click (same node) → cancels selection
   *
   * Node mode: ignored (handleMapClick places nodes on map click).
   * Default mode: selects node for properties panel.
   */
  const handleNodeClick = useCallback(
    async (node: NetworkNode, _e: L.LeafletMouseEvent) => {
      if (drawMode === "node") return;

      if (drawMode === "pipe") {
        if (!pipeFromNodeId) {
          // First click: record FROM node
          setPipeFromNodeId(node.id);
          return;
        }
        if (pipeFromNodeId === node.id) {
          // Same node clicked twice — cancel
          setPipeFromNodeId(null);
          return;
        }
        // Second click: create the pipe
        if (!session) return;
        const { data, error } = await supabase
          .from("network_pipes")
          .insert({
            project_id: projectId,
            user_id: session.user.id,
            from_node_id: pipeFromNodeId,
            to_node_id: node.id,
            diameter_in: 8,
            material: "PVC" as const,
          })
          .select()
          .single();
        if (!error && data) setPipes((prev) => [...prev, data as NetworkPipe]);
        // Stay in pipe mode so user can immediately start the next pipe.
        // pipeFromNodeId is already null so the next click becomes the new FROM node.
        markUnsaved();
        return;
      }

      // Default: select for properties panel
      setSelectedId(node.id);
      setSelectedType("node");
    },
    [drawMode, pipeFromNodeId, session, projectId]
  );

  /**
   * Handles clicks on pipe polylines in the Leaflet map.
   * Only acts in default (non-draw) mode — pipes cannot be drawn by clicking them.
   *
   * @param pipe - The NetworkPipe that was clicked
   * @param _e   - The Leaflet mouse event (unused)
   */
  const handlePipeClick = useCallback(
    (pipe: NetworkPipe, _e: L.LeafletMouseEvent) => {
      if (drawMode !== "pipe") {
        setSelectedId(pipe.id);
        setSelectedType("pipe");
      }
    },
    [drawMode]
  );

  // -------------------------------------------------------------------------
  // Property update handlers (called by PropertiesPanel)
  // -------------------------------------------------------------------------

  /**
   * Updates a single node's properties in both React state and Supabase.
   * Used by the PropertiesPanel form when the user edits a node field
   * (label, rim_elev, invert_elev, type, etc.).
   *
   * @param id      - Primary key of the node to update
   * @param updates - A partial NetworkNode object containing the changed fields
   */
  const handleUpdateNode = useCallback(
    async (id: string, updates: Partial<NetworkNode>) => {
      // Optimistic update: reflect the change in React state immediately
      // so the UI feels instant, even on a slow network.
      setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...updates } : n)));
      await supabase.from("network_nodes").update(updates).eq("id", id);
      markUnsaved();
    },
    []
  );

  /**
   * Updates a single pipe's properties in both React state and Supabase.
   *
   * @param id      - Primary key of the pipe to update
   * @param updates - A partial NetworkPipe object containing the changed fields
   */
  const handleUpdatePipe = useCallback(
    async (id: string, updates: Partial<NetworkPipe>) => {
      setPipes((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
      await supabase.from("network_pipes").update(updates).eq("id", id);
      markUnsaved();
    },
    []
  );

  /**
   * Deletes a node from Supabase and removes it from React state.
   * Also orphan-cleans any pipes that referenced this node as from_node or to_node
   * by nulling out the relevant FK (the pipe remains but is now "unconnected").
   *
   * @param id - Primary key of the node to delete
   */
  const handleDeleteNode = useCallback(
    async (id: string) => {
      await supabase.from("network_nodes").delete().eq("id", id);

      setNodes((prev) => prev.filter((n) => n.id !== id));

      // Orphan-clean connected pipes so they don't hold stale FK references
      setPipes((prev) =>
        prev.map((p) =>
          p.from_node_id === id
            ? { ...p, from_node_id: null }
            : p.to_node_id === id
            ? { ...p, to_node_id: null }
            : p
        )
      );

      // Close the properties panel if the deleted node was selected
      if (selectedId === id) {
        setSelectedId(null);
        setSelectedType(null);
      }

      markUnsaved();
    },
    [selectedId]
  );

  /**
   * Deletes a pipe from Supabase and removes it from React state.
   * Closes the properties panel if the deleted pipe was selected.
   *
   * @param id - Primary key of the pipe to delete
   */
  const handleDeletePipe = useCallback(
    async (id: string) => {
      await supabase.from("network_pipes").delete().eq("id", id);
      setPipes((prev) => prev.filter((p) => p.id !== id));

      if (selectedId === id) {
        setSelectedId(null);
        setSelectedType(null);
      }

      markUnsaved();
    },
    [selectedId]
  );

  /** Delete ALL nodes and pipes for this project (used by "Clear Network" button). */
  const handleClearNetwork = useCallback(async () => {
    if (!session) return;
    if (!confirm(`Delete all ${nodes.length} nodes and ${pipes.length} pipes? This cannot be undone.`)) return;
    await supabase.from("network_pipes").delete().eq("project_id", projectId);
    await supabase.from("network_nodes").delete().eq("project_id", projectId);
    setNodes([]);
    setPipes([]);
    setSelectedId(null);
    setSelectedType(null);
    markUnsaved();
  }, [session, projectId, nodes.length, pipes.length]);

  // -------------------------------------------------------------------------
  // Derived / convenience values
  // -------------------------------------------------------------------------

  /**
   * The currently selected element — either a NetworkNode or a NetworkPipe.
   * Used by PropertiesPanel to render the correct edit form.
   * Returns null if nothing is selected.
   */
  const selectedElement =
    selectedType === "node"
      ? nodes.find((n) => n.id === selectedId) ?? null
      : pipes.find((p) => p.id === selectedId) ?? null;

  // -------------------------------------------------------------------------
  // Render — loading gate
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center" style={{ backgroundColor: "#0a0f1e" }}>
        <div
          className="w-8 h-8 border-2 rounded-full animate-spin"
          style={{ borderColor: "#38bdf8", borderTopColor: "transparent" }}
          aria-label="Loading project"
        />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------------

  return (
    <div
      className="h-screen w-screen flex flex-col overflow-hidden"
      style={{ backgroundColor: "#0a0f1e" }}
    >
      {/* ── Top Bar ──────────────────────────────────────────────────────── */}
      {/*
        The top bar contains:
          - Left:  SEWA logo, breadcrumb navigation (Dashboard › Project Name)
          - Center (M3): "Run Analysis" button — triggers Manning's simulation
          - Right: Meridian health dot, save-status indicator, zoom controls
      */}
      <header
        className="h-12 flex items-center justify-between px-4 border-b flex-shrink-0 z-10"
        style={{ backgroundColor: "#0d1526", borderColor: "#1e293b" }}
      >
        {/* Left cluster: branding + breadcrumb */}
        <div className="flex items-center gap-4">
          <span className="text-sky-400 font-bold text-base tracking-wide">SEWA</span>
          <span className="text-slate-600 text-sm" aria-hidden="true">›</span>
          <a
            href="/dashboard"
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            Dashboard
          </a>
          <span className="text-slate-600 text-sm" aria-hidden="true">›</span>
          <span className="text-sm text-white font-medium">{project?.name ?? "Project"}</span>
        </div>

        {/* Center: M3 Run Analysis button — solid filled for high visibility */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleRunAnalysis}
            disabled={simLoading || nodes.length < 2}
            title={nodes.length < 2 ? "Add at least 2 nodes to run analysis" : "Run hydraulic analysis"}
            className={`
              flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold
              transition-all shadow-lg
              ${simLoading || nodes.length < 2
                ? "opacity-40 cursor-not-allowed bg-slate-700 text-slate-400"
                : "bg-sky-500 hover:bg-sky-400 text-white active:scale-95 shadow-sky-500/30"
              }
            `}
            aria-label="Run hydraulic analysis"
          >
            <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor" aria-hidden="true">
              <path d="M0 0 L10 6 L0 12 Z" />
            </svg>
            {simLoading ? "Running…" : "Run Analysis"}
          </button>
        </div>

        {/* Right cluster: Meridian status, save indicator, zoom controls */}
        <div className="flex items-center gap-3">
          {/* Meridian API health indicator (M2) */}
          {meridianStatus !== "checking" && (
            <div className="flex items-center gap-1.5 text-xs">
              <div
                className={`w-2 h-2 rounded-full ${
                  meridianStatus === "ok" ? "bg-emerald-500" : "bg-red-500"
                }`}
              />
              <span className={meridianStatus === "ok" ? "text-emerald-400" : "text-red-400"}>
                {meridianStatus === "ok" ? "Meridian ✓" : "Meridian offline"}
              </span>
            </div>
          )}

          {/* Save status indicator */}
          <div className="flex items-center gap-1.5 text-xs">
            {saved ? (
              <>
                {/* Checkmark SVG */}
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#22c55e" strokeWidth="2" aria-hidden="true">
                  <polyline points="2,7 5.5,10.5 12,3.5" />
                </svg>
                <span className="text-emerald-400">Saved</span>
              </>
            ) : (
              <>
                {/* Pulsing dot while saving */}
                <div className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" aria-hidden="true" />
                <span className="text-slate-400">Saving…</span>
              </>
            )}
          </div>

          {/* Clear Network — only shown when nodes exist */}
          {nodes.length > 0 && (
            <button
              onClick={handleClearNetwork}
              className="px-3 py-1 rounded text-xs font-medium text-red-400 border border-red-900/40 hover:bg-red-900/20 transition-colors"
              title="Delete all nodes and pipes"
            >
              Clear Network
            </button>
          )}

          {/* Zoom controls */}
          <div className="flex items-center border rounded-lg overflow-hidden" style={{ borderColor: "#1e293b" }}>
            <button
              onClick={() => mapRef.current?.zoomIn()}
              aria-label="Zoom in"
              className="px-2.5 py-1 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors text-sm font-bold"
            >
              +
            </button>
            <div className="w-px h-4 bg-slate-700" aria-hidden="true" />
            <button
              onClick={() => mapRef.current?.zoomOut()}
              aria-label="Zoom out"
              className="px-2.5 py-1 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors text-sm font-bold"
            >
              −
            </button>
          </div>
        </div>
      </header>

      {/* ── Body: Palette + Map + Properties Panel ──────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/*
          ElementPalette (left sidebar):
            - Node type buttons (manhole, cleanout, etc.)
            - Draw mode toggle (none / node / pipe)
            - Layer visibility toggles
            - Basemap selector
        */}
        <ElementPalette
          drawMode={drawMode}
          nodeTypeToAdd={nodeTypeToAdd}
          pipeTypeToAdd="gravity"
          layerVisibility={layerVisibility}
          basemap={basemap}
          boundaryLabel={boundaryLabel}
          nodes={nodes}
          onDrawModeChange={setDrawMode}
          onNodeTypeToAdd={setNodeTypeToAdd}
          onPipeTypeToAdd={() => {}}
          onLayerVisibilityChange={setLayerVisibility}
          onBasemapChange={setBasemap}
          onAppendNodes={handleImportNodes}
          onAppendPipes={handleImportPipes}
          onImportBoundary={handleImportBoundary}
          onClearBoundary={handleClearBoundary}
          pipes={pipes}
          projectId={projectId}
        />

        {/* Map canvas (center) — switches between GIS and Schematic view */}
        <div className="flex-1 relative">

          {/* View Mode toggle overlay — top-left of map area */}
          <ViewToggle
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            elevationSource={elevationSource}
            onElevationSourceChange={setElevationSource}
            hasDemTile={!!demTile}
          />

          {/* Conditional: GIS map (editable) or Schematic (read-only) */}
          {viewMode === "schematic" ? (
            <SchematicCanvas
              nodes={nodes}
              pipes={pipes}
              simulationResult={simResult}
            />
          ) : (
          <MapCanvas
            nodes={nodes}
            pipes={pipes}
            drawMode={drawMode}
            nodeTypeToAdd={nodeTypeToAdd}
            selectedId={selectedId}
            selectedType={selectedType}
            layerVisibility={layerVisibility}
            basemap={basemap}
            boundaryGeoJSON={boundaryGeoJSON}
            onMapClick={handleMapClick}
            pipeFromNodeId={pipeFromNodeId}
            onNodeClick={handleNodeClick}
            onPipeClick={handlePipeClick}
            onBasemapChange={setBasemap}
            onMapReady={(map) => {
              // Store the Leaflet map instance so zoom buttons can access it
              mapRef.current = map;
            }}
          />
          )}

        </div>

        {/* Properties panel (right sidebar) — appears when an element is selected */}
        <PropertiesPanel
          selected={selectedElement as NetworkNode | NetworkPipe | null}
          selectedType={selectedType}
          nodes={nodes}
          onUpdateNode={handleUpdateNode}
          onUpdatePipe={handleUpdatePipe}
          onDeleteNode={handleDeleteNode}
          onDeletePipe={handleDeletePipe}
          onClose={() => {
            setSelectedId(null);
            setSelectedType(null);
          }}
          onFetchElevation={(nodeId, lat, lng) => fetchAndApplyElevation(nodeId, lat, lng)}
          fetchingElevation={fetchingElevationNodeId === selectedId}
        />
      </div>

      {/* ── M3: Simulation Results Bottom Drawer ─────────────────────── */}
      {/*
        SimulationPanel is portalled to the bottom of the screen.
        It is controlled by:
          - showSimPanel : boolean  — opens/closes the drawer
          - simLoading   : boolean  — shows spinner while simulation runs
          - simResult    : SimulationResult | null — the result to display

        onClose hides the panel but does NOT clear simResult — this allows
        the user to re-open the results without re-running the simulation.
        Closing the panel is not destructive.
      */}
      <SimulationPanel
        result={simResult}
        loading={simLoading}
        show={showSimPanel}
        onClose={() => setShowSimPanel(false)}
      />
    </div>
  );
}
