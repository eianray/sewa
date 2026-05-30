# AquaFlow — Cleanup Specification
## Chunk 0: Foundation Clean

**Purpose:** Strip SEWA from the codebase, rename to AquaFlow, keep everything water-relevant, deploy clean.

---

## Audit Results

### Files to DELETE (sewer-only, never used in water)

| File | Reason |
|------|--------|
| `src/types/facility.ts` | WWTP, lift station, CSO, SSO, outfall — all sewer facility types |
| `src/lib/simulation.ts` | Manning's sewer simulation engine (Hazen-Williams incoming) |
| `src/lib/schematicLayout.ts` | Sewer subway-map layout (hierarchical by upstream depth) |
| `src/components/FacilityPalette.tsx` | Sewer facility palette (WWTP, lift stations, etc.) |
| `src/components/SchematicCanvas.tsx` | Schematic/sewerrun view (subway map) |
| `src/components/SimulationPanel.tsx` | Sewer simulation results panel |
| `src/components/ViewToggle.tsx` | Geographic/schematic toggle (schematic is sewer-only) |

**Total: 7 files deleted.** No sewer code remains after this.

---

### Files to REWRITE (SEWA branding → AquaFlow)

These require text changes but the logic is reusable:

| File | Changes needed |
|------|---------------|
| `src/app/page.tsx` | "SEWA" logo → "AquaFlow", "Sewer & Water Analysis" → "Water Distribution Analysis", `signInWithPassword` → `signInWithOtp` (magic link), remove password field, keep email |
| `src/app/auth/login/page.tsx` | "SEWA" → "AquaFlow", "Sewer & Water Analysis" → remove, already uses magic link ✓ |
| `src/app/dashboard/page.tsx` | "SEWA" references → "AquaFlow", remove all sewer UI strings (facility counts, sewer project types, etc.) |
| `src/app/layout.tsx` | `title: "Create Next App"` → `title: "AquaFlow"`, `description` → water-appropriate |
| `src/types/network.ts` | Remove `manhole`, `inlet`, `outlet`, `lift_station` from `NodeType`. Remove `gravity`, `force_main` from `PipeType`. Add `reservoir`, `tank` to `NodeType`. Rename `invert_elev`, `rim_elev` → `elevation`. |
| `src/types/project.ts` | Keep — no sewer references. `boundary_geojson`, `dem_tile` also kept (may be useful for study area delineation in water analysis). |

---

### Files to KEEP (water-relevant or shared)

| File | Why kept |
|------|---------|
| `src/app/project/page.tsx` | Project detail view — needs rewording but structure is reusable |
| `src/components/MapCanvas.tsx` | Base map canvas — works for water, just needs new layer types |
| `src/components/ImportButton.tsx` | Shapefile import button — already format-agnostic |
| `src/components/ImportPanel.tsx` | Import panel — already format-agnostic |
| `src/components/ElementPalette.tsx` | Sidebar element palette — needs new water element types but structure is reusable |
| `src/components/PropertiesPanel.tsx` | Properties panel for selected features — works for water |
| `src/lib/geoImport.ts` | Shapefile + GeoJSON parsing — already format-agnostic |
| `src/lib/meridian.ts` | Meridian API client — used for GIS preprocessing |
| `src/lib/elevation.ts` | LIDAR elevation fetch — used for node elevation |
| `src/lib/lidarElevation.ts` | Meridian elevation fetch — used for DEM/lidar |
| `src/lib/demSampler.ts` | DEM sampling — useful for water node elevation |
| `src/lib/supabase.ts` | Supabase auth client — keep as-is |
| `src/app/auth/callback/page.tsx` | Auth callback — keep as-is |
| `src/app/dashboard/NewProjectModal.tsx` | New project modal — keep, needs text changes |

---

## Type Rewrite Details (network.ts)

**Current (sewer) → New (water):**

```ts
// OLD — sewer types
export type NodeType = "manhole" | "inlet" | "outlet" | "junction" | "lift_station";
export interface NetworkNode {
  id: string;
  project_id: string;
  user_id: string;
  type: NodeType;
  label: string;
  lat: number;
  lng: number;
  invert_elev: number | null;   // sewer invert
  rim_elev: number | null;       // sewer rim
  properties: Record<string, unknown>;
  created_at: string;
}

// NEW — water types
export type NodeType = "junction" | "reservoir" | "tank";

export interface NetworkNode {
  id: string;
  project_id: string;
  user_id: string;
  type: NodeType;
  label: string;
  x: number;           // easting (was lng)
  y: number;           // northing (was lat)
  elevation: number | null;  // NAVD88 ft (was invert_elev)
  demand_gpm: number | null;
  hazen_williams_C: number | null;
  properties: Record<string, unknown>;
  created_at: string;
}

// OLD — sewer pipe
export type PipeMaterial = "PVC" | "RCP" | "HDPE" | "DI";
export type PipeType = "gravity" | "force_main";
export interface NetworkPipe {
  id: string;
  project_id: string;
  user_id: string;
  label: string;
  from_node_id: string | null;
  to_node_id: string | null;
  diameter_in: number;
  length_ft: number | null;
  slope_pct: number | null;
  material: PipeMaterial;
  pipe_type: PipeType;
  properties: Record<string, unknown>;
  created_at: string;
}

// NEW — water pipe
export type PipeMaterial = "PVC" | "HDPE" | "DIP" | "Concrete" | "Steel" | "Cast_Iron";

export interface NetworkPipe {
  id: string;
  project_id: string;
  user_id: string;
  label: string;
  from_node_id: string | null;
  to_node_id: string | null;
  diameter_in: number;
  length_ft: number | null;
  hazen_williams_C: number | null;
  material: PipeMaterial;
  installation_year: number | null;
  properties: Record<string, unknown>;
  created_at: string;
}
```

**Changes summary:**
- `lat/lng` → `x/y` (more generic, works for any CRS)
- `invert_elev` → `elevation`
- `rim_elev` → removed (no rim in water model)
- `slope_pct` → removed (not used in Hazen-Williams, roughness is in C-factor)
- `pipe_type` → removed (gravity/force_main is sewer)
- `demand_gpm` added to nodes
- `hazen_williams_C` added to nodes (for demand allocation)
- `installation_year` added to pipes

---

## Auth Change (app/page.tsx — landing)

Current: `signInWithPassword` (email + password)

New: `signInWithOtp` (magic link only — no password needed, matches the login page)

Keep email input. Remove password input. Button: "Get Started" or "Send Magic Link". On success: "Check your email for the magic link!"

---

## Dashboard Changes (dashboard/page.tsx)

- Top bar: "SEWA" → "AquaFlow", subtitle → "Water Distribution Analysis"
- Project card: remove sewer-specific stats
- "New Project" button: keep, but modal text changes to water context
- Project list: existing projects shown as cards (no project type filter needed)

---

## MapCanvas Changes (MapCanvas.tsx)

- Layer visibility: currently `nodes | pipes | basins | facilities`
- New visibility: `pipes | junctions | tanks | hydrants`
- When analysis results come back: color pipes by velocity, nodes by pressure
- No schematic view toggle (that's sewer)

---

## New Types to Add

```ts
// src/types/water.ts (new file)

export type HydrantNode = NetworkNode & {
  node_type: "hydrant";
  flow_test_gpm: number | null;
  residual_psi: number | null;
};

export type PumpNode = NetworkNode & {
  node_type: "pump";
  suction_node: string;
  discharge_node: string;
  pump_curve: PumpCurve | null;
  pump_type: "fixed_speed" | "variable_speed";
};

export interface PumpCurve {
  points: Array<{ gpm: number; head_ft: number }>;
}

export interface PipeResult {
  pipe_id: string;
  flow_gpm: number;
  velocity_fps: number;
  headloss_ft_per_1000ft: number;
  status: "ok" | "warning" | "error";
}

export interface NodeResult {
  node_id: string;
  pressure_psi: number;
  elevation_ft: number;
  demand_gpm: number;
  status: "ok" | "warning" | "error";
}

export interface SteadyStateResult {
  pipes: PipeResult[];
  nodes: NodeResult[];
  summary: {
    total_pipes: number;
    total_nodes: number;
    pipes_over_velocity: number;
    nodes_under_pressure: number;
  };
}
```

---

## Landing Page Text (page.tsx)

**Old:** "SEWA — Sewer & Water Analysis"
**New:** "AquaFlow — Water Distribution Analysis"
**Sub:** "Free browser-based hydraulic modeling. No licenses. No downloads."

---

## Post-Cleanup Verification

After cleanup, run these searches to confirm no sewer code remains:

```bash
# Must return zero results
grep -r "manhole\|inlet\|outlet\|lift_station\|invert\|rim_elev\|slope_pct\|gravity\|force_main\|WWTP\|CSO\|SSO\|MODL\|SWMM\|HGL\|I&I" src/ --include="*.ts" --include="*.tsx" -i

# Must find only AquaFlow references
grep -r "SEWA\|Sewer & Water" src/ --include="*.ts" --include="*.tsx" -i
# Expected: zero results
```

---

## Step-by-Step Execution

### Step 1: Delete sewer-only files

```bash
rm src/types/facility.ts
rm src/lib/simulation.ts
rm src/lib/schematicLayout.ts
rm src/components/FacilityPalette.tsx
rm src/components/SchematicCanvas.tsx
rm src/components/SimulationPanel.tsx
rm src/components/ViewToggle.tsx
```

### Step 2: Rewrite types/network.ts

Replace with water types (see Type Rewrite Details above).

### Step 3: Add src/types/water.ts

New file with `PipeResult`, `NodeResult`, `SteadyStateResult`, `PumpCurve` types.

### Step 4: Rewrite app/page.tsx

- Branding: SEWA → AquaFlow
- Auth: password → magic link (signInWithOtp)
- Remove password field

### Step 5: Rewrite src/app/auth/login/page.tsx

- Branding: SEWA → AquaFlow
- Subtitle: remove "Sewer & Water Analysis"

### Step 6: Rewrite src/app/layout.tsx

- Metadata: "AquaFlow" title and description

### Step 7: Rewrite src/app/dashboard/page.tsx

- Branding, remove sewer-specific UI strings

### Step 8: Rewrite src/components/MapCanvas.tsx

- Remove schematic view references
- Update layer visibility keys

### Step 9: Create src/app/(marketing)/page.tsx

Create the AquaFlow landing page (new route group):
- Hero: "Free water distribution hydraulic modeling"
- Feature list: steady-state analysis, fire flow, no installs
- Call to action: "Get Started" → sends magic link
- Dark glassmorphism design, consistent with the app aesthetic

### Step 10: Create src/app/(app)/page.tsx

Create the main app page (new route group):
- Move current dashboard content here
- Sidebar + map canvas
- Project list / new project

### Step 11: Update globals.css

Create `src/styles/globals.css`:
- Dark background: `#0a0f1e`
- Surface: `rgba(15, 23, 42, 0.95)` glassmorphism
- Accent: `#3b82f6` (electric blue)
- Text: `#f8fafc` primary, `#94a3b8` muted
- Pipe velocity colors: green/yellow/red
- Node pressure colors: red/yellow/green/blue

### Step 12: Git init + initial commit

```bash
cd ~/workspace/projects/1_Dev\ Programs/SEWA
git init
git add .
git commit -m "AquaFlow: initial water-only cleanup, SEWA branding removed"
git remote add origin https://github.com/eianray/aquaflow.git
git push -u origin main
```

### Step 13: Deploy to Cloudflare Pages

Deploy from `src/` directory. Set build command: `npm run build`. Set output directory: `.next`.

---

## Definition of Done

- Zero sewer references remain in the codebase
- Landing page at `/` shows AquaFlow branding and "Get Started" magic link flow
- Auth flow: magic link email → callback → app
- App at `/app` shows project list and can create new projects
- Git repo is clean and pushed to GitHub `eianray/aquaflow`
- Deployed to Cloudflare Pages and smoke-tested in browser