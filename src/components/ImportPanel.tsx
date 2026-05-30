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
}

interface FieldMapping {
  label: string;
  x?: string;
  y?: string;
  elevation?: string;
  demand_gpm?: string;
  hazen_williams_C?: string;
  from_node_label?: string;
  to_node_label?: string;
  diameter_in?: string;
  length_ft?: string;
  material?: string;
}

interface BasinFieldMapping {
  label?: string;
  area_acres?: string;
}

async function loadShp(): Promise<void> {
  if ((window as unknown as Record<string, unknown>)["shp"]) return;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/shpjs/3.6.3/shp.min.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load shp.js"));
    document.head.appendChild(s);
  });
}

async function parseShapefileZip(file: File): Promise<{ geojson: FeatureCollection; fields: string[] }> {
  await loadShp();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const shpFn = (window as any)["shp"];
        if (!shpFn) return reject(new Error("shp.js not loaded"));
        Promise.resolve(shpFn(buffer)).then((geojson: FeatureCollection) => {
          const fields = new Set<string>();
          geojson.features.forEach((f) => {
            if (f.properties) Object.keys(f.properties).forEach((k) => fields.add(k));
          });
          resolve({ geojson, fields: Array.from(fields).sort() });
        }).catch(reject);
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error("FileReader error"));
    reader.readAsArrayBuffer(file);
  });
}

function guessMapping(fields: string[]): FieldMapping {
  const val = (pat: string) => fields.find((s) => s.toLowerCase().replace(/[_\s-]/g, "").includes(pat));
  return {
    label: val("uid") ?? val("unique_id") ?? val("label") ?? val("name") ?? val("id") ?? fields[0] ?? "",
    x: val("x") ?? val("easting") ?? val("lon") ?? val("lng"),
    y: val("y") ?? val("northing") ?? val("lat"),
    elevation: val("elev") ?? val("elevation") ?? val("ground"),
    demand_gpm: val("demand") ?? val("flow") ?? val("gpm"),
    hazen_williams_C: val("c_factor") ?? val("c") ?? val("hw"),
    from_node_label: val("from") ?? val("from_node"),
    to_node_label: val("to") ?? val("to_node"),
    diameter_in: val("diam") ?? val("diameter"),
    length_ft: val("length") ?? val("len"),
    material: val("material") ?? val("mat"),
  };
}

function guessBasinMapping(fields: string[]): BasinFieldMapping {
  const val = (pat: string) => fields.find((s) => s.toLowerCase().replace(/[_\s-]/g, "").includes(pat));
  return {
    label: val("name") ?? val("basin") ?? val("label") ?? fields[0] ?? "",
    area_acres: val("area") ?? val("acres") ?? val("sqft"),
  };
}

function FieldSelect({ label, value, fields, onChange }: { label: string; value: string; fields: string[]; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[#94a3b8] w-24 shrink-0">{label}:</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 rounded px-2 py-1 text-xs bg-[#111827] text-[#e2e8f0] border border-[#1e293b] focus:outline-none focus:border-[#38bdf8]">
        <option value="">— skip —</option>
        {fields.map((f) => <option key={f} value={f}>{f}</option>)}
      </select>
    </div>
  );
}

function Section({ title, color, children, defaultOpen }: { title: string; color: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="border border-[#1e293b] rounded-lg overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#111827] transition-colors">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span className="text-xs font-semibold text-[#e2e8f0]">{title}</span>
        <span className="ml-auto text-[#475569]">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="px-3 pb-3 pt-1 border-t border-[#1e293b]">{children}</div>}
    </div>
  );
}

export default function ImportPanel({ projectId, onImportNodes, onImportPipes, onImportBoundary, onClearBoundary, boundaryLabel }: ImportPanelProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nodeFile, setNodeFile] = useState<File | null>(null);
  const [nodeFields, setNodeFields] = useState<string[]>([]);
  const [nodeMapping, setNodeMapping] = useState<FieldMapping>({ label: "" });

  const [pipeFile, setPipeFile] = useState<File | null>(null);
  const [pipeFields, setPipeFields] = useState<string[]>([]);
  const [pipeMapping, setPipeMapping] = useState<FieldMapping>({ label: "" });

  const [basinFile, setBasinFile] = useState<File | null>(null);
  const [basinFields, setBasinFields] = useState<string[]>([]);
  const [basinMapping, setBasinMapping] = useState<BasinFieldMapping>({});
  const [basinName, setBasinName] = useState("");

  const setMap = (setter: React.Dispatch<React.SetStateAction<FieldMapping>>, key: keyof FieldMapping, v: string) =>
    setter((prev) => ({ ...prev, [key]: v }));

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>, type: "nodes" | "pipes" | "basins") => {
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
      else { setBasinFile(file); setBasinFields(fields); setBasinMapping(guessBasinMapping(fields)); }
    } catch (err) { setError("Parse error: " + (err instanceof Error ? err.message : String(err))); }
    finally { setUploading(false); }
  }, []);

  const handleUpload = useCallback(async () => {
    setError(null);
    setUploading(true);
    try {
      const now = new Date().toISOString();
      if (nodeFile && nodeMapping.label) {
        const { geojson } = await parseShapefileZip(nodeFile);
        const nodes = geojson.features
          .filter((f) => f.geometry.type === "Point" && f.properties)
          .map((f, i) => ({
            id: crypto.randomUUID(), project_id: projectId, user_id: "",
            type: "junction" as const,
            label: f.properties?.[nodeMapping.label] ?? `J${i + 1}`,
            x: parseFloat(f.properties?.[nodeMapping.x ?? ""] ?? "0"),
            y: parseFloat(f.properties?.[nodeMapping.y ?? ""] ?? "0"),
            elevation: nodeMapping.elevation ? parseFloat(f.properties?.[nodeMapping.elevation] ?? "0") : null,
            demand_gpm: nodeMapping.demand_gpm ? parseFloat(f.properties?.[nodeMapping.demand_gpm] ?? "0") : null,
            hazen_williams_C: nodeMapping.hazen_williams_C ? parseFloat(f.properties?.[nodeMapping.hazen_williams_C] ?? "0") : null,
            properties: {}, created_at: now,
          }))
          .filter((n) => n.x !== 0 && n.y !== 0);
        if (nodes.length) onImportNodes(nodes as NetworkNode[]);
        setNodeFile(null); setNodeFields([]); setNodeMapping({ label: "" });
      }
      if (pipeFile && pipeMapping.label && pipeMapping.from_node_label && pipeMapping.to_node_label) {
        const { geojson } = await parseShapefileZip(pipeFile);
        const pipes = geojson.features
          .filter((f) => (f.geometry.type === "LineString" || f.geometry.type === "MultiLineString") && f.properties)
          .map((f, i) => ({
            id: crypto.randomUUID(), project_id: projectId, user_id: "",
            label: f.properties?.[pipeMapping.label] ?? `P${i + 1}`,
            from_node_id: "", to_node_id: "",
            from_node_label: f.properties?.[pipeMapping.from_node_label ?? ""] ?? "",
            to_node_label: f.properties?.[pipeMapping.to_node_label ?? ""] ?? "",
            diameter_in: pipeMapping.diameter_in ? parseFloat(f.properties?.[pipeMapping.diameter_in] ?? "8") : 8,
            length_ft: pipeMapping.length_ft ? parseFloat(f.properties?.[pipeMapping.length_ft] ?? "0") : null,
            material: (f.properties?.[pipeMapping.material ?? ""] as NetworkPipe["material"]) ?? "PVC",
            hazen_williams_C: null,
            installation_year: null,
            properties: {}, created_at: now,
          }));
        if (pipes.length) onImportPipes(pipes);
        setPipeFile(null); setPipeFields([]); setPipeMapping({ label: "" });
      }
      if (basinFile) {
        const { geojson } = await parseShapefileZip(basinFile);
        const mappedLabel = basinMapping.label && basinMapping.label !== ''
          ? (geojson.features[0]?.properties?.[basinMapping.label] ?? basinName.trim())
          : basinName.trim() || `Boundary ${Date.now()}`;
        onImportBoundary(geojson, mappedLabel);
        setBasinFile(null); setBasinFields([]); setBasinMapping({}); setBasinName("");
      }
    } catch (err) { setError("Upload error: " + (err instanceof Error ? err.message : String(err))); }
    finally { setUploading(false); }
  }, [nodeFile, nodeMapping, pipeFile, pipeMapping, basinFile, basinName, basinMapping, projectId, onImportNodes, onImportPipes, onImportBoundary]);

  return (
    <div className="border-b border-[#1e293b] p-3 space-y-2">
      <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-2">Import Data</h3>
      {error && <div className="bg-red-900/30 border border-red-800 rounded px-3 py-2 text-xs text-red-300 mb-2">{error}</div>}

      <Section title="Nodes" color="#38bdf8" defaultOpen>
        <div onDrop={(e) => handleDrop(e, "nodes")} onDragOver={(e) => e.preventDefault()} className="border-2 border-dashed border-[#1e293b] rounded-lg p-3 text-center mb-2 cursor-pointer hover:border-[#38bdf8]/50 transition-colors">
          <input type="file" accept=".zip" onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setNodeFile(file);
            parseShapefileZip(file).then(({ fields }) => { setNodeFields(fields); setNodeMapping(guessMapping(fields)); }).catch((e) => setError("Could not read shapefile: " + (e instanceof Error ? e.message : String(e))));
          }} className="hidden" id="node-upload" />
          <label htmlFor="node-upload" className="cursor-pointer">
            <div className="text-xs text-[#94a3b8] mb-1">Drop .shp/.shx/.dbf zip or click</div>
            {nodeFile && <div className="text-xs text-[#38bdf8] font-medium truncate">{nodeFile.name}</div>}
          </label>
        </div>
        {nodeFields.length > 0 && (
          <div className="space-y-1 mb-2">
            <p className="text-xs text-[#94a3b8] font-medium">Map fields:</p>
            <FieldSelect label="Label *" value={nodeMapping.label} fields={nodeFields} onChange={(v) => setMap(setNodeMapping, "label", v)} />
            <FieldSelect label="X / Easting" value={nodeMapping.x ?? ""} fields={nodeFields} onChange={(v) => setMap(setNodeMapping, "x", v)} />
            <FieldSelect label="Y / Northing" value={nodeMapping.y ?? ""} fields={nodeFields} onChange={(v) => setMap(setNodeMapping, "y", v)} />
            <FieldSelect label="Elevation (ft)" value={nodeMapping.elevation ?? ""} fields={nodeFields} onChange={(v) => setMap(setNodeMapping, "elevation", v)} />
            <FieldSelect label="Demand (GPM)" value={nodeMapping.demand_gpm ?? ""} fields={nodeFields} onChange={(v) => setMap(setNodeMapping, "demand_gpm", v)} />
            <FieldSelect label="C-Factor" value={nodeMapping.hazen_williams_C ?? ""} fields={nodeFields} onChange={(v) => setMap(setNodeMapping, "hazen_williams_C", v)} />
          </div>
        )}
        <button onClick={handleUpload} disabled={uploading || !nodeFile || !nodeMapping.label} className="w-full rounded bg-[#38bdf8] text-[#0a0f1e] py-1.5 text-xs font-bold hover:bg-[#0ea5e9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          {uploading ? "Processing…" : "Upload Nodes"}
        </button>
      </Section>

      <Section title="Pipes" color="#f97316">
        <div onDrop={(e) => handleDrop(e, "pipes")} onDragOver={(e) => e.preventDefault()} className="border-2 border-dashed border-[#1e293b] rounded-lg p-3 text-center mb-2 cursor-pointer hover:border-[#f97316]/50 transition-colors">
          <input type="file" accept=".zip" onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) { setPipeFile(file); parseShapefileZip(file).then(({ fields }) => { setPipeFields(fields); setPipeMapping(guessMapping(fields)); }).catch((e) => { setError("Could not read shapefile: " + (e instanceof Error ? e.message : String(e))); setPipeFile(null); }); }
          }} className="hidden" id="pipe-upload" />
          <label htmlFor="pipe-upload" className="cursor-pointer">
            <div className="text-xs text-[#94a3b8] mb-1">Drop .shp/.shx/.dbf zip or click</div>
            {pipeFile && <div className="text-xs text-[#f97316] font-medium truncate">{pipeFile.name}</div>}
          </label>
        </div>
        {pipeFields.length > 0 && (
          <div className="space-y-1 mb-2">
            <p className="text-xs text-[#94a3b8] font-medium">Map fields:</p>
            <FieldSelect label="Label *" value={pipeMapping.label} fields={pipeFields} onChange={(v) => setMap(setPipeMapping, "label", v)} />
            <FieldSelect label="From Node *" value={pipeMapping.from_node_label ?? ""} fields={pipeFields} onChange={(v) => setMap(setPipeMapping, "from_node_label", v)} />
            <FieldSelect label="To Node *" value={pipeMapping.to_node_label ?? ""} fields={pipeFields} onChange={(v) => setMap(setPipeMapping, "to_node_label", v)} />
            <FieldSelect label="Diameter (in)" value={pipeMapping.diameter_in ?? ""} fields={pipeFields} onChange={(v) => setMap(setPipeMapping, "diameter_in", v)} />
            <FieldSelect label="Length (ft)" value={pipeMapping.length_ft ?? ""} fields={pipeFields} onChange={(v) => setMap(setPipeMapping, "length_ft", v)} />
            <FieldSelect label="Material" value={pipeMapping.material ?? ""} fields={pipeFields} onChange={(v) => setMap(setPipeMapping, "material", v)} />
          </div>
        )}
        <button onClick={handleUpload} disabled={uploading || !pipeFile || !pipeMapping.label || !pipeMapping.from_node_label || !pipeMapping.to_node_label} className="w-full rounded bg-[#f97316] text-[#0a0f1e] py-1.5 text-xs font-bold hover:bg-[#ea580c] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          {uploading ? "Processing…" : "Upload Pipes"}
        </button>
      </Section>

      <Section title="Boundary" color="#22c55e">
        <div onDrop={(e) => handleDrop(e, "basins")} onDragOver={(e) => e.preventDefault()} className="border-2 border-dashed border-[#1e293b] rounded-lg p-3 text-center mb-2 cursor-pointer hover:border-[#22c55e]/50 transition-colors">
          <input type="file" accept=".zip" onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBasinFile(file);
            setBasinName(file.name.replace(/\.zip$/i, ""));
            parseShapefileZip(file).then(({ fields }) => { setBasinFields(fields); setBasinMapping(guessBasinMapping(fields)); }).catch((err) => setError("Could not read shapefile: " + (err instanceof Error ? err.message : String(err))));
          }} className="hidden" id="basin-upload" />
          <label htmlFor="basin-upload" className="cursor-pointer">
            <div className="text-xs text-[#94a3b8] mb-1">Drop polygon .shp zip or click</div>
            {basinFile && <div className="text-xs text-[#22c55e] font-medium truncate">{basinFile.name}</div>}
          </label>
        </div>
        <input type="text" placeholder="Boundary name" value={basinName} onChange={(e) => setBasinName(e.target.value)} className="w-full rounded px-2 py-1 text-xs bg-[#111827] text-[#e2e8f0] border border-[#1e293b] focus:outline-none focus:border-[#22c55e] mb-2" />
        {basinFields.length > 0 && (
          <div className="space-y-1 mb-2">
            <p className="text-xs text-[#94a3b8] font-medium">Map fields:</p>
            <FieldSelect label="Label" value={basinMapping.label ?? ""} fields={basinFields} onChange={(v) => setBasinMapping((p) => ({ ...p, label: v }))} />
            <FieldSelect label="Area Acres" value={basinMapping.area_acres ?? ""} fields={basinFields} onChange={(v) => setBasinMapping((p) => ({ ...p, area_acres: v }))} />
          </div>
        )}
        <button onClick={handleUpload} disabled={uploading || !basinFile} className="w-full rounded bg-[#22c55e] text-[#0a0f1e] py-1.5 text-xs font-bold hover:bg-[#16a34a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          {uploading ? "Processing…" : "Upload Boundary"}
        </button>
        {boundaryLabel && (
          <button onClick={onClearBoundary} className="w-full mt-1 rounded text-xs text-red-400 hover:text-red-300 py-1 transition-colors">Remove {boundaryLabel}</button>
        )}
      </Section>
    </div>
  );
}