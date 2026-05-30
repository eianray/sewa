"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";
import type { Project } from "@/types/project";
import type { NetworkNode, NetworkPipe, NodeType, DrawMode, BasemapType, LayerVisibility } from "@/types/network";
import { loadDemTile } from "@/lib/demSampler";
import ElementPalette from "@/components/ElementPalette";
import PropertiesPanel from "@/components/PropertiesPanel";
import type L from "leaflet";
import type { FeatureCollection } from "geojson";

const MapCanvas = dynamic(() => import("@/components/MapCanvas"), { ssr: false });

function LoadingState() {
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-[#0a0f1e]">
      <div className="w-8 h-8 border-2 border-[#38bdf8] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function NoProject() {
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-[#0a0f1e]">
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
  const [pipeTypeToAdd, setPipeTypeToAdd] = useState<NodeType>("junction");
  const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>({
    pipes: true,
    junctions: true,
    tanks: true,
    reservoirs: true,
  });
  const [basemap, setBasemap] = useState<BasemapType>("street");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<"node" | "pipe" | null>(null);
  const [pipeFirstNodeId, setPipeFirstNodeId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [boundaryGeoJSON, setBoundaryGeoJSON] = useState<FeatureCollection | null>(null);
  const [boundaryLabel, setBoundaryLabel] = useState<string | null>(null);
  const [demTile, setDemTile] = useState<string | null>(null);
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
  }, [projectId]);

  // Clear-layer event listeners
  useEffect(() => {
    if (!session) return;
    const userId = session.user.id;
    const clearNodes = async () => {
      await supabase.from("network_nodes").delete().eq("project_id", projectId).eq("user_id", userId);
      setNodes([]);
      markUnsaved();
    };
    const clearPipes = async () => {
      await supabase.from("network_pipes").delete().eq("project_id", projectId).eq("user_id", userId);
      setPipes([]);
      markUnsaved();
    };
    window.addEventListener("aquaflow:clear-layer:nodes", clearNodes);
    window.addEventListener("aquaflow:clear-layer:pipes", clearPipes);
    return () => {
      window.removeEventListener("aquaflow:clear-layer:nodes", clearNodes);
      window.removeEventListener("aquaflow:clear-layer:pipes", clearPipes);
    };
  }, [session, projectId, supabase]);

  async function fetchData(userId: string) {
    setLoading(true);
    const [{ data: proj }, { data: nodeData }, { data: pipeData }] = await Promise.all([
      supabase.from("projects").select("*").eq("id", projectId).single(),
      supabase.from("network_nodes").select("*").eq("project_id", projectId).eq("user_id", userId),
      supabase.from("network_pipes").select("*").eq("project_id", projectId).eq("user_id", userId),
    ]);
    if (proj) setProject(proj as Project);
    setNodes((nodeData as NetworkNode[]) || []);
    setPipes((pipeData as NetworkPipe[]) || []);
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
          .insert({ project_id: projectId, user_id: session.user.id, type: nodeTypeToAdd, x: lng, y: lat, label: '' })
          .select()
          .single();
        if (!error && data) setNodes((prev) => [...prev, data as NetworkNode]);
        markUnsaved();
        return;
      }
    },
    [session, drawMode, nodeTypeToAdd, projectId]
  );

  const handleNodeClick = useCallback(
    async (node: NetworkNode, _e: L.LeafletMouseEvent) => {
      if (drawMode === "pipe") {
        if (!pipeFirstNodeId) {
          setPipeFirstNodeId(node.id);
        } else if (pipeFirstNodeId !== node.id && session) {
          const { data, error } = await supabase
            .from("network_pipes")
            .insert({ project_id: projectId, user_id: session.user.id, from_node_id: pipeFirstNodeId, to_node_id: node.id, diameter_in: 8, material: "PVC" })
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
    await supabase.from("projects").update({ boundary_geojson: fc as unknown as Record<string, unknown>, boundary_label: label }).eq("id", projectId);
    markUnsaved();
  }, [projectId]);

  const handleClearBoundary = useCallback(async () => {
    setBoundaryGeoJSON(null);
    setBoundaryLabel(null);
    await supabase.from("projects").update({ boundary_geojson: null, boundary_label: null }).eq("id", projectId);
    markUnsaved();
  }, [projectId]);

  const handleImportNodes = useCallback(async (importedNodes: NetworkNode[]) => {
    if (!session) return;
    const userId = session.user.id;
    const inserts = importedNodes.map((n) => ({ ...n, user_id: userId }));
    const { data, error } = await supabase.from("network_nodes").insert(inserts).select();
    if (error) { console.error("[AquaFlow] handleImportNodes:", error.message); return; }
    if (data) setNodes((prev) => [...prev, ...(data as NetworkNode[])]);
    markUnsaved();
  }, [session, supabase, projectId]);

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
        return { ...p, user_id: userId, from_node_id: fromId, to_node_id: toId };
      })
      .filter(Boolean) as NetworkPipe[];
    if (skipped.length) console.warn("[AquaFlow] handleImportPipes skipped:", skipped.join(", "));
    if (!inserts.length) return;
    const { data, error } = await supabase.from("network_pipes").insert(inserts).select();
    if (error) { console.error("[AquaFlow] handleImportPipes:", error.message); return; }
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

  // Auto-calculate pipe length from node coordinates
  const handleAutoLength = useCallback(async (pipeId: string) => {
    const pipe = pipes.find((p) => p.id === pipeId);
    if (!pipe || !pipe.from_node_id || !pipe.to_node_id) return;
    const fromNode = nodes.find((n) => n.id === pipe.from_node_id);
    const toNode = nodes.find((n) => n.id === pipe.to_node_id);
    if (!fromNode || !toNode) return;
    const dx = (toNode.x - fromNode.x);
    const dy = (toNode.y - fromNode.y);
    const lenFt = Math.sqrt(dx * dx + dy * dy);
    if (lenFt <= 0) return;
    await handleUpdatePipe(pipeId, { length_ft: +lenFt.toFixed(2) });
  }, [pipes, nodes, handleUpdatePipe]);

  const selectedElement = selectedType === "node"
    ? nodes.find((n) => n.id === selectedId) ?? null
    : pipes.find((p) => p.id === selectedId) ?? null;

  if (!authChecked || loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#0a0f1e]">
        <div className="w-8 h-8 border-2 border-[#38bdf8] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#0a0f1e]">
      {/* Top bar */}
      <header className="h-12 flex items-center justify-between px-4 border-b border-[#1e293b] bg-[#0d1526] flex-shrink-0 z-10">
        <div className="flex items-center gap-4">
          <span className="text-[#38bdf8] font-bold text-base tracking-wide">AquaFlow</span>
          <span className="text-[#475569] text-sm">›</span>
          <a href="/dashboard" className="text-sm text-[#94a3b8] hover:text-white transition-colors">Dashboard</a>
          <span className="text-[#475569] text-sm">›</span>
          <span className="text-sm text-white font-medium">{project?.name ?? "Project"}</span>
        </div>
        <div className="flex items-center gap-3">
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

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        <ElementPalette
          drawMode={drawMode}
          nodeTypeToAdd={nodeTypeToAdd}
          pipeTypeToAdd={pipeTypeToAdd}
          layerVisibility={layerVisibility}
          basemap={basemap}
          boundaryLabel={boundaryLabel}
          nodes={nodes}
          pipes={pipes}
          onDrawModeChange={(mode) => { setDrawMode(mode); if (mode !== 'pipe') setPipeFirstNodeId(null); }}
          onNodeTypeToAdd={setNodeTypeToAdd}
          onPipeTypeToAdd={setPipeTypeToAdd}
          onLayerVisibilityChange={setLayerVisibility}
          onBasemapChange={setBasemap}
          onAppendNodes={handleImportNodes}
          onAppendPipes={handleImportPipes}
          onImportBoundary={handleImportBoundary}
          onClearBoundary={handleClearBoundary}
          projectId={projectId}
        />
        <div className="flex-1 relative">
          <MapCanvas
            junctions={nodes.filter((n) => n.type === "junction")}
            tanks={nodes.filter((n) => n.type === "tank")}
            reservoirs={nodes.filter((n) => n.type === "reservoir")}
            pipes={pipes}
            drawMode={drawMode}
            nodeTypeToAdd={nodeTypeToAdd}
            selectedId={selectedId}
            selectedType={selectedType}
            layerVisibility={layerVisibility}
            basemap={basemap}
            onMapClick={handleMapClick}
            onNodeClick={handleNodeClick}
            onPipeClick={handlePipeClick}
            onBasemapChange={setBasemap}
            onMapReady={(map) => { mapRef.current = map; }}
          />
        </div>
        <PropertiesPanel
          selected={selectedElement as NetworkNode | NetworkPipe | null}
          selectedType={selectedType}
          nodes={nodes}
          boundaryGeoJSON={boundaryGeoJSON}
          onUpdateNode={handleUpdateNode}
          onUpdatePipe={handleUpdatePipe}
          onDeleteNode={handleDeleteNode}
          onDeletePipe={handleDeletePipe}
          onClose={() => { setSelectedId(null); setSelectedType(null); }}
          onAutoLength={handleAutoLength}
        />
      </div>
    </div>
  );
}

function ProjectContent() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("id");
  if (!projectId) return <NoProject />;
  return <ProjectDetailClient projectId={projectId} />;
}

export default function ProjectPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <ProjectContent />
    </Suspense>
  );
}