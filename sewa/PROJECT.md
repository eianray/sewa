# PROJECT: AquaFlow — Water Distribution Analysis
> Template version: 1.4 — from `templates/PROJECT_TEMPLATE.md`
> Chunk-by-chunk execution. Eian verifies each chunk before next begins.
> Created: 2026-05-30

---

## 🔄 Sync Manifest

| Layer | Location | How to verify |
|-------|----------|---------------|
| Local | `~/workspace/projects/1_Dev Programs/SEWA/` | `git status` |
| GitHub | [eianray/aquaflow] (pending creation) | `git log --oneline -1` |
| Deployed | [aquaflow.pages.dev — TBD] | Browser smoke test |
| Docs | `projects/1_Dev Programs/SEWA/sewa/` | This file + SPEC.md + REBUILD_GUIDE.md |

**Sync rule:** Each chunk is not done until committed + pushed + smoke tested.

---

## 🎯 Goal Statement

AquaFlow is a free, browser-based water distribution hydraulic modeling tool that makes steady-state pressure/flow analysis accessible to engineers without expensive desktop licenses. A water district engineer imports a shapefile of their water network, maps the incoming layers to the AquaFlow schema, inspects and edits attributes in a map-native interface, runs a Hazen-Williams steady-state analysis via EPANET 2.2, sees flow/velocity/pressure results color-coded on the map, and exports clean CSV/GIS deliverables — all without installing any software. Fire flow analysis follows in Phase 5. The tool runs on Cloudflare Pages (frontend) + Railway (Python/EPANET backend) + Meridian on Hetzner (GIS preprocessing). Free forever. No billing.

**Signed off by Eian:** ✅ &nbsp; Date: 2026-05-30
_Nothing moves until this is signed off._

---

## 📄 Documents

| Document | Status | Location |
|----------|--------|----------|
| This PROJECT.md | Current | `projects/1_Dev Programs/SEWA/sewa/PROJECT.md` |
| Spec | ☐ Draft (derived from original SEWA spec) | `projects/1_Dev Programs/SEWA/sewa/SPEC.md` |
| Rebuild Guide | ☐ Post-launch | `projects/1_Dev Programs/SEWA/sewa/REBUILD_GUIDE.md` |

---

## 🔒 Scope Lock

### In Scope
- Water distribution hydraulic analysis only (no sewer)
- Hazen-Williams steady-state solver via EPANET 2.2 / WNTR
- Fire flow analysis (available flow at 20 PSI residual)
- Shapefile import with schema mapping
- Attribute editor (map-native click-to-edit)
- Scenario management (save/restore/compare)
- Growth projection
- Export: CSV, Shapefile, GDB, DXF, simple PDF
- Meridian for GIS preprocessing (validate, repair, reproject, elevation fetch, export)
- Single-user per project, no collaboration in v1
- IndexedDB for project storage (no server-side database)

### Out of Scope
- Sewer / gravity pipe modeling (Manning's, SWMM)
- Billing / Stripe / subscription tiers / pay-per-run
- Gault's Gulch or any built-in demo project
- Collaboration (live cursors, comments, snapshots, public links)
- PRV modeling (non-linear, iterative solve)
- Valve isolation analysis
- Water hammer / surge analysis
- Water quality (age, chlorine decay) — Phase 2
- Extended period simulation — Phase 2
- Branded exports / white-label — v2+
- Multi-user / org/tenant management
- Real-time SCADA/CMMS integration

### Parking Lot
- PRV modeling
- Valve isolation analysis
- Water hammer / surge
- Water quality (age, chlorine decay) — Phase 2
- Extended period simulation (EPS) — Phase 2
- Batch fire flow (all hydrants at once)
- Available flow curve chart (10/15/20/25/30 PSI residual)
- Multi-user collaboration — v2+

---

## 🗺️ Architecture

```
User Browser
    │
    ├── Next.js App (Cloudflare Pages)
    │       ├── Landing page (AquaFlow branding, free forever pitch)
    │       └── App (Supabase magic link auth, IndexedDB storage)
    │              ├── MapLibre GL JS — dark basemap, OSM + satellite
    │              ├── Project panel — create, list, open, delete
    │              └── Analysis panel — run, results, export
    │
    ├── Python FastAPI Backend (Railway, free tier)
    │       ├── WNTR (EPANET 2.2 wrapper, MIT/public domain)
    │       ├── GeoJSON → EPANET .inp converter
    │       ├── Steady-state Hazen-Williams solver
    │       └── Fire flow solver
    │
    └── Meridian API (Hetzner VPS, existing)
            ├── /v1/validate, /v1/repair, /v1/reproject
            ├── /v1/schema, /v1/epsg/search
            ├── /v1/elevation/fetch-s3 (USGS 3DEP LIDAR)
            └── /v1/export/shapefile, /v1/export/gdb, /v1/export/dxf
```

### Data Flow

```
1. User uploads .zip shapefile (single zip, multiple layers)
       ↓
2. Meridian: validate → repair → reproject to project CRS
       ↓
3. Schema mapper UI: user maps incoming fields → AquaFlow schema
       ↓
4. Stored in IndexedDB as GeoJSON (no server DB for v1)
       ↓
5. MapLibre renders: pipes (lines), junctions (circles), tanks (diamonds), pumps (triangles)
       ↓
6. User clicks feature → floating attribute card → inline edit → auto-save to IndexedDB
       ↓
7. User clicks "Run Steady-State" → GeoJSON → Python/EPANET backend → solved (~100-200ms)
       ↓
8. Results: pipes colored by velocity (🟢<2 · 🟡2-5 · 🔴>5 fps), nodes by pressure (🔴<20 · 🟡20-40 · 🟢40-80 · 🔵>80 PSI)
       ↓
9. User exports → Meridian packages CSV/SHP/GDB/DXF with calculated attributes embedded
```

---

## 🗺️ GIS Layer Model

### Required Layers (3 minimum)

| Layer | Fields | Notes |
|-------|--------|-------|
| **Pipes (Water Mains)** | `pipe_id`, `from_node`, `to_node`, `diameter` (in), `length` (ft), `hazen_williams_C`, `material` | `length` auto-computed from geometry. `C` auto-lookup from `material`. |
| **Junctions (Demand Nodes)** | `node_id`, `x`, `y`, `elevation` (ft NAVD88), `demand_gpm`, `node_type` | `node_type` = `junction \| tank \| pump \| hydrant` |
| **Tanks / Reservoirs** | `node_id`, `x`, `y`, `elevation` (ft NAVD88), `min_elevation`, `max_elevation` | Fixed-head boundary. At least one required as system source. |

### Optional Layers

| Layer | Fields | Notes |
|-------|--------|-------|
| **Pumps / Boosters** | `pump_id`, `x`, `y`, `suction_node`, `discharge_node`, `pump_curve` (JSON GPM→head pairs), `pump_type` | Adds head to system. Include if network has boosting. |
| **Fire Hydrants** | `hydrant_id`, `x`, `y`, `elevation`, `flow_test_gpm`, `residual_psi` | Display + fire flow. Can also be `node_type: 'hydrant'` on a junction node. |

### Layer Attributes (Complete)

**Pipes:**
```
pipe_id          string — unique ID (e.g., "P-101")
from_node        string — start node reference (must match a node_id)
to_node          string — end node reference (must match a node_id)
diameter         number — inches (e.g., 8, 12, 16)
material         string — PVC | HDPE | DIP | Concrete | Steel | Cast_Iron
hazen_williams_C number — roughness coefficient (auto-set from material, user can override)
length           number — feet (auto-computed from geometry, override-able)
installation_year number — year (optional, for age/condition)
pressure_rating  number — PSI (optional, manufacturer max)
valve_status     string — open | closed | partially_open (v2 — all = open for v1)
```

**Junctions:**
```
node_id      string — unique ID (e.g., "J-1")
x            number — longitude or state plane easting
y            number — latitude or state plane northing
elevation    number — feet NAVD88 (fetch from USGS 3DEP via Meridian if missing)
demand_gpm   number — base demand in GPM (or use population_served + per_capita_demand)
node_type    string — junction | tank | pump | hydrant
population_served number — optional (for demand allocation)
per_capita_demand_gpd number — optional (default 100 GPD/person)
```

**Tanks:**
```
node_id        string — unique ID
x              number — longitude or easting
y              number — latitude or northing
elevation      number — water surface elevation in feet NAVD88 (fixed head)
min_elevation  number — minimum water level (ft NAVD88)
max_elevation  number — maximum water level (ft NAVD88)
diameter_or_area number — for volume calc (v2)
```

**Pumps:**
```
pump_id        string — unique ID
x              number — longitude or easting
y              number — latitude or northing
suction_node   string — node ID on suction side
discharge_node string — node ID on discharge side
pump_curve     JSON — array of GPM→head pairs, e.g.: [{"gpm": 0, "head": 120}, {"gpm": 500, "head": 100}, {"gpm": 1000, "head": 50}]
pump_type      string — fixed_speed | variable_speed
```

**Hydrants:**
```
hydrant_id        string — unique ID
x                 number — longitude or easting
y                 number — latitude or northing
elevation         number — ft NAVD88
flow_test_gpm     number — field flow test result (GPM at residual)
residual_psi      number — field flow test residual pressure (PSI)
```

### Auto C-Factor Lookup Table

```ts
const HAZEN_WILLIAMS_C: Record<string, number> = {
  PVC: 140,
  HDPE: 120,
  DIP: 130,
  Concrete: 130,
  Steel: 130,
  Cast_Iron: 130,
};
```

### Multi-Layer Import

Clients typically send 6-8 separate layers: water mains, junctions, tanks, valves, fittings, hydrants, pumps. The import pipeline accepts all as separate layers — no combining. The schema mapper shows each incoming layer's fields and lets the user map to the AquaFlow schema before confirming.

---

## 🎨 Design Tokens

### Color System

| Element | Color | Meaning |
|---------|-------|---------|
| Pipe velocity < 2 fps | 🟢 `#22c55e` | Adequate — below scouring threshold |
| Pipe velocity 2–5 fps | 🟡 `#f59e0b` | Acceptable range |
| Pipe velocity > 5 fps | 🔴 `#ef4444` | Excessive velocity |
| Pipe velocity > 8 fps | ⚠️ `#dc2626` | Erosion / structural concern |
| Node pressure < 20 PSI | 🔴 `#ef4444` | Violation — NFPA/ISO minimum |
| Node pressure 20–40 PSI | 🟡 `#f59e0b` | Acceptable |
| Node pressure 40–80 PSI | 🟢 `#22c55e` | Normal operating range |
| Node pressure > 80 PSI | 🔵 `#3b82f6` | High — verify anomalies |
| Invalid/missing field | 🔴 red halo | Data quality issue |
| Valid field | 🟢 green checkmark | Ready for analysis |

### Validation Thresholds

| Check | Warning | Error |
|-------|---------|-------|
| Pipe velocity | < 2 fps (scouring) | > 8 fps (erosion) |
| Node pressure | < 30 PSI (low) | < 20 PSI (violation) |
| Junction missing elevation | — | Missing elevation |
| Junction missing demand | Warning | — |
| Pipe from_node not found | — | Invalid node reference |
| Pipe to_node not found | — | Invalid node reference |
| Tank missing elevation | — | Missing elevation |

### Background / Surface Colors

```
Background:   #0a0f1a (deep navy)
Surface:      rgba(15, 23, 42, 0.95) (floating glassmorphism cards)
Border:       rgba(255, 255, 255, 0.1)
Accent:       #3b82f6 (electric blue — buttons, active states)
Text primary: #f8fafc
Text muted:   #94a3b8
```

---

## 🔬 EPANET / WNTR Integration

### Why WNTR

- MIT / public domain license — fully open, no licensing concerns
- Python API: `wntr.network.WaterNetworkModel` → add nodes/links → `wntr.sim.EpanetSimulator`
- Output: `results.node.pressure`, `results.link.flow`, `results.link.velocity`, `results.link.headloss`
- Validated against EPA example networks (Anytown, Net1, Net3) — byte-for-byte accuracy checks available
- EPS available in v2+ — same API, just run with time series instead of steady-state

### API Contract

```
POST /solve
Content-Type: application/json

Body: {
  "network": {
    "pipes": [...],      // GeoJSON FeatureCollection
    "junctions": [...],   // GeoJSON FeatureCollection
    "tanks": [...],        // GeoJSON FeatureCollection
    "pumps": [...]         // GeoJSON FeatureCollection (optional)
  },
  "options": {
    "type": "steady-state" | "fire-flow",
    "fire_hydrant_id": "HF-3",      // required if type=fire-flow
    "fire_demand_gpm": 1500          // required if type=fire-flow
  }
}

Response: {
  "pipes": [{
    "pipe_id": "P-101", "from_node": "J-1", "to_node": "J-2",
    "diameter": 8, "flow_gpm": 245, "velocity_fps": 0.62,
    "headloss_ft_per_1000ft": 0.12, "status": "open"
  }],
  "nodes": [{
    "node_id": "J-1", "x": -122.4194, "y": 37.7749,
    "elevation": 450, "pressure_psi": 52.3, "demand_gpm": 45
  }],
  "summary": {
    "total_pipes": 87, "total_nodes": 74, "total_tanks": 2,
    "pipes_over_velocity": 3, "nodes_under_pressure": 2
  },
  "fire_flow": null | {
    "hydrant_id": "HF-3", "required_gpm": 1500,
    "available_gpm": 1780, "pass": true, "margin_pct": 18.7
  }
}
```

### Fire Flow Method

EPANET modified demand solve:
1. Select hydrant node (must have `elevation`, ideally has `flow_test_gpm` + `residual_psi`)
2. Set required flow (e.g., 1,500 GPM)
3. EPANET re-solve with: base demand + fire demand at hydrant
4. Available flow = max flow achievable at that node while maintaining 20 PSI residual at the same node
5. Return: `{ hydrant_id, required_gpm, available_gpm, pass: boolean, margin_pct }`

If hydrant has field test data, compare modeled result to field test result and show both.

---

## 🌐 Meridian Integration

Meridian handles all GIS preprocessing. It is NOT the hydraulic solver.

### Endpoints Used in v1

| Endpoint | When | Purpose |
|----------|------|---------|
| `GET /v1/epsg/search` | Import | Search CRS by name or EPSG code |
| `POST /v1/schema` | Import | Inspect incoming shapefile schemas |
| `POST /v1/validate` | Import | Flag invalid geometries before import |
| `POST /v1/repair` | Import | Fix invalid geometries |
| `POST /v1/reproject` | Import | Convert incoming CRS → project CRS |
| `POST /v1/elevation/fetch-s3` | Attribute edit | USGS 3DEP LIDAR for missing node elevations |
| `POST /v1/export/shapefile` | Export | Package results as .zip shapefile |
| `POST /v1/export/gdb` | Export | Package results as FileGDB .zip |
| `POST /v1/export/dxf` | Export | CAD-compatible DXF |

**No new Meridian endpoints needed in v1.** All hydraulics goes through Python/EPANET.

---

## 📋 Implementation Plan

**Eian verifies each chunk before Arnold is spawned on the next one.**

---

### Chunk 0 — Project Foundation

**Goal:** Clean codebase, renamed to AquaFlow, deployed and smoke-tested before any feature code begins.
**Definition of done:** Landing page loads at `aquaflow.pages.dev`. App route redirects to `/projects`. No SEWA references remain. Git repo is clean.

**Items:**
- [ ] 0a — Fork/copy SEWA `src/` → new `frontend/` directory structure. Remove all sewer-specific components, types, simulation code.
- [ ] 0b — Rename all SEWA references → AquaFlow: app name, metadata, favicon, env vars, Supabase project name
- [ ] 0c — Update landing page: AquaFlow branding, water-only messaging, "free forever, no billing" pitch, screenshot of water network (placeholder)
- [ ] 0d — Verify Supabase magic link auth works (single user per project, no org/tenant)
- [ ] 0e — Deploy to Cloudflare Pages. Smoke test: landing page loads, clicking "Get Started" triggers auth flow, app route is accessible
- [ ] 0f — Create `backend/` directory with FastAPI skeleton, `requirements.txt` (wntr, fastapi, uvicorn, pydantic), `Dockerfile`
- [ ] 0g — `git init` / `git commit` with clean initial state. Push to GitHub (new repo `eianray/aquaflow`)
- [ ] 0h — Verify no sewer-specific code remains: search for "sewer", "manhole", "invert", "SWMM", "MODL" in codebase — all must be gone

**Definition of done for 0:** AquaFlow landing page at `aquaflow.pages.dev`. Auth flow works. No sewer code in repo. Git clean. Eian can open the URL and see the app.

**Sign-off required from Eian before Chunk 1.**

---

### Chunk 1 — Shapefile Import + Schema Mapper

**Goal:** User can upload a .zip shapefile, see all incoming layers, map fields to AquaFlow schema, and see the water network rendered on the map.
**Definition of done:** User uploads a real client shapefile (or the sample provided by Eian), sees the network on the map within 2 minutes of starting.

**Items:**

**1a — Shapefile Upload Component**
- File input accepts `.zip` only. Max upload size: 50MB.
- On selection: parse zip client-side (use `shapefile-js` or similar), extract all `.shp` / `.dbf` / `.prj` files.
- Show loading state: "Reading shapefile..."
- On parse complete: show schema preview

**1b — Schema Mapper UI**
- For each layer detected in the zip: show a table of detected fields (from `.dbf` header)
- User sees a dropdown next to each field: map to one of the AquaFlow target fields (pipe_id, from_node, to_node, diameter, material, x, y, elevation, demand_gpm, node_type, etc.)
- Preset auto-detection: common field names like "DIAM" → diameter, "ELEV" → elevation, "FROM" → from_node
- User must confirm all required fields are mapped before import proceeds
- Show "Unmapped" count: must be 0 before "Import" button enables

**1c — CRS Picker**
- On upload, read `.prj` file. Parse WKT, extract EPSG code. Auto-populate CRS field.
- If no `.prj`, show dropdown/search powered by `GET /v1/epsg/search`: search by name (e.g., "NAD83 / Washington South") or EPSG number.
- Store project CRS in IndexedDB. All subsequent imports reprojected via Meridian `/v1/reproject`.

**1d — Meridian Validate + Repair**
- Before storing: `POST /v1/validate` → show error/warning count in import dialog
- If errors found: show "Fix automatically?" button → `POST /v1/repair` → re-validate
- Block import if unrepaired errors remain (show list of problematic features)

**1e — MapLibre Rendering**
- After import confirmed: store GeoJSON in IndexedDB
- Render pipes as `LineString` features (gray initially, no analysis run yet)
- Render junctions as `Circle` features (sized by demand or default radius)
- Render tanks as `Symbol` with diamond icon
- Render pumps as `Symbol` with triangle icon
- Render hydrants as `Circle` with hydrant styling

**1f — Layer Toggle Panel**
- Floating panel: checkboxes to show/hide each layer (pipes, junctions, tanks, pumps, hydrants)
- Persist toggle state in localStorage

**Definition of done for 1:** Eian can open the app, upload a client shapefile, map fields in the schema mapper, and see the water network rendered on the MapLibre map with all layers visible and togglable.

**Sign-off required from Eian before Chunk 2.**

---

### Chunk 2 — Attribute Editor

**Goal:** User can click any feature on the map, see its attributes in a floating card, edit inline, and see real-time validation feedback.
**Definition of done:** User clicks a pipe → attribute card appears. User types a new diameter → value saves → map re-renders. Missing elevation shows red halo. "Fetch elevation" button populates elevation from USGS via Meridian.

**Items:**

**2a — Click-to-Select**
- MapLibre `click` event on pipe layer → show `AttributeCard` floating panel anchored near click point
- MapLibre `click` event on node layer → show `AttributeCard` for node
- Click on empty map area → dismiss card
- Selected feature gets highlight style (thicker stroke, glow)

**2b — AttributeCard Component**
- Glassmorphism floating card (backdrop blur, subtle border)
- Shows all fields for the selected feature
- Editable fields: text inputs, number inputs, dropdowns for enum fields (material, node_type)
- Auto-save on blur: `IndexedDB.put(feature)`
- Show field-level validation status: green checkmark on valid, red glow on invalid/missing
- "Fetch elevation" button on any node: calls `POST /v1/elevation/fetch-s3` with node XY → fills `elevation` field

**2c — Auto C-Factor**
- When `material` field changes in `AttributeCard`: auto-set `hazen_williams_C` from `HAZEN_WILLIAMS_C` lookup table
- Show small toast: "C-factor auto-set to 140 (PVC)"

**2d — ValidationPanel (Sidebar)**
- Always-visible panel listing all errors and warnings in the project
- Grouped by type: Errors (missing required fields, invalid references) / Warnings (velocity low, demand missing)
- Each item clickable → map pans/zooms to that feature and opens its `AttributeCard`
- Count badge: "12 errors, 5 warnings"

**2e — Auto-Length**
- When pipe's geometry changes (vertex drag): recompute `length` from geometry using `turf.length()`
- Update `length` field automatically, show small indicator: "Length auto-updated to 342 ft"

**2f — Red/Green Halo Rendering**
- After analysis run: pipes with velocity > 5 fps render with red halo/pipe color
- Nodes with pressure < 20 PSI render with red halo
- Before analysis: all features render neutral gray
- Validation halos (missing elevation, invalid from_node) apply regardless of whether analysis has run

**Definition of done for 2:** Eian can click any pipe or node on the map, see all its attributes, edit them inline, see auto-save, see red/green validation feedback, use "Fetch elevation" to populate missing elevations from USGS 3DEP, and see the ValidationPanel listing all data quality issues.

**Sign-off required from Eian before Chunk 3.**

---

### Chunk 3 — Steady-State Analysis

**Goal:** User clicks "Run Steady-State" and sees flow/velocity/pressure color-coded on the map within 2 seconds. Results table shows all pipes and nodes with sortable columns. Violations are highlighted and clickable.
**Definition of done:** User uploads a complete dataset (all required layers, no missing elevations) → runs steady-state → sees green/yellow/red pipes and blue/yellow/red nodes on the map within 2 seconds. Violations are visible and clickable.

**Items:**

**3a — Python/EPANET Backend**
- FastAPI on Railway: `POST /solve` endpoint
- Accepts `{ "network": { "pipes": [...], "junctions": [...], "tanks": [...], "pumps": [...] }, "options": { "type": "steady-state" } }`
- WNTR `WaterNetworkModel` from GeoJSON
- `EpanetSimulator.run_sim()` → extract `results.node.pressure`, `results.link.flow`, `results.link.velocity`, `results.link.headloss`
- Return structured JSON: `{ "pipes": [...], "nodes": [...], "summary": {...}, "fire_flow": null }`
- Handle errors: missing elevation → 400 with field name; no tanks → 400 with message; unconnected nodes → warning in response

**3b — GeoJSON → EPANET .inp Converter**
- Translate AquaFlow GeoJSON to EPANET .inp format
- Pipe `from_node`/`to_node` → EPANET link junctions
- Tank → EPANET reservoir (fixed head)
- Pump → EPANET pump with pump curve
- Handle unit conversion: AquaFlow uses feet and GPM; EPANET uses SI (m/s, m³/s) internally — WNTR handles internally, just ensure consistent units in/out

**3c — Run Button + Loading State**
- "Run Steady-State" button in sidebar
- On click: disable button, show spinner + "Solving..." text
- Timeout: 10 seconds. If no response, show error: "Solve timed out. Network may be too large."
- On success: enable button, show "Solved in 127ms" toast

**3d — Map Re-Rendering with Results**
- On results received: update each feature's properties with `flow_gpm`, `velocity_fps`, `headloss_ft`, `pressure_psi`
- Re-render pipe layer: color by velocity threshold
- Re-render node layer: color by pressure threshold
- Update layer source with `map.getSource().setData(updatedGeoJSON)`

**3e — ResultsPanel**
- Sortable table: columns = Pipe ID, From→To, Diameter, Flow (GPM), Velocity (fps), Headloss (ft/1000ft)
- Default sort: velocity descending (most problematic at top)
- Filter toggle: "Show all" / "Show violations only" (velocity > 5 or pressure < 20)
- Each row clickable → map pans/zooms to that pipe
- Violation rows highlighted with red background

**3f — ViolationSummaryCard**
- Floating card at top of results panel: "3 pipes over velocity · 2 nodes below minimum pressure"
- Each count clickable → filters ResultsPanel to that violation type
- "Zoom to violations" button → map fits bounds of all violation features

**3g — Map Legend**
- Always-visible floating card in map corner
- Two legends: "Velocity" (🟢 <2 · 🟡 2-5 · 🔴 >5 fps) and "Pressure" (🔴 <20 · 🟡 20-40 · 🟢 40-80 · 🔵 >80 PSI)
- Legend updates when analysis results are loaded

**Definition of done for 3:** Eian uploads a complete dataset → clicks "Run Steady-State" → sees colored pipes and nodes on the map within 2 seconds → opens ResultsPanel → sees sortable table → clicks violation → map zooms to that pipe.

**Sign-off required from Eian before Chunk 4.**

---

### Chunk 4 — Scenario Management

**Goal:** User can save the current state as a named scenario, load a previous scenario, compare two scenarios side-by-side, and run growth projections.
**Definition of done:** User saves "Baseline" → modifies demand on several junctions → saves "Build-out" → switches between them → runs analysis on each and sees different results. Growth projection with 20% growth over 5 years produces higher demands and different results.

**Items:**

**4a — Save Scenario**
- "Save Snapshot" button in sidebar → modal prompts for name → saves all current features (GeoJSON + analysis results) to IndexedDB with timestamp and name
- Key: `scenarios[]` array in project object, each entry: `{ name, savedAt, data: <GeoJSON> }`

**4b — Scenario List + Switch**
- Dropdown in sidebar: lists all saved scenarios + "Current (unsaved)" option
- Selecting a scenario loads its GeoJSON into the map → triggers re-render
- Unsaved changes indicator: "*" badge if current state differs from last saved scenario

**4c — Compare Two Scenarios**
- Select "Scenario A" and "Scenario B" from two dropdowns → click "Compare"
- Compute per-feature delta: `flow_change = flow_B - flow_A`, `pressure_change = pressure_B - pressure_A`
- Render pipe layer: green ramp for increase, red ramp for decrease (using `delta_flow` attribute)
- Render node layer: blue ramp for pressure increase, orange for decrease
- "Diff view" panel: table showing feature ID, scenario A value, scenario B value, delta
- Toggle diff view off → restore normal results rendering

**4d — Growth Projection**
- Modal: "Growth Projection" — fields: growth rate (% per year), planning period (years), which junctions to apply (all with `population_served` set)
- Formula: `future_demand = current_demand × (1 + rate%)^years`
- Apply to all qualifying junctions → create temporary scenario "Growth 2026→2031"
- Run steady-state on projected scenario → results show impact of growth
- Option to save as permanent scenario

**4e — Undo/Redo**
- Command pattern: every attribute edit, scenario save, analysis run is a command in a history stack
- Ctrl+Z: undo last command
- Ctrl+Shift+Z / Ctrl+Y: redo
- ~50 step history (configurable)
- Visual: subtle toast on undo/redo: "Undo: changed diameter on P-101"

**Definition of done for 4:** Eian saves "Baseline", creates "Build-out" with modified demands, switches between them seeing different analysis results, and runs a 20% 5-year growth projection showing which pipes exceed velocity thresholds under growth.

**Sign-off required from Eian before Chunk 5.**

---

### Chunk 5 — Fire Flow Analysis

**Goal:** User selects a hydrant, enters required flow, clicks "Run Fire Flow", and sees available flow at 20 PSI residual with a pass/fail badge — within 3 seconds.
**Definition of done:** User clicks a hydrant on the map → fire flow panel opens → enters 1,500 GPM → clicks Run → sees "Available: 1,780 GPM ✅ PASS" or "Available: 1,200 GPM ❌ FAIL" within 3 seconds. If hydrant has field test data, both results are shown.

**Items:**

**5a — Hydrant Selector**
- Click on any node with `node_type: hydrant` → `FireFlowPanel` opens in sidebar
- Dropdown list of all hydrants as fallback (if click doesn't trigger correctly)
- Show hydrant ID, elevation, and any field test data (flow_test_gpm, residual_psi) in the panel

**5b — Required Flow Input**
- Preset buttons: 500 / 1,000 / 1,250 / 1,500 / 2,000 GPM
- Manual entry field for any value
- Common preset highlights: 1,500 GPM for commercial, 1,000 GPM for residential

**5c — Run Fire Flow Solve**
- `POST /solve` with `{ "type": "fire-flow", "fire_hydrant_id": "HF-3", "fire_demand_gpm": 1500 }`
- Backend: EPANET re-solve with fire demand added at hydrant → available flow at 20 PSI residual
- Show loading state: "Calculating available flow..."
- Timeout: 10 seconds

**5d — Result Card**
- Display:
  ```
  Hydrant: HF-3
  Required: 1,500 GPM at 20 PSI residual
  Available: 1,780 GPM ✅ PASS (+18.7% margin)
  ```
  Or:
  ```
  Available: 1,200 GPM ❌ FAIL (-20.0% margin)
  ```
- Color-coded: green for pass, red for fail

**5e — Field Test Comparison**
- If hydrant has `flow_test_gpm` and `residual_psi`: show field test result alongside modeled result
- Note: "Modeled result differs from field test (1,800 GPM) by X%. Verify network attributes."
- Both results shown: "Field test: 1,800 GPM · Modeled: 1,780 GPM"

**5f — Fire Flow Summary Table**
- "Run fire flow at all hydrants" button (batch mode, v2 deferred)
- For now: one hydrant at a time. Results card shows current hydrant result.
- History of fire flow runs in session: list of hydrant IDs + results (pass/fail) in a collapsible section

**Definition of done for 5:** Eian clicks a hydrant → enters 1,500 GPM → clicks Run → sees pass/fail result within 3 seconds. Field test data is displayed if present.

**Sign-off required from Eian before Chunk 6.**

---

### Chunk 6 — Export + Reporting

**Goal:** User can export results as CSV, Shapefile, GDB, DXF, and a simple PDF report — all containing the calculated attributes (flow, velocity, pressure) from the analysis.
**Definition of done:** User runs steady-state → clicks Export → downloads a CSV with all pipes and calculated results → downloads a Shapefile with flow/velocity/headloss embedded → downloads a PDF with project summary, network stats, and results table.

**Items:**

**6a — CSV Export**
- Pipes table: pipe_id, from_node, to_node, diameter, material, length, flow_gpm, velocity_fps, headloss_ft_per_1000ft, status
- Nodes table: node_id, x, y, elevation, pressure_psi, demand_gpm, node_type
- Two separate CSV files in a .zip, or combined in one file with sheet/section headers
- Use browser's `Blob` + `URL.createObjectURL` + `<a download>` trigger

**6b — Shapefile Export**
- `POST /v1/export/shapefile` — sends GeoJSON with calculated attributes to Meridian, gets back .zip shapefile
- Include all calculated fields: flow_gpm, velocity_fps, headloss_ft, pressure_psi
- Merge pipes and nodes into separate layers in the shapefile

**6c — GDB Export**
- `POST /v1/export/gdb` — FileGDB .zip via Meridian
- Separate feature classes: Pipes (with flow/vel/headloss), Junctions (with pressure/demand), Tanks, Pumps

**6d — DXF Export**
- `POST /v1/export/dxf` — CAD-compatible DXF via Meridian
- Layers: PIPES, JUNCTIONS, TANKS, PUMPS, HYDRANTS

**6e — PDF Report**
- Python reportlab (same approach as PMI Workflow Builder business cards)
- Contents:
  - Project name, analyst name, date
  - Network summary: pipe count, node count, tank count, total pipe miles
  - Results summary: pipes over velocity threshold, nodes under pressure threshold
  - Fire flow results table: hydrant ID, required GPM, available GPM, pass/fail
  - Analysis settings: Hazen-Williams solve parameters
  - Disclaimer: "Results should be reviewed by a licensed professional engineer prior to use in design or regulatory submissions."
- Capture map screenshot via `html2canvas` → embed in PDF

**Definition of done for 6:** Eian runs analysis → opens Export panel → clicks each format → downloads files. CSV opens in Excel with correct columns and data. PDF shows project summary and map screenshot.

**Sign-off required from Eian before deployment.**

---

## ✅ Pre-Deployment Checklist

**Infrastructure**
- [ ] Cloudflare Pages: `aquaflow.pages.dev` loads without error
- [ ] Railway: Python backend回应 `/solve` endpoint
- [ ] Meridian: health check passing, all endpoints accessible
- [ ] Supabase: magic link auth works, projects persist in IndexedDB

**Product**
- [ ] Landing page: AquaFlow branding, free forever message, no SEWA references
- [ ] Import: shapefile upload → schema mapper → map renders correctly
- [ ] Edit: click-to-select, inline edit, auto-save, validation halos
- [ ] Analysis: steady-state solve → colored map + results table
- [ ] Scenarios: save, load, compare, growth projection work
- [ ] Fire flow: select hydrant → run → pass/fail result
- [ ] Export: CSV, SHP, GDB, DXF, PDF all functional

**Quality**
- [ ] Selen code review complete (no sewer code, no billing code, clean imports)
- [ ] Human test complete (Eian)
- [ ] Blackbox agent test complete (Arnold validates full flow with sample data)
- [ ] No console errors in browser
- [ ] No broken API calls (404, 500 responses handled gracefully)

**Documentation**
- [ ] SPEC.md updated with final decisions
- [ ] REBUILD_GUIDE.md written (Selah)
- [ ] PROJECT.md updated with final chunk statuses

---

## 📌 Key Spec Details (for Arnold reference)

- **Tech stack:** Next.js 15 + TypeScript + Tailwind + shadcn/ui + MapLibre GL JS
- **Auth:** Supabase magic link, single user, no org/tenant
- **Storage:** IndexedDB (no server-side DB in v1)
- **Hydraulic engine:** WNTR (EPANET 2.2 wrapper, MIT/public domain) via Python FastAPI on Railway
- **GIS preprocessing:** Meridian on Hetzner — validate, repair, reproject, elevation fetch, export
- **Meridian key:** `71d110c0284e0651d0524b9d65e4866824336b5b97aa0d4ae70446243e373dfd` (from TOOLS.md)
- **No sewer code:** Search for and remove all references to "sewer", "manhole", "invert", "SWMM", "MODL", "I&I", "HGL", "outfall", "MODL"
- **No billing code:** Remove all Stripe integration, tier logic, pay-per-run metering
- **Color thresholds:** Velocity 🟢<2 · 🟡2-5 · 🔴>5 | Pressure 🔴<20 · 🟡20-40 · 🟢40-80 · 🔵>80
- **C-factor lookup:** PVC→140, HDPE→120, DIP→130, Concrete→130, Steel→130, Cast_Iron→130
- **Solve timeout:** 10 seconds. If exceeded, show error: "Network may be too large."
- **Sample data:** Eian will upload client shapefile for testing. No built-in demo project.

---

## 📝 Session Log

| Date | Summary | Next action |
|------|---------|-------------|
| 2026-05-30 | Consolidated SEWA + AquaFlow specs into single PROJECT.md. Removed sewer, billing, Gault's Gulch demo. Kept Meridian for GIS, moved hydraulics to Python/EPANET. Defined 6 chunks with sign-off gates. | Eian signs off on Goal Statement → Arnold starts Chunk 0 |

---

_Template v1.4 — created 2026-05-30, based on consolidated SEWA + AquaFlow planning_