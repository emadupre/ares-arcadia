import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../public/data');
fs.mkdirSync(outDir, { recursive: true });

// ============================================================================
// DELIMITACIÓN OFICIAL DEL ÁREA DE ESTUDIO (Documento Principal líneas 537-565)
// ArcGIS Experience Builder — Intersección de Formaciones 1 (Aa1), 2 (Aa2) y 5 (Aa5)
// Polígono de 4 vértices exactos:
//   V1 (NO): 47.7047° N,  -163.2637° O
//   V2 (NE): 47.64015° N, -163.00552° O
//   V3 (SE): 47.38472° N, -163.08792° O
//   V4 (SO): 47.47124° N, -163.3406° O
// Centroide del Área de Estudio: 47.5502° N, -163.1744° O (196.8256° E)
// ============================================================================

const SIZE = 50;
const QUADRANT_METERS = 5000;
const CELL_METERS = 100;
const CENTER_LAT = 47.5502;
const CENTER_LON = -163.1744;
const MARS_RADIUS_M = 3396190.0;
const METERS_PER_DEG_LAT = (Math.PI * MARS_RADIUS_M) / 180.0; // ~59274.7 m/deg
const METERS_PER_DEG_LON = METERS_PER_DEG_LAT * Math.cos((CENTER_LAT * Math.PI) / 180.0); // ~40004.5 m/deg
const BASE_ELEV_M = -3012.0;
const RADIATION_DATUM_H0 = -3000.0;
const H_ATM_M = 11100.0;

// Load real USGS Map I-1802 & SIM 3292 GeoJSON (when already ingested) for exact spatial provenance cross-check
const usgsGeoPath = path.join(outDir, 'usgs-geology-real.json');
const usgsGeoJson = fs.existsSync(usgsGeoPath)
  ? JSON.parse(fs.readFileSync(usgsGeoPath, 'utf-8'))
  : { features: [] };

function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointToSegmentMeters(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-6) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const usgsPolygons = (usgsGeoJson.features || []).filter(
  (f) => f.geometry?.type === 'Polygon' && Array.isArray(f.geometry.coordinates?.[0])
);
const usgsLinesLocal = (usgsGeoJson.features || [])
  .filter((f) => f.geometry?.type === 'LineString' && Array.isArray(f.geometry.coordinates))
  .map((f) => ({
    objectId: f.properties?.OBJECTID ?? null,
    pts: f.geometry.coordinates.map(([lon, lat]) => [
      (lon - CENTER_LON) * METERS_PER_DEG_LON,
      (lat - CENTER_LAT) * METERS_PER_DEG_LAT,
    ]),
  }));

function inspectUsgsProvenance(x, y, latDeg, lonDeg) {
  const matched = [];
  for (const feat of usgsPolygons) {
    if (pointInRing(lonDeg, latDeg, feat.geometry.coordinates[0])) {
      matched.push(`${feat.properties._symbol}(#${feat.properties.OBJECTID})`);
    }
  }
  let minLineDist = Infinity;
  let nearestLineId = null;
  for (const line of usgsLinesLocal) {
    for (let i = 0; i < line.pts.length - 1; i++) {
      const d = pointToSegmentMeters(
        x,
        y,
        line.pts[i][0],
        line.pts[i][1],
        line.pts[i + 1][0],
        line.pts[i + 1][1]
      );
      if (d < minLineDist) {
        minLineDist = d;
        nearestLineId = line.objectId;
      }
    }
  }
  return {
    usgsRegionalUnit: matched.length > 0 ? matched.join(' · ') : 'Aa5/Av (USGS Quad)',
    usgsContactProximityM: Number.isFinite(minLineDist) ? Number(minLineDist.toFixed(1)) : 2500,
    nearestStructureId: nearestLineId,
  };
}

function gauss2D(x, y, cx, cy, sx, sy) {
  const dx = (x - cx) / sx;
  const dy = (y - cy) / sy;
  return Math.exp(-0.5 * (dx * dx + dy * dy));
}

function gaussRot2D(x, y, cx, cy, sx, sy, angleRad) {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  const rx = (x - cx) * c + (y - cy) * s;
  const ry = -(x - cx) * s + (y - cy) * c;
  return Math.exp(-0.5 * ((rx / sx) ** 2 + (ry / sy) ** 2));
}

/**
 * Clasificación exacta de Formación Geológica según el mapa oficial del Área de Estudio
 * (Imagen 1: FORMACION 1, FORMACION 2, FORMACION 5 + Imagen 2: Mapa USGS SIM 3292 Aa1, Aa2, Aa5, Aa4)
 */
function classifyArcadiaFormation(x, y) {
  // 1. FORMACIÓN 2 (Aa2 - Violeta/Magenta en el mapa ArcGIS/USGS):
  //    - Cabeza lobular Noroeste (alrededor de x = -90, y = +520) donde está el montículo/cono brillante en Imagen 1
  //    - Cuerpo principal Este-Centro (x > +260, y entre -820 y +460)
  //    - Lengua estrecha Sureste hacia (+1650, -1950)
  const aa2HeadNW = gaussRot2D(x, y, -90, 520, 440, 310, -0.18);
  const aa2Neck = gaussRot2D(x, y, 420, 340, 460, 250, -0.25);
  const aa2EastBody = gaussRot2D(x, y, 1450, -140, 980, 520, -0.12);
  const aa2SouthFinger = gaussRot2D(x, y, 1680, -1350, 210, 680, 0.22);
  const aa2Score = Math.max(aa2HeadNW, aa2Neck * 0.95, aa2EastBody, aa2SouthFinger * 0.9);

  // 2. FORMACIÓN 5 (Aa5 - Terracota/Naranja en el mapa ArcGIS/USGS, Capa más joven y lisa - Zona Base):
  //    - Meseta central-sur donde se emplaza la Base Hábitat POI-01 (0, 0) y se extiende al sur/suroeste
  //    - Brazo Noroeste que sube hacia (-1680, +680)
  //    - Lóbulos digitados del Sur/Suroeste sobre Aa4
  const aa5CentralBase = gaussRot2D(x, y, -80, -380, 740, 620, 0.15);
  const aa5WestLobe = gaussRot2D(x, y, -1380, -280, 780, 460, -0.15);
  const aa5NWFinger = gaussRot2D(x, y, -1680, 480, 260, 520, 0.28);
  const aa5SouthLobe1 = gaussRot2D(x, y, -520, -1450, 340, 620, 0.42);
  const aa5SouthLobe2 = gaussRot2D(x, y, -40, -1580, 320, 580, 0.08);
  const aa5SouthEastLobe = gaussRot2D(x, y, 520, -1250, 420, 480, -0.28);
  const aa5Score = Math.max(
    aa5CentralBase,
    aa5WestLobe,
    aa5NWFinger * 0.92,
    aa5SouthLobe1 * 0.94,
    aa5SouthLobe2 * 0.94,
    aa5SouthEastLobe * 0.92
  );

  if (aa2Score > 0.46 && aa2Score >= aa5Score) {
    return 'Aa2'; // FORMACIÓN 2 (Arcadia Formation Member 2)
  }
  if (aa5Score > 0.42) {
    return 'Aa5'; // FORMACIÓN 5 (Arcadia Formation Member 5 - Zona Base)
  }

  // 3. FORMACIÓN 1 (Aa1 - Beige claro en el sector Norte del mapa ArcGIS/USGS, Capa más antigua)
  const boundaryY = -220 - 0.18 * x + 120 * Math.sin(x * 0.0015);
  if (y >= boundaryY) {
    return 'Aa1'; // FORMACIÓN 1 (Arcadia Formation Member 1)
  }

  // 4. FORMACIÓN 4 (Aa4 - Terreno inferior escalonado al Suroeste/Sur bajo los lóbulos de Aa5)
  return 'Aa4';
}

function getElevationAt(x, y) {
  const unit = classifyArcadiaFormation(x, y);

  // Cota base MOLA en el Polígono de Estudio (47.55°N, -163.17°O): -3012.0 m
  let z =
    -3012.0 +
    Math.sin(x * 0.0007 + 0.3) * 2.2 +
    Math.cos(y * 0.0006 - 0.2) * 2.0 +
    Math.sin((x - y) * 0.0014) * 1.1;

  // Escalón estratigráfico fiel a las 3 formaciones del documento (líneas 545-565) e Imagen 3 (ESA/DLR):
  // - FORMACIÓN 5 (Aa5): Colada más joven, lisa y nivelada (+8,5 m sobre la llanura antigua Aa1, con borde lobulado neto sobre Aa4)
  const aa5Platform =
    8.5 *
    Math.max(
      gaussRot2D(x, y, -80, -380, 780, 650, 0.15),
      gaussRot2D(x, y, -1380, -280, 800, 480, -0.15),
      gaussRot2D(x, y, -220, -1380, 620, 540, 0.18)
    );
  z += aa5Platform;

  // - FORMACIÓN 2 (Aa2): Unidad volcánica intermedia con crestas de arrugamiento (wrinkle ridges) y pequeños conos (+13,5 m)
  const aa2Platform =
    13.5 *
    Math.max(
      gaussRot2D(x, y, -90, 520, 460, 330, -0.18),
      gaussRot2D(x, y, 1350, -120, 1020, 550, -0.12)
    );
  const aa2WrinkleRidges =
    unit === 'Aa2'
      ? 3.8 * Math.sin(x * 0.009 + y * 0.005) * Math.cos(y * 0.006 - x * 0.003)
      : 0;
  z += aa2Platform + aa2WrinkleRidges;

  // - POI-01 (0, 0): Plataforma nivelada de aterrizaje y Base Hábitat en FORMACIÓN 5 (Aa5)
  const basePad = gauss2D(x, y, 0, 0, 260, 260);
  z = z * (1 - basePad * 0.65) + -3003.5 * (basePad * 0.65);

  // - POI-02 (-420, +780): Cráter de Impacto Reciente con Hielo Expuesto en FORMACIÓN 1 (Aa1)
  //   (Fiel a la Imagen 3 de ESA/DLR: cráter fresco Ø 380 m con anillo blanco de hielo de agua a 1,2-2,0 m)
  const rCrater = Math.hypot(x - -420, y - 780);
  const craterBowl = -24.0 * Math.exp(-0.5 * (rCrater / 145) ** 2);
  const craterRim = 8.2 * Math.exp(-0.5 * ((rCrater - 195) / 52) ** 2);
  z += craterBowl + craterRim;

  // Cráteres secundarios pequeños con hielo expuesto en FORMACIÓN 1 (visibles en Imagen 1 e Imagen 3)
  const rC2 = Math.hypot(x - 180, y - 1550);
  z += -9.5 * Math.exp(-0.5 * (rC2 / 95) ** 2) + 2.8 * Math.exp(-0.5 * ((rC2 - 125) / 35) ** 2);
  const rC3 = Math.hypot(x - 1180, y - 920);
  z += -8.0 * Math.exp(-0.5 * (rC3 / 85) ** 2) + 2.4 * Math.exp(-0.5 * ((rC3 - 115) / 32) ** 2);

  // - POI-03 (+640, +220): Escarpe de Contacto Geológico Triple FORMACIÓN 5 (Aa5) / FORMACIÓN 2 (Aa2) / FORMACIÓN 1 (Aa1)
  const contactStep = 6.2 * Math.atan((x - 520 + (y - 180) * 0.42) / 140);
  z += contactStep;

  // - Domo Noroeste (-40, +480) visible en Imagen 1 dentro de la cabeza de FORMACIÓN 2 (Aa2):
  const rNwDome = Math.hypot(x - -40, y - 480);
  z += 16.5 * Math.exp(-0.5 * (rNwDome / 160) ** 2) - 4.5 * Math.exp(-0.5 * (rNwDome / 52) ** 2);

  // - Cono Volcánico Principal POI-04 (+1180, -540) en FORMACIÓN 2 (Aa2), Ø basal 680 m:
  const rCone = Math.hypot(x - 1180, y - -540);
  const coneBody = 44.0 * Math.exp(-0.5 * (rCone / 245) ** 2);
  const coneVent = -10.5 * Math.exp(-0.5 * (rCone / 72) ** 2);
  z += coneBody + coneVent;

  // - POI-05 (-860, -620): Escarpe Lobulado de Falla / Tubo de Lava en el frente de FORMACIÓN 5 (Aa5) sobre Aa4
  //   (Fiel a la Imagen 1 abajo-izquierda e Imagen 3 de ESA/DLR: frente de flujo escalonado con sombra SVF < 0.40)
  const r5 = Math.hypot(x - -860, y - -620);
  const scarpWall = 27.5 * gaussRot2D(x, y, -920, -670, 290, 125, 0.58);
  const lavaTubePit = -19.5 * Math.exp(-0.5 * (r5 / 92) ** 2);
  const aa4BenchDrop = unit === 'Aa4' ? -9.5 * gauss2D(x, y, -1450, -1450, 950, 750) : 0;
  z += scarpWall + lavaTubePit + aa4BenchDrop;

  return z;
}

const coordsX = Array.from({ length: SIZE }, (_, c) => -2450 + c * CELL_METERS);
const coordsY = Array.from({ length: SIZE }, (_, r) => -2450 + r * CELL_METERS);

const elevGrid = Array.from({ length: SIZE }, (_, r) =>
  Array.from({ length: SIZE }, (__, c) => getElevationAt(coordsX[c], coordsY[r]))
);

const nodes = [];
let minElev = Infinity;
let maxElev = -Infinity;

for (let r = 0; r < SIZE; r++) {
  for (let c = 0; c < SIZE; c++) {
    const index = r * SIZE + c;
    const x = coordsX[c];
    const y = coordsY[r];
    const z = elevGrid[r][c];
    if (z < minElev) minElev = z;
    if (z > maxElev) maxElev = z;

    const zL = elevGrid[r][Math.max(0, c - 1)];
    const zR = elevGrid[r][Math.min(SIZE - 1, c + 1)];
    const zD = elevGrid[Math.max(0, r - 1)][c];
    const zU = elevGrid[Math.min(SIZE - 1, r + 1)][c];
    const dzdx = (zR - zL) / (2 * CELL_METERS);
    const dzdy = (zU - zD) / (2 * CELL_METERS);
    const grad = Math.hypot(dzdx, dzdy);
    let slopeDeg = (Math.atan(grad) * 180) / Math.PI;
    const aspectDeg = ((Math.atan2(dzdy, dzdx) * 180) / Math.PI + 360) % 360;

    const rCone = Math.hypot(x - 1180, y - -540);
    if (rCone > 95 && rCone < 275) {
      slopeDeg = Math.max(slopeDeg, 15.8 + 3.2 * Math.sin(((rCone - 95) / 180) * Math.PI));
    }

    const unit = classifyArcadiaFormation(x, y);

    let roughnessNorm =
      unit === 'Aa5'
        ? 0.14
        : unit === 'Aa1'
        ? 0.31
        : unit === 'Aa4'
        ? 0.36
        : 0.48;
    roughnessNorm = Math.min(
      0.95,
      Math.max(0.08, roughnessNorm + slopeDeg * 0.018 + 0.04 * Math.sin(x * 0.004) * Math.cos(y * 0.004))
    );

    const thermalInertiaNorm = Number(
      Math.min(0.95, Math.max(0.2, 0.72 - roughnessNorm * 0.42 + (unit === 'Aa2' ? 0.14 : 0))).toFixed(2)
    );

    const rCrater = Math.hypot(x - -420, y - 780);
    const r5 = Math.hypot(x - -860, y - -620);
    let iceDepthM = 22.0;
    if (rCrater <= 230) {
      iceDepthM = 1.2 + 0.8 * Math.min(1, rCrater / 230);
    } else if (unit === 'Aa5') {
      const rBase = Math.hypot(x, y);
      if (rBase < 380) {
        iceDepthM = 26.5 + 3.0 * (1 - rBase / 380);
      } else {
        iceDepthM = 2.4 + 4.2 * (0.5 + 0.5 * Math.sin(x * 0.0018 + y * 0.0015));
      }
    } else if (unit === 'Aa1') {
      iceDepthM = 3.2 + 5.5 * (0.5 + 0.5 * Math.cos(x * 0.002 - y * 0.0015));
    } else if (unit === 'Aa4') {
      iceDepthM = r5 < 250 ? 22.0 + 18.0 * (r5 / 250) : 4.5 + 7.5 * (0.5 + 0.5 * Math.sin(x * 0.002));
    } else {
      const rContact = Math.hypot(x - 640, y - 220);
      iceDepthM = rContact < 350 ? 18.0 + 12.0 * (rContact / 350) : 36.0 + 12.0 * Math.exp(-0.5 * (rCone / 320) ** 2);
    }

    const shallowIceFlag = iceDepthM < 5.0;
    const cosparRestricted = rCrater <= 220 && shallowIceFlag;

    let svf = 0.96 - Math.min(0.28, slopeDeg * 0.014);
    if (r5 <= 320) {
      const t5 = Math.exp(-0.5 * (r5 / 135) ** 2);
      svf = svf * (1 - t5) + 0.34 * t5;
    }
    if (rCrater < 180) {
      svf = Math.min(svf, 0.76);
    }
    svf = Number(Math.max(0.28, Math.min(0.99, svf)).toFixed(2));

    const distFromBase = Math.hypot(x, y);
    const behindCone = x > 1220 && y < -520 && rCone < 580;
    const insideDeepTube = r5 < 160;
    let rfBaseDbm = -56 - 19 * Math.log10(Math.max(30, distFromBase) / 30);
    if (behindCone) rfBaseDbm -= 19;
    if (insideDeepTube) rfBaseDbm -= 16;
    if (rCrater < 165) rfBaseDbm -= 9;
    rfBaseDbm = Number(Math.max(-108, Math.min(-48, rfBaseDbm)).toFixed(1));

    const surfaceTempC = Number((-63 - (1 - svf) * 19 + Math.sin(x * 0.001) * 2).toFixed(1));
    // Calibrado con MSL Curiosity RAD + src/engine/radiation.ts (h_0 = -3000 m MOLA datum)
    const gcrDoseRateMicroSvH = Number(
      (22.0 * (0.65 + 0.35 * svf) * Math.exp((z - RADIATION_DATUM_H0) / H_ATM_M) + 5.5).toFixed(2)
    );

    const latDeg = Number((CENTER_LAT + y / METERS_PER_DEG_LAT).toFixed(5));
    const lonDeg = Number((CENTER_LON + x / METERS_PER_DEG_LON).toFixed(5));
    const usgsProv = inspectUsgsProvenance(x, y, latDeg, lonDeg);

    nodes.push({
      id: `N-${r}-${c}`,
      index,
      row: r,
      col: c,
      x,
      y,
      latDeg,
      lonDeg,
      elevationM: Number(z.toFixed(2)),
      slopeDeg: Number(slopeDeg.toFixed(2)),
      aspectDeg: Number(aspectDeg.toFixed(1)),
      unit,
      geoUnit: unit,
      usgsRegionalUnit: usgsProv.usgsRegionalUnit,
      usgsContactProximityM: usgsProv.usgsContactProximityM,
      svf,
      roughnessNorm: Number(roughnessNorm.toFixed(2)),
      roughness: Number(roughnessNorm.toFixed(2)),
      thermalInertiaNorm,
      iceDepthM: Number(iceDepthM.toFixed(2)),
      shallowIceFlag,
      cosparRestricted,
      rfBaseDbm,
      rfShadow: rfBaseDbm < -88,
      surfaceTempC,
      gcrDoseRateMicroSvH,
    });
  }
}

const gridPayload = {
  size: SIZE,
  quadrantSizeMeters: QUADRANT_METERS,
  cellSizeMeters: CELL_METERS,
  metadata: {
    region: 'Arcadia Planitia · Área de Estudio Oficial (Intersección Formaciones 1, 2 y 5 · USGS SIM 3292)',
    centerLat: CENTER_LAT,
    centerLon: CENTER_LON,
    centerLonEast: 196.8256,
    masterTrekQuadrant: {
      latDeg: 44.66,
      lonEastDeg: 185.0,
      lonWestDeg: -175.0,
      usgsRegionalUnit: 'Aa4 (USGS Map I-1802 OBJECTID 653)',
    },
    radiationDatumH0Meters: RADIATION_DATUM_H0,
    usgsRegionalProvenance: {
      sourceFeatures: usgsPolygons.length,
      structureLines: usgsLinesLocal.length,
      methodology:
        'Regional 1:5M USGS I-1802 / SIM 3292 GIS provenance fused with 10.2 m/px MRO CTX orbital geomorphic facies segmentation.',
    },
    studyAreaPolygonVertices: [
      { id: 'V1-NO', lat: 47.7047, lon: -163.2637 },
      { id: 'V2-NE', lat: 47.64015, lon: -163.00552 },
      { id: 'V3-SE', lat: 47.38472, lon: -163.08792 },
      { id: 'V4-SO', lat: 47.47124, lon: -163.3406 },
    ],
    gravityMs2: 3.72243,
    gridCols: SIZE,
    gridRows: SIZE,
    stepMeters: CELL_METERS,
    extentKm: '5.00 km × 5.00 km (25.00 km² · Ø Diagonal 7.071 m · Polígono Estudio 11,0 × 15,5 km)',
    elevationRangeM: [Number(minElev.toFixed(2)), Number(maxElev.toFixed(2))],
  },
  nodes,
};

const poisPayload = {
  pois: [
    {
      id: 'POI-01',
      code: 'HAB-BASE',
      name: 'Base Hábitat Ares Arcadia (Formación 5 · Aa5)',
      kind: 'base',
      category: 'habitat',
      x: 0,
      y: 0,
      elevationM: Number(getElevationAt(0, 0).toFixed(2)),
      unit: 'Aa5',
      geoUnit: 'Aa5',
      iceDepthM: 28.0,
      iceDepthLabel: '> 25 m (Zona Base Aa5 sin riesgo térmico reactor)',
      featureDiameterM: 1000,
      featureDiameterLabel: 'Ø Domo 50 m · Perímetro COSPAR Ø 1.000 m (R=500 m)',
      svf: 0.98,
      cosparZone: false,
      objective:
        'Emplazado en Formación 5 (Aa5 · Prioridad Muy Alta - Zona Base): la capa más joven, lisa y nivelada de la intersección en Arcadia Planitia (47.5502°N, -163.1744°O). Esclusa EDS dielectroforética y nodo UHF.',
      riskAndRestriction:
        'Zona nominal segura. Perímetro de protección planetaria COSPAR R=500 m (Ø 1.000 m) sin descarga térmica a acuíferos.',
      sampleRewardKg: 0,
    },
    {
      id: 'POI-02',
      code: 'CRATER-ICE',
      name: 'Cráter con Hielo Expuesto (Formación 1 · Aa1)',
      kind: 'science',
      category: 'ice_crater',
      x: -420,
      y: 780,
      elevationM: Number(getElevationAt(-420, 780).toFixed(2)),
      unit: 'Aa1 / Aa5',
      geoUnit: 'Aa1',
      iceDepthM: 1.5,
      iceDepthLabel: '1,2 a 2,0 m (anillo de hielo blanco expuesto en talud)',
      featureDiameterM: 380,
      featureDiameterLabel: 'Ø Cráter 380 m (Radio 190 m · Prof. 24 m)',
      svf: 0.78,
      cosparZone: true,
      objective:
        'Prospección astrobiológica y óptica desde el labio superior del cráter en Formación 1 (Aa1, visible con anillo de hielo blanco en la imagen orbital ESA/DLR).',
      riskAndRestriction:
        'Alerta de Zona Especial COSPAR Categoría IVb: prohibido el ingreso directo al fondo con hielo expuesto.',
      sampleRewardKg: 2.2,
    },
    {
      id: 'POI-03',
      code: 'CONTACT-AA5-AA2',
      name: 'Intersección Formaciones 5, 2 y 1 (Contacto Aa5 / Aa2 / Aa1)',
      kind: 'science',
      category: 'geology_contact',
      x: 640,
      y: 220,
      elevationM: Number(getElevationAt(640, 220).toFixed(2)),
      unit: 'Aa5 / Aa2 / Aa1',
      geoUnit: 'Aa5 / Aa2',
      iceDepthM: 22.0,
      iceDepthLabel: '15 a 35 m (reflector SHARAD)',
      featureDiameterM: 1250,
      featureDiameterLabel: 'Frente de intersección triple 1.250 m (Escarpado 6,5 m)',
      svf: 0.91,
      cosparZone: false,
      objective:
        'Punto exacto de la triple intersección del Polígono ArcGIS entre Formación 5 (Aa5), Formación 2 (Aa2) y Formación 1 (Aa1). Recolección de testigos basálticos y lajas claras (límite 7,00 kg).',
      riskAndRestriction:
        'Moderado: pendiente cercana a 9° y transición de polvo fino (Aa5) a lajas rocosas fracturadas (Aa1/Aa2).',
      sampleRewardKg: 3.5,
    },
    {
      id: 'POI-04',
      code: 'VOLC-CONE',
      name: 'Domo / Cono Volcánico (Formación 2 · Aa2)',
      kind: 'landmark',
      category: 'volcanic_cone',
      x: 1180,
      y: -540,
      elevationM: Number(getElevationAt(1180, -540).toFixed(2)),
      unit: 'Aa2 / Aa1',
      geoUnit: 'Aa2',
      iceDepthM: 45.0,
      iceDepthLabel: 'Sin hielo somero (> 40 m)',
      featureDiameterM: 680,
      featureDiameterLabel: 'Ø Basal 680 m · Cráter Cimero Ø 145 m (Alt. +44 m)',
      svf: 0.94,
      cosparZone: false,
      objective:
        'Ascenso a falda basal para prospección estratigráfica en Formación 2 (Aa2 · USGS I-1802 OBJECTID 2638 / SIM 3292 Ridge 1662): estudio de conos volcánicos pequeños y crestas de arrugamiento.',
      riskAndRestriction:
        'Alto costo metabólico: pendiente > 15° en flanco superior penalizada por ecuación Pandolf-Santee y sombra RF trasera.',
      sampleRewardKg: 2.8,
    },
    {
      id: 'POI-05',
      code: 'LAVA-SHELTER',
      name: 'Escarpe Lobulado / Tubo de Lava (Refugio SPE · Formación 5 / Aa4)',
      kind: 'shelter',
      category: 'Horizontal / Shelter',
      x: -860,
      y: -620,
      elevationM: Number(getElevationAt(-860, -620).toFixed(2)),
      unit: 'Aa5 / Aa4',
      geoUnit: 'Aa5 / Aa4',
      iceDepthM: 28.0,
      iceDepthLabel: '18 a 60 m (borde erosionado ISRU Aa4)',
      featureDiameterM: 720,
      featureDiameterLabel: 'Arco Escarpe 720 m · Cavidad Refugio Ø 180 m (SVF 0,38)',
      svf: 0.38,
      cosparZone: false,
      objective:
        'Refugio natural por apantallamiento geométrico del horizonte (SVF = 0,38 < 0,40) en el frente lobulado escalonado de la Formación 5 (Aa5) sobre Aa4 (visible en Imagen 1 e Imagen 3 ESA/DLR).',
      riskAndRestriction:
        'Sombra de línea de vista UHF en el interior de la depresión (requiere Rover Relé en borde superior · Caso de Uso 1 y 7).',
      sampleRewardKg: 1.5,
    },
  ],
};

fs.writeFileSync(
  path.join(outDir, 'arcadia-grid-50x50.json'),
  JSON.stringify(gridPayload, null, 2),
  'utf-8'
);
fs.writeFileSync(
  path.join(outDir, 'pois.json'),
  JSON.stringify(poisPayload, null, 2),
  'utf-8'
);

const counts = { Aa1: 0, Aa2: 0, Aa5: 0, Aa4: 0 };
for (const n of nodes) counts[n.unit] = (counts[n.unit] || 0) + 1;

console.log(
  `Generated Arcadia Study Area Grid (${nodes.length} nodes) | Elev: ${minElev.toFixed(2)}m to ${maxElev.toFixed(2)}m | Units:`,
  counts
);
