"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";
import type { Project } from "@/types/project";
import type { NetworkNode, NetworkPipe, NodeType, DrawMode, BasemapType, LayerVisibility } from "@/types/network";
import ElementPalette from "@/components/ElementPalette";
import PropertiesPanel from "@/components/PropertiesPanel";
import type L from "leaflet";

const MapCanvas = dynamic(() => import("@/components/MapCanvas"), { ssr: false });

interface ProjectDetailClientProps {
  projectId: string;
}

export default function ProjectDetailClient({ projectId }: ProjectDetailClientProps) {
  const [session, setSession] = useState<{ user: { id: string } } | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [nodes, setNodes] = useState<NetworkNode[]>([]);
  const [pipes, setPipes] = useState<NetworkPipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(true);
  const [savedTimer, setSavedTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [drawMode, setDrawMode] = useState<DrawMode>("none");
  const [nodeTypeToAdd, setNodeTypeToAdd] = useState<NodeType | null>(null);
  const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>({
    nodes: true,
    pipes: true,
    labels: true,
  });
  const [basemap, setBasemap] = useState<BasemapType>("street");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<"node" | "pipe" | null>(null);
  const [pipeFirstNodeId, setPipeFirstNodeId] = useState<string | null>(null);

  const mapRef = useRef<L.Map | null>(null);

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
      if (!session || drawMode !== "node" || !nodeTypeToAdd) return;
      const { data, error } = await supabase
        .from("network_nodes")
        .insert({ project_id: projectId, user_id: session.user.id, type: nodeTypeToAdd, lat, lng, label: "" })
        .select()
        .single();
      if (!error && data) setNodes((prev) => [...prev, data as NetworkNode]);
      markUnsaved();
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

  const selectedElement = selectedType === "node"
    ? nodes.find((n) => n.id === selectedId) ?? null
    : pipes.find((p) => p.id === selectedId) ?? null;

  if (loading) {
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
          drawMode={drawMode} nodeTypeToAdd={nodeTypeToAdd}
          layerVisibility={layerVisibility} basemap={basemap}
          onDrawModeChange={(mode) => { setDrawMode(mode); if (mode !== "pipe") setPipeFirstNodeId(null); }}
          onNodeTypeToAdd={setNodeTypeToAdd}
          onLayerVisibilityChange={setLayerVisibility}
          onBasemapChange={setBasemap}
        />
        <div className="flex-1 relative">
          <MapCanvas
            nodes={nodes} pipes={pipes}
            drawMode={drawMode} nodeTypeToAdd={nodeTypeToAdd}
            selectedId={selectedId} selectedType={selectedType}
            layerVisibility={layerVisibility} basemap={basemap}
            onMapClick={handleMapClick}
            onNodeClick={handleNodeClick}
            onPipeClick={handlePipeClick}
            onMapReady={(map) => { mapRef.current = map; }}
          />
          {drawMode === "pipe" && pipeFirstNodeId && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-[#38bdf8] text-[#0a0f1e] text-xs font-semibold rounded-full px-4 py-1.5 shadow-lg z-[1000]">
              Click second node to complete pipe
            </div>
          )}
        </div>
        <PropertiesPanel
          selected={selectedElement as NetworkNode | NetworkPipe | null}
          selectedType={selectedType}
          nodes={nodes}
          onUpdateNode={handleUpdateNode}
          onUpdatePipe={handleUpdatePipe}
          onDeleteNode={handleDeleteNode}
          onDeletePipe={handleDeletePipe}
          onClose={() => { setSelectedId(null); setSelectedType(null); }}
        />
      </div>
    </div>
  );
}
