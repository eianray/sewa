/**
 * seed-gaults-gulch.mjs
 * ======================
 * Seeds the Gault's Gulch sanitary sewer network into Supabase.
 *
 * Project: 6b33bc00-932a-4407-b9b1-7abb5b2a334b
 * User:    0dd6e54a-a3e3-4b4e-9380-c180f9ad774f
 *
 * Run:  node scripts/seed-gaults-gulch.mjs
 */

import pg from "pg";
const { Client } = pg;

const DB_URL =
  "postgresql://postgres:Trogon123%24%24%24@db.iomtesrpjaomxgtgtxks.supabase.co:5432/postgres";

const PROJECT_ID = "6b33bc00-932a-4407-b9b1-7abb5b2a334b";
const USER_ID    = "0dd6e54a-a3e3-4b4e-9380-c180f9ad774f";

// ── Coordinate system ─────────────────────────────────────────────────────────
// South Fork Skokomish Valley, Olympic Peninsula WA
// Valley floor ≈ 1,050–1,200 ft; ridge ≈ 2,400–2,700 ft
// Community: ~5.5 miles N-S × 1.5 miles E-W
//
// Lat ° → ft: 1° ≈ 364,000 ft  →  1 mile ≈ 14,510 µ°
// Lng ° → ft: 1° ≈ 364,000 × cos(47.5°) ≈ 246,000 ft  →  1 mile ≈ 20,540 µ°
//
// NW corner:  47.518°N, 123.350°W
// SE corner:  47.478°N, 123.315°W
//
// Flow direction: south → north (upstream south end, downstream = north = Lake Cushman)
// Trunk main runs NNW from LS-1 (south) to TM-11 (north)

function coord(lat, lng) {
  return { lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6)) };
}

// ── Node definitions ──────────────────────────────────────────────────────────
// id, label, type, lat, lng, rim_elev (ft), invert_elev (ft)
const NODES = [

  // ── TRUNK MAIN (12 nodes, south → north) ──────────────────────────────
  // TM-01: upstream end of trunk (south)
  { id:"TM-01", label:"TM-01", type:"manhole",   lat:47.4790, lng:-123.3490, rim:1180, inv:1174 },
  { id:"TM-02", label:"TM-02", type:"manhole",   lat:47.4815, lng:-123.3481, rim:1170, inv:1164 },
  { id:"TM-03", label:"TM-03", type:"manhole",   lat:47.4840, lng:-123.3472, rim:1160, inv:1154 }, // West R lateral tie
  { id:"TM-04", label:"TM-04", type:"manhole",   lat:47.4865, lng:-123.3463, rim:1150, inv:1144 }, // East R lateral tie
  { id:"TM-05", label:"TM-05", type:"manhole",   lat:47.4890, lng:-123.3454, rim:1140, inv:1134 }, // Commercial lateral tie
  { id:"TM-06", label:"TM-06", type:"manhole",   lat:47.4915, lng:-123.3445, rim:1130, inv:1124 }, // South R lateral tie
  { id:"TM-07", label:"TM-07", type:"manhole",   lat:47.4940, lng:-123.3436, rim:1120, inv:1114 },
  { id:"TM-08", label:"TM-08", type:"manhole",   lat:47.4965, lng:-123.3427, rim:1110, inv:1104 },
  { id:"TM-09", label:"TM-09", type:"manhole",   lat:47.4990, lng:-123.3418, rim:1100, inv:1094 }, // East H lateral tie
  { id:"TM-10",label:"TM-10", type:"manhole",   lat:47.5015, lng:-123.3409, rim:1090, inv:1084 },
  { id:"TM-11",label:"TM-11", type:"manhole",   lat:47.5040, lng:-123.3400, rim:1080, inv:1074 }, // North R lateral tie
  { id:"TM-12",label:"TM-12", type:"manhole",   lat:47.5065, lng:-123.3391, rim:1070, inv:1064 }, // LS-1 inlet

  // ── LIFT STATION 1 (south collection sump) ─────────────────────────────
  { id:"LS-01",label:"LS-01", type:"lift_station", lat:47.5068, lng:-123.3395, rim:1070, inv:1062 },

  // ── LIFT STATION 2 (ridge saddle, west) ────────────────────────────────
  { id:"LS-02",label:"LS-02", type:"lift_station", lat:47.5120, lng:-123.3620, rim:1250, inv:1242 },

  // ── TREATMENT FACILITY ──────────────────────────────────────────────────
  { id:"TF-01", label:"TF-01", type:"outlet",    lat:47.5145, lng:-123.3635, rim:1420, inv:1416 },

  // ════════════════════════════════════════════════════════════════════════
  // WEST RESIDENTIAL BASIN — 18 nodes
  // Area: NW quadrant of community, between Elkhorn Ridge and NF Skok
  // Lateral streets flow east → west into trunk at TM-03
  // Rim elev: 1,160–1,240 ft
  // ════════════════════════════════════════════════════════════════════════

  // Main west collector (7 nodes, flows east → trunk at TM-03)
  { id:"WR-01",label:"WR-01", type:"manhole", lat:47.4895, lng:-123.3575, rim:1220, inv:1214 },
  { id:"WR-02",label:"WR-02", type:"manhole", lat:47.4890, lng:-123.3555, rim:1210, inv:1204 },
  { id:"WR-03",label:"WR-03", type:"manhole", lat:47.4885, lng:-123.3535, rim:1200, inv:1194 },
  { id:"WR-04",label:"WR-04", type:"manhole", lat:47.4880, lng:-123.3515, rim:1195, inv:1189 }, // South lateral tie
  { id:"WR-05",label:"WR-05", type:"manhole", lat:47.4875, lng:-123.3495, rim:1190, inv:1184 }, // connects to TM-03
  { id:"WR-06",label:"WR-06", type:"manhole", lat:47.4870, lng:-123.3565, rim:1215, inv:1209 },
  { id:"WR-07",label:"WR-07", type:"manhole", lat:47.4865, lng:-123.3540, rim:1205, inv:1199 },

  // West residential laterals (continuing north)
  { id:"WR-08",label:"WR-08", type:"manhole", lat:47.4910, lng:-123.3570, rim:1230, inv:1224 },
  { id:"WR-09",label:"WR-09", type:"manhole", lat:47.4915, lng:-123.3545, rim:1225, inv:1219 },
  { id:"WR-10",label:"WR-10", type:"manhole", lat:47.4920, lng:-123.3520, rim:1220, inv:1214 },
  { id:"WR-11",label:"WR-11", type:"manhole", lat:47.4925, lng:-123.3495, rim:1215, inv:1209 }, // to TM-11

  // Upper bench laterals
  { id:"WR-12",label:"WR-12", type:"manhole", lat:47.4945, lng:-123.3580, rim:1240, inv:1234 },
  { id:"WR-13",label:"WR-13", type:"manhole", lat:47.4940, lng:-123.3555, rim:1235, inv:1229 },
  { id:"WR-14",label:"WR-14", type:"manhole", lat:47.4935, lng:-123.3530, rim:1230, inv:1224 },
  { id:"WR-15",label:"WR-15", type:"manhole", lat:47.4930, lng:-123.3505, rim:1225, inv:1219 },
  { id:"WR-16",label:"WR-16", type:"manhole", lat:47.4928, lng:-123.3480, rim:1210, inv:1204 },
  { id:"WR-17",label:"WR-17", type:"manhole", lat:47.4948, lng:-123.3600, rim:1245, inv:1239 },
  { id:"WR-18",label:"WR-18", type:"manhole", lat:47.4953, lng:-123.3575, rim:1240, inv:1234 },

  // ════════════════════════════════════════════════════════════════════════
  // EAST RESIDENTIAL BASIN — 18 nodes
  // Area: NE quadrant, above floodplain, east of valley floor
  // Lateral streets flow west → east into trunk at TM-04 and TM-09
  // Rim elev: 1,120–1,200 ft
  // ════════════════════════════════════════════════════════════════════════

  // Main east collector (7 nodes, flows west → trunk at TM-04)
  { id:"ER-01",label:"ER-01", type:"manhole", lat:47.4865, lng:-123.3375, rim:1190, inv:1184 },
  { id:"ER-02",label:"ER-02", type:"manhole", lat:47.4860, lng:-123.3355, rim:1185, inv:1179 },
  { id:"ER-03",label:"ER-03", type:"manhole", lat:47.4855, lng:-123.3335, rim:1180, inv:1174 },
  { id:"ER-04",label:"ER-04", type:"manhole", lat:47.4850, lng:-123.3315, rim:1175, inv:1169 },
  { id:"ER-05",label:"ER-05", type:"manhole", lat:47.4845, lng:-123.3295, rim:1170, inv:1164 },
  { id:"ER-06",label:"ER-06", type:"manhole", lat:47.4840, lng:-123.3275, rim:1165, inv:1159 },
  { id:"ER-07",label:"ER-07", type:"manhole", lat:47.4835, lng:-123.3255, rim:1160, inv:1154 },
  // North lateral from ER
  { id:"ER-08",label:"ER-08", type:"manhole", lat:47.4870, lng:-123.3330, rim:1185, inv:1179 },
  { id:"ER-09",label:"ER-09", type:"manhole", lat:47.4875, lng:-123.3305, rim:1180, inv:1174 },
  { id:"ER-10",label:"ER-10", type:"manhole", lat:47.4880, lng:-123.3280, rim:1175, inv:1169 },
  { id:"ER-11",label:"ER-11", type:"manhole", lat:47.4885, lng:-123.3255, rim:1170, inv:1164 },
  { id:"ER-12",label:"ER-12", type:"manhole", lat:47.4890, lng:-123.3230, rim:1165, inv:1159 },
  // East hillside lateral (steeper)
  { id:"ER-13",label:"ER-13", type:"manhole", lat:47.4860, lng:-123.3220, rim:1200, inv:1194 },
  { id:"ER-14",label:"ER-14", type:"manhole", lat:47.4855, lng:-123.3200, rim:1195, inv:1189 },
  { id:"ER-15",label:"ER-15", type:"manhole", lat:47.4850, lng:-123.3180, rim:1190, inv:1184 },
  { id:"ER-16",label:"ER-16", type:"manhole", lat:47.4845, lng:-123.3160, rim:1185, inv:1179 },
  { id:"ER-17",label:"ER-17", type:"manhole", lat:47.4840, lng:-123.3140, rim:1180, inv:1174 },
  { id:"ER-18",label:"ER-18", type:"manhole", lat:47.4835, lng:-123.3120, rim:1175, inv:1169 },

  // ════════════════════════════════════════════════════════════════════════
  // COMMERCIAL CORE BASIN — 16 nodes
  // Area: valley floor, mixed-use commercial district
  // Larger diameter pipes; 8" minimum
  // Rim elev: 1,060–1,120 ft
  // ════════════════════════════════════════════════════════════════════════

  // Commercial main collector (flows NW into trunk at TM-05)
  { id:"CC-01",label:"CC-01", type:"manhole", lat:47.4895, lng:-123.3420, rim:1130, inv:1124 },
  { id:"CC-02",label:"CC-02", type:"manhole", lat:47.4905, lng:-123.3405, rim:1125, inv:1119 },
  { id:"CC-03",label:"CC-03", type:"manhole", lat:47.4915, lng:-123.3390, rim:1120, inv:1114 }, // connects to TM-05
  { id:"CC-04",label:"CC-04", type:"manhole", lat:47.4900, lng:-123.3400, rim:1135, inv:1129 },
  { id:"CC-05",label:"CC-05", type:"manhole", lat:47.4908, lng:-123.3388, rim:1128, inv:1122 },
  { id:"CC-06",label:"CC-06", type:"manhole", lat:47.4915, lng:-123.3375, rim:1122, inv:1116 },
  { id:"CC-07",label:"CC-07", type:"manhole", lat:47.4920, lng:-123.3360, rim:1120, inv:1114 },
  { id:"CC-08",label:"CC-08", type:"manhole", lat:47.4925, lng:-123.3345, rim:1115, inv:1109 },
  { id:"CC-09",label:"CC-09", type:"manhole", lat:47.4930, lng:-123.3330, rim:1110, inv:1104 },
  // South commercial lateral
  { id:"CC-10",label:"CC-10", type:"manhole", lat:47.4885, lng:-123.3410, rim:1140, inv:1134 },
  { id:"CC-11",label:"CC-11", type:"manhole", lat:47.4878, lng:-123.3390, rim:1135, inv:1129 },
  { id:"CC-12",label:"CC-12", type:"manhole", lat:47.4872, lng:-123.3370, rim:1130, inv:1124 },
  // East commercial strip
  { id:"CC-13",label:"CC-13", type:"manhole", lat:47.4900, lng:-123.3365, rim:1138, inv:1132 },
  { id:"CC-14",label:"CC-14", type:"manhole", lat:47.4905, lng:-123.3348, rim:1133, inv:1127 },
  { id:"CC-15",label:"CC-15", type:"manhole", lat:47.4910, lng:-123.3330, rim:1128, inv:1122 },
  { id:"CC-16",label:"CC-16", type:"manhole", lat:47.4915, lng:-123.3312, rim:1123, inv:1117 },

  // ════════════════════════════════════════════════════════════════════════
  // EAST HILLSIDE BASIN — 14 nodes
  // Area: east side of valley, steeper terrain, older unplatted lots
  // Higher elevation; 6" minimum (small diameter acceptable)
  // Rim elev: 1,100–1,180 ft
  // ════════════════════════════════════════════════════════════════════════

  // East hillside collector (flows west → trunk at TM-09)
  { id:"EH-01",label:"EH-01", type:"manhole", lat:47.4995, lng:-123.3300, rim:1180, inv:1174 },
  { id:"EH-02",label:"EH-02", type:"manhole", lat:47.4990, lng:-123.3280, rim:1175, inv:1169 },
  { id:"EH-03",label:"EH-03", type:"manhole", lat:47.4985, lng:-123.3260, rim:1170, inv:1164 },
  { id:"EH-04",label:"EH-04", type:"manhole", lat:47.4980, lng:-123.3240, rim:1165, inv:1159 },
  { id:"EH-05",label:"EH-05", type:"manhole", lat:47.4975, lng:-123.3220, rim:1160, inv:1154 },
  { id:"EH-06",label:"EH-06", type:"manhole", lat:47.4970, lng:-123.3200, rim:1155, inv:1149 },
  { id:"EH-07",label:"EH-07", type:"manhole", lat:47.4965, lng:-123.3180, rim:1150, inv:1144 },
  { id:"EH-08",label:"EH-08", type:"manhole", lat:47.4960, lng:-123.3160, rim:1145, inv:1139 },
  { id:"EH-09",label:"EH-09", type:"manhole", lat:47.5000, lng:-123.3275, rim:1185, inv:1179 },
  { id:"EH-10",label:"EH-10", type:"manhole", lat:47.5005, lng:-123.3255, rim:1180, inv:1174 },
  { id:"EH-11",label:"EH-11", type:"manhole", lat:47.5010, lng:-123.3235, rim:1175, inv:1169 },
  { id:"EH-12",label:"EH-12", type:"manhole", lat:47.5015, lng:-123.3215, rim:1170, inv:1164 },
  { id:"EH-13",label:"EH-13", type:"manhole", lat:47.5020, lng:-123.3195, rim:1165, inv:1159 },
  { id:"EH-14",label:"EH-14", type:"manhole", lat:47.5025, lng:-123.3175, rim:1160, inv:1154 }, // to TM-09

  // ════════════════════════════════════════════════════════════════════════
  // MUNICIPAL / NORTH RESIDENTIAL BASIN — 14 nodes
  // Area: north end of community, higher elevation, rural residential
  // Rim elev: 1,100–1,180 ft
  // ════════════════════════════════════════════════════════════════════════

  // North residential collector (flows south → trunk at TM-11)
  { id:"NR-01",label:"NR-01", type:"manhole", lat:47.5050, lng:-123.3385, rim:1160, inv:1154 },
  { id:"NR-02",label:"NR-02", type:"manhole", lat:47.5045, lng:-123.3360, rim:1155, inv:1149 },
  { id:"NR-03",label:"NR-03", type:"manhole", lat:47.5040, lng:-123.3335, rim:1150, inv:1144 },
  { id:"NR-04",label:"NR-04", type:"manhole", lat:47.5035, lng:-123.3310, rim:1145, inv:1139 },
  { id:"NR-05",label:"NR-05", type:"manhole", lat:47.5030, lng:-123.3285, rim:1140, inv:1134 },
  { id:"NR-06",label:"NR-06", type:"manhole", lat:47.5028, lng:-123.3260, rim:1135, inv:1129 },
  { id:"NR-07",label:"NR-07", type:"manhole", lat:47.5060, lng:-123.3410, rim:1170, inv:1164 },
  { id:"NR-08",label:"NR-08", type:"manhole", lat:47.5055, lng:-123.3388, rim:1165, inv:1159 },
  { id:"NR-09",label:"NR-09", type:"manhole", lat:47.5050, lng:-123.3365, rim:1160, inv:1154 },
  { id:"NR-10",label:"NR-10", type:"manhole", lat:47.5048, lng:-123.3342, rim:1155, inv:1149 },
  { id:"NR-11",label:"NR-11", type:"manhole", lat:47.5043, lng:-123.3320, rim:1150, inv:1144 },
  { id:"NR-12",label:"NR-12", type:"manhole", lat:47.5068, lng:-123.3435, rim:1175, inv:1169 },
  { id:"NR-13",label:"NR-13", type:"manhole", lat:47.5072, lng:-123.3410, rim:1170, inv:1164 },
  { id:"NR-14",label:"NR-14", type:"manhole", lat:47.5076, lng:-123.3385, rim:1165, inv:1159 },
];

console.log(`Total nodes: ${NODES.length}`);

// ── Pipe definitions ──────────────────────────────────────────────────────────
// from, to, diameter_in, material
// slope_pct is computed from rim elevations (not stored — recomputed at sim time)
// Pipe material: PVC throughout (most common for new construction)
const PIPES = [

  // ── TRUNK MAIN ────────────────────────────────────────────────────────
  { from:"TM-01", to:"TM-02", dia:12, mat:"PVC" },
  { from:"TM-02", to:"TM-03", dia:12, mat:"PVC" },
  { from:"TM-03", to:"TM-04", dia:12, mat:"PVC" },
  { from:"TM-04", to:"TM-05", dia:12, mat:"PVC" },
  { from:"TM-05", to:"TM-06", dia:12, mat:"PVC" },
  { from:"TM-06", to:"TM-07", dia:12, mat:"PVC" },
  { from:"TM-07", to:"TM-08", dia:12, mat:"PVC" },
  { from:"TM-08", to:"TM-09", dia:12, mat:"PVC" },
  { from:"TM-09", to:"TM-10", dia:12, mat:"PVC" },
  { from:"TM-10",to:"TM-11",  dia:12, mat:"PVC" },
  { from:"TM-11",to:"TM-12",  dia:12, mat:"PVC" },
  { from:"TM-12",to:"LS-01",  dia:12, mat:"PVC" },

  // ── FORCE MAINS (lift station discharge) ─────────────────────────────
  // LS-01 → TM-11 (pumps north, then gravity takes over)
  { from:"LS-01",to:"TM-11",  dia:6,  mat:"HDPE" },
  // LS-02 → TF-01 (pumps to treatment)
  { from:"LS-02",to:"TF-01",  dia:6,  mat:"HDPE" },

  // ── WEST RESIDENTIAL LATERALS ──────────────────────────────────────────
  // Main west collector → trunk at TM-03
  { from:"WR-01",to:"WR-02",  dia:8,  mat:"PVC" },
  { from:"WR-02",to:"WR-03",  dia:8,  mat:"PVC" },
  { from:"WR-03",to:"WR-04",  dia:8,  mat:"PVC" },
  { from:"WR-04",to:"WR-05",  dia:8,  mat:"PVC" },
  { from:"WR-05",to:"TM-03",  dia:8,  mat:"PVC" },
  { from:"WR-06",to:"WR-02",  dia:6,  mat:"PVC" },
  { from:"WR-07",to:"WR-04",  dia:6,  mat:"PVC" },
  { from:"WR-08",to:"WR-09",  dia:8,  mat:"PVC" },
  { from:"WR-09",to:"WR-10",  dia:8,  mat:"PVC" },
  { from:"WR-10",to:"WR-11",  dia:8,  mat:"PVC" },
  { from:"WR-11",to:"TM-11",  dia:8,  mat:"PVC" },
  { from:"WR-12",to:"WR-13",  dia:6,  mat:"PVC" },
  { from:"WR-13",to:"WR-14",  dia:6,  mat:"PVC" },
  { from:"WR-14",to:"WR-15",  dia:6,  mat:"PVC" },
  { from:"WR-15",to:"WR-16",  dia:6,  mat:"PVC" },
  { from:"WR-16",to:"WR-05",  dia:6,  mat:"PVC" },
  { from:"WR-17",to:"WR-12",  dia:6,  mat:"PVC" },
  { from:"WR-18",to:"WR-13",  dia:6,  mat:"PVC" },

  // ── EAST RESIDENTIAL LATERALS ─────────────────────────────────────────
  // Main east collector → trunk at TM-04
  { from:"ER-01",to:"ER-02",  dia:8,  mat:"PVC" },
  { from:"ER-02",to:"ER-03",  dia:8,  mat:"PVC" },
  { from:"ER-03",to:"ER-04",  dia:8,  mat:"PVC" },
  { from:"ER-04",to:"ER-05",  dia:8,  mat:"PVC" },
  { from:"ER-05",to:"ER-06",  dia:8,  mat:"PVC" },
  { from:"ER-06",to:"ER-07",  dia:8,  mat:"PVC" },
  { from:"ER-07",to:"TM-04",  dia:8,  mat:"PVC" },
  { from:"ER-08",to:"ER-09",  dia:6,  mat:"PVC" },
  { from:"ER-09",to:"ER-10",  dia:6,  mat:"PVC" },
  { from:"ER-10",to:"ER-11",  dia:6,  mat:"PVC" },
  { from:"ER-11",to:"ER-12",  dia:6,  mat:"PVC" },
  { from:"ER-12",to:"TM-11",  dia:6,  mat:"PVC" },
  { from:"ER-13",to:"ER-14",  dia:6,  mat:"PVC" },
  { from:"ER-14",to:"ER-15",  dia:6,  mat:"PVC" },
  { from:"ER-15",to:"ER-16",  dia:6,  mat:"PVC" },
  { from:"ER-16",to:"ER-17",  dia:6,  mat:"PVC" },
  { from:"ER-17",to:"ER-18",  dia:6,  mat:"PVC" },

  // ── COMMERCIAL CORE LATERALS ───────────────────────────────────────────
  { from:"CC-01",to:"CC-02",  dia:10, mat:"PVC" },
  { from:"CC-02",to:"CC-03",  dia:10, mat:"PVC" },
  { from:"CC-03",to:"TM-05",  dia:10, mat:"PVC" },
  { from:"CC-04",to:"CC-05",  dia:8,  mat:"PVC" },
  { from:"CC-05",to:"CC-06",  dia:8,  mat:"PVC" },
  { from:"CC-06",to:"CC-07",  dia:8,  mat:"PVC" },
  { from:"CC-07",to:"CC-08",  dia:8,  mat:"PVC" },
  { from:"CC-08",to:"CC-09",  dia:8,  mat:"PVC" },
  { from:"CC-09",to:"TM-06",  dia:8,  mat:"PVC" },
  { from:"CC-10",to:"CC-11",  dia:8,  mat:"PVC" },
  { from:"CC-11",to:"CC-12",  dia:8,  mat:"PVC" },
  { from:"CC-12",to:"TM-04",  dia:8,  mat:"PVC" },
  { from:"CC-13",to:"CC-14",  dia:8,  mat:"PVC" },
  { from:"CC-14",to:"CC-15",  dia:8,  mat:"PVC" },
  { from:"CC-15",to:"CC-16",  dia:8,  mat:"PVC" },

  // ── EAST HILLSIDE LATERALS ────────────────────────────────────────────
  { from:"EH-01",to:"EH-02",  dia:6,  mat:"PVC" },
  { from:"EH-02",to:"EH-03",  dia:6,  mat:"PVC" },
  { from:"EH-03",to:"EH-04",  dia:6,  mat:"PVC" },
  { from:"EH-04",to:"EH-05",  dia:6,  mat:"PVC" },
  { from:"EH-05",to:"EH-06",  dia:6,  mat:"PVC" },
  { from:"EH-06",to:"EH-07",  dia:6,  mat:"PVC" },
  { from:"EH-07",to:"EH-08",  dia:6,  mat:"PVC" },
  { from:"EH-08",to:"TM-09",  dia:6,  mat:"PVC" },
  { from:"EH-09",to:"EH-10",  dia:6,  mat:"PVC" },
  { from:"EH-10",to:"EH-11",  dia:6,  mat:"PVC" },
  { from:"EH-11",to:"EH-12",  dia:6,  mat:"PVC" },
  { from:"EH-12",to:"EH-13",  dia:6,  mat:"PVC" },
  { from:"EH-13",to:"EH-14",  dia:6,  mat:"PVC" },
  { from:"EH-14",to:"TM-09",  dia:6,  mat:"PVC" },

  // ── NORTH RESIDENTIAL LATERALS ─────────────────────────────────────────
  { from:"NR-01",to:"NR-02",  dia:8,  mat:"PVC" },
  { from:"NR-02",to:"NR-03",  dia:8,  mat:"PVC" },
  { from:"NR-03",to:"NR-04",  dia:8,  mat:"PVC" },
  { from:"NR-04",to:"NR-05",  dia:8,  mat:"PVC" },
  { from:"NR-05",to:"NR-06",  dia:8,  mat:"PVC" },
  { from:"NR-06",to:"TM-12",  dia:8,  mat:"PVC" },
  { from:"NR-07",to:"NR-08",  dia:6,  mat:"PVC" },
  { from:"NR-08",to:"NR-09",  dia:6,  mat:"PVC" },
  { from:"NR-09",to:"NR-10",  dia:6,  mat:"PVC" },
  { from:"NR-10",to:"NR-11",  dia:6,  mat:"PVC" },
  { from:"NR-11",to:"TM-11",  dia:6,  mat:"PVC" },
  { from:"NR-12",to:"NR-13",  dia:6,  mat:"PVC" },
  { from:"NR-13",to:"NR-14",  dia:6,  mat:"PVC" },
  { from:"NR-14",to:"TM-12",  dia:6,  mat:"PVC" },
];

console.log(`Total pipes: ${PIPES.length}`);

// ── Helper: haversine distance in feet ──────────────────────────────────────
function distFt(lat1, lng1, lat2, lng2) {
  const R_ft = 20902231; // Earth radius in ft
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R_ft * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── Main ─────────────────────────────────────────────────────────────────────
const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  console.log("Connected to Supabase Postgres.");

  // Check if nodes already exist for this project
  const existing = await client.query(
    `SELECT COUNT(*) FROM network_nodes WHERE project_id = $1`,
    [PROJECT_ID]
  );
  if (parseInt(existing.rows[0].count) > 0) {
    console.log(`Project already has ${existing.rows[0].count} nodes — deleting first.`);
    await client.query(`DELETE FROM network_pipes WHERE project_id = $1`, [PROJECT_ID]);
    await client.query(`DELETE FROM network_nodes WHERE project_id = $1`, [PROJECT_ID]);
  }

  // ── Insert nodes ───────────────────────────────────────────────────────
  console.log("Inserting nodes…");
  let nodeInserts = 0;
  for (const n of NODES) {
    await client.query(
      `INSERT INTO network_nodes
         (id, project_id, user_id, type, label, lat, lng, invert_elev, rim_elev, properties)
       VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        PROJECT_ID, USER_ID, n.type, n.label,
        n.lat, n.lng, n.inv, n.rim,
        JSON.stringify({ source: "seed", burial_depth_ft: n.inv < n.rim ? n.rim - n.inv : 4 })
      ]
    );
    nodeInserts++;
    if (nodeInserts % 20 === 0) process.stdout.write(`  ${nodeInserts}/${NODES.length} nodes…\n`);
  }
  console.log(`  ✓ ${nodeInserts} nodes inserted.`);

  // ── Insert pipes ───────────────────────────────────────────────────────
  console.log("Inserting pipes…");
  let pipeInserts = 0;
  // Map readable IDs → DB UUIDs (needed because DB auto-generates UUIDs)
  const idMap = {};
  const allDbNodes = await client.query(
    `SELECT id, label FROM network_nodes WHERE project_id = $1`, [PROJECT_ID]
  );
  for (const row of allDbNodes.rows) idMap[row.label] = row.id;

  console.log(`  Resolved ${Object.keys(idMap).length} node UUIDs.`);

  for (const p of PIPES) {
    const fromDbId = idMap[p.from];
    const toDbId   = idMap[p.to];
    if (!fromDbId || !toDbId) {
      console.error(`  ERROR: missing DB UUID for pipe ${p.from}→${p.to}`);
      continue;
    }
    const fromNode = NODES.find(n => n.id === p.from);
    const toNode   = NODES.find(n => n.id === p.to);
    const lenFt  = distFt(fromNode.lat, fromNode.lng, toNode.lat, toNode.lng);
    // slope = (upstream_invert - downstream_invert) / length_ft * 100
    const slope  = ((fromNode.inv - toNode.inv) / lenFt) * 100;

    await client.query(
      `INSERT INTO network_pipes
         (id, project_id, user_id, label, from_node_id, to_node_id,
          diameter_in, length_ft, slope_pct, material, properties)
       VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        PROJECT_ID, USER_ID,
        `${p.from}→${p.to}`,
        fromDbId, toDbId,
        p.dia, Math.round(lenFt),
        parseFloat(slope.toFixed(4)),
        p.mat,
        JSON.stringify({ source: "seed", flow_type: "gravity" })
      ]
    );
    pipeInserts++;
  }
  console.log(`  ✓ ${pipeInserts} pipes inserted.`);

  // ── Update project description ─────────────────────────────────────────
  await client.query(
    `UPDATE projects SET description = $1 WHERE id = $2`,
    [
      "Gault's Gulch Sanitary Sewer District — Olympic Peninsula WA. " +
      "5 service basins, 95 nodes (82 manholes, 2 lift stations, 1 treatment facility), " +
      "94 pipes (PVC/HDPE, 6–12 inch). Current capacity: 280 EDU.",
      PROJECT_ID
    ]
  );
  console.log("  ✓ Project description updated.");

  console.log("\n✅ Gault's Gulch seed complete!");
  console.log(`   Nodes: ${nodeInserts}  Pipes: ${pipeInserts}`);
  console.log(`   Project: https://sewa-7h6.pages.dev/project?id=${PROJECT_ID}`);

} finally {
  await client.end();
}
