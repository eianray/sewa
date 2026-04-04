"use client";

import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
// leaflet-draw removed — pipe drawing uses two-node-click flow in ProjectDetailClient
import type { FeatureCollection } from "geojson";
import type { NetworkNode, NetworkPipe, NodeType, DrawMode, BasemapType, LayerVisibility } from "@/types/network";
import { NODE_COLORS } from "@/types/network";

interface MapCanvasProps {
  nodes: NetworkNode[];
  pipes: NetworkPipe[];
  drawMode: DrawMode;
  nodeTypeToAdd: NodeType | null;
  selectedId: string | null;
  selectedType: "node" | "pipe" | null;
  layerVisibility: LayerVisibility;
  basemap: BasemapType;
  /** M4: GeoJSON FeatureCollection to render as the project boundary polygon. */
  boundaryGeoJSON?: FeatureCollection | null;
  onMapClick: (lat: number, lng: number) => void;
  /** ID of the first node selected in pipe-draw mode, for highlight rendering. */
  pipeFromNodeId?: string | null;
  onNodeClick: (node: NetworkNode, e: L.LeafletMouseEvent) => void;
  onPipeClick: (pipe: NetworkPipe, e: L.LeafletMouseEvent) => void;
  onMapReady?: (map: L.Map) => void;
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
  nodes,
  pipes,
  drawMode,
  nodeTypeToAdd,
  selectedId,
  selectedType,
  layerVisibility,
  basemap,
  boundaryGeoJSON,
  onMapClick,
  pipeFromNodeId,
  onNodeClick,
  onPipeClick,
  onMapReady,
}: MapCanvasProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const nodeMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const pipeLinesRef = useRef<Map<string, L.Polyline>>(new Map());
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const boundaryLayerRef = useRef<L.GeoJSON | null>(null);


  // Mutable refs so Leaflet event handlers always call the latest callbacks
  const onMapClickRef = useRef(onMapClick);
  const onNodeClickRef = useRef(onNodeClick);
  const onPipeClickRef = useRef(onPipeClick);
  useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);
  useEffect(() => { onNodeClickRef.current = onNodeClick; }, [onNodeClick]);
  useEffect(() => { onPipeClickRef.current = onPipeClick; }, [onPipeClick]);

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

    // Map click → place node (node mode only).
    // Use ref so the handler always calls the CURRENT onMapClick (which closes
    // over the current drawMode) rather than the stale one captured at mount.
    map.on("click", (e: L.LeafletMouseEvent) => {
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

  // Crosshair cursor + disable map pan in pipe-draw mode so node clicks register cleanly.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const container = map.getContainer();
    if (drawMode === "pipe") {
      container.classList.add("leaflet-crosshair");
      map.dragging.disable();
    } else {
      container.classList.remove("leaflet-crosshair");
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

  // Render nodes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentIds = new Set(nodes.map((n) => n.id));

    nodeMarkersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        nodeMarkersRef.current.delete(id);
      }
    });

    nodes.forEach((node) => {
      const isSelected = selectedType === "node" && selectedId === node.id;
      const isPipeFrom = pipeFromNodeId === node.id;
      const icon = createNodeIcon(node.type, isSelected, isPipeFrom);

      if (nodeMarkersRef.current.has(node.id)) {
        const marker = nodeMarkersRef.current.get(node.id)!;
        marker.setIcon(icon);
        if (layerVisibility.labels) {
          marker.setTooltipContent(node.label || node.type);
        } else {
          marker.setTooltipContent("");
        }
      } else {
        const marker = L.marker([node.lat, node.lng], { icon })
          .addTo(map)
          .bindTooltip(node.label || node.type, {
            permanent: false,
            direction: "top",
            className: "sewa-tooltip",
          });
        marker.on("click", (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          onNodeClickRef.current(node, e);
        });
        nodeMarkersRef.current.set(node.id, marker);
      }
    });
  }, [nodes, selectedId, selectedType, layerVisibility.labels, pipeFromNodeId]);

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

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    pipes.forEach((pipe) => {
      const fromNode = pipe.from_node_id ? nodeMap.get(pipe.from_node_id) : null;
      const toNode = pipe.to_node_id ? nodeMap.get(pipe.to_node_id) : null;
      if (!fromNode || !toNode) return;

      const isSelected = selectedType === "pipe" && selectedId === pipe.id;
      const color = isSelected ? "#ffffff" : "#38bdf8";
      const weight = isSelected ? 5 : 3;

      const latLngs: L.LatLngExpression[] = [
        [fromNode.lat, fromNode.lng],
        [toNode.lat, toNode.lng],
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
            className: "sewa-tooltip",
          });
        line.on("click", (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          onPipeClickRef.current(pipe, e);
        });
        pipeLinesRef.current.set(pipe.id, line);
      }
    });
  }, [pipes, nodes, selectedId, selectedType, onPipeClick]);

  // Toggle layer visibility
  useEffect(() => {
    nodeMarkersRef.current.forEach((marker) => {
      if (layerVisibility.nodes) {
        if (!marker.getElement()?.parentNode) marker.addTo(mapRef.current!);
      } else {
        marker.remove();
      }
    });
    pipeLinesRef.current.forEach((line) => {
      if (layerVisibility.pipes) {
        if (!line.getElement()?.parentNode) line.addTo(mapRef.current!);
      } else {
        line.remove();
      }
    });
  }, [layerVisibility]);

  // Render boundary polygon
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (boundaryLayerRef.current) {
      boundaryLayerRef.current.remove();
      boundaryLayerRef.current = null;
    }
    if (boundaryGeoJSON) {
      const layer = L.geoJSON(boundaryGeoJSON, {
        style: {
          color: "#a78bfa",
          weight: 2,
          fillOpacity: 0.06,
          dashArray: "6 4",
        },
      }).addTo(map);
      boundaryLayerRef.current = layer;
    }
  }, [boundaryGeoJSON]);

  // Auto-fit map to boundary when it first appears
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !boundaryGeoJSON) return;
    const layer = boundaryLayerRef.current;
    if (layer) {
      map.fitBounds(layer.getBounds(), { padding: [40, 40] });
    }
  }, [boundaryGeoJSON]);

  return (
    <div
      ref={mapContainerRef}
      className="flex-1 relative"
      style={{ background: "#0d1526" }}
    />
  );
}
