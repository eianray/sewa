# SEWA / MODL — Grok-Generated Specification

> Grok produced this spec without knowledge of prior MODL planning discussions.
> This file is the raw Grok output, preserved for reference during integration.

## Project Name
**SEWA — Sewer & Water Analysis** (internal name: MODL)

## Tagline
"Sewer modeling should be fun."

## Overall Vision
Web-based SaaS tool combining precision of PCSWMM with game-like UX (SimCity/Cities: Skylines feel). Target: low-tech planners, small municipalities, solo GIS/civil consultants, engineering teams.

### Key Principles
- Delightful/forgiving UX first (animations, feedback, playful tone, auto-suggestions)
- Accuracy via EPA SWMM 5 (dynamic wave routing, St. Venant) — don't reinvent hydraulics
- Minimal viable scope: essential sewer elements only
- Hybrid freemium: generous free data prep, monetize simulation runs
- Turnkey delivery with marketing site

---

## 1. SaaS Architecture
- Auth: org-based tenancy, roles (Admin/Editor/Viewer), row-level security
- Projects: CRUD, duplicate, archive, share, version history
- File storage: GeoJSON, Shapefiles, DEMs, simulation outputs; tier-based quotas
- Background jobs: Celery/BullMQ for SWMM sims, real-time progress via WebSocket/polling
- Stripe: subscriptions, customer portal, webhooks, usage metering
- Marketing site: Next.js (sewa.app), hero/features/demo/pricing/FAQ/sign-up flow

### Deployment
Docker Compose + Vercel (frontend + marketing) + Supabase/Postgres (auth + DB) + backend host (Render/Fly.io/self-host). Env var templates included.

---

## 2. Pricing Tiers (Hybrid Freemium)

| Tier | Price | Projects | Nodes | Sims/mo | Features |
|------|-------|----------|-------|---------|----------|
| **Free/Starter** | $0 | 1–3 | ≤500 | 0 | Upload, import, cleanup, editing, 2D/3D view, basic GeoJSON export. No simulation results. |
| **Consultant** | $29/mo or $290/yr (single-user, no invites) | Unlimited | ≤2,000 | 100 | Full results, PDF reports, exports |
| **Pro** | $49/mo or $490/yr (per org) | Unlimited | Higher | More | Multi-user, collaboration |
| **Team/Municipal** | $149/mo or $1,490/yr (per org) | Unlimited | Unlimited | Unlimited | Audit logs, priority support |
| **Enterprise** | Custom | Custom | Custom | Custom | White-label, SSO, SLA |

Optional: pay-per-simulation (~$5–10) for non-subscribers.

Competitor pricing undercut: PCSWMM $1,600–2,400/yr, Bentley OpenFlows ~$982+, InfoWorks ICM ~$1,500+/mo. SEWA undercuts by 70–90%.

---

## 3. UX (Game-Like)
- Tailwind + shadcn/ui, dark/light themes, desktop-first responsive
- Drag-and-drop elements (auto-snap, undo/redo, copy/paste)
- Real-time validation with gentle warnings (red glow invalid, green check valid)
- Playful tone: "Network flowing smoothly!" tooltips
- First-project wizard with confetti/achievement animations
- Context-sensitive help icons everywhere

---

## 4. Mapping & Visualization
- **2D**: MapLibre GL JS (open-source), OSM/satellite/terrain baselayers
- **3D**: Three.js (React-Three-Fiber) or Cesium, one-click toggle
  - Pipes as extruded cylinders with accurate diameters
  - Nodes as manholes/structures
  - Animated water flow (pulsing particles)
  - 45° oblique/isometric default camera
  - Optional terrain from DEM
- Results overlay: color gradients (depth/velocity/utilization), animated arrows, flood highlights

---

## 5. Sewer Flow Modeling (EPA SWMM 5)
- Elements: Junctions/Manholes, Conduits/Pipes (gravity + force mains), Pumps, Outfalls, Subcatchments
- Backend: PySWMM or .inp file generation + execution
- Force main support: pressure pipes, pump curves (off/single-speed/variable), head calculations
- Outputs: flows, depths, velocities, surcharge/flooding warnings
- Visualization: tables, hydrographs, longitudinal profiles, map overlays
- Export: SWMM .inp, GeoJSON, PDF reports

---

## 6. Meridian Integration
Base: `https://meridian.nodeapi.ai/v1`
Endpoints: reproject, buffer, clip, dissolve, convert, schema, validate, repair, union, intersect, difference, hillshade, slope, contours, raster-calc
- x402 payment flow (USDC/Base) with graceful user prompts
- Fallbacks for missing features (e.g., watershed delineation via contours+slope)

---

## 7. Data Validation & Problem Flagging
"Issues Dashboard" after upload/import/edits:
- Color-coded map highlights + severity list (error/warning/info)
- Flags: missing attributes, topology problems, undersized pipes, low slope <0.5%, pump capacity mismatch
- One-click auto-fix where safe
- Game-like tone, not punitive

---

## 8. Data Model (Full Schema)

### Junctions/Manholes
ID, coordinates, invert_in, invert_out, ground_elevation, max_depth, initial_depth, surcharge_allowed, dry_weather_flow_avg/peak

### Pipes/Conduits
ID, from_node, to_node, length (auto/manual), diameter/shape, roughness (Manning's n), slope (auto), max_flow, loss_coefficients, is_force_main (bool), pressure_rating

### Pumps
ID, from_node, to_node, curve_type, coefficients, shutoff_head, design_point

### Outfalls
ID, invert_elevation, type (free/fixed/tidal), tide_gate

### Subcatchments
ID, area, impervious_percent, slope, width, roughness, outlet_node

Smart auto-calcs (slope from inverts), US/metric toggle.

---

## 9. Help System
- Searchable in-app help center (guides, glossary, tooltips)
- Context-sensitive "?" icons on every field/tool
- "Ask AI Assistant" button → forwards to OpenClaw/LLM with context

---

## 10. Production Requirements
- Security: input sanitization, rate limiting, audit logging
- Liability disclaimer: "planning/educational tool only — consult licensed engineer"
- Sample starter projects (small residential, simple trunk sewer)
- Performance: LOD for 3D, throttled animations, large network handling
- Accessibility: keyboard nav, high-contrast, ARIA labels
- Onboarding flow with tutorial

---

## Recommended Tech Stack
- **Frontend**: Next.js 15 App Router + TypeScript + Tailwind CSS + shadcn/ui + MapLibre GL JS + React-Three-Fiber
- **Backend**: Python FastAPI (PySWMM + spatial libs) or Node.js
- **Database**: PostgreSQL + PostGIS
- **Auth/Storage**: Supabase (or Clerk + S3-compatible)
- **Queue**: Celery/RabbitMQ or BullMQ

---

## Delivery
1. Architecture diagram (text/Mermaid)
2. Implementation roadmap (5 phases)
3. README with setup, env vars, Stripe test, Meridian API, deployment
4. Initial scaffolding (auth, map, project CRUD)
