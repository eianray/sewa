"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";
import type { Project } from "@/types/project";
import type { NetworkNode, NetworkPipe, NodeType, PipeType, DrawMode, BasemapType, LayerVisibility } from "@/types/network";
import type { Facility } from "@/types/facility";
import { FACILITY_TYPE_LABELS } from "@/types/facility";
import type { SimulationResult } from "@/lib/simulation";
import { loadDemTile } from "@/lib/demSampler";
import { DEFAULT_BURIAL_DEPTH_FT } from "@/lib/lidarElevation";
import { runSimulation } from "@/lib/simulation";
import ElementPalette from "@/components/ElementPalette";
import FacilityPalette from "@/components/FacilityPalette";
import { AddFacilityModal } from "@/components/FacilityPalette";
import SimulationPanel from "@/components/SimulationPanel";
import PropertiesPanel from "@/components/PropertiesPanel";
import type L from "leaflet";
import type { FeatureCollection } from "geojson";

const MapCanvas = dynamic(() => import("@/components/MapCanvas"), { ssr: false });

function LoadingState() {
  return (
    <div className="h-screen w-screen bg-[#0a0f1e] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#38bdf8] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function NoProject() {
  return (
    <div className="h-screen w-screen bg-[#0a0f1e] flex items-center justify-center">
      <div className="text-center">
        <p className="text-[#94a3b8] text-lg mb-4">No project selected</p>
        <a href="/dashboard" className="text-[#38bdf8] hover:text-[#0ea5e9] transition-colors">
          ← Back to Dashboard
        </a>
      </div>
    </div>
  );
}

interface ProjectDetailClientProps {
  projectId: string;
}

export function ProjectDetailClient({ projectId }: ProjectDetailClientProps) {
  const [session, setSession] = useState<{ user: { id: string } } | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [nodes, setNodes] = useState<NetworkNode[]>([]);
  const [pipes, setPipes] = useState<NetworkPipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(true);
  const [savedTimer, setSavedTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [drawMode, setDrawMode] = useState<DrawMode>("none");
  const [nodeTypeToAdd, setNodeTypeToAdd] = useState<NodeType | null>(null);
  const [pipeTypeToAdd, setPipeTypeToAdd] = useState<PipeType>("gravity");
  const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>({
    nodes: true,
    pipes: true,
    basins: true,
    facilities: true,
  });
  const [basemap, setBasemap] = useState<BasemapType>("street");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<"node" | "pipe" | "facility" | null>(null);
  const [pipeFirstNodeId, setPipeFirstNodeId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [boundaryGeoJSON, setBoundaryGeoJSON] = useState<FeatureCollection | null>(null);
  const [boundaryLabel, setBoundaryLabel] = useState<string | null>(null);
  const [demTile, setDemTile] = useState<string | null>(null);
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [showSimulation, setShowSimulation] = useState(false);
  const [grabbingLidar, setGrabbingLidar] = useState(false);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);
  const [showAddFacilityModal, setShowAddFacilityModal] = useState(false);
  const [pendingFacilityLocation, setPendingFacilityLocation] = useState<{ lat: number; lng: number } | null>(null);


  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        window.location.href = "/";
        return;
      }
      setSession(data.session as { user: { id: string } });
      setAuthChecked(true);
      fetchData(data.session.user.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Clear-layer event listeners (dispatched by ElementPalette ⋯ menu)
  useEffect(() => {
    if (!session) return;
    const userId = session.user.id;

    const clearNodes = async () => {
      const { error } = await supabase
        .from("network_nodes")
        .delete()
        .eq("project_id", projectId)
        .eq("user_id", userId);
      if (!error) { setNodes([]); markUnsaved(); }
    };
    const clearPipes = async () => {
      const { error } = await supabase
        .from("network_pipes")
        .delete()
        .eq("project_id", projectId)
        .eq("user_id", userId);
      if (!error) { setPipes([]); markUnsaved(); }
    };
    const clearFacilities = async () => {
      const { error } = await supabase
        .from("network_facilities")
        .delete()
        .eq("project_id", projectId)
        .eq("user_id", userId);
      if (!error) { setFacilities([]); markUnsaved(); }
    };

    window.addEventListener("sewa:clear-layer:nodes", clearNodes);
    window.addEventListener("sewa:clear-layer:pipes", clearPipes);
    window.addEventListener("sewa:clear-layer:facilities", clearFacilities);
    return () => {
      window.removeEventListener("sewa:clear-layer:nodes", clearNodes);
      window.removeEventListener("sewa:clear-layer:pipes", clearPipes);
      window.removeEventListener("sewa:clear-layer:facilities", clearFacilities);
    };
  }, [session, projectId, supabase]);

  async function fetchData(userId: string) {
    setLoading(true);
    const [{ data: proj }, { data: nodeData }, { data: pipeData }, { data: facilityData }] = await Promise.all([
      supabase.from("projects").select("*").eq("id", projectId).single(),
      supabase.from("network_nodes").select("*").eq("project_id", projectId).eq("user_id", userId),
      supabase.from("network_pipes").select("*").eq("project_id", projectId).eq("user_id", userId),
      supabase.from("network_facilities").select("*").eq("project_id", projectId).eq("user_id", userId).order("facility_id"),
    ]);
    if (proj) setProject(proj as Project);
    setNodes((nodeData as NetworkNode[]) || []);
    setPipes((pipeData as NetworkPipe[]) || []);
    setFacilities((facilityData as Facility[]) || []);
    const projRecord = proj as Project | null;
    if (projRecord?.boundary_geojson) setBoundaryGeoJSON(projRecord.boundary_geojson as FeatureCollection);
    if (projRecord?.boundary_label) setBoundaryLabel(projRecord.boundary_label);
    if (projRecord?.dem_tile) setDemTile(projRecord.dem_tile);
    setLoading(false);
  }

  function markUnsaved() {
    setSaved(false);
    if (savedTimer) clearTimeout(savedTimer);
    const t = setTimeout(() => setSaved(true), 1500);
    setSavedTimer(t);
  }

  const handleMapClick = useCallback(
    async (lat: number, lng: number) => {
      if (!session) return;
      if (drawMode === 'node' && nodeTypeToAdd) {
        const { data, error } = await supabase
          .from('network_nodes')
          .insert({ project_id: projectId, user_id: session.user.id, type: nodeTypeToAdd, lat, lng, label: '' })
          .select()
          .single();
        if (!error && data) setNodes((prev) => [...prev, data as NetworkNode]);
        markUnsaved();
        return;
      }
      if (drawMode === 'facility') {
        setPendingFacilityLocation({ lat, lng });
        setShowAddFacilityModal(true);
        return;
      }
    },
    [session, drawMode, nodeTypeToAdd, pipeTypeToAdd, projectId]
  );

  const handleNodeClick = useCallback(
    async (node: NetworkNode, _e: L.LeafletMouseEvent) => {
      if (drawMode === "pipe") {
        if (!pipeFirstNodeId) {
          setPipeFirstNodeId(node.id);
        } else if (pipeFirstNodeId !== node.id && session) {
          const { data, error } = await supabase
            .from("network_pipes")
            .insert({ project_id: projectId, user_id: session.user.id, from_node_id: pipeFirstNodeId, to_node_id: node.id, diameter_in: 8, material: "PVC", pipe_type: pipeTypeToAdd })
            .select()
            .single();
          if (!error && data) setPipes((prev) => [...prev, data as NetworkPipe]);
          setPipeFirstNodeId(null);
          setDrawMode("none");
          markUnsaved();
        }
      } else {
        setSelectedId(node.id);
        setSelectedType("node");
      }
    },
    [drawMode, pipeFirstNodeId, session, projectId]
  );

  const handlePipeClick = useCallback((pipe: NetworkPipe, _e: L.LeafletMouseEvent) => {
    if (drawMode !== "pipe") { setSelectedId(pipe.id); setSelectedType("pipe"); }
  }, [drawMode]);

  const handleImportBoundary = useCallback(async (fc: FeatureCollection, label: string) => {
    setBoundaryGeoJSON(fc);
    setBoundaryLabel(label);
    const { error } = await supabase.from("projects").update({ boundary_geojson: fc as unknown as Record<string, unknown>, boundary_label: label }).eq("id", projectId);
    if (error) console.error("[SEWA] Failed to save boundary:", error.message);
    markUnsaved();
  }, [projectId]);

  const handleClearBoundary = useCallback(async () => {
    setBoundaryGeoJSON(null);
    setBoundaryLabel(null);
    const { error } = await supabase.from("projects").update({ boundary_geojson: null, boundary_label: null }).eq("id", projectId);
    if (error) console.error("[SEWA] Failed to clear boundary:", error.message);
    markUnsaved();
  }, [projectId]);

  // M5: Import nodes from shapefile
  const handleImportNodes = useCallback(async (importedNodes: NetworkNode[]) => {
    if (!session) return;
    const userId = session.user.id;
    const inserts = importedNodes.map((n) => ({ ...n, user_id: userId }));
    const { data, error } = await supabase.from("network_nodes").insert(inserts).select();
    if (error) { console.error("[SEWA] handleImportNodes:", error.message); return; }
    if (data) setNodes((prev) => [...prev, ...(data as NetworkNode[])]);
    markUnsaved();
  }, [session, supabase, projectId]);

  // M5: Import pipes from shapefile — resolves node labels to IDs from current nodes
  const handleImportPipes = useCallback(async (importedPipes: (NetworkPipe & { from_node_label?: string; to_node_label?: string })[]) => {
    if (!session) return;
    const userId = session.user.id;
    const labelToId = new Map<string, string>();
    nodes.forEach((n) => labelToId.set(n.label, n.id));
    const skipped: string[] = [];
    const inserts = importedPipes
      .map((p) => {
        const fromId = labelToId.get(p.from_node_label ?? "");
        const toId = labelToId.get(p.to_node_label ?? "");
        if (!fromId || !toId) { skipped.push(p.label); return null; }
        return { ...p, user_id: userId, from_node_id: fromId, to_node_id: toId, pipe_type: p.pipe_type ?? "gravity" };
      })
      .filter(Boolean) as NetworkPipe[];
    if (skipped.length) console.warn("[SEWA] handleImportPipes skipped:", skipped.join(", "));
    if (!inserts.length) return;
    const { data, error } = await supabase.from("network_pipes").insert(inserts).select();
    if (error) { console.error("[SEWA] handleImportPipes:", error.message); return; }
    if (data) setPipes((prev) => [...prev, ...(data as NetworkPipe[])]);
    markUnsaved();
  }, [session, supabase, projectId, nodes]);

  const handleUpdateNode = useCallback(async (id: string, updates: Partial<NetworkNode>) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...updates } : n)));
    await supabase.from("network_nodes").update(updates).eq("id", id);
    markUnsaved();
  }, []);

  const handleUpdatePipe = useCallback(async (id: string, updates: Partial<NetworkPipe>) => {
    setPipes((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
    await supabase.from("network_pipes").update(updates).eq("id", id);
    markUnsaved();
  }, []);

  const handleDeleteNode = useCallback(async (id: string) => {
    await supabase.from("network_nodes").delete().eq("id", id);
    setNodes((prev) => prev.filter((n) => n.id !== id));
    setPipes((prev) => prev.map((p) => p.from_node_id === id ? { ...p, from_node_id: null } : p.to_node_id === id ? { ...p, to_node_id: null } : p));
    if (selectedId === id) { setSelectedId(null); setSelectedType(null); }
    markUnsaved();
  }, [selectedId]);

  const handleDeletePipe = useCallback(async (id: string) => {
    await supabase.from("network_pipes").delete().eq("id", id);
    setPipes((prev) => prev.filter((p) => p.id !== id));
    if (selectedId === id) { setSelectedId(null); setSelectedType(null); }
    markUnsaved();
  }, [selectedId]);

  // Facility handlers
  const handleFacilityClick = useCallback(
    async (_facility: Facility, _e: L.LeafletMouseEvent) => {
      if (drawMode !== 'facility') {
        const f = facilities.find((f) => f.id === _facility.id);
        setSelectedId(_facility.id);
        setSelectedType('facility');
        setSelectedFacility(f ?? null);
      }
    },
    [drawMode, facilities]
  );

  const handleAddFacility = useCallback(
    async (location: { lat: number; lng: number }, data: { name: string; facility_type: Facility['facility_type'] }) => {
      if (!session) return;
      const facilityId = `FAC-${String(facilities.length + 1).padStart(3, '0')}`;
      const { data: newFacility, error } = await supabase
        .from('network_facilities')
        .insert({
          project_id: projectId,
          user_id: session.user.id,
          facility_id: facilityId,
          facility_type: data.facility_type,
          name: data.name,
          lat: location.lat,
          lng: location.lng,
          allocated_cfs: 0,
          allocated_mgd: 0,
          properties: {},
        })
        .select()
        .single();
      if (error) { console.error('[SEWA] handleAddFacility:', error.message); return; }
      if (newFacility) {
        setFacilities((prev) => [...prev, newFacility as Facility]);
        setSelectedId(newFacility.id);
        setSelectedType('facility');
        setSelectedFacility(newFacility as Facility);
      }
      setShowAddFacilityModal(false);
      setPendingFacilityLocation(null);
      setDrawMode('none');
      markUnsaved();
    },
    [session, facilities, projectId]
  );

  const handleUpdateFacility = useCallback(async (id: string, updates: Partial<Facility>) => {
    setFacilities((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
    setSelectedFacility((prev) => prev ? { ...prev, ...updates } : null);
    await supabase.from('network_facilities').update(updates).eq('id', id);
    markUnsaved();
  }, []);

  const handleDeleteFacility = useCallback(async (id: string) => {
    await supabase.from('network_facilities').delete().eq('id', id);
    setFacilities((prev) => prev.filter((f) => f.id !== id));
    if (selectedId === id) { setSelectedId(null); setSelectedType(null); setSelectedFacility(null); }
    markUnsaved();
  }, [selectedId]);

  const handleImportFacilities = useCallback(async (importedFacilities: Facility[]) => {
    if (!session) return;
    const userId = session.user.id;

    // Get existing facility count to generate unique IDs
    const { data: existing } = await supabase
      .from('network_facilities')
      .select('facility_id')
      .eq('project_id', projectId)
      .order('facility_id', { ascending: false })
      .limit(1);
    const lastIdx = existing?.[0]
      ? parseInt(existing[0].facility_id.replace('FAC-', ''), 10) || 0
      : 0;

    const inserts = importedFacilities.map((f, i) => ({
      ...f,
      project_id: projectId,
      user_id: userId,
      facility_id: f.facility_id || `FAC-${String(lastIdx + i + 1).padStart(3, '0')}`,
    }));

    const { data, error } = await supabase.from('network_facilities').insert(inserts).select();
    if (error) { console.error('[SEWA] handleImportFacilities:', error.message); alert(`Import failed: ${error.message}`); return; }
    if (data) {
      const mapped = data.map((f: Record<string, unknown>) => ({
        ...f,
        remaining_cfs: (Number(f.capacity_cfs) || 0) - (Number(f.allocated_cfs) || 0),
        remaining_mgd: (Number(f.capacity_mgd) || 0) - (Number(f.allocated_mgd) || 0),
      }));
      setFacilities((prev) => [...prev, ...mapped as Facility[]]);
    }
    markUnsaved();
  }, [session, projectId]);

  // Grab elevation from LIDAR for a single node — fetches tile from USGS WCS using project bbox
  const handleGrabLidar = useCallback(async (nodeId: string, lat: number, lng: number) => {
    if (!boundaryGeoJSON) { console.warn("[SEWA] Grab LIDAR requires a boundary polygon first"); return; }
    setGrabbingLidar(true);
    try {
      const coords = (boundaryGeoJSON.features[0]?.geometry as GeoJSON.Polygon)?.coordinates[0];
      if (!coords) return;
      const lngs = coords.map((c: number[]) => c[0]);
      const lats = coords.map((c: number[]) => c[1]);
      const bbox = {
        minLng: Math.min(...lngs), maxLng: Math.max(...lngs),
        minLat: Math.min(...lats), maxLat: Math.max(...lats),
      };
      const tile = await loadDemTile(bbox, 1024, 1024);
      if (!tile) { console.warn("[SEWA] LIDAR tile fetch failed"); return; }
      const elevFt = tile.sampleElevationFt(lat, lng);
      if (elevFt === null) { console.warn("[SEWA] LIDAR: no coverage at", lat, lng); return; }
      const rimElev = +elevFt.toFixed(2);
      const invertElev = +(elevFt - DEFAULT_BURIAL_DEPTH_FT).toFixed(2);
      await handleUpdateNode(nodeId, { rim_elev: rimElev, invert_elev: invertElev });
    } finally {
      setGrabbingLidar(false);
    }
  }, [boundaryGeoJSON, handleUpdateNode]);

  // Auto-calculate slope from rim elevations of connected nodes
  const handleAutoSlope = useCallback(async (pipeId: string) => {
    const pipe = pipes.find((p) => p.id === pipeId);
    if (!pipe) return;
    const fromNode = nodes.find((n) => n.id === pipe.from_node_id);
    const toNode = nodes.find((n) => n.id === pipe.to_node_id);
    if (!fromNode || !toNode) return;
    if (fromNode.rim_elev == null || toNode.rim_elev == null) {
      console.warn("[SEWA] Auto-slope: rim elevations missing on one or both nodes"); return;
    }
    let lenFt = pipe.length_ft;
    if (!lenFt) {
      // Haversine
      const R = 20902230; const lat1 = (fromNode.lat * Math.PI) / 180;
      const lat2 = (toNode.lat * Math.PI) / 180;
      const dLat = ((toNode.lat - fromNode.lat) * Math.PI) / 180;
      const dLng = ((toNode.lng - fromNode.lng) * Math.PI) / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      lenFt = Math.round(R * c * 100) / 100;
    }
    if (lenFt <= 0) return;
    const slope = Math.abs(fromNode.rim_elev - toNode.rim_elev) / lenFt * 100;
    await handleUpdatePipe(pipeId, { slope_pct: +slope.toFixed(3) });
  }, [pipes, nodes, handleUpdatePipe]);

  // Run Manning's steady-state sewer analysis
  const handleRunSimulation = useCallback(() => {
    setSimulationLoading(true);
    setShowSimulation(true);
    try {
      const result = runSimulation(nodes, pipes);
      setSimulationResult(result);
    } finally {
      setSimulationLoading(false);
    }
  }, [nodes, pipes]);

  const selectedElement = selectedType === "node"
    ? nodes.find((n) => n.id === selectedId) ?? null
    : pipes.find((p) => p.id === selectedId) ?? null;

  if (!authChecked || loading) {
    return (
      <div className="h-screen w-screen bg-[#0a0f1e] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#38bdf8] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-[#0a0f1e] flex flex-col overflow-hidden">
      {/* Top bar */}
      <header className="h-12 flex items-center justify-between px-4 border-b border-[#1e293b] bg-[#0d1526] flex-shrink-0 z-10">
        <div className="flex items-center gap-4">
          <span className="text-[#38bdf8] font-bold text-base tracking-wide">SEWA</span>
          <span className="text-[#475569] text-sm">›</span>
          <a href="/dashboard" className="text-sm text-[#94a3b8] hover:text-white transition-colors">Dashboard</a>
          <span className="text-[#475569] text-sm">›</span>
          <span className="text-sm text-white font-medium">{project?.name ?? "Project"}</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Run Analysis — always visible in header */}
          <button
            onClick={handleRunSimulation}
            disabled={simulationLoading || nodes.length === 0}
            className="bg-[#38bdf8] hover:bg-[#0ea5e9] disabled:opacity-40 disabled:cursor-not-allowed text-[#0a0f1e] text-xs font-semibold rounded-lg px-4 py-1.5 transition-colors"
          >
            {simulationLoading ? "Running…" : "Run Analysis"}
          </button>
          <div className="flex items-center gap-1.5 text-xs">
            {saved ? (
              <><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#22c55e" strokeWidth="2"><polyline points="2,7 5.5,10.5 12,3.5" /></svg><span className="text-[#22c55e]">Saved</span></>
            ) : (
              <><div className="w-2 h-2 rounded-full bg-[#38bdf8] animate-pulse" /><span className="text-[#94a3b8]">Saving…</span></>
            )}
          </div>
          <div className="flex items-center border border-[#1e293b] rounded-lg overflow-hidden">
            <button onClick={() => mapRef.current?.zoomIn()} className="px-2.5 py-1 text-[#94a3b8] hover:text-white hover:bg-[#1e293b] transition-colors text-sm font-bold" aria-label="Zoom in">+</button>
            <div className="w-px h-4 bg-[#1e293b]" />
            <button onClick={() => mapRef.current?.zoomOut()} className="px-2.5 py-1 text-[#94a3b8] hover:text-white hover:bg-[#1e293b] transition-colors text-sm font-bold" aria-label="Zoom out">−</button>
          </div>
        </div>
      </header>

      {/* Simulation results — shown when user clicks Run Analysis */}
      <SimulationPanel
        result={simulationResult}
        loading={simulationLoading}
        show={showSimulation}
        onClose={() => setShowSimulation(false)}
      />

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        <ElementPalette
          drawMode={drawMode} nodeTypeToAdd={nodeTypeToAdd} pipeTypeToAdd={pipeTypeToAdd}
          layerVisibility={layerVisibility} basemap={basemap}
          boundaryLabel={boundaryLabel}
          nodes={nodes}
          facilities={facilities}
          onDrawModeChange={(mode) => { setDrawMode(mode); if (mode !== 'pipe') setPipeFirstNodeId(null); }}
          onNodeTypeToAdd={setNodeTypeToAdd}
          onPipeTypeToAdd={setPipeTypeToAdd}
          onLayerVisibilityChange={setLayerVisibility}
          onBasemapChange={setBasemap}
          onAppendNodes={handleImportNodes}
          onAppendPipes={handleImportPipes}
          onImportBoundary={handleImportBoundary}
          onClearBoundary={handleClearBoundary}
          onAppendFacilities={handleImportFacilities}
          pipes={pipes}
          projectId={projectId}
        />
        <div className="flex-1 relative">
          <MapCanvas
            nodes={nodes} pipes={pipes}
            facilities={facilities}
            drawMode={drawMode} nodeTypeToAdd={nodeTypeToAdd}
            selectedId={selectedId} selectedType={selectedType}
            layerVisibility={layerVisibility} basemap={basemap}
            boundaryGeoJSON={boundaryGeoJSON}
            onMapClick={handleMapClick}
            onNodeClick={handleNodeClick}
            onPipeClick={handlePipeClick}
            onFacilityClick={handleFacilityClick}
            onMapReady={(map) => { mapRef.current = map; }}
          />
          {drawMode === 'pipe' && pipeFirstNodeId && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-[#38bdf8] text-[#0a0f1e] text-xs font-semibold rounded-full px-4 py-1.5 shadow-lg z-[1000]">
              Click second node to complete pipe
            </div>
          )}
          {drawMode === 'facility' && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-[#3b82f6] text-white text-xs font-semibold rounded-full px-4 py-1.5 shadow-lg z-[1000]">
              Click map to place facility
              <button
                onClick={() => setDrawMode('none')}
                className="ml-2 underline hover:no-underline"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
        <PropertiesPanel
          selected={selectedElement as NetworkNode | NetworkPipe | null}
          selectedType={selectedType}
          selectedFacility={selectedFacility}
          nodes={nodes}
          boundaryGeoJSON={boundaryGeoJSON}
          onUpdateNode={handleUpdateNode}
          onUpdatePipe={handleUpdatePipe}
          onUpdateFacility={handleUpdateFacility}
          onDeleteNode={handleDeleteNode}
          onDeletePipe={handleDeletePipe}
          onDeleteFacility={handleDeleteFacility}
          onClose={() => { setSelectedId(null); setSelectedType(null); setSelectedFacility(null); }}
          onGrabLidar={handleGrabLidar}
          grabbingLidar={grabbingLidar}
          onAutoSlope={handleAutoSlope}
        />
      </div>
      {showAddFacilityModal && pendingFacilityLocation && (
        <AddFacilityModal
          lat={pendingFacilityLocation.lat}
          lng={pendingFacilityLocation.lng}
          existingCount={facilities.length}
          onConfirm={(data) => handleAddFacility(pendingFacilityLocation, data)}
          onCancel={() => { setShowAddFacilityModal(false); setPendingFacilityLocation(null); setDrawMode('none'); }}
        />
      )}
    </div>
  );
}

function ProjectContent() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("id");

  if (!projectId) {
    return <NoProject />;
  }

  return <ProjectDetailClient projectId={projectId} />;
}

export default function ProjectPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <ProjectContent />
    </Suspense>
  );
}
