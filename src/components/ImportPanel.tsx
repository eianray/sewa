"use client";

import { useState, useCallback } from "react";
import type { FeatureCollection } from "geojson";
import type { NetworkNode, NetworkPipe } from "@/types/network";

interface ImportPanelProps {
  projectId: string;
  onImportNodes: (nodes: NetworkNode[]) => void;
  onImportPipes: (pipes: NetworkPipe[]) => void;
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

async function parseShapefileZip(file: File): Promise<{ geojson: FeatureCollection; fields: string[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const win = window as any;
        const shpFn = win["shp"] as (buf: ArrayBuffer, jszip?: unknown) => Promise<FeatureCollection>;
        const JSZip = win["JSZip"] as (buf: ArrayBuffer) => Promise<unknown>;
        shpFn(buffer, JSZip).then((geojson: FeatureCollection) => {
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
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function guessMapping(fields: string[]): FieldMapping {
  // Simple smart defaults: matches common shapefile field names to app fields
  const f = fields.map((s) => s.toLowerCase().replace(/[_\s-]/g, ""));
  const has = (pat: string) => f.some((s) => s.includes(pat));
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
  const [basinName, setBasinName] = useState("");

  // ── Field change helpers ───────────────────────────────────────────────────
  const setMap = (setter: React.Dispatch<React.SetStateAction<FieldMapping>>, key: keyof FieldMapping, v: string) =>
    setter((prev) => ({ ...prev, [key]: v }));

  // ── File drop handler ─────────────────────────────────────────────────────
  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>, type: "nodes" | "pipes" | "basins") => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (!file) return;
      if (!file.name.endsWith(".zip")) { setError("Please upload a .zip of a shapefile."); return; }
      setError(null);
      setUploading(true);
      try {
        const { geojson, fields } = await parseShapefileZip(file);
        const guess = guessMapping(fields);
        if (type === "nodes") { setNodeFile(file); setNodeFields(fields); setNodeMapping(guess); }
        else if (type === "pipes") { setPipeFile(file); setPipeFields(fields); setPipeMapping(guess); }
        else { setBasinFile(file); }
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
        const { geojson } = await parseShapefileZip(basinFile);
        const label = basinName.trim() || `Basin ${Date.now()}`;
        onImportBoundary(geojson, label);
        setBasinFile(null); setBasinName("");
      }
    } catch (err) {
      setError(`Upload error: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setUploading(false); }
  }, [nodeFile, nodeMapping, nodeName, pipeFile, pipeMapping, pipeName, basinFile, basinName, projectId, onImportNodes, onImportPipes, onImportBoundary]);

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
              }).catch(() => {});
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
              if (file) { setPipeFile(file); parseShapefileZip(file).then(({ fields }) => { setPipeFields(fields); setPipeMapping(guessMapping(fields)); }).catch(() => {}); }
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
              if (file) { setBasinFile(file); setBasinName(file.name.replace(/\.zip$/i, "")); }
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
          placeholder="Basin name (optional)"
          value={basinName}
          onChange={(e) => setBasinName(e.target.value)}
          className="w-full rounded px-2 py-1 text-xs bg-[#111827] text-[#e2e8f0] border border-[#1e293b] focus:outline-none focus:border-[#22c55e] mb-2"
        />
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
    </div>
  );
}
