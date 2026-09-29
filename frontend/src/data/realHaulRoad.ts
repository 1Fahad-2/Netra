// Real haul road geometry — corrected to follow actual visible road in Mapbox satellite imagery.
//
// Coordinates were captured in Phase 2D correction by clicking on the actual visible haul
// road surface in the running NETRA application (Mapbox standard-satellite basemap).
// 63 GPS-digitised points were captured using the temporary Road Coordinate Picker.
//
// Route layout (direction: approach → BC01 → link → BC02 → exit):
//   Vertices  0–6   : straight approach (heading north), from south
//   Vertices  7–26  : Blind Curve 01 — left-hand hairpin
//                       Entry at v7, apex (westernmost) at v17, exit at v26
//   Vertices 26–38  : link road (heading south/SE)
//   Vertices 38–49  : Blind Curve 02 — right-hand sweep (S → SW/W)
//                       Approach at v38, apex (easternmost) at v46, end at v49
//   Vertices 49–62  : BC02 exit heading SW/S
//
// Coordinates are [longitude, latitude] (GeoJSON / Mapbox convention).
// All coordinates are within Bailadila Deposit-14 mine area (Kirandul, Chhattisgarh, India).
// These are DEMONSTRATION coordinates for the SIH NETRA prototype — not official NMDC/DGMS data.
export const REAL_HAUL_CORRIDOR_PATH: [number, number][] = [

  // ── APPROACH — heading north, to BC01 entry ───────────────────────────────────
  [81.23495335, 18.65144331],  //  0  ← approach start
  [81.23494257, 18.65171961],  //  1
  [81.23493897, 18.65185946],  //  2
  [81.23496057, 18.65203485],  //  3
  [81.23496777, 18.65224292],  //  4
  [81.23496777, 18.65243052],  //  5
  [81.23496417, 18.65252262],  //  6

  // ── BLIND CURVE 01 — GPS-digitised vertices ───────────────────────────────────
  // Entry at v7 heading north; hairpin curves left (counterclockwise);
  // apex (westernmost) at v17; exits at v26 heading south.
  [81.23490297, 18.65263177],  //  7  ← BC01 entry (BC01_START_INDEX)
  [81.23489217, 18.65265565],  //  8
  [81.23485977, 18.65270340],  //  9
  [81.23480577, 18.65274774],  // 10
  [81.23471577, 18.65278867],  // 11
  [81.23461496, 18.65283984],  // 12
  [81.23453216, 18.65285348],  // 13
  [81.23444216, 18.65285348],  // 14
  [81.23434496, 18.65285348],  // 15
  [81.23428736, 18.65283984],  // 16
  [81.23426936, 18.65275115],  // 17  ← BC01 apex (BC01_APEX_INDEX) — westernmost
  [81.23428376, 18.65268976],  // 18
  [81.23432336, 18.65260789],  // 19
  [81.23434136, 18.65254991],  // 20
  [81.23443856, 18.65243393],  // 21
  [81.23453576, 18.65226339],  // 22
  [81.23458616, 18.65214059],  // 23
  [81.23454656, 18.65197004],  // 24
  [81.23453936, 18.65175515],  // 25
  [81.23452496, 18.65150615],  // 26  ← BC01 exit (BC01_END_INDEX)

  // ── LINK ROAD — heading south/SE, to BC02 approach ───────────────────────────
  [81.23453576, 18.65127594],  // 27
  [81.23455736, 18.65106446],  // 28
  [81.23457896, 18.65084274],  // 29
  [81.23462216, 18.65061762],  // 30
  [81.23463435, 18.65048572],  // 31
  [81.23466483, 18.65031634],  // 32
  [81.23470139, 18.65017775],  // 33
  [81.23471968, 18.65006418],  // 34
  [81.23474609, 18.64997757],  // 35
  [81.23477656, 18.64989480],  // 36
  [81.23482545, 18.64981524],  // 37
  [81.23488233, 18.64974402],  // 38  ← BC02 approach (BC02_APPROACH_INDEX)

  // ── BLIND CURVE 02 — GPS-digitised vertices ───────────────────────────────────
  // Approach at v38; sweeps right (clockwise);
  // apex (easternmost) at v46; exits at v49.
  [81.23494937, 18.64967280],  // 39
  [81.23501970, 18.64960569],  // 40
  [81.23510096, 18.64952292],  // 41
  [81.23517409, 18.64944593],  // 42
  [81.23524113, 18.64936893],  // 43
  [81.23528176, 18.64929964],  // 44
  [81.23532239, 18.64923805],  // 45
  [81.23534068, 18.64918415],  // 46  ← BC02 apex (BC02_APEX_INDEX) — easternmost
  [81.23533255, 18.64913410],  // 47
  [81.23530208, 18.64907636],  // 48
  [81.23521472, 18.64902439],  // 49  ← BC02 end (BC02_END_INDEX)

  // ── BC02 EXIT — heading SW/S ──────────────────────────────────────────────────
  [81.23515784, 18.64902824],  // 50
  [81.23509487, 18.64904749],  // 51
  [81.23504002, 18.64905519],  // 52
  [81.23495469, 18.64910716],  // 53
  [81.23488156, 18.64914950],  // 54
  [81.23484296, 18.64918030],  // 55
  [81.23479217, 18.64921495],  // 56
  [81.23466013, 18.64936123],  // 57
  [81.23451589, 18.64950945],  // 58
  [81.23435947, 18.64965766],  // 59
  [81.23420711, 18.64981934],  // 60
  [81.23406490, 18.64996755],  // 61
  [81.23397145, 18.65006187],  // 62  ← route end

];

// ── Named vertex indices ───────────────────────────────────────────────────────

/** Vertex index where BC01 section begins (end of straight approach). */
export const BC01_START_INDEX = 7;
/** Vertex index of the BC01 apex (westernmost / tightest point of the hairpin). */
export const BC01_APEX_INDEX = 17;
/** Vertex index where BC01 finishes and the link road begins. */
export const BC01_END_INDEX = 26;

/** Vertex index where BC02 approach begins (end of link road). */
export const BC02_APPROACH_INDEX = 38;
/** Vertex index of the BC02 apex (easternmost point of the arc). */
export const BC02_APEX_INDEX = 46;
/** Vertex index where BC02 finishes and its exit begins. */
export const BC02_END_INDEX = 49;

// ── Legacy exports — kept so existing imports still compile ───────────────────

export const BLIND_CURVE_01 = {
  id: 'BLIND_CURVE_01',
  type: 'blind_curve',
  label: 'Blind Curve 01',
  geometry: REAL_HAUL_CORRIDOR_PATH.slice(BC01_START_INDEX, BC01_END_INDEX + 1),
};

export const BLIND_CURVE_02 = {
  id: 'BLIND_CURVE_02',
  type: 'blind_curve',
  label: 'Blind Curve 02',
  geometry: REAL_HAUL_CORRIDOR_PATH.slice(BC02_APPROACH_INDEX, BC02_END_INDEX + 1),
};
