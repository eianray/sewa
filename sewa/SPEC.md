# SEWA — Sewer & Water Analysis
## Project Specification · Status: PLANNING

> Internal codename: **SEWA** (sewa.app TBD — domain available alternatives sought)
> Combines: MODL's steady-state sewer hydraulics engine + Grok's game-like UX polish + modern SaaS stack.

---

## 🎯 Goal

Build a browser-based sewer and water network modeling SaaS that makes accurate hydraulic analysis accessible and enjoyable. Engineers import or draw a utility network, assign pipe and node attributes, run steady-state hydraulic analysis (Manning's equation, Hazen-Williams), validate and clean data with satisfying visual feedback, model growth scenarios, and export polished deliverables for clients and regulators.

**SEWER:** Sanitary sewer — gravity pipes, force mains, pump stations, manholes, basins, I&I, growth projections, WA State 5-year reporting.

**WATER:** Water distribution — Hazen-Williams networks, fire flow analysis, demand allocation, pressure zones, water age, chlorine decay.

**Feel:** Like Figma meets engineering software. Real-time collaboration, live cursors, comments on the canvas. A tool engineers actually enjoy opening.

**Feel:** Like a well-designed consumer app that happens to do engineering work. Smooth, forgiving, delightful — the way modern tools should work. Think Linear, Figma, or Notion — but for sewer modeling.

---

## 🏗️ Architecture

```
User Browser
    │
    ├── Next.js App (sewa.app or TLD TBD)
    │       ├── Marketing / landing site (Next.js)
    │       └── App (authenticated)
    │              ├── 2D map: MapLibre GL JS (dark theme, OSM + satellite)
    │              ├── 3D toggle: React-Three-Fiber (oblique/isometric, pipe extrusion)
    │              └── Sidebar: project management, attribute editor, analysis panel
    │
    ├── Python FastAPI Backend (handles geoprocessing, SWMM-ready)
    │       ├── D1 / PostgreSQL + PostGIS (projects, users, orgs)
    │       ├── R2 / S3 (uploaded files, exports)
    │       ├── Celery/BullMQ (long-running simulations)
    │       └── Stripe webhooks
    │
    └── Meridian API (Hetzner self-hosted)
            └── Geoprocessing: reproject, buffer, clip, dissolve, convert,
                schema, validate, repair, union, intersect, difference,
                hillshade, slope, contours, raster-calc, network trace,
                hydraulics (manning, hgl, force-main)
```

### Data Flow
1. User imports .zip shapefile → stored in R2 → parsed → GeoJSON in D1
2. User edits attributes → validated in-browser → D1 updated
3. User runs analysis → backend sends to Meridian → results returned → stored in D1
4. User exports → backend generates CSV/GDB/SHP → R2 → signed URL

---

## 🎨 UX Philosophy

> "Like Figma meets engineering software. Real-time collaboration, live cursors, comments pinned to the canvas."

- **Dark theme primary** — matches engineering/professional feel; **light mode** also supported (toggle in settings; light mode preferred for print/PDF output)
- **Floating glassmorphism panels** — backdrop blur, subtle borders, smooth shadows
- **Map dominant** — Leaflet/MapLibre fills the screen, panels float over it
- **Satisfying interactions** — smooth transitions, gentle spring animations, micro-feedback on every action
- **Real-time validation** — features glow red when invalid, green when good, with clear inline fixes
- **Zero punitiveness** — validation warnings feel helpful, not like failures
- **Undo/redo everywhere** — no action is final; command pattern, ~50 steps
- **Autosave with clear state** — "Saved 2 min ago" / "Saving..." / "Unsaved changes"
- **Keyboard shortcuts** — Ctrl+Z undo, Ctrl+S save, Ctrl+E export, Ctrl+F find feature by ID, Delete remove selected
- **Onboarding wizard** — first-project walkthrough: import data → assign attributes → run analysis → export. Achievement "First Analysis Run" on completion.

### Collaboration
- **Live multi-cursor presence** — see collaborator cursors on the canvas in real time (like Figma). See who's editing which feature.
- **Comments / annotation pins** — drop a pin on any pipe or node: "verify this invert in the field" — with resolve/unresolve. Threaded. Mention collaborators by email.
- **Named snapshots with restore** — name a version: "Pre-field verification", "Updated flows from AI review"; restore any named snapshot; full audit trail of who changed what and when
- **Shareable public links** — read-only view link for clients or colleagues; no account required; optional password
- **Notifications center** — bell icon: collaborator edited a feature you commented on; simulation completed; collaborator joined project
- **Slack / Teams webhooks** — get notified in your team channel when simulations finish or comments are added

### Color System
- Background: `#0a0f1a` (deep navy)
- Surface: `rgba(15, 23, 42, 0.95)` (floating cards)
- Accent: `#3b82f6` (electric blue) — buttons, highlights, active states
- Success: `#22c55e`
- Warning: `#f59e0b`
- Error: `#ef4444`
- Text: `#f8fafc` (primary), `#94a3b8` (muted)
- Pipe coloring: 🟢 <50% util · 🟡 50–80% · 🔴 >80% · 🟣 surcharge

### Layout
```
┌─────────────────────────────────────────────────┐
│  Top bar: project name · autosave · collaborators │
├──────────┬──────────────────────────────────────┤
│          │                                      │
│  Sidebar │          Map Canvas                  │
│  (4 tabs)│        (MapLibre / 3D)             │
│          │                                      │
│  Import  │    Floating toolbar: draw, select    │
│  Validate│                                      │
│  Analyze │                                      │
│  Export  │                                      │
│          │                                      │
└──────────┴──────────────────────────────────────┘
```

---

## 💰 Pricing Tiers

| Tier | Price | Users | Projects | Nodes | Sims/mo | Notes |
|------|-------|-------|----------|-------|---------|-------|
| **Free** | $0 | 1 | 3 | ≤500 | 0 | Data prep only. No sim results. |
| **Consultant** | $29/mo or $290/yr | 1 (strict) | Unlimited | ≤2,000 | 100 | PDF reports, full exports, branded deliverables |
| **Pro** | $49/mo per org | Unlimited | Unlimited | ≤10,000 | 500 | Collaboration, comments, snapshots, audit log |
| **Team** | $149/mo per org | Unlimited | Unlimited | Unlimited | Unlimited | Priority support, public share links |
| **Enterprise** | Custom | Unlimited | Unlimited | Unlimited | Unlimited | SSO, white-label, SLA, dedicated onboarding |

- Server-side enforcement with friendly upgrade prompts (especially before running a simulation)
- Teaser messages on free tier: *"Run simulation to see flow animations and capacity analysis — upgrade to Consultant for $29/mo"*
- **Per-simulation pay-per-run** ($5–10 per run) — available as an alternative to monthly subscription; Stripe usage metering via `metered` billing
- **Freemium viral loop** — when a project is shared via public link, exported files include a "Made with SEWA" watermark/badge in metadata. Recipients see the tool, click to learn more, sign up. Free marketing.
- **Engineering review add-on** — offer optional paid human review of analysis by a licensed engineer (stretch goal, Phase 2+)
- **White-label** — engineering firms can have their own branded instance (separate deployment, custom domain); Enterprise tier pricing

---

## 📂 Workflow (4 Sidebar Tabs)

### Tab 1 — Import
- Upload .zip shapefile → R2 → parsed → layers appear on map
- **Auto-detect schema** — recognize InfoSewer, EPA SWMM, and standard GIS formats on import, auto-map fields to SEWA attributes
- **Shapefile schema preview** — before importing, show mapped fields and let user correct mis-mapped columns
- **Data quality score** — on import, show overall quality: % missing required fields, % invalid geometry, referential integrity score
- **Bulk validation before import** — flag all issues before data enters the system, not after
- **CAD import (.dxf)** — import AutoCAD .dxf files; auto-convert LINE entities to pipes, INSERT blocks (with attribute) to nodes
- Define datum (NAVD88 default, NGVD29, local offset)
- Define outfall / treatment plant boundary condition
- Set service area basins
- **CRS / projection picker** — easy State Plane / UTM / geographic selector; auto-reproject incoming data
- **GPS field data import** — import CSV of node coordinates from field survey equipment
- **Photo attachments** — attach site photos to any node or pipe (e.g., "invert measurement at MH-12")

### Tab 2 — Validate & Clean
- Red halo on features with missing/invalid attributes
- Click feature → floating attribute card with inline edit
- Topological error list (disconnected, dangles, missing outfall)
- **Cross-layer referential integrity** — if `from_node`/`to_node` references a missing manhole, flag immediately on import
- **Impossible-state prevention** — UI guards: can't connect pipe to non-existent node; can't set invert_down < invert_up; can't run analysis without an outfall
- **Smart suggestions** — "Did you mean: pipe 14 connects to pipe 15? Their inverts are within 0.1ft."
- Drawing tools: draw pipes (polyline snapping to nodes), draw manholes, draw basins
- Auto-connect: snap unconnected pipe ends to nearest node
- **CAD import** — .dxf files auto-convert lines → pipes, blocks → nodes
- Optional LIDAR elevation fetch from USGS 3DEP via Meridian

### Tab 3 — Analyze
- Peaking factor method selector (Harmon, Ten-State, Babcock, Alberta, Flat multiplier)
- Per-basin: growth rate %, fixed EDU additions, I&I config (%, GPD/acre)
- Planning period (default 5 years, matches WA reporting cycle)
- **Run Analysis** → results on map + capacity table + problem pipe list
- Current vs. future scenario comparison (side by side)
- HGL profile chart (floating card over map)
- **Batch scenario runner** — run up to 10 scenarios in one click; results in a comparison table; flag which basins trigger capacity violations first
- **Sensitivity analysis** — one-click sweep on any input parameter (e.g., I&I 10%→50%) showing how capacity % shifts; chart output
- **Background simulation** — analysis runs server-side; poll for completion; progress bar in UI; don't block the browser
- **Design calculator** — given a desired flow, suggest pipe diameter and slope that meet min velocity (2 ft/sec scouring, 0.5% min slope)
- **Construction cost estimate** — given pipe material, diameter, and length, estimate install cost (ballpark from $/ft multipliers)

### Tab 4 — Export
- Capacity utilization table
- Problem pipe / surcharge list
- Export: CSV, GDB (FileGDB), Shapefile
- **Branded PDF report** — company logo, project name, date, capacity summary table, problem pipe list, map screenshot, footer with engineer name/stamp (Consultant+ tier)
- **WA State 5-year reporting data package** — CSV + GDB + SHP + pre-filled narrative template document with all calculated values
- **Branded exports** — embed company name, analyst, and analysis date in GDB/SHP file metadata
- **Shareable public link** — read-only link anyone can view without an account; optional password; shows map + results + comments
- **Embeddable map widget** — iframe embed code for any public project; useful for consultants showing preliminary results on their own website

---

### Additional Input Sources
- **GPS field data import** — CSV of node coordinates from GPS survey equipment; auto-match to existing nodes by ID
- **Photo attachments per feature** — attach field photos to any pipe or node; thumbnail in attribute card
- **CAD (.dxf) import** — AutoCAD .dxf files; auto-convert LINE/LWPOLYLINE entities to pipes; BLOCK INSERT entities with attributes to nodes

### Analysis Extensions
- **Batch scenario runner** — run up to 10 named scenarios in one click; comparison table output; identify which basins trigger violations first
- **Sensitivity analysis** — one-click parameter sweep (e.g., I&I 10%→50% in 5% steps); chart showing capacity % drift across range
- **Background simulation** — server-side Celery job; poll for completion; progress bar in UI; no browser blocking
- **Design calculator** — given desired flow, suggest min diameter + slope that satisfy 2 ft/sec min velocity and 0.5% min slope
- **Construction cost estimate** — ballpark $/ft by material × diameter × length; output as CSV alongside analysis results

### Data & Quality
- **Shapefile schema auto-detect** — recognize InfoSewer, EPA SWMM, and standard GIS naming conventions on import; pre-map fields to SEWA schema
- **Import preview + correction** — before confirming import, show all mapped fields; let user override mis-mapped columns
- **Data quality score** — on import, show: % missing required attributes, % invalid geometry, referential integrity %, overall score badge
- **Bulk pre-validation** — flag all errors before data enters system; batch-fix from import preview screen
- **CRS / projection picker** — State Plane (feet), UTM, geographic; auto-reproject incoming data to project CRS

### Deliverables
- **Branded PDF report** — logo, project name, date, capacity table, problem pipe list, map screenshot, footer with analyst name/title (Consultant+ tier)
- **Branded exports** — embed company name, analyst, analysis date in GDB/SHP file metadata
- **Shareable public link** — anyone with link views read-only project; optional password; no account needed
- **Embeddable map widget** — generate iframe embed code for any public project; useful for consultants displaying preliminary results on their own website
- **WA State narrative template** — pre-filled narrative document with all calculated values; user adds written analysis around data

### Notifications & Integrations
- **In-app notifications** — simulation complete, collaborator edited your commented feature, snapshot created by teammate
- **Slack / Teams webhooks** — post to team channel: simulation finished, new comment on your pipe, collaborator joined project
- **Public example library** — community gallery of anonymized real-world projects users can open and explore without their own data (increases viral discovery)

---

## 🗺️ GIS Layers & Attributes

### Gravity Mains
`pipe_id`, `from_node`, `to_node`, `diameter` (inches), `material` (PVC/concrete/clay/HDPE/DIP), `manning_n` (auto from material), `invert_up` (ft NAVD88), `invert_dn`, `slope` (auto), `length` (auto from geometry), `cover_up`, `cover_dn`

### Force Mains
`pipe_id`, `from_node`, `to_node`, `diameter`, `material`, `hazen_williams_C` (auto from material), `length`, `invert_up`, `invert_dn`

### Manholes / Nodes
`manhole_id`, `x`, `y`, `rim_elevation` (ft NAVD88), `invert_in`, `invert_out`, `ground_elevation` (auto = rim), `type` (standard/junction/terminal/inlet/rock_catcher), `basin_id`

### Pump / Lift Stations
`station_id`, `station_name`, `x`, `y`, `wet_well_on_elevation`, `wet_well_off_elevation`, `pump_capacity` (GPM), `discharge_elevation`, `discharge_diameter`, `discharge_hazen_williams_C`

### Outfalls
`outfall_id`, `x`, `y`, `rim_elevation`, `type` (gravity_outfall/pump_discharge)

### Service Area Basins
`basin_id`, `population_equivalent`, `per_capita_flow` (GPD, default 100), `growth_rate_pct`, `growth_method` (rate/fixed_additions/both), `fixed_additions_edu`, `gal_per_edu`, `planning_period_years`, `I&I_factor_type` (pct/GPD_per_acre), `I&I_pct` or `I&I_gpd_per_acre`, `land_use`

---

## 🔬 Hydraulics Engine (Steady-State)

> NOT SWMM dynamic routing. Pure Manning's + Hazen-Williams. Same physics as MODL.

### Gravity Pipes: Manning's Equation
```
Q = (1/n) × A × R^(2/3) × S^(1/2)
Q_full  = Manning's at 100% depth
Q_design = Q_full × (d/D)^(8/3)
%_util  = (Q_design / Q_full) × 100
```

### Sanitary Design Flow
```
Q_design = (Q_dwf × PF) + Q_I&I
Q_dwf = population_equivalent × per_capita_flow
PF = peaking factor (user-selected method)
Q_I&I = I&I_factor × Q_dwf  (or flat GPD/acre)
```

### Force Mains: Hazen-Williams
```
V = k × C × r^0.63 × S^0.54
Q = V × A
C = Hazen-Williams roughness (120 HDPE, 130 DIP, 140 PVC)
```

### WA State Standards (Orange Book / Ecology Criteria)
- Min slope: 0.5% standard; 1% dead-end last segments
- Min velocity: 2 ft/sec scouring velocity at design flow
- Min gravity pipe diameter: 8 inches
- Manhole invert slope: min 0.1 ft invert-in to invert-out
- Manning's n defaults: 0.013 concrete, 0.011 PVC

### Validation Thresholds
| Check | Warning | Error |
|-------|---------|-------|
| Slope | < 0.5% | < 0.1% |
| Velocity at design | < 2 ft/sec | — |
| Capacity utilization | > 80% | > 100% (surcharge) |

### Growth Projections
Per-basin configurable growth over planning period (default 5 years):
- Growth rate method: `projected_pop = current_pop × (1 + rate%)`
- Fixed additions method: `N × gal/EDU/day` added per basin
- Methods combinable per basin

---

## 🌐 Meridian Integration

Base: `https://meridian.nodeapi.ai/v1`
Auth: `X-Mcp-Key` header (Meridian API key)

### Reusable (existing)
`/v1/reproject` · `/v1/buffer` · `/v1/clip` · `/v1/dissolve` · `/v1/convert` · `/v1/schema` · `/v1/validate` · `/v1/repair` · `/v1/union` · `/v1/intersect` · `/v1/difference` · `/v1/hillshade` · `/v1/slope` · `/v1/contours` · `/v1/raster-calc` · `/v1/epsg/search`

### New SEWER endpoints (build on Hetzner Meridian)
- `POST /v1/network/trace` — directed graph traversal (upstream/downstream per node)
- `POST /v1/hydraulics/manning` — gravity pipe Manning's solver, returns capacity % + surcharge flag
- `POST /v1/hydraulics/hgl` — HGL calculator along traced paths
- `POST /v1/hydraulics/force-main` — Hazen-Williams solver for force mains
- `POST /v1/export/gdb` — GeoDatabase export
- `POST /v1/export/shp` — Shapefile export
- `POST /v1/export/dxf` — DXF export (already built ✅)
- `POST /v1/export/kml` — KML export (already built ✅)
- `POST /v1/export/shapefile` — single-layer SHP export (already built ✅)

### New WATER endpoints (build on Hetzner Meridian)
- `POST /v1/water/network/trace` — directed graph traversal for water distribution networks (upstream/downstream)
- `POST /v1/water/hazen-williams` — Hazen-Williams pipe solver, returns flow/velocity/headloss per pipe
- `POST /v1/water/demand-allocate` — allocate nodal demands (population-based or customer count)
- `POST /v1/water/fire-flow` — fire flow analysis: required residual pressure, available flow at given residual
- `POST /v1/water/pressure-zone` — pressure zone boundary analysis
- `POST /v1/water/hydraulic-grade` — hydraulic grade line for water networks
- `POST /v1/water/water-age` — water age / residence time estimation (simple first-order decay)
- `POST /v1/water/chlorine-decay` — chlorine concentration decay along network path
- `POST /v1/water/tank-capacity` — tank/reservoir storage analysis
- `POST /v1/water/export/wd` — water distribution export (GeoDatabase, Shapefile)

---

## 🛠️ Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Frontend | Next.js 15 + TypeScript + Tailwind CSS + shadcn/ui | Modern, fast, great DX |
| 2D Map | MapLibre GL JS | Open-source, dark-theme ready |
| 3D | React-Three-Fiber | Great for pipe extrusion + flow animation |
| Backend | Python FastAPI | PySWMM-ready; spatial libs; async |
| Database | PostgreSQL + PostGIS | Spatial queries, RLS for multi-tenant |
| Auth | Supabase Auth | Magic link, org/tenant management |
| Storage | Supabase Storage / R2 | S3-compatible, signed URLs |
| Queue | Celery + Redis (or Supabase Edge Functions) | Simulation jobs |
| Payments | Stripe | Subscriptions, webhooks, usage metering |
| Geoprocessing | Meridian on Hetzner | Reuse existing investment |
| Deployment | Vercel (frontend) + Render/Fly.io (backend) | Fast, Git-connected |

---

## 📋 Implementation Phases

### Phase 1 — Foundation
1. Project scaffold: Next.js + Tailwind + shadcn/ui
2. Auth: Supabase magic link + org tenancy
3. Project CRUD: create, list, open, delete, rename
4. Dark theme + layout shell (sidebar 4-tab structure)
5. Marketing landing page (Next.js, sewa.app or TBD domain)
6. **Light mode** toggle (settings panel)
7. **Keyboard shortcuts** — Ctrl+Z/Y undo/redo, Ctrl+S save, Ctrl+E export, Ctrl+F find by ID
8. **Gault's Gulch SD demo project** — build the fictional sewer + water system (see Demo Project section); pre-load in app as built-in sample project; LIDAR elevation data fetched from USGS 3DEP via Meridian for all node elevations

### Phase 2 — Map + Import
8. MapLibre GL JS integration (dark basemap, OSM + satellite)
9. Shapefile import → parse → display on map
10. **Schema auto-detect** — recognize InfoSewer/SWMM formats on import; preview + correct field mapping before confirming
11. **Data quality score** on import — % missing required fields, geometry validity, referential integrity
12. **CRS picker** — State Plane / UTM / geographic; auto-reproject incoming data
13. Layer toggles (pipes, nodes, force mains, pump stations, outfalls, basins)
14. Basic attribute editor (click feature → card)
15. **GPS field data import** (CSV with node coordinates)
16. **Photo attachments** per feature

### Phase 3 — Validation & Cleaning
17. Red halo validation for missing/invalid attributes
18. Issues dashboard panel (error/warning/info)
19. **Cross-layer referential integrity** — flag missing `from_node`/`to_node` references on import
20. **Impossible-state prevention** — UI guards: invert_down ≥ invert_up enforced; outfall required before analysis
21. Manual drawing tools: draw pipe (polyline), draw node, draw basin
22. Topology cleanup: auto-connect dangling pipe ends, snap to nodes
23. LIDAR elevation fetch via Meridian
24. **Smart suggestions** — "did you mean..." prompts for common data entry errors
25. **CAD (.dxf) import** — LINE → pipes, BLOCK INSERT → nodes

### Phase 4 — Collaboration + UX Polish
26. **Live multi-cursor presence** — real-time collaborator cursors on canvas
27. **Comments / annotation pins** — drop pin on any feature; threaded; resolve/unresolve
28. **Named snapshots** — name any save point; restore any snapshot; full audit trail
29. **Shareable public links** — read-only view link; optional password
30. **Notifications center** — simulation complete, comment on your feature, collaborator joined
31. Slack / Teams webhook integration
32. Smooth sidebar transitions, micro-animations throughout
33. First-project onboarding wizard

### Phase 5 — Hydraulics + Water
34. Manning's equation engine (Python backend)
35. Hazen-Williams force main solver
36. Peaking factor methods (all 5)
37. I&I handling (% + GPD/acre modes)
38. Per-basin growth projections
39. HGL profile chart (floating card)
40. Scenario comparison (current vs. future)
41. **Batch scenario runner** — multi-scenario in one click
42. **Sensitivity analysis** — parameter sweep on I&I, growth rate, etc.
43. **Background simulation** — server-side job; polling + progress bar
44. **Design calculator** — suggest diameter + slope from desired flow
45. **Construction cost estimate** — ballpark $/ft by material × diameter × length

### Phase 6 — Water Distribution
46. `POST /v1/water/hazen-williams` — Hazen-Williams pipe solver
47. `POST /v1/water/demand-allocate` — nodal demand allocation
48. `POST /v1/water/fire-flow` — fire flow analysis
49. `POST /v1/water/pressure-zone` — pressure zone boundary analysis
50. `POST /v1/water/hydraulic-grade` — hydraulic grade for water networks
51. `POST /v1/water/water-age` — water age estimation
52. `POST /v1/water/chlorine-decay` — chlorine concentration decay
53. `POST /v1/water/tank-capacity` — tank/reservoir analysis
54. Water distribution map UI (parallel to sewer map)

### Phase 7 — Meridian New Endpoints
55. `POST /v1/network/trace` (sewer)
56. `POST /v1/hydraulics/manning`
57. `POST /v1/hydraulics/hgl`
58. `POST /v1/hydraulics/force-main`
59. `POST /v1/water/network/trace`
60. Export endpoints (GDB, SHP) — DXF/KML/SHP already done ✅

### Phase 8 — Billing + Deliverables
61. Stripe subscription integration (all tiers)
62. **Branded PDF report** — logo, analyst name, capacity summary, map screenshot (Consultant+)
63. **Branded exports** — embed metadata in GDB/SHP files
64. **Shareable public links** (read-only, optional password)
65. **Embeddable map widget** — iframe embed code generator
66. Full export: CSV + GDB + SHP with calculated attributes
67. WA State 5-year reporting data package + narrative template

### Phase 9 — Public Launch
68. Public example library (community gallery of anonymized projects)
69. Performance: LOD for 3D, throttled animations
70. Accessibility: keyboard nav, high-contrast, ARIA
71. Liability disclaimer (prominent)
72. **Gault's Gulch SD GIS package** — all layers generated with real LIDAR elevations (see Demo Project section)
73. Beta user testing (invite-only, NDA, no public URL until complete)
74. Freemium viral loop: shared links include "Made with SEWA" watermark → drives signups
75. **Landing page + domain setup** — built LAST, after engineering is validated

---

## 🔒 Security Notes
- Row-level security on all org data
- Input sanitization on all user uploads
- Rate limiting on simulation endpoints
- Audit logging for all simulations + exports
- Turnstile on auth forms

---

## 📁 File Structure

```
sewa/
├── frontend/                  # Next.js 15 app
│   ├── app/
│   │   ├── (marketing)/     # Landing page, pricing, docs
│   │   ├── (app)/           # Auth-gated app
│   │   │   ├── projects/
│   │   │   └── [projectId]/
│   │   └── api/             # Route handlers
│   ├── components/
│   │   ├── ui/              # shadcn/ui components
│   │   ├── map/             # MapLibre + 3D components
│   │   ├── editor/           # Attribute editor
│   │   └── analysis/         # Charts, results panels
│   └── lib/
│
├── backend/                  # Python FastAPI
│   ├── app/
│   │   ├── api/             # Route handlers
│   │   ├── core/             # Auth, security
│   │   ├── models/           # Pydantic + SQLAlchemy
│   │   ├── services/         # Business logic
│   │   └── hydraulics/       # Manning's, Hazen-Williams solvers
│   ├── workers/              # Celery tasks
│   └── tests/
│
├── meridian-endpoints/       # New Meridian routes (Rust)
│   ├── src/routes/
│   │   ├── network_trace.rs
│   │   ├── hydraulics_manning.rs
│   │   ├── hydraulics_hgl.rs
│   │   ├── hydraulics_force_main.rs
│   │   └── export_gdb.rs
│   └── Cargo.toml
│
├── docker-compose.yml
├── README.md
└── REBUILD_GUIDE.md         # Written by Selah at project end
```

---

## 🗑️ Parking Lot (Out of Scope)
- SWMM dynamic / hydrograph routing
- Real-time SCADA/CMMS integration
- Rehab prioritization scoring
- Water hammer / surge analysis
- Real-time SCADA integration for water networks
- DXF import (see open questions)
- PDF output (see open questions — may re-add if client demand warrants)

### Demo Project GIS Package
All GIS data is programmatically generated (Python: shapely + geopandas) as valid, topologically correct GeoJSON, packaged as `.zip` shapefiles for direct import into SEWA. All elevations are real — pulled from USGS 3DEP LIDAR bare-earth DEM via Meridian `/v1/raster-warp` and elevation extraction. Streets, parcels, and buildings are fictional but elevation-consistent with the real terrain.

**Layers generated:**
- **Streets** — valley floor arterial (FR 25 alignment, ~3 mi), residential collectors (~4 mi, dead-end + cul-de-sacs), commercial core grid (~1.5 mi). All centerlines properly noded at intersections. EPSG:2920 (WA State Plane South, US feet).
- **Parcels** — ~320 residential parcels (0.25–1 ac each), ~15 commercial parcels, ~8 municipal/utilities parcels. Polygons properly closed, lot IDs, acreage, zone codes.
- **Building footprints** — rectangular/irregular footprints per parcel, all at LIDAR-derived grade elevation. ~340 total.
- **Sewer network** — ~110 pipes, ~95 manholes, 3 lift stations, outfall. All invert elevations from LIDAR. Real topographic alignment.
- **Water network** — ~85 water mains, ~75 demand nodes, 3 tanks, 2 PRVs, 6 fire hydrants. All elevations from LIDAR.
- **Utility sites** — treatment plant structures, water treatment building, lift station buildings, tank pads. Accurate polygon outlines.
- **District boundaries** — sewer district boundary, water district boundary, pressure zone boundaries, zoning overlay.

**Elevation workflow:** USGS 3DEP LIDAR bare-earth DEM (1/9 arc-second, ~3.7m resolution) for the Upper South Fork Skokomish Valley quadrangle (Mount Lincoln / Mount Stone). `GET /v1/raster-warp` reprojects to EPSG:2920. `GET /v1/raster/geotiff` extracts values at node XY coordinates. All pipe inverts, node rim elevations, street centerline Z-values, and building grade elevations are LIDAR-derived from the real terrain.

---

## 🏔️ Demo Project: Gault's Gulch SD

A fictional mountain community built specifically to showcase SEWA's full capabilities. Lives in the app as a pre-loaded sample project. Users can open it, see realistic results immediately, and explore all features without uploading their own data.

### Location: Upper Hamma Hamma River Valley, Olympic Peninsula, WA
- Center: ~47.55°N, 123.08°W
- USGS 3DEP LIDAR: full coverage at 1/9 arc-second bare-earth DEM — dramatic steep-walled glacial valley
- Glacial valley floor: ~400 ft NAVD88
- Ridge tops: 2,500–3,500 ft NAVD88 within 1–2 miles horizontal
- Typical slope: 30–50% on valley walls; 60–80%+ in headwall areas
- USGS topographic quadrangle: Mount Lincoln
- nearby community reference: upper Hamma Hamma River drainage (no actual community there — purely fictional)

### Why This Location?
The extreme terrain forces every interesting engineering challenge:
- **Steep gravity pipes** — 40–60% grades on valley wall pipes; demonstrate min slope validation errors and scouring velocity warnings
- **Multiple lift stations** — three lift stations pump sewage up and over intervening ridgelines to the treatment plant (no single gravity path to outfall)
- **Complex force main routing** — force mains run along valley floors and ridge tops, requiring careful head/pressure calculations
- **Surcharge scenario** — one basin shows >100% utilization at current load (existing system is at capacity)
- **Growth projection scenario** — planned 200-lot residential development on south bench triggers surcharge on trunk main; demonstrates growth modeling
- **High I&I** — old vitrified clay pipe in valley floor; 35% I&I factor; demonstrates I&I impact on capacity
- **Pressure sewer area** — steep hillside parcels use grinder pump pressure sewer (force main to nearest MH) instead of gravity
- **Water system complexity** — three pressure zones due to 700 ft elevation spread; fire flow analysis critical in forested terrain; booster pumping for ridge-top developments

### Water System Details
Three pressure zones due to terrain:
- **Zone 1** (valley floor, 400 ft): lowest zone, gravity from reservoir, domestic + fire flow
- **Zone 2** (south bench, 800 ft): booster pump station, 200 ft of head, ~87 PSI at customers
- **Zone 3** (north bench, 1,200 ft): separate ridge-top reservoir, 350 ft of head, PRV at zone boundary
- Fire flow requirement: 1,500 GPM at 20 PSI residual in commercial core; 1,000 GPM in residential
- Two fire hydrants in the commercial zone have field flow test data: 1,800 GPM at 42 PSI static, 1,500 GPM at 22 PSI residual

### Sewer System Details
Gravity trunk mains in valley floor and along valley walls. Three lift stations:
- **LS-1** (south bench): 150 GPM, pumps up 250 ft to MH-14 on ridge
- **LS-2** (valley floor): 300 GPM, pumps up 180 ft to MH-22, south of treatment plant
- **LS-3** (north bench): 200 GPM, pumps up 120 ft to MH-31, feeds directly to treatment plant headworks

Treatment plant at elevation 850 ft receives all three force mains. Land application site in valley floor southwest of commercial core (spray field, 40 acres, permitted for 50,000 GPD average dry weather flow).

### Basins (5 sanitary sewer basins)
| Basin | Area | Current EDU | Future EDU (5yr) | I&I Factor | Notes |
|-------|------|-------------|-----------------|------------|-------|
| A — Valley Floor | 42 ac | 340 EDU | 380 EDU (+40 from new subdivision) | 35% | Old VC pipe, high I&I |
| B — South Bench | 28 ac | 185 EDU | 320 EDU (+135 from approved development) | 20% | Proposed development drives surcharge |
| C — North Bench | 19 ac | 95 EDU | 105 EDU | 15% | Lower density |
| D — Commercial Core | 12 ac | 210 EDU | 240 EDU | 10% | High density, low I&I |
| E — Resort | 8 ac | 280 EDU | 280 EDU | 10% | Seasonal variation (peak 2× average) |

### Pipe Network (~110 pipes total)
Mix of gravity and force mains:
- Valley floor trunk: 12" and 15" VC, installed 1978–1985, Manning's n = 0.015
- Valley wall laterals: 8" PVC, installed 1995–2010, Manning's n = 0.011
- Force mains: 4" and 6" HDPE DR11, installed 2005–2018, C-factor = 120
- South bench pressure sewer: 2" HDPE DR17, grinder pump installations, 2019–2022

### Growth Scenario
Proposed 200-lot residential development ("Gault's Gulch South Ridge") on south bench adds 135 EDU over 5 years. Pipeline reach from MH-8 → MH-14 is already identified as the critical trunk that would surcharge under proposed future flow. Demonstrates: scenario comparison, CIP identification, growth modeling.

### Demo Capabilities Shown
- All 4 tabs: import (shapefile pre-loaded), validate (some intentional errors to demo), analyze (results immediate), export (all formats)
- Red halo on 3 intentionally bad pipes (missing invert, diameter too small, I&I over threshold)
- Capacity utilization: Basin B trunk main at 87% current → 112% future (surcharge flagged)
- LIDAR elevation fetch: click any node without invert data → USGS 3DEP fetch via Meridian → elevation populated
- Growth scenario: run current → run future → compare side-by-side
- Water: fire flow analysis at hydrant HF-1 shows available flow of 1,420 GPM at 20 PSI (below 1,500 GPM required — deficiency flagged)
- HGL profile: trace from MH-1 upstream through LS-1 → MH-14 → LS-2 → treatment plant
- Comments: one pinned comment on MH-22: "verify invert in field — old record may be wrong"
- Snapshots: "Pre-development" snapshot vs current state vs proposed CIP

### Data Files
- Shapefile package: `gaults-gulch-sewer.zip` (~150 KB) — all 6 sewer layers
- Shapefile package: `gaults-gulch-water.zip` (~80 KB) — all 5 water layers
- LIDAR coverage: confirmed from USGS 3DEP for this quadrangle (Mount Lincoln, WA)
- Location: stored in app as built-in sample project; also available for download separately

---

## 💧 Water Distribution Layers & Attributes

### Water Mains (required)
`pipe_id`, `from_node`, `to_node`, `diameter` (inches), `material` (PVC/concrete/DI/HDPE/steel), `hazen_williams_C` (auto from material), `length` (auto from geometry), `installation_year`, `pressure_rating` (PSI)

### Junction / Demand Nodes
`node_id`, `x`, `y`, `elevation` (ft NAVD88), `demand_gpm` (or `population_served` + `per_capita_demand`), `demand_type` (residential/commercial/industrial/institutional)

### Fire Hydrants
`hydrant_id`, `x`, `y`, `elevation`, `flow_test_gpm` (from field flow test), `residual_pressure_psi`

### Tanks / Reservoirs
`tank_id`, `x`, `y`, `min_elevation` (ft NAVD88), `max_elevation`, `diameter_or_area`, `current_level_ft`

### Pumps / Boosters
`pump_id`, `x`, `y`, `pump_curve_data` (JSON: GPM × feet pairs), `pump_type` (fixed_speed/variable_speed), `discharge_node_id`, `suction_node_id`

### Pressure Reducing Valves (PRV)
`prv_id`, `x`, `y`, `setpoint_psi`, `upstream_node_id`, `downstream_node_id`

---

## 📝 Open Questions

1. **Domain name** — sewa.app taken. Options: sewerflow.app, sewernet.app, sewasuite.app, hydraulics.app, or TBD. Eian to decide.
2. **Domain registrar** — who holds it? Eian to register preferred domain.
3. **Stripe test mode** — wire before any real billing.
4. **WA State reporting format** — confirm exact table/narrative requirements with Eian's district contact.
5. **Water modeling scope** — how deep? Fire flow + demand is v1. Water hammer/surge is parking lot for now.
6. **Branded PDF reports** — do we build this v1 or defer?
7. **CAD (AutoCAD .dxf) import** — districts often only have CAD drawings, not GIS. Is this v1 scope?
8. **White-label / private-label** — sell to engineering firms who want their own branded version?
9. **Gault's Gulch GIS package** — confirm Python/shapely approach for generating all layers with real LIDAR elevations is acceptable.
