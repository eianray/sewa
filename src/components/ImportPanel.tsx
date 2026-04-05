"use client";

import { useState, useCallback } from "react";
import type { FeatureCollection } from "geojson";
import type { NetworkNode, NetworkPipe } from "@/types/network";
import type { Facility, FacilityType } from "@/types/facility";
import { FACILITY_TYPE_LABELS } from "@/types/facility";

interface ImportPanelProps {
  projectId: string;
  onImportNodes: (nodes: NetworkNode[]) => void;
  onImportPipes: (pipes: NetworkPipe[]) => void;
  onImportFacilities?: (facilities: Facility[]) => void;
  onImportBoundary: (fc: FeatureCollection, label: string) => void;
  onClearBoundary: () => void;
  boundaryLabel: string | null;
  /** Not currently used by ImportPanel but kept for future field-mapping auto-fill. */
  nodes?: NetworkNode[];
}

interface FieldMapping {
  label: string;
  lat?: string;
  lng?: string;
  invert_elev?: string;
  rim_elev?: string;
  from_node_label?: string;
  to_node_label?: string;
  diameter_in?: string;
  length_ft?: string;
  slope_pct?: string;
  material?: string;
}

interface FacilityFieldMapping {
  facility_id?: string;
  name?: string;
  facility_type?: string;
  lat?: string;
  lng?: string;
  capacity_cfs?: string;
  capacity_mgd?: string;
  allocated_cfs?: string;
  allocated_mgd?: string;
}

interface BasinFieldMapping {
  label?: string;
  area_acres?: string;
}

interface ParseResult {
  type: "nodes" | "pipes" | "basins";
  geojson: FeatureCollection;
  fields: string[];
  mapping: FieldMapping;
  name: string;
}

function identifyGeometry(fc: FeatureCollection): "nodes" | "pipes" | "basins" {
  const type = fc.features[0]?.geometry?.type;
  if (type === "Point") return "nodes";
  if (type === "LineString" || type === "MultiLineString") return "pipes";
  return "basins";
}

function shpReady() { return typeof window !== "undefined" && !!((window as unknown) as Record<string, unknown>)["shp"] && !!((window as unknown) as Record<string, unknown>)["JSZip"]; }

async function loadShp(): Promise<void> {
  if (shpReady()) return;
  await new Promise<void>((resolve, reject) => {
    const s1 = document.createElement("script");
    s1.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    s1.onload = () => {
      const s2 = document.createElement("script");
      s2.src = "https://cdnjs.cloudflare.com/ajax/libs/shpjs/4.0.0/shp.js";
      s2.onload = () => resolve();
      s2.onerror = () => reject(new Error("Failed to load shp.js"));
      document.head.appendChild(s2);
    };
    s1.onerror = () => reject(new Error("Failed to load JSZip"));
    document.head.appendChild(s1);
  });
}

async function parseShapefileZip(file: File): Promise<{ geojson: FeatureCollection; fields: string[] }> {
  // Ensure CDN scripts are loaded before trying to parse
  await loadShp();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const win = window as any;
        const shpFn = win["shp"];
        const JSZipClass = win["JSZip"];
        if (!shpFn || !JSZipClass) return reject(new Error("shp.js or JSZip not loaded"));
        const jszipInstance = new JSZipClass();
        shpFn(buffer, jszipInstance).then((geojson: FeatureCollection) => {
          const fields = new Set<string>();
          geojson.features.forEach((f) => {
            if (f.properties) Object.keys(f.properties).forEach((k) => fields.add(k));
          });
          resolve({ geojson, fields: Array.from(fields).sort() });
        }).catch(reject);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("FileReader error"));
    reader.readAsArrayBuffer(file);
  });
}

function guessMapping(fields: string[]): FieldMapping {
  // Simple smart defaults: matches common shapefile field names to app fields
  const f = fields.map((s) => s.toLowerCase().replace(/[_\s-]/g, ""));
  const val = (pat: string) => fields.find((s) => s.toLowerCase().replace(/[_\s-]/g, "").includes(pat));
  return {
    label: val("uid") ?? val("unique_id") ?? val("label") ?? val("name") ?? val("id") ?? fields[0] ?? "",
    lat: val("lat") ?? val("latitude") ?? val("y"),
    lng: val("lng") ?? val("lon") ?? val("longitude") ?? val("x"),
    invert_elev: val("invert"),
    rim_elev: val("rim"),
    diameter_in: val("diam") ?? val("diameter"),
    length_ft: val("length") ?? val("len"),
    slope_pct: val("slope") ?? val("slp"),
    material: val("material") ?? val("mat"),
    from_node_label: val("from") ?? val("from_node"),
    to_node_label: val("to") ?? val("to_node"),
  };
}

function guessBasinMapping(fields: string[]): BasinFieldMapping {
  const val = (pat: string) => fields.find((s) => s.toLowerCase().replace(/[_\s-]/g, "").includes(pat));
  return {
    label: val("name") ?? val("basin") ?? val("label") ?? fields[0] ?? "",
    area_acres: val("area") ?? val("acres") ?? val("sqft") ?? val("area_acres") ?? "",
  };
}

function guessFacilityMapping(fields: string[]): FacilityFieldMapping {
  const val = (pat: string) => fields.find((s) => s.toLowerCase().replace(/[_\s-]/g, "").includes(pat));
  return {
    name: val("name") ?? val("facility") ?? val("label") ?? fields[0] ?? "",
    facility_type: val("type") ?? val("facilitytype") ?? val("facility_type") ?? "",
    lat: val("lat") ?? val("latitude") ?? val("y"),
    lng: val("lng") ?? val("lon") ?? val("longitude") ?? val("x"),
    capacity_cfs: val("capacity_cfs") ?? val("capacity") ?? val("cfs") ?? "",
    capacity_mgd: val("capacity_mgd") ?? val("mgd") ?? "",
    allocated_cfs: val("allocated_cfs") ?? val("allocated") ?? "",
    allocated_mgd: val("allocated_mgd") ?? "",
  };
}

const VALID_FACILITY_TYPES: FacilityType[] = ['wwtp', 'lift_station', 'cso', 'sso', 'outfall', 'other'];

function normalizeFacilityType(raw: string): FacilityType {
  const lower = raw.toLowerCase().replace(/[_\s-]/g, '');
  if (lower.includes('wwtp') || lower.includes('treatment')) return 'wwtp';
  if (lower.includes('lift') || lower.includes('pump')) return 'lift_station';
  if (lower === 'cso') return 'cso';
  if (lower === 'sso') return 'sso';
  if (lower.includes('outfall')) return 'outfall';
  return 'other';
}

function FieldSelect({
  label,
  value,
  fields,
  onChange,
  required,
}: {
  label: string;
  value: string;
  fields: string[];
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[#94a3b8] w-24 shrink-0">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 rounded px-2 py-1 text-xs bg-[#111827] text-[#e2e8f0] border border-[#1e293b] focus:outline-none focus:border-[#38bdf8]"
      >
        <option value="">— skip —</option>
        {fields.map((f) => (
          <option key={f} value={f}>{f}</option>
        ))}
      </select>
      {required && !value && <span className="text-red-400 text-xs">*</span>}
    </div>
  );
}

function Section({
  title,
  color,
  children,
  defaultOpen,
}: {
  title: string;
  color: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="border border-[#1e293b] rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#111827] transition-colors"
      >
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span className="text-xs font-semibold text-[#e2e8f0]">{title}</span>
        <span className="ml-auto text-[#475569]">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="px-3 pb-3 pt-1 border-t border-[#1e293b]">{children}</div>}
    </div>
  );
}

export default function ImportPanel({
  projectId,
  onImportNodes,
  onImportPipes,
  onImportFacilities,
  onImportBoundary,
  onClearBoundary,
  boundaryLabel,
}: ImportPanelProps) {
  // ── Shared state ──────────────────────────────────────────────────────────
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Nodes ─────────────────────────────────────────────────────────────────
  const [nodeFile, setNodeFile] = useState<File | null>(null);
  const [nodeFields, setNodeFields] = useState<string[]>([]);
  const [nodeMapping, setNodeMapping] = useState<FieldMapping>({ label: "" });
  const [nodeName, setNodeName] = useState("");

  // ── Pipes ─────────────────────────────────────────────────────────────────
  const [pipeFile, setPipeFile] = useState<File | null>(null);
  const [pipeFields, setPipeFields] = useState<string[]>([]);
  const [pipeMapping, setPipeMapping] = useState<FieldMapping>({ label: "" });
  const [pipeName, setPipeName] = useState("");

  // ── Boundary / Basins ─────────────────────────────────────────────────────
  const [basinFile, setBasinFile] = useState<File | null>(null);
  const [basinFields, setBasinFields] = useState<string[]>([]);
  const [basinMapping, setBasinMapping] = useState<BasinFieldMapping>({});
  const [basinName, setBasinName] = useState("");

  // ── Facilities ─────────────────────────────────────────────────────────────
  const [facilityFile, setFacilityFile] = useState<File | null>(null);
  const [facilityFields, setFacilityFields] = useState<string[]>([]);
  const [facilityMapping, setFacilityMapping] = useState<FacilityFieldMapping>({});

  // ── Field change helpers ───────────────────────────────────────────────────
  const setMap = (setter: React.Dispatch<React.SetStateAction<FieldMapping>>, key: keyof FieldMapping, v: string) =>
    setter((prev) => ({ ...prev, [key]: v }));
  const setBasinMap = (key: keyof BasinFieldMapping, v: string) =>
    setBasinMapping((prev) => ({ ...prev, [key]: v }));
  const setFacilityMap = (key: keyof FacilityFieldMapping, v: string) =>
    setFacilityMapping((prev) => ({ ...prev, [key]: v }));

  // ── File drop handler ─────────────────────────────────────────────────────
  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>, type: "nodes" | "pipes" | "basins" | "facilities") => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (!file) return;
      setError(null);
      setUploading(true);
      try {
        if (!file.name.endsWith('.zip')) { setError('Please upload a .zip shapefile.'); setUploading(false); return; }
        const { geojson, fields } = await parseShapefileZip(file);
        const guess = guessMapping(fields);
        if (type === 'nodes') { setNodeFile(file); setNodeFields(fields); setNodeMapping(guess); }
        else if (type === 'pipes') { setPipeFile(file); setPipeFields(fields); setPipeMapping(guess); }
        else if (type === 'facilities') {
          const fieldArr = fields.sort();
          setFacilityFile(file);
          setFacilityFields(fieldArr);
          setFacilityMapping(guessFacilityMapping(fieldArr));
        }
        else { setBasinFile(file); setBasinFields(fields); setBasinMapping(guessBasinMapping(fields)); }
      } catch (err) {
        setError(`Parse error: ${err instanceof Error ? err.message : String(err)}`);
      } finally { setUploading(false); }
    },
    []
  );

  // ── Upload handler ────────────────────────────────────────────────────────
  const handleUpload = useCallback(async () => {
    setError(null);
    setUploading(true);
    try {
      const now = new Date().toISOString();
      // Nodes
      if (nodeFile && nodeMapping.label) {
        const { geojson } = await parseShapefileZip(nodeFile);
        const nodes = geojson.features
          .filter((f) => f.geometry.type === "Point" && f.properties)
          .map((f, i) => ({
            id: crypto.randomUUID(),
            project_id: projectId,
            user_id: "",
            type: "manhole" as const,
            label: f.properties?.[nodeMapping.label] ?? `Node ${i + 1}`,
            lat: parseFloat(f.properties?.[nodeMapping.lat ?? ""] ?? "0"),
            lng: parseFloat(f.properties?.[nodeMapping.lng ?? ""] ?? "0"),
            invert_elev: nodeMapping.invert_elev ? parseFloat(f.properties?.[nodeMapping.invert_elev] ?? "0") : 0,
            rim_elev: nodeMapping.rim_elev ? parseFloat(f.properties?.[nodeMapping.rim_elev] ?? "0") : 0,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            properties: {} as any,
            created_at: now,
          }))
          .filter((n) => n.lat !== 0 && n.lng !== 0);
        if (nodes.length) onImportNodes(nodes as NetworkNode[]);
        setNodeFile(null); setNodeFields([]); setNodeMapping({ label: "" }); setNodeName("");
      }
      // Pipes
      if (pipeFile && pipeMapping.label && pipeMapping.from_node_label && pipeMapping.to_node_label) {
        const { geojson } = await parseShapefileZip(pipeFile);
        // Build label→node map from currently loaded nodes
        const pipes = geojson.features
          .filter((f) => (f.geometry.type === "LineString" || f.geometry.type === "MultiLineString") && f.properties)
          .map((f, i) => ({
            id: crypto.randomUUID(),
            project_id: projectId,
            user_id: "",
            label: f.properties?.[pipeMapping.label] ?? `Pipe ${i + 1}`,
            from_node_id: "",
            to_node_id: "",
            from_node_label: f.properties?.[pipeMapping.from_node_label ?? ""] ?? "",
            to_node_label: f.properties?.[pipeMapping.to_node_label ?? ""] ?? "",
            diameter_in: pipeMapping.diameter_in ? parseFloat(f.properties?.[pipeMapping.diameter_in] ?? "8") : 8,
            length_ft: pipeMapping.length_ft ? parseFloat(f.properties?.[pipeMapping.length_ft] ?? "0") : 0,
            slope_pct: pipeMapping.slope_pct ? parseFloat(f.properties?.[pipeMapping.slope_pct] ?? "0") : 0,
            material: (f.properties?.[pipeMapping.material ?? ""] as NetworkPipe["material"]) ?? "PVC",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            properties: {} as any,
            created_at: now,
          }));
        if (pipes.length) onImportPipes(pipes);
        setPipeFile(null); setPipeFields([]); setPipeMapping({ label: "" }); setPipeName("");
      }
      // Basins / Boundary
      if (basinFile) {
        const { geojson, fields } = await parseShapefileZip(basinFile);
        // If no basinMapping yet, auto-detect from fields
        if (!basinMapping.label && fields.length) {
          setBasinFields(fields);
          setBasinMapping(guessBasinMapping(fields));
        }
        const mappedLabel = basinMapping.label && basinMapping.label !== ''
          ? (geojson.features[0]?.properties?.[basinMapping.label] ?? basinName.trim())
          : basinName.trim() || `Basin ${Date.now()}`;
        onImportBoundary(geojson, mappedLabel);
        setBasinFile(null); setBasinFields([]); setBasinMapping({}); setBasinName("");
      }
      // Facilities
      if (facilityFile) {
        let geojson: FeatureCollection;
        let fields: string[];
        if (facilityFile.name.endsWith('.json')) {
          const text = await facilityFile.text();
          geojson = JSON.parse(text) as FeatureCollection;
          fields = Array.from(new Set(geojson.features.flatMap((f) => f.properties ? Object.keys(f.properties) : []))).sort();
        } else {
          const result = await parseShapefileZip(facilityFile);
          geojson = result.geojson;
          fields = result.fields;
        }
        // facilities.json stores GeoJSON Point: coordinates = [lng, lat]
        // If fields include lat/lng properties, use those; otherwise pull from geometry
        const facilities: Facility[] = geojson.features
          .filter((f) => f.geometry.type === 'Point' && f.properties)
          .map((f, i) => {
            const rawType = facilityMapping.facility_type
              ? (f.properties?.[facilityMapping.facility_type] as string ?? 'other')
              : 'other';
            const type = normalizeFacilityType(rawType);
            // Try property fields first; fall back to GeoJSON coordinates [lng, lat]
            const lngProp = facilityMapping.lng ?? '';
            const latProp = facilityMapping.lat ?? '';
            const lng = lngProp
              ? parseFloat(f.properties?.[lngProp] ?? '0')
              : parseFloat(String((f.geometry as GeoJSON.Point).coordinates?.[0] ?? '0'));
            const lat = latProp
              ? parseFloat(f.properties?.[latProp] ?? '0')
              : parseFloat(String((f.geometry as GeoJSON.Point).coordinates?.[1] ?? '0'));
            const capCfs = facilityMapping.capacity_cfs
              ? parseFloat(f.properties?.[facilityMapping.capacity_cfs] ?? '0') || 0
              : parseFloat(String(f.properties?.['capacity_cfs'] ?? '0')) || 0;
            const capMgd = facilityMapping.capacity_mgd
              ? parseFloat(f.properties?.[facilityMapping.capacity_mgd] ?? '0') || 0
              : parseFloat(String(f.properties?.['capacity_mgd'] ?? '0')) || 0;
            const allocCfs = facilityMapping.allocated_cfs
              ? parseFloat(f.properties?.[facilityMapping.allocated_cfs] ?? '0') || 0
              : parseFloat(String(f.properties?.['allocated_cfs'] ?? '0')) || 0;
            const allocMgd = facilityMapping.allocated_mgd
              ? parseFloat(f.properties?.[facilityMapping.allocated_mgd] ?? '0') || 0
              : parseFloat(String(f.properties?.['allocated_mgd'] ?? '0')) || 0;
            const name = facilityMapping.name
              ? (f.properties?.[facilityMapping.name] as string) ?? ''
              : (f.properties?.['name'] as string) ?? '';
            return {
              id: crypto.randomUUID(),
              project_id: projectId,
              user_id: '',
              facility_id: f.properties?.['facility_id'] as string ?? '',
              facility_type: type,
              name,
              lat,
              lng,
              capacity_cfs: capCfs || null,
              capacity_mgd: capMgd || null,
              allocated_cfs: allocCfs,
              allocated_mgd: allocMgd,
              remaining_cfs: capCfs - allocCfs,
              remaining_mgd: capMgd - allocMgd,
              properties: {},
              created_at: now,
            };
          })
          .filter((f) => f.lat !== 0 && f.lng !== 0);
        if (facilities.length) onImportFacilities?.(facilities);
        setFacilityFile(null); setFacilityFields([]); setFacilityMapping({});
      }
    } catch (err) {
      setError(`Upload error: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setUploading(false); }
  }, [nodeFile, nodeMapping, nodeName, pipeFile, pipeMapping, pipeName, basinFile, basinName, basinMapping, facilityFile, facilityMapping, projectId, onImportNodes, onImportPipes, onImportFacilities, onImportBoundary]);

  return (
    <div className="border-b border-[#1e293b] p-3 space-y-2">
      <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-2">
        Import Data
      </h3>

      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded px-3 py-2 text-xs text-red-300 mb-2">
          {error}
        </div>
      )}

      {/* ── Nodes ──────────────────────────────────────────────────────── */}
      <Section title="Nodes" color="#38bdf8" defaultOpen>
        <div
          onDrop={(e) => handleDrop(e, "nodes")}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed border-[#1e293b] rounded-lg p-3 text-center mb-2 cursor-pointer hover:border-[#38bdf8]/50 transition-colors"
        >
          <input
            type="file"
            accept=".zip"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setNodeFile(file);
              parseShapefileZip(file).then(({ fields }) => {
                setNodeFields(fields);
                setNodeMapping(guessMapping(fields));
              }).catch((e) => setError(`Could not read shapefile: ${e instanceof Error ? e.message : String(e)}`));
            }}
            className="hidden"
            id="node-upload"
          />
          <label htmlFor="node-upload" className="cursor-pointer">
            <div className="text-xs text-[#94a3b8] mb-1">Drop .shp/.shx/.dbf zip or click</div>
            {nodeFile && <div className="text-xs text-[#38bdf8] font-medium truncate">{nodeFile.name}</div>}
          </label>
        </div>
        {nodeFields.length > 0 && (
          <div className="space-y-1 mb-2">
            <p className="text-xs text-[#94a3b8] font-medium">Map fields:</p>
            <FieldSelect label="Unique ID *" value={nodeMapping.label} fields={nodeFields} onChange={(v) => setMap(setNodeMapping, "label", v)} required />
            <FieldSelect label="Latitude" value={nodeMapping.lat ?? ""} fields={nodeFields} onChange={(v) => setMap(setNodeMapping, "lat", v)} />
            <FieldSelect label="Longitude" value={nodeMapping.lng ?? ""} fields={nodeFields} onChange={(v) => setMap(setNodeMapping, "lng", v)} />
            <FieldSelect label="Invert El" value={nodeMapping.invert_elev ?? ""} fields={nodeFields} onChange={(v) => setMap(setNodeMapping, "invert_elev", v)} />
            <FieldSelect label="Rim El" value={nodeMapping.rim_elev ?? ""} fields={nodeFields} onChange={(v) => setMap(setNodeMapping, "rim_elev", v)} />
          </div>
        )}
        <button
          onClick={handleUpload}
          disabled={uploading || !nodeFile || !nodeMapping.label}
          className="w-full rounded bg-[#38bdf8] text-[#0a0f1e] py-1.5 text-xs font-bold hover:bg-[#0ea5e9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {uploading ? "Processing…" : "Upload Nodes"}
        </button>
      </Section>

      {/* ── Pipes ──────────────────────────────────────────────────────── */}
      <Section title="Pipes" color="#f97316">
        <div
          onDrop={(e) => handleDrop(e, "pipes")}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed border-[#1e293b] rounded-lg p-3 text-center mb-2 cursor-pointer hover:border-[#f97316]/50 transition-colors"
        >
          <input
            type="file"
            accept=".zip"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) { setPipeFile(file); parseShapefileZip(file).then(({ fields }) => { setPipeFields(fields); setPipeMapping(guessMapping(fields)); }).catch((e) => { setError(`Could not read shapefile: ${e instanceof Error ? e.message : String(e)}`); setPipeFile(null); }); }
            }}
            className="hidden"
            id="pipe-upload"
          />
          <label htmlFor="pipe-upload" className="cursor-pointer">
            <div className="text-xs text-[#94a3b8] mb-1">Drop .shp/.shx/.dbf zip or click</div>
            {pipeFile && <div className="text-xs text-[#f97316] font-medium truncate">{pipeFile.name}</div>}
          </label>
        </div>
        {pipeFields.length > 0 && (
          <div className="space-y-1 mb-2">
            <p className="text-xs text-[#94a3b8] font-medium">Map fields:</p>
            <FieldSelect label="Unique ID *" value={pipeMapping.label} fields={pipeFields} onChange={(v) => setMap(setPipeMapping, "label", v)} required />
            <FieldSelect label="From Node *" value={pipeMapping.from_node_label ?? ""} fields={pipeFields} onChange={(v) => setMap(setPipeMapping, "from_node_label", v)} required />
            <FieldSelect label="To Node *" value={pipeMapping.to_node_label ?? ""} fields={pipeFields} onChange={(v) => setMap(setPipeMapping, "to_node_label", v)} required />
            <FieldSelect label="Diameter (in)" value={pipeMapping.diameter_in ?? ""} fields={pipeFields} onChange={(v) => setMap(setPipeMapping, "diameter_in", v)} />
            <FieldSelect label="Length (ft)" value={pipeMapping.length_ft ?? ""} fields={pipeFields} onChange={(v) => setMap(setPipeMapping, "length_ft", v)} />
            <FieldSelect label="Slope (%)" value={pipeMapping.slope_pct ?? ""} fields={pipeFields} onChange={(v) => setMap(setPipeMapping, "slope_pct", v)} />
            <FieldSelect label="Material" value={pipeMapping.material ?? ""} fields={pipeFields} onChange={(v) => setMap(setPipeMapping, "material", v)} />
          </div>
        )}
        <button
          onClick={handleUpload}
          disabled={uploading || !pipeFile || !pipeMapping.label || !pipeMapping.from_node_label || !pipeMapping.to_node_label}
          className="w-full rounded bg-[#f97316] text-[#0a0f1e] py-1.5 text-xs font-bold hover:bg-[#ea580c] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {uploading ? "Processing…" : "Upload Pipes"}
        </button>
      </Section>

      {/* ── Basins / Boundary ────────────────────────────────────────────── */}
      <Section title="Basins" color="#22c55e">
        <div
          onDrop={(e) => handleDrop(e, "basins")}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed border-[#1e293b] rounded-lg p-3 text-center mb-2 cursor-pointer hover:border-[#22c55e]/50 transition-colors"
        >
          <input
            type="file"
            accept=".zip"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setBasinFile(file);
              setBasinName(file.name.replace(/\.zip$/i, ""));
              parseShapefileZip(file).then(({ fields }) => {
                setBasinFields(fields);
                setBasinMapping(guessBasinMapping(fields));
              }).catch((err) => setError(`Could not read shapefile: ${err instanceof Error ? err.message : String(err)}`));
            }}
            className="hidden"
            id="basin-upload"
          />
          <label htmlFor="basin-upload" className="cursor-pointer">
            <div className="text-xs text-[#94a3b8] mb-1">Drop polygon .shp zip or click</div>
            {basinFile && <div className="text-xs text-[#22c55e] font-medium truncate">{basinFile.name}</div>}
          </label>
        </div>
        <input
          type="text"
          placeholder="Basin name (fallback if no field mapped)"
          value={basinName}
          onChange={(e) => setBasinName(e.target.value)}
          className="w-full rounded px-2 py-1 text-xs bg-[#111827] text-[#e2e8f0] border border-[#1e293b] focus:outline-none focus:border-[#22c55e] mb-2"
        />
        {basinFields.length > 0 && (
          <div className="space-y-1 mb-2">
            <p className="text-xs text-[#94a3b8] font-medium">Map fields:</p>
            <FieldSelect label="Label" value={basinMapping.label ?? ""} fields={basinFields} onChange={(v) => setBasinMap("label", v)} />
            <FieldSelect label="Area Acres" value={basinMapping.area_acres ?? ""} fields={basinFields} onChange={(v) => setBasinMap("area_acres", v)} />
          </div>
        )}
        <button
          onClick={handleUpload}
          disabled={uploading || !basinFile}
          className="w-full rounded bg-[#22c55e] text-[#0a0f1e] py-1.5 text-xs font-bold hover:bg-[#16a34a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {uploading ? "Processing…" : "Upload Basin"}
        </button>
        {boundaryLabel && (
          <button
            onClick={onClearBoundary}
            className="w-full mt-1 rounded text-xs text-red-400 hover:text-red-300 py-1 transition-colors"
          >
            Remove {boundaryLabel}
          </button>
        )}
      </Section>

      {/* ── Facilities ──────────────────────────────────────────────────── */}
      <Section title="Facilities" color="#a855f7">
        <div
          onDrop={(e) => handleDrop(e, "facilities")}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed border-[#1e293b] rounded-lg p-3 text-center mb-2 cursor-pointer hover:border-[#a855f7]/50 transition-colors"
        >
          <input
            type="file"
            accept=".zip"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              parseShapefileZip(file).then(({ fields }) => {
                setFacilityFile(file);
                setFacilityFields(fields);
                setFacilityMapping(guessFacilityMapping(fields));
              }).catch((e) => setError(`Could not read shapefile: ${e instanceof Error ? e.message : String(e)}`));
            }}
            className="hidden"
            id="facility-upload"
          />
          <label htmlFor="facility-upload" className="cursor-pointer">
            <div className="text-xs text-[#94a3b8] mb-1">Drop .shp zip (shapefile) or click</div>
            {facilityFile && <div className="text-xs text-[#a855f7] font-medium truncate">{facilityFile.name}</div>}
          </label>
        </div>
        {facilityFields.length > 0 && (
          <div className="space-y-1 mb-2">
            <p className="text-xs text-[#94a3b8] font-medium">Map fields:</p>
            <FieldSelect label="Name" value={facilityMapping.name ?? ""} fields={facilityFields} onChange={(v) => setFacilityMap("name", v)} />
            <FieldSelect label="Type" value={facilityMapping.facility_type ?? ""} fields={facilityFields} onChange={(v) => setFacilityMap("facility_type", v)} />
            <FieldSelect label="Latitude" value={facilityMapping.lat ?? ""} fields={facilityFields} onChange={(v) => setFacilityMap("lat", v)} />
            <FieldSelect label="Longitude" value={facilityMapping.lng ?? ""} fields={facilityFields} onChange={(v) => setFacilityMap("lng", v)} />
            <FieldSelect label="Capacity cfs" value={facilityMapping.capacity_cfs ?? ""} fields={facilityFields} onChange={(v) => setFacilityMap("capacity_cfs", v)} />
            <FieldSelect label="Capacity mgd" value={facilityMapping.capacity_mgd ?? ""} fields={facilityFields} onChange={(v) => setFacilityMap("capacity_mgd", v)} />
            <FieldSelect label="Allocated cfs" value={facilityMapping.allocated_cfs ?? ""} fields={facilityFields} onChange={(v) => setFacilityMap("allocated_cfs", v)} />
            <FieldSelect label="Allocated mgd" value={facilityMapping.allocated_mgd ?? ""} fields={facilityFields} onChange={(v) => setFacilityMap("allocated_mgd", v)} />
          </div>
        )}
        <button
          onClick={handleUpload}
          disabled={uploading || !facilityFile}
          className="w-full rounded bg-[#a855f7] text-white py-1.5 text-xs font-bold hover:bg-[#9333ea] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {uploading ? 'Processing…' : 'Upload Facilities'}
        </button>
      </Section>
    </div>
  );
}
