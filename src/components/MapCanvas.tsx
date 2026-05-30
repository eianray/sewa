"use client";

import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { NetworkNode, NetworkPipe, NodeType, DrawMode, BasemapType, LayerVisibility } from "@/types/network";
import { NODE_COLORS } from "@/types/network";

interface MapCanvasProps {
  junctions: NetworkNode[];
  tanks: NetworkNode[];
  reservoirs: NetworkNode[];
  pipes: NetworkPipe[];
  drawMode: DrawMode;
  nodeTypeToAdd: NodeType | null;
  selectedId: string | null;
  selectedType?: "node" | "pipe" | null;
  layerVisibility: LayerVisibility;
  basemap: BasemapType;
  onMapClick: (lat: number, lng: number) => void;
  /** ID of the first node selected in pipe-draw mode, for highlight rendering. */
  pipeFromNodeId?: string | null;
  onNodeClick: (node: NetworkNode, e: L.LeafletMouseEvent) => void;
  onPipeClick: (pipe: NetworkPipe, e: L.LeafletMouseEvent) => void;
  onMapReady?: (map: L.Map) => void;
  onBasemapChange: (b: BasemapType) => void;
}

const BASEMAP_TILES: Record<BasemapType, string> = {
  street: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  topo: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
  esri_topo: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
  esri_terrain: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}",
  esri_natgeo: "https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}",
  esri_street: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
  usgs_imagery: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}",
  usgs_topo: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}",
  stamen_terrain: "https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}.jpg",
  stamen_watercolor: "https://tiles.stadiamaps.com/tiles/stamen_watercolor/{z}/{x}/{y}.jpg",
};

const BASEMAP_ATTRIBUTION: Record<BasemapType, string> = {
  street: "© OpenStreetMap contributors",
  satellite: "Tiles © Esri",
  topo: "© OpenTopoMap (CC-BY-SA)",
  esri_topo: "Tiles © Esri",
  esri_terrain: "Tiles © Esri — USGS, NPS",
  esri_natgeo: "Tiles © Esri",
  esri_street: "Tiles © Esri",
  usgs_imagery: "Tiles © U.S. Geological Survey",
  usgs_topo: "Tiles © U.S. Geological Survey",
  stamen_terrain: "Map tiles by Stamen Design (CC BY 3.0). Data by OpenStreetMap (ODbL).",
  stamen_watercolor: "Map tiles by Stamen Design (CC BY 3.0). Data by OpenStreetMap (CC BY SA).",
};

// Fix default marker icon
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function createNodeIcon(type: NodeType, isSelected: boolean, isPipeFrom: boolean): L.DivIcon {
  const color = NODE_COLORS[type];
  const size = isSelected ? 20 : 16;
  const border = isSelected ? "3px solid white" : "2px solid rgba(255,255,255,0.6)";
  // Pulsing cyan ring when this node is the selected FROM node in pipe-draw mode
  const shadow = isPipeFrom
    ? "0 0 0 3px #38bdf8, 0 0 14px #38bdf8"
    : "0 0 6px rgba(0,0,0,0.5)";
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;background:${color};border:${border};border-radius:50%;box-shadow:${shadow};cursor:pointer;"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export default function MapCanvas({
  junctions,
  tanks,
  reservoirs,
  pipes,
  drawMode,
  nodeTypeToAdd,
  selectedId,
  selectedType,
  layerVisibility,
  basemap,
  onMapClick,
  pipeFromNodeId,
  onNodeClick,
  onPipeClick,
  onMapReady,
  onBasemapChange,
}: MapCanvasProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const junctionMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const tankMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const reservoirMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const pipeLinesRef = useRef<Map<string, L.Polyline>>(new Map());
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  // Mutable refs so Leaflet event handlers always call the latest callbacks
  // and always see the latest state without stale closures.
  const onMapClickRef = useRef(onMapClick);
  const onNodeClickRef = useRef(onNodeClick);
  const onPipeClickRef = useRef(onPipeClick);
  const drawModeRef = useRef(drawMode);
  const allNodesRef = useRef<NetworkNode[]>([]);

  useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);
  useEffect(() => { onNodeClickRef.current = onNodeClick; }, [onNodeClick]);
  useEffect(() => { onPipeClickRef.current = onPipeClick; }, [onPipeClick]);
  useEffect(() => { drawModeRef.current = drawMode; }, [drawMode]);
  useEffect(() => { allNodesRef.current = [...junctions, ...tanks, ...reservoirs]; }, [junctions, tanks, reservoirs]);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [64, -153],
      zoom: 6,
      zoomControl: false,
      attributionControl: true,
    });

    const tileLayer = L.tileLayer(BASEMAP_TILES[basemap], {
      attribution: BASEMAP_ATTRIBUTION[basemap],
      maxZoom: 19,
    });
    tileLayer.addTo(map);
    tileLayerRef.current = tileLayer;

    // Map click → place node (node mode) or snap-to-nearest-node (pipe mode).
    // Use ref so the handler always calls the CURRENT callback rather than stale captures.
    map.on("click", (e: L.LeafletMouseEvent) => {
      const mode = drawModeRef.current;
      if (mode === "pipe") {
        // In pipe mode, clicking the MAP snaps to the nearest node marker within 40px.
        // This lets users click near a node without hitting the exact 16px icon.
        const clickPt = map.latLngToLayerPoint(e.latlng);
        let nearest: NetworkNode | null = null;
        let nearestDist = Infinity;
        allNodesRef.current.forEach((node) => {
          const nodePt = map.latLngToLayerPoint(L.latLng(node.y, node.x));
          const dist = clickPt.distanceTo(nodePt);
          if (dist < nearestDist) { nearestDist = dist; nearest = node; }
        });
        // 40px snap radius — generous enough to click near but not anywhere
        if (nearest && nearestDist <= 40) {
          onNodeClickRef.current(nearest, e);
        }
        return;
      }
      onMapClickRef.current(e.latlng.lat, e.latlng.lng);
    });

    mapRef.current = map;
    onMapReady?.(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Crosshair cursor in node or pipe draw mode; disable map pan in pipe mode
  // (pan stays enabled in node mode so user can pan & click without fighting the map).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const container = map.getContainer();
    if (drawMode === 'pipe' || drawMode === 'node') {
      container.classList.add('leaflet-crosshair');
    } else {
      container.classList.remove('leaflet-crosshair');
    }
    if (drawMode === "pipe") {
      map.dragging.disable();
    } else {
      map.dragging.enable();
    }
  }, [drawMode]);

  // Switch basemap
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !tileLayerRef.current) return;
    tileLayerRef.current.remove();
    const newTileLayer = L.tileLayer(BASEMAP_TILES[basemap], {
      attribution: BASEMAP_ATTRIBUTION[basemap],
      maxZoom: 19,
    });
    newTileLayer.addTo(map);
    tileLayerRef.current = newTileLayer;
  }, [basemap]);

  // Render junctions
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentIds = new Set(junctions.map((n) => n.id));

    junctionMarkersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        junctionMarkersRef.current.delete(id);
      }
    });

    junctions.forEach((node) => {
      const isSelected = selectedType === "node" && selectedId === node.id;
      const isPipeFrom = pipeFromNodeId === node.id;
      const icon = createNodeIcon(node.type, isSelected, isPipeFrom);

      if (junctionMarkersRef.current.has(node.id)) {
        const marker = junctionMarkersRef.current.get(node.id)!;
        marker.setIcon(icon);
        marker.setTooltipContent(node.label || node.type);
      } else {
        const marker = L.marker([node.y, node.x], { icon })
          .addTo(map)
          .bindTooltip(node.label || node.type, {
            permanent: false,
            direction: "top",
            className: "map-tooltip",
          });
        marker.on("click", (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          onNodeClickRef.current(node, e);
        });
        junctionMarkersRef.current.set(node.id, marker);
      }
    });
  }, [junctions, selectedId, selectedType, pipeFromNodeId]);

  // Render tanks
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentIds = new Set(tanks.map((n) => n.id));

    tankMarkersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        tankMarkersRef.current.delete(id);
      }
    });

    tanks.forEach((node) => {
      const isSelected = selectedType === "node" && selectedId === node.id;
      const isPipeFrom = pipeFromNodeId === node.id;
      const icon = createNodeIcon(node.type, isSelected, isPipeFrom);

      if (tankMarkersRef.current.has(node.id)) {
        const marker = tankMarkersRef.current.get(node.id)!;
        marker.setIcon(icon);
        marker.setTooltipContent(node.label || node.type);
      } else {
        const marker = L.marker([node.y, node.x], { icon })
          .addTo(map)
          .bindTooltip(node.label || node.type, {
            permanent: false,
            direction: "top",
            className: "map-tooltip",
          });
        marker.on("click", (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          onNodeClickRef.current(node, e);
        });
        tankMarkersRef.current.set(node.id, marker);
      }
    });
  }, [tanks, selectedId, selectedType, pipeFromNodeId]);

  // Render reservoirs
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentIds = new Set(reservoirs.map((n) => n.id));

    reservoirMarkersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        reservoirMarkersRef.current.delete(id);
      }
    });

    reservoirs.forEach((node) => {
      const isSelected = selectedType === "node" && selectedId === node.id;
      const isPipeFrom = pipeFromNodeId === node.id;
      const icon = createNodeIcon(node.type, isSelected, isPipeFrom);

      if (reservoirMarkersRef.current.has(node.id)) {
        const marker = reservoirMarkersRef.current.get(node.id)!;
        marker.setIcon(icon);
        marker.setTooltipContent(node.label || node.type);
      } else {
        const marker = L.marker([node.y, node.x], { icon })
          .addTo(map)
          .bindTooltip(node.label || node.type, {
            permanent: false,
            direction: "top",
            className: "map-tooltip",
          });
        marker.on("click", (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          onNodeClickRef.current(node, e);
        });
        reservoirMarkersRef.current.set(node.id, marker);
      }
    });
  }, [reservoirs, selectedId, selectedType, pipeFromNodeId]);

  // Render pipes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentPipeIds = new Set(pipes.map((p) => p.id));

    pipeLinesRef.current.forEach((line, id) => {
      if (!currentPipeIds.has(id)) {
        line.remove();
        pipeLinesRef.current.delete(id);
      }
    });

    const allNodes = [...junctions, ...tanks, ...reservoirs];
    const nodeMap = new Map(allNodes.map((n) => [n.id, n]));

    pipes.forEach((pipe) => {
      const fromNode = pipe.from_node_id ? nodeMap.get(pipe.from_node_id) : null;
      const toNode = pipe.to_node_id ? nodeMap.get(pipe.to_node_id) : null;
      if (!fromNode || !toNode) return;

      const isSelected = selectedType === "pipe" && selectedId === pipe.id;
      const color = isSelected ? "#ffffff" : "#38bdf8";
      const weight = isSelected ? 5 : 3;

      const latLngs: L.LatLngExpression[] = [
        [fromNode.y, fromNode.x],
        [toNode.y, toNode.x],
      ];

      if (pipeLinesRef.current.has(pipe.id)) {
        const line = pipeLinesRef.current.get(pipe.id)!;
        line.setLatLngs(latLngs);
        line.setStyle({ color, weight });
      } else {
        const line = L.polyline(latLngs, { color, weight, smoothFactor: 1.2 })
          .addTo(map)
          .bindTooltip(pipe.label || `${pipe.diameter_in}" ${pipe.material}`, {
            permanent: false,
            direction: "center",
            className: "map-tooltip",
          });
        line.on("click", (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          onPipeClickRef.current(pipe, e);
        });
        pipeLinesRef.current.set(pipe.id, line);
      }
    });
  }, [pipes, junctions, tanks, reservoirs, selectedId, selectedType, onPipeClick]);

  // Toggle layer visibility
  useEffect(() => {
    // Junctions
    if (layerVisibility.junctions) {
      junctionMarkersRef.current.forEach((marker) => {
        if (!marker.getElement()?.parentNode) marker.addTo(mapRef.current!);
      });
    } else {
      junctionMarkersRef.current.forEach((marker) => marker.remove());
    }
    // Tanks
    if (layerVisibility.tanks) {
      tankMarkersRef.current.forEach((marker) => {
        if (!marker.getElement()?.parentNode) marker.addTo(mapRef.current!);
      });
    } else {
      tankMarkersRef.current.forEach((marker) => marker.remove());
    }
    // Reservoirs
    if (layerVisibility.reservoirs) {
      reservoirMarkersRef.current.forEach((marker) => {
        if (!marker.getElement()?.parentNode) marker.addTo(mapRef.current!);
      });
    } else {
      reservoirMarkersRef.current.forEach((marker) => marker.remove());
    }
    // Pipes
    if (layerVisibility.pipes) {
      pipeLinesRef.current.forEach((line) => {
        if (!line.getElement()?.parentNode) line.addTo(mapRef.current!);
      });
    } else {
      pipeLinesRef.current.forEach((line) => line.remove());
    }
  }, [layerVisibility]);

  const BASEMAP_GROUPS = [
    { group: "OpenStreetMap", options: [
      { value: "street",           label: "OSM Street" },
      { value: "topo",             label: "OSM Topo" },
    ]},
    { group: "Esri", options: [
      { value: "satellite",        label: "Satellite" },
      { value: "esri_topo",        label: "Esri Topo" },
      { value: "esri_terrain",     label: "Esri Terrain" },
      { value: "esri_natgeo",      label: "NatGeo" },
      { value: "esri_street",      label: "Esri Street" },
    ]},
    { group: "USGS", options: [
      { value: "usgs_imagery",     label: "USGS Imagery" },
      { value: "usgs_topo",        label: "USGS Topo" },
    ]},
    { group: "Stamen", options: [
      { value: "stamen_terrain",   label: "Terrain" },
      { value: "stamen_watercolor",label: "Watercolor" },
    ]},
  ];

  return (
    <div className="w-full h-full relative" style={{ background: "#0a0f1e" }}>
      <div ref={mapContainerRef} className="w-full h-full" />
      {/* Basemap control — bottom-left, above attribution */}
      <div className="absolute bottom-7 left-2 z-[1000] pointer-events-auto">
        <select
          value={basemap}
          onChange={(e) => onBasemapChange(e.target.value as BasemapType)}
          className="text-xs rounded px-2 py-1 bg-[#0d1117]/90 text-[#e2e8f0] border border-[#334155] focus:outline-none cursor-pointer shadow-lg backdrop-blur"
        >
          {BASEMAP_GROUPS.map(({ group, options }) => (
            <optgroup key={group} label={group}>
              {options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
    </div>
  );
}
