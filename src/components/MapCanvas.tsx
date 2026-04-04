"use client";

import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
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
  onNodeClick: (node: NetworkNode, e: L.LeafletMouseEvent) => void;
  onPipeClick: (pipe: NetworkPipe, e: L.LeafletMouseEvent) => void;
  onMapReady?: (map: L.Map) => void;
}

const BASEMAP_TILES: Record<BasemapType, string> = {
  // OpenStreetMap
  street: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  // Esri World Imagery (satellite)
  satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  // OpenTopoMap (community topo)
  topo: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
  // Esri World Topo Map
  esri_topo: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
  // Esri World Terrain Base
  esri_terrain: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}",
  // Esri National Geographic
  esri_natgeo: "https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}",
  // Esri World Street Map
  esri_street: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
  // USGS National Map — Imagery
  usgs_imagery: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}",
  // USGS National Map — Topo (The National Map)
  usgs_topo: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}",
  // Stamen Terrain (via Stadia)
  stamen_terrain: "https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}.jpg",
  // Stamen Watercolor (artistic — fun for demos)
  stamen_watercolor: "https://tiles.stadiamaps.com/tiles/stamen_watercolor/{z}/{x}/{y}.jpg",
};

const BASEMAP_ATTRIBUTION: Record<BasemapType, string> = {
  street: "© OpenStreetMap contributors",
  satellite: "Tiles © Esri — Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), MapmyIndia, © OpenStreetMap contributors",
  topo: "© OpenTopoMap (CC-BY-SA)",
  esri_topo: "Tiles © Esri — Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), swisstopo, Mapmyindia, © OpenStreetMap contributors",
  esri_terrain: "Tiles © Esri — USGS, NPS",
  esri_natgeo: "Tiles © Esri — National Geographic, Esri, DeLorme, HERE, UNEP-WCMC, USGS, NASA, ESA, METI, NRCAN, GEBCO, NOAA, iPC",
  esri_street: "Tiles © Esri — Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom, 2012",
  usgs_imagery: "Tiles courtesy of the U.S. Geological Survey",
  usgs_topo: "Tiles courtesy of the U.S. Geological Survey",
  stamen_terrain: "Map tiles by Stamen Design, under CC BY 3.0. Data by OpenStreetMap, under ODbL.",
  stamen_watercolor: "Map tiles by Stamen Design, under CC BY 3.0. Data by OpenStreetMap, under CC BY SA.",
};

// Fix default marker icon
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function createNodeIcon(type: NodeType, isSelected: boolean): L.DivIcon {
  const color = NODE_COLORS[type];
  const size = isSelected ? 20 : 16;
  const border = isSelected ? "3px solid white" : "2px solid rgba(255,255,255,0.6)";
  return L.divIcon({
    className: "",
    html: `<div style="
      width:${size}px;height:${size}px;
      background:${color};
      border:${border};
      border-radius:50%;
      box-shadow:0 0 6px rgba(0,0,0,0.5);
      cursor:pointer;
    "></div>`,
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
  onNodeClick,
  onPipeClick,
  onMapReady,
}: MapCanvasProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const nodeMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const pipeLinesRef = useRef<Map<string, L.Polyline>>(new Map());
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  /** M4: Ref to the Leaflet GeoJSON layer showing the project boundary polygon. */
  const boundaryLayerRef = useRef<L.GeoJSON | null>(null);

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

    map.on("click", (e: L.LeafletMouseEvent) => {
      if (drawMode === "node" && nodeTypeToAdd) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      } else if (drawMode === "none") {
        // deselect
      }
    });

    mapRef.current = map;
    onMapReady?.(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update cursor based on draw mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (drawMode === "node") {
      mapContainerRef.current!.style.cursor = "crosshair";
    } else {
      mapContainerRef.current!.style.cursor = "";
    }
  }, [drawMode, nodeTypeToAdd]);

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

    // Remove old markers
    nodeMarkersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        nodeMarkersRef.current.delete(id);
      }
    });

    // Add/update markers
    nodes.forEach((node) => {
      const isSelected = selectedType === "node" && selectedId === node.id;
      const icon = createNodeIcon(node.type, isSelected);

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
          onNodeClick(node, e);
        });
        nodeMarkersRef.current.set(node.id, marker);
      }
    });
  }, [nodes, selectedId, selectedType, layerVisibility.labels, onNodeClick]);

  // Render pipes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentPipeIds = new Set(pipes.map((p) => p.id));

    // Remove old lines
    pipeLinesRef.current.forEach((line, id) => {
      if (!currentPipeIds.has(id)) {
        line.remove();
        pipeLinesRef.current.delete(id);
      }
    });

    // Node lookup
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    // Add/update lines
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
          onPipeClick(pipe, e);
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
  }, [layerVisibility.nodes]);

  useEffect(() => {
    pipeLinesRef.current.forEach((line) => {
      if (layerVisibility.pipes) {
        if (!line.getElement()?.parentNode) line.addTo(mapRef.current!);
      } else {
        line.remove();
      }
    });
  }, [layerVisibility.pipes]);

  // --------------------------------------------------------------------
  // M4: Render project boundary GeoJSON as a polygon overlay on the map.
  //
  // When boundaryGeoJSON prop changes:
  //   1. Remove the previous L.GeoJSON layer if one exists
  //   2. Add a new L.GeoJSON layer with sky-blue styling (see style options)
  //   3. Auto-fit the Leaflet map to the layer's bounding box with 40px
  //      padding so the boundary has breathing room on all sides
  // --------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove stale layer
    if (boundaryLayerRef.current) {
      boundaryLayerRef.current.remove();
      boundaryLayerRef.current = null;
    }

    // Nothing to render — just clear
    if (!boundaryGeoJSON || boundaryGeoJSON.features.length === 0) return;

    // Style: sky-blue stroke, transparent fill so nodes/pipes remain visible
    const BOUNDARY_STYLE: L.GeoJSONOptions = {
      style: {
        color: "#38bdf8",
        weight: 2,
        fillOpacity: 0.05,
      },
    };

    const layer = L.geoJSON(boundaryGeoJSON, BOUNDARY_STYLE).addTo(map);
    boundaryLayerRef.current = layer;

    // Auto-fit map bounds to the boundary polygon with breathing room
    const bounds = layer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [boundaryGeoJSON]);

  return (
    <div
      ref={mapContainerRef}
      className="w-full h-full"
      style={{ background: "#0a0f1e" }}
    />
  );
}
