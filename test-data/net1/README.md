# AquaFlow Test Data — Net1 (EPA Example Network 1)

**Source:** EPA / OpenWaterAnalytics `epanet-example-networks`  
**Original file:** `NET1-3.inp` — a simple water distribution network with chlorine decay modeling  
**CRS:** State plane feet (EPSG:2249 — NAD83 / California zone 6, feet)  
**Coordinates:** Grid units from original EPANET file (not geographic)

## What's in this directory

```
net1/
├── README.md              ← this file
├── Net1.inp               ← original EPANET .inp file (as downloaded)
├── pipes.geojson          ← AquaFlow pipes layer (12 pipes)
├── junctions.geojson      ← AquaFlow junctions layer (11 nodes)
└── aquaflow-project.json  ← full AquaFlow project file (GeoJSON + metadata)
```

## Network summary

| Element | Count | Notes |
|---------|-------|-------|
| Pipes | 12 | 6–18 inch diameter, all PVC (Hazen-Williams C=100) |
| Junctions | 9 | Demand nodes with elevation and demand |
| Reservoirs | 1 | Node 9 — fixed head at elevation 800 ft |
| Tanks | 1 | Node 2 — storage tank |
| Pumps | 1 | Pump 9 — Reservoir 9 to Junction 10 |

## Expected solve results (baseline)

When run through EPANET steady-state (Hazen-Williams):

| Metric | Expected range |
|--------|---------------|
| Tank 2 level | 120 ft (initial) |
| Junction pressures | 55–95 PSI (varies by demand and elevation) |
| Pipe velocities | < 5 fps throughout (all within limits) |
| Total system demand | ~1,050 GPM |

## Using these files

**For import testing:**
Import `pipes.geojson` and `junctions.geojson` separately via the schema mapper.

**For EPANET solver testing:**
Use `Net1.inp` directly with WNTR/Python to validate the solver output matches EPANET desktop results.

**For full project testing:**
Use `aquaflow-project.json` — pre-loaded project that can be imported directly (v2 import path).

## Schema mapping (for reference)

| AquaFlow field | Source from .inp |
|----------------|-----------------|
| pipe_id | [PIPES] ID |
| from_node | [PIPES] Node1 |
| to_node | [PIPES] Node2 |
| diameter | [PIPES] Diameter (inches) |
| length | [PIPES] Length (ft) |
| hazen_williams_C | [PIPES] Roughness (H-W factor, 100 = smooth PVC) |
| material | Derived — all set to "PVC" (typical for modern pipe) |
| node_id | [JUNCTIONS] ID |
| elevation | [JUNCTIONS] Elev (ft) |
| demand_gpm | [JUNCTIONS] Demand (GPM, converted from cfs × 448.83) |
| node_type | reservoir / tank / junction |

**C-factor note:** Net1 uses H-W roughness = 100 throughout. This is unusually smooth (PVC is typically 140). Real-world old cast iron might be 130 or lower. The test data uses C=100 as-is from the original EPA file.