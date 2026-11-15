import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { X } from 'lucide-react';
import type {
  ArcadiaMacroGrid,
  GridNode,
  HabitatLayerId,
  NasaCartographicStyle,
  PoiStation,
  PreEvaModalId,
  RouteMetrics,
  RoverTelemetry,
} from '../../types/mission';
import { computeInstantDoseRateMicroSvH } from '../../engine/radiation';
import {
  ARCADIA_ZONES,
  STUDY_AREA_VISUAL_REFERENCES,
  WORLDVIEW_EARTH_SPINOFF_PRESETS,
  WORLDVIEW_TEMPORAL_SOLS,
  fetchPerseveranceRawSamples,
  fetchUsgsRealOverlayVectors,
  getMarsTrekWmtsTileUrl,
  type ArcadiaZoneId,
  type ArcadiaZoneSpec,
  type NasaDonkiSpaceWeatherStatus,
  type PerseveranceRawSample,
  type UsgsOverlayVector,
  type WorldviewTemporalSol,
} from '../../services/nasaApiService';
import { useI18n } from '../../i18n/I18nContext';
import { buildDetailedRoverMesh } from '../shared/buildRoverMesh';
import {
  CARTO_BIB_BY_LANG,
  CARTO_STYLE_BY_LANG,
  FORMATION_ANCHORS_BY_LANG,
  GIS_LAYERS_BY_LANG,
  LAYER_BIB_BY_LANG,
  getDonkiSummaryText,
  getPoiCopy,
  getStudyRefCopy,
  getVertexLabel,
  getZoneCopy,
  lonDir,
} from '../../i18n/catalog';

interface HabitatViewport3DProps {
  grid: ArcadiaMacroGrid;
  pois: PoiStation[];
  activeLayer: HabitatLayerId;
  onChangeLayer?: (layer: HabitatLayerId) => void;
  spePreview: boolean;
  plannedRoute: RouteMetrics | null;
  abortedRoute?: RouteMetrics | null;
  selectedNode: GridNode | null;
  selectedPoiId: string;
  rover: RoverTelemetry;
  astronautPos: { x: number; y: number };
  onSelectNode: (node: GridNode) => void;
  onSelectPoi: (poi: PoiStation) => void;
  activeZoneId?: ArcadiaZoneId;
  onChangeZoneId?: (zoneId: ArcadiaZoneId) => void;
  donkiStatus?: NasaDonkiSpaceWeatherStatus | null;
  plannerOpen?: boolean;
  activeModal?: PreEvaModalId;
  onChangeModal?: (modal: PreEvaModalId) => void;
  detailedMarkers?: boolean;
  cleanVisor?: boolean;
  cartoStyle?: NasaCartographicStyle;
  onChangeCartoStyle?: (style: NasaCartographicStyle) => void;
  trueScale1to1?: boolean;
  onChangeTrueScale1to1?: (v: boolean) => void;
  hideWatermark?: boolean;
  flyoverActive?: boolean;
  onToggleFlyover?: () => void;
  onApplyWorldviewSol?: (sol: WorldviewTemporalSol) => void;
}

interface ProjectedPoi {
  poi: PoiStation;
  x: number;
  y: number;
  elevM: number;
  visible: boolean;
}

interface ProjectedFormationBanner {
  id: string;
  title: string;
  subtitle: string;
  badgeColor: string;
  x: number;
  y: number;
  visible: boolean;
}

const SCALE_XY = 1 / 100; // 100 m = 1 unidad Three.js => Cuadrante 5.000 m x 5.000 m = 50 x 50 unidades

function sampleBilinearGrid(
  grid: ArcadiaMacroGrid,
  wx: number,
  wy: number
): {
  elevationM: number;
  slopeDeg: number;
  svf: number;
  thermalInertiaNorm: number;
  roughnessNorm: number;
} {
  const half = grid.quadrantSizeMeters / 2;
  const fx = Math.max(
    0,
    Math.min(grid.size - 1.001, (wx + half - grid.cellSizeMeters / 2) / grid.cellSizeMeters)
  );
  const fy = Math.max(
    0,
    Math.min(grid.size - 1.001, (wy + half - grid.cellSizeMeters / 2) / grid.cellSizeMeters)
  );
  const c0 = Math.floor(fx);
  const r0 = Math.floor(fy);
  const c1 = Math.min(grid.size - 1, c0 + 1);
  const r1 = Math.min(grid.size - 1, r0 + 1);
  const tx = fx - c0;
  const ty = fy - r0;

  const n00 = grid.nodes[r0 * grid.size + c0];
  const n10 = grid.nodes[r0 * grid.size + c1];
  const n01 = grid.nodes[r1 * grid.size + c0];
  const n11 = grid.nodes[r1 * grid.size + c1];

  const bilerp = (a: number, b: number, c: number, d: number) =>
    a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;

  return {
    elevationM: bilerp(n00.elevationM, n10.elevationM, n01.elevationM, n11.elevationM),
    slopeDeg: bilerp(n00.slopeDeg, n10.slopeDeg, n01.slopeDeg, n11.slopeDeg),
    svf: bilerp(n00.svf, n10.svf, n01.svf, n11.svf),
    thermalInertiaNorm: bilerp(
      n00.thermalInertiaNorm,
      n10.thermalInertiaNorm,
      n01.thermalInertiaNorm,
      n11.thermalInertiaNorm
    ),
    roughnessNorm: bilerp(
      n00.roughnessNorm,
      n10.roughnessNorm,
      n01.roughnessNorm,
      n11.roughnessNorm
    ),
  };
}

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function createCleanRegolithTextures(): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 512;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const cCtx = colorCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;

  const cImg = cCtx.createImageData(size, size);
  const bImg = bCtx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const grain = hash2(x * 0.9, y * 0.9);
      const patch = hash2(Math.floor(x / 6), Math.floor(y / 6));
      const v = 0.86 + grain * 0.09 + patch * 0.05;

      const idx = (y * size + x) * 4;
      cImg.data[idx] = Math.min(255, Math.round(238 * v));
      cImg.data[idx + 1] = Math.min(255, Math.round(230 * v));
      cImg.data[idx + 2] = Math.min(255, Math.round(222 * v));
      cImg.data[idx + 3] = 255;

      const bVal = Math.min(255, Math.round((grain * 0.65 + patch * 0.35) * 255));
      bImg.data[idx] = bVal;
      bImg.data[idx + 1] = bVal;
      bImg.data[idx + 2] = bVal;
      bImg.data[idx + 3] = 255;
    }
  }

  cCtx.putImageData(cImg, 0, 0);
  bCtx.putImageData(bImg, 0, 0);

  const map = new THREE.CanvasTexture(colorCanvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(24, 24);

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(24, 24);

  return { map, bumpMap };
}

function getMolaHypsometricColor(elevM: number, baseDatum: number): THREE.Color {
  const rel = elevM - baseDatum;
  const t = Math.max(0, Math.min(1, (rel + 28) / 88));
  const c = new THREE.Color();
  if (t < 0.22) {
    const u = t / 0.22;
    c.setRGB(0.12 + u * 0.08, 0.28 + u * 0.44, 0.72 + u * 0.16);
  } else if (t < 0.48) {
    const u = (t - 0.22) / 0.26;
    c.setRGB(0.2 + u * 0.28, 0.72 + u * 0.08, 0.88 - u * 0.56);
  } else if (t < 0.72) {
    const u = (t - 0.48) / 0.24;
    c.setRGB(0.48 + u * 0.46, 0.8 - u * 0.08, 0.32 - u * 0.18);
  } else {
    const u = (t - 0.72) / 0.28;
    c.setRGB(0.94 + u * 0.05, 0.72 - u * 0.42, 0.14 + u * 0.35);
  }
  return c;
}

function getRealisticMarsColor(
  node: GridNode,
  wx: number,
  wy: number,
  elevSmooth: number,
  layer: HabitatLayerId,
  spePreview: boolean,
  cartoStyle: NasaCartographicStyle,
  baseDatum: number
): THREE.Color {
  const c = new THREE.Color();
  const baseColor = new THREE.Color();
  const unit = node.unit;

  const rCraterPoi2 = Math.hypot(wx - -420, wy - 780);
  const rCraterN1 = Math.hypot(wx - 180, wy - 1550);
  const rCraterN2 = Math.hypot(wx - 1180, wy - 920);
  const rNwDome = Math.hypot(wx - -40, wy - 480);
  const rScarpPoi5 = Math.hypot(wx - -860, wy - -620);

  if (cartoStyle === 'ctx-orbital') {
    // Neutral luminance multiplier so real MRO CTX + HRSC orbital texture displays faithfully
    baseColor.setRGB(0.95, 0.92, 0.89);
  } else if (cartoStyle === 'mola-hypsometric') {
    baseColor.copy(getMolaHypsometricColor(elevSmooth, baseDatum));
  } else if (cartoStyle === 'usgs-sim3292') {
    switch (unit) {
      case 'Aa1':
        // Formación 1 (Norte): crema-arena vivo USGS Aa1
        baseColor.setRGB(0.88, 0.81, 0.65);
        break;
      case 'Aa2':
        // Formación 2 (Conos y Crestas): rosa-magenta vivo USGS Aa2
        baseColor.setRGB(0.88, 0.36, 0.60);
        if (rNwDome < 160) {
          baseColor.lerp(
            new THREE.Color(0.95, 0.72, 0.82),
            Math.exp(-0.5 * (rNwDome / 75) ** 2) * 0.55
          );
        }
        break;
      case 'Aa5':
        // Formación 5 (Base joven): terracota-naranja vivo USGS Aa5
        baseColor.setRGB(0.90, 0.44, 0.21);
        break;
      case 'Aa4':
      default:
        // Unidad basal Sur: ocre dorado USGS Aa4
        baseColor.setRGB(0.85, 0.63, 0.28);
        break;
    }
  } else {
    switch (unit) {
      case 'Aa5':
        baseColor.setRGB(0.82, 0.57, 0.29);
        break;
      case 'Aa4':
        baseColor.setRGB(0.78, 0.54, 0.27);
        break;
      case 'Aa2':
        baseColor.setRGB(0.69, 0.39, 0.28);
        break;
      case 'Aa1':
      default:
        baseColor.setRGB(0.73, 0.43, 0.31);
        break;
    }
    if (node.slopeDeg > 4.5 || rScarpPoi5 < 320) {
      const darkFactor = Math.min(0.65, node.slopeDeg * 0.045 + (rScarpPoi5 < 320 ? 0.28 : 0));
      baseColor.lerp(new THREE.Color(0.24, 0.19, 0.18), darkFactor);
    }
  }

  if (cartoStyle !== 'mola-hypsometric' && cartoStyle !== 'ctx-orbital') {
    const iceRingPoi2 = Math.exp(-0.5 * ((rCraterPoi2 - 145) / 38) ** 2);
    const iceFloorPoi2 = rCraterPoi2 < 95 ? 0.55 : 0;
    const iceRingN1 = Math.exp(-0.5 * ((rCraterN1 - 95) / 28) ** 2) * 0.75;
    const iceRingN2 = Math.exp(-0.5 * ((rCraterN2 - 85) / 26) ** 2) * 0.75;
    const iceHighlight = Math.max(iceRingPoi2, iceFloorPoi2, iceRingN1, iceRingN2);
    if (iceHighlight > 0.08) {
      baseColor.lerp(new THREE.Color(0.95, 0.96, 0.98), iceHighlight * 0.78);
    }
  }

  const slopeDarken = 1.0 - Math.min(0.24, node.slopeDeg * 0.012);
  baseColor.multiplyScalar((0.86 + node.svf * 0.16) * slopeDarken);

  if (layer === 'geology') {
    return baseColor;
  }

  if (layer === 'radiation') {
    const rate = computeInstantDoseRateMicroSvH(node.elevationM, node.svf, spePreview);
    const maxRef = spePreview ? 560 : 31;
    const minRef = spePreview ? 210 : 21;
    const t = Math.max(0, Math.min(1, (rate - minRef) / (maxRef - minRef)));
    c.setHSL(0.38 - t * 0.38, 0.88, 0.38 + t * 0.16);
    return baseColor.lerp(c, 0.72);
  }

  if (layer === 'ice') {
    if (node.iceDepthM < 5) c.setRGB(0.14, 0.9, 0.98);
    else if (node.iceDepthM < 25) c.setRGB(0.18, 0.58, 0.78);
    else c.setRGB(0.45, 0.31, 0.22);
    return baseColor.lerp(c, node.iceDepthM < 25 ? 0.76 : 0.35);
  }

  if (layer === 'cospar') {
    if (node.cosparRestricted) return baseColor.lerp(new THREE.Color(0.98, 0.16, 0.26), 0.84);
    if (node.slopeDeg > 15) return baseColor.lerp(new THREE.Color(0.96, 0.58, 0.12), 0.76);
    return baseColor.lerp(new THREE.Color(0.18, 0.68, 0.52), 0.32);
  }

  if (layer === 'rfLos') {
    if (node.rfBaseDbm >= -75) c.setRGB(0.16, 0.82, 0.55);
    else if (node.rfBaseDbm >= -85) c.setRGB(0.94, 0.68, 0.16);
    else c.setRGB(0.68, 0.22, 0.86);
    return baseColor.lerp(c, 0.65);
  }

  if (node.slopeDeg <= 5) return baseColor.lerp(new THREE.Color(0.16, 0.74, 0.58), 0.38);
  if (node.slopeDeg <= 12) return baseColor.lerp(new THREE.Color(0.22, 0.65, 0.88), 0.58);
  if (node.slopeDeg <= 15) return baseColor.lerp(new THREE.Color(0.95, 0.65, 0.14), 0.74);
  return baseColor.lerp(new THREE.Color(0.96, 0.16, 0.24), 0.86);
}

function buildHabitatBaseMesh(): THREE.Group {
  const base = new THREE.Group();

  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(0.95, 1.15, 0.14, 24),
    new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7, metalness: 0.4 })
  );
  pad.position.y = 0.07;
  pad.castShadow = true;
  pad.receiveShadow = true;
  base.add(pad);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.56, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.35, metalness: 0.25 })
  );
  dome.position.y = 0.14;
  dome.castShadow = true;
  base.add(dome);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.57, 0.045, 10, 28),
    new THREE.MeshBasicMaterial({ color: 0x38e8ff })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.16;
  base.add(ring);

  const airlock = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.26, 0.48),
    new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.4, metalness: 0.35 })
  );
  airlock.position.set(0, 0.2, 0.62);
  airlock.castShadow = true;
  base.add(airlock);

  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.035, 1.25, 8),
    new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.2 })
  );
  mast.position.set(-0.35, 0.75, -0.25);
  base.add(mast);

  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0x38e8ff })
  );
  beacon.position.set(-0.35, 1.4, -0.25);
  base.add(beacon);

  return base;
}

function buildConformalCircleLine(
  cx: number,
  cy: number,
  radiusMeters: number,
  segments: number,
  colorHex: number,
  opacity: number,
  toWorld: (x: number, y: number, elevM: number) => THREE.Vector3,
  findElev: (x: number, y: number) => number
): THREE.Line {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const wx = cx + Math.cos(a) * radiusMeters;
    const wy = cy + Math.sin(a) * radiusMeters;
    const clampedX = Math.max(-2490, Math.min(2490, wx));
    const clampedY = Math.max(-2490, Math.min(2490, wy));
    const p = toWorld(clampedX, clampedY, findElev(clampedX, clampedY));
    p.y += 0.14;
    pts.push(p);
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity,
  });
  return new THREE.Line(geo, mat);
}

export const HabitatViewport3D: React.FC<HabitatViewport3DProps> = ({
  grid,
  pois,
  activeLayer,
  onChangeLayer,
  spePreview,
  plannedRoute,
  abortedRoute,
  selectedNode,
  selectedPoiId,
  rover,
  astronautPos,
  onSelectNode,
  onSelectPoi,
  activeZoneId = 'zona-1-marstrek',
  onChangeZoneId,
  donkiStatus,
  plannerOpen = true,
  activeModal = 'none',
  onChangeModal,
  detailedMarkers = false,
  cleanVisor = false,
  cartoStyle: externalCartoStyle,
  onChangeCartoStyle,
  trueScale1to1: externalTrueScale1to1,
  onChangeTrueScale1to1,
  hideWatermark = false,
  flyoverActive = false,
  onToggleFlyover,
  onApplyWorldviewSol,
}) => {
  const { lang, t } = useI18n();
  const langRef = useRef(lang);
  langRef.current = lang;
  const containerRef = useRef<HTMLDivElement>(null);
  const terrainMeshRef = useRef<THREE.Mesh | null>(null);
  const terrainMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const regolithMapRef = useRef<THREE.CanvasTexture | null>(null);
  const orbitalMosaicTexRef = useRef<THREE.CanvasTexture | null>(null);
  const overlayGroupRef = useRef<THREE.Group | null>(null);
  const routePulseRef = useRef<{ mesh: THREE.Mesh; points: THREE.Vector3[] } | null>(null);

  const [localCartoStyle, setLocalCartoStyle] = useState<NasaCartographicStyle>('usgs-sim3292');
  const [localTrueScale1to1, setLocalTrueScale1to1] = useState<boolean>(false);
  const cartoStyle = externalCartoStyle ?? localCartoStyle;
  const setCartoStyle = onChangeCartoStyle ?? setLocalCartoStyle;
  const trueScale1to1 = externalTrueScale1to1 ?? localTrueScale1to1;
  const setTrueScale1to1 = onChangeTrueScale1to1 ?? setLocalTrueScale1to1;
  const [showDimensionRings, setShowDimensionRings] = useState<boolean>(true);
  const [wmtsLoaded, setWmtsLoaded] = useState<boolean>(false);
  const [hoveredPoiId, setHoveredPoiId] = useState<string | null>(null);
  const [selectedAtlasId, setSelectedAtlasId] = useState<string>(
    STUDY_AREA_VISUAL_REFERENCES[0].id
  );
  const [atlasTab, setAtlasTab] = useState<'atlas' | 'perseverance' | 'worldview'>('atlas');
  const [perseSamples, setPerseSamples] = useState<PerseveranceRawSample[]>([]);
  const [usgsVectors, setUsgsVectors] = useState<UsgsOverlayVector[]>([]);
  const [worldviewSolIdx, setWorldviewSolIdx] = useState<number>(1);
  const flyoverActiveRef = useRef(flyoverActive);
  flyoverActiveRef.current = flyoverActive;

  useEffect(() => {
    fetchPerseveranceRawSamples().then(setPerseSamples).catch(() => {});
  }, []);

  useEffect(() => {
    const z = ARCADIA_ZONES.find((item) => item.id === activeZoneId) ?? ARCADIA_ZONES[0];
    fetchUsgsRealOverlayVectors(z.centerLatDeg, z.centerLonWestDeg)
      .then(setUsgsVectors)
      .catch(() => {});
  }, [activeZoneId]);

  const activeZone: ArcadiaZoneSpec =
    ARCADIA_ZONES.find((z) => z.id === activeZoneId) ?? ARCADIA_ZONES[0];

  const scaleY = trueScale1to1 ? 1 / 100 : 3 / 100; // 1x estricto (1:1) vs 3x relieve DTM para distinguir cráteres, conos y escarpes
  const baseDatum = activeZone.datumElevationBaseM;

  const toWorld = (x: number, y: number, elevM: number): THREE.Vector3 => {
    return new THREE.Vector3(
      x * SCALE_XY,
      (elevM - baseDatum + 28) * scaleY,
      -y * SCALE_XY
    );
  };

  const cameraStateRef = useRef({
    theta: 1.48,
    phi: 0.72,
    radius: 35,
    target: new THREE.Vector3(-0.6, 0.45, -0.4),
  });
  const [projectedPois, setProjectedPois] = useState<ProjectedPoi[]>([]);
  const [projectedBanners, setProjectedBanners] = useState<ProjectedFormationBanner[]>([]);

  const onSelectNodeRef = useRef(onSelectNode);
  onSelectNodeRef.current = onSelectNode;
  const onSelectPoiRef = useRef(onSelectPoi);
  onSelectPoiRef.current = onSelectPoi;
  const poisRef = useRef(pois);
  poisRef.current = pois;
  const plannerOpenRef = useRef(plannerOpen);
  plannerOpenRef.current = plannerOpen;
  const cleanVisorRef = useRef(cleanVisor);
  cleanVisorRef.current = cleanVisor;
  const detailedMarkersRef = useRef(detailedMarkers);
  detailedMarkersRef.current = detailedMarkers;
  const selectedPoiIdRef = useRef(selectedPoiId);
  selectedPoiIdRef.current = selectedPoiId;

  useEffect(() => {
    let cancelled = false;

    // Load local cached MRO CTX LOD 11 (~10.2 m/px) + HRSC+MOLA mosaic texture onto 3D terrain mesh
    (async () => {
      const sizePx = 1024;
      const canvas = document.createElement('canvas');
      canvas.width = sizePx;
      canvas.height = sizePx;
      const ctx2d = canvas.getContext('2d');
      if (!ctx2d || cancelled) return;

      ctx2d.fillStyle = '#4e3528';
      ctx2d.fillRect(0, 0, sizePx, sizePx);

      try {
        const res = await fetch('/nasa-layers/manifest.json');
        if (!res.ok) throw new Error('manifest unavailable');
        const manifest = (await res.json()) as {
          studySite: { quadrantBboxDeg: { minLon: number; minLat: number; maxLon: number; maxLat: number } };
          layers: {
            hrscMola?: { tiles: Array<{ localUrl: string; boundsDeg: [number, number, number, number] }> };
            ctxLod11?: { tiles: Array<{ localUrl: string; boundsDeg: [number, number, number, number] }> };
          };
          masterTrekQuadrant?: {
            tiles?: Array<{ localUrl: string; boundsDeg: [number, number, number, number] }>;
          };
        };
        const bbox =
          activeZone.id === 'zona-5-trek-44n'
            ? {
                minLon: activeZone.lonWestSpanDeg[0],
                minLat: activeZone.latSpanDeg[0],
                maxLon: activeZone.lonWestSpanDeg[1],
                maxLat: activeZone.latSpanDeg[1],
              }
            : manifest.studySite.quadrantBboxDeg;
        const lonSpan = bbox.maxLon - bbox.minLon;
        const latSpan = bbox.maxLat - bbox.minLat;

        const drawTileList = async (
          tiles: Array<{ localUrl: string; boundsDeg: [number, number, number, number] }>,
          alpha: number
        ) => {
          const imgs = await Promise.all(
            tiles.map(
              (tile) =>
                new Promise<{ imgEl: HTMLImageElement; tile: typeof tile } | null>((resolve) => {
                  const im = new Image();
                  im.crossOrigin = 'anonymous';
                  im.onload = () => resolve({ imgEl: im, tile });
                  im.onerror = () => resolve(null);
                  im.src = tile.localUrl;
                })
            )
          );
          ctx2d.globalAlpha = alpha;
          for (const item of imgs) {
            if (!item) continue;
            const [tMinLon, tMinLat, tMaxLon, tMaxLat] = item.tile.boundsDeg;
            const dx = ((tMinLon - bbox.minLon) / lonSpan) * sizePx;
            const dy = ((bbox.maxLat - tMaxLat) / latSpan) * sizePx;
            const dw = ((tMaxLon - tMinLon) / lonSpan) * sizePx;
            const dh = ((tMaxLat - tMinLat) / latSpan) * sizePx;
            ctx2d.drawImage(item.imgEl, dx, dy, dw, dh);
          }
          ctx2d.globalAlpha = 1.0;
        };

        if (activeZone.id === 'zona-5-trek-44n' && manifest.masterTrekQuadrant?.tiles?.length) {
          await drawTileList(manifest.masterTrekQuadrant.tiles, 1.0);
        } else {
          if (manifest.layers.hrscMola?.tiles?.length) {
            await drawTileList(manifest.layers.hrscMola.tiles, 1.0);
          }
          if (manifest.layers.ctxLod11?.tiles?.length) {
            await drawTileList(manifest.layers.ctxLod11.tiles, 0.88);
          }
        }
      } catch {
        // Remote WMTS fallback projected directly onto the 3D terrain canvas texture
        await new Promise<void>((resolve) => {
          const fallbackImg = new Image();
          fallbackImg.crossOrigin = 'anonymous';
          fallbackImg.onload = () => {
            ctx2d.drawImage(fallbackImg, 0, 0, sizePx, sizePx);
            resolve();
          };
          fallbackImg.onerror = () => resolve();
          fallbackImg.src = getMarsTrekWmtsTileUrl(8, 60, 23);
        });
      }

      if (cancelled) return;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      orbitalMosaicTexRef.current = tex;
      setWmtsLoaded(true);

      if (terrainMatRef.current && cartoStyle === 'ctx-orbital') {
        terrainMatRef.current.map = tex;
        terrainMatRef.current.needsUpdate = true;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeZone]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(
      44,
      Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
      0.2,
      300
    );

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    container.appendChild(renderer.domElement);

    // Base óptica de mesa proyectora holográfica debajo del terreno 3D
    const holoPlatenGroup = new THREE.Group();
    const plateDisc = new THREE.Mesh(
      new THREE.CircleGeometry(30.5, 64),
      new THREE.MeshBasicMaterial({
        color: 0x0a2538,
        transparent: true,
        opacity: 0.24,
        side: THREE.DoubleSide,
      })
    );
    plateDisc.rotation.x = -Math.PI / 2;
    plateDisc.position.y = -0.35;
    holoPlatenGroup.add(plateDisc);

    for (const [r, op] of [
      [28.5, 0.34],
      [31.8, 0.2],
    ] as const) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r, r + 0.16, 72),
        new THREE.MeshBasicMaterial({
          color: 0x38e8ff,
          transparent: true,
          opacity: op,
          side: THREE.DoubleSide,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -0.32;
      holoPlatenGroup.add(ring);
    }

    const slabBorder = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(50.2, 0.18, 50.2)),
      new THREE.LineBasicMaterial({ color: 0x38e8ff, transparent: true, opacity: 0.42 })
    );
    slabBorder.position.y = -0.15;
    holoPlatenGroup.add(slabBorder);
    scene.add(holoPlatenGroup);

    const hemi = new THREE.HemisphereLight(0xffe8d6, 0x334155, 0.82);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff0dd, 1.65);
    sun.position.set(36, 28, 24);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 5;
    sun.shadow.camera.far = 120;
    sun.shadow.camera.left = -32;
    sun.shadow.camera.right = 32;
    sun.shadow.camera.top = 32;
    sun.shadow.camera.bottom = -32;
    sun.shadow.bias = -0.0005;
    scene.add(sun);

    const subdiv = 180;
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(subdiv * subdiv * 3);
    const colors = new Float32Array(subdiv * subdiv * 3);
    const uvs = new Float32Array(subdiv * subdiv * 2);
    const elevAttr = new Float32Array(subdiv * subdiv);
    const indices: number[] = [];

    const half = grid.quadrantSizeMeters / 2;
    const stepM = grid.quadrantSizeMeters / (subdiv - 1);

    for (let r = 0; r < subdiv; r++) {
      for (let c = 0; c < subdiv; c++) {
        const idx = r * subdiv + c;
        const wx = -half + c * stepM;
        const wy = -half + r * stepM;
        const s = sampleBilinearGrid(grid, wx, wy);
        const w = toWorld(wx, wy, s.elevationM);

        positions[idx * 3] = w.x;
        positions[idx * 3 + 1] = w.y;
        positions[idx * 3 + 2] = w.z;
        elevAttr[idx] = s.elevationM;

        uvs[idx * 2] = c / (subdiv - 1);
        uvs[idx * 2 + 1] = r / (subdiv - 1);
      }
    }

    for (let r = 0; r < subdiv - 1; r++) {
      for (let c = 0; c < subdiv - 1; c++) {
        const a = r * subdiv + c;
        const b = a + 1;
        const d = (r + 1) * subdiv + c;
        const e = d + 1;
        indices.push(a, b, d, b, e, d);
      }
    }

    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geom.setAttribute('aElevationM', new THREE.BufferAttribute(elevAttr, 1));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    const { map, bumpMap } = createCleanRegolithTextures();
    regolithMapRef.current = map;
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map:
        cartoStyle === 'ctx-orbital' && orbitalMosaicTexRef.current
          ? orbitalMosaicTexRef.current
          : map,
      bumpMap,
      bumpScale: 0.03,
      roughness: 0.88,
      metalness: 0.04,
    });
    terrainMatRef.current = mat;

    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `
          #include <common>
          attribute float aElevationM;
          varying vec3 vTerrainWorldPos;
          varying float vElevM;
          `
        )
        .replace(
          '#include <begin_vertex>',
          `
          #include <begin_vertex>
          vTerrainWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          vElevM = aElevationM;
          `
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `
          #include <common>
          varying vec3 vTerrainWorldPos;
          varying float vElevM;
          `
        )
        .replace(
          '#include <dithering_fragment>',
          `
          float minorStep = vElevM / 2.5;
          float majorStep = vElevM / 10.0;
          float minorDist = abs(fract(minorStep - 0.5) - 0.5) / max(0.0001, fwidth(minorStep));
          float majorDist = abs(fract(majorStep - 0.5) - 0.5) / max(0.0001, fwidth(majorStep));

          float minorMask = (1.0 - smoothstep(0.0, 1.25, minorDist)) * 0.28;
          float majorMask = (1.0 - smoothstep(0.0, 1.55, majorDist)) * 0.68;
          float majorHalo = (1.0 - smoothstep(1.2, 2.8, majorDist)) * 0.22;

          float g500x = abs(fract(vTerrainWorldPos.x / 5.0 - 0.5) - 0.5) / max(0.0001, fwidth(vTerrainWorldPos.x / 5.0));
          float g500z = abs(fract(vTerrainWorldPos.z / 5.0 - 0.5) - 0.5) / max(0.0001, fwidth(vTerrainWorldPos.z / 5.0));
          float gridMask = (1.0 - smoothstep(0.0, 1.35, min(g500x, g500z))) * 0.16;

          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.03, 0.05, 0.09), majorHalo);
          vec3 contourCol = mix(vec3(0.92, 0.96, 1.0), vec3(1.0, 0.98, 0.88), majorMask);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, contourCol, clamp(minorMask + majorMask, 0.0, 0.78));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.22, 0.91, 1.0), gridMask);
          #include <dithering_fragment>
          `
        );
    };

    const terrainMesh = new THREE.Mesh(geom, mat);
    terrainMesh.castShadow = true;
    terrainMesh.receiveShadow = true;
    terrainMeshRef.current = terrainMesh;
    scene.add(terrainMesh);

    const overlayGroup = new THREE.Group();
    overlayGroupRef.current = overlayGroup;
    scene.add(overlayGroup);

    let dragging = false;
    let moved = false;
    let lastX = 0;
    let lastY = 0;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const onPointerDown = (e: PointerEvent) => {
      dragging = true;
      moved = false;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      if (Math.hypot(dx, dy) > 3) moved = true;
      lastX = e.clientX;
      lastY = e.clientY;
      cameraStateRef.current.theta -= dx * 0.0065;
      cameraStateRef.current.phi = Math.max(
        0.24,
        Math.min(1.42, cameraStateRef.current.phi - dy * 0.0055)
      );
    };
    const onPointerUp = (e: PointerEvent) => {
      if (dragging && !moved) {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObject(terrainMesh);
        if (hits.length > 0) {
          const pt = hits[0].point;
          const worldX = pt.x / SCALE_XY;
          const worldY = -pt.z / SCALE_XY;
          let nearestPoi: PoiStation | null = null;
          let minPoiDist = 210;
          for (const poi of poisRef.current) {
            const d = Math.hypot(poi.x - worldX, poi.y - worldY);
            if (d < minPoiDist) {
              minPoiDist = d;
              nearestPoi = poi;
            }
          }
          if (nearestPoi) {
            onSelectPoiRef.current(nearestPoi);
          }
          const col = Math.max(
            0,
            Math.min(grid.size - 1, Math.floor((worldX + half) / grid.cellSizeMeters))
          );
          const row = Math.max(
            0,
            Math.min(grid.size - 1, Math.floor((worldY + half) / grid.cellSizeMeters))
          );
          onSelectNodeRef.current(grid.nodes[row * grid.size + col]);
        }
      }
      dragging = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cameraStateRef.current.radius = Math.max(
        10,
        Math.min(62, cameraStateRef.current.radius + e.deltaY * 0.03)
      );
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    const onResize = () => {
      if (!container) return;
      camera.aspect =
        Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight);
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', onResize);
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    let rafId = 0;
    let frameCount = 0;
    const tempVec = new THREE.Vector3();

    const animate = () => {
      if (flyoverActiveRef.current && routePulseRef.current && routePulseRef.current.points.length > 1) {
        const pts = routePulseRef.current.points;
        const progress = (performance.now() * 0.000095) % 1;
        const segFloat = progress * (pts.length - 1);
        const idx = Math.floor(segFloat);
        const frac = segFloat - idx;
        const posPt = new THREE.Vector3().lerpVectors(
          pts[idx],
          pts[Math.min(pts.length - 1, idx + 1)],
          frac
        );
        const lookIdx = Math.min(pts.length - 1, idx + 2);
        const lookPt = pts[lookIdx];
        const dir = new THREE.Vector3().subVectors(lookPt, posPt);
        if (dir.lengthSq() < 0.001) dir.set(0.6, 0, -0.6);
        dir.normalize();
        camera.position.set(
          posPt.x - dir.x * 7.5 + 1.8,
          posPt.y + 4.4,
          posPt.z - dir.z * 7.5 + 1.8
        );
        camera.lookAt(lookPt.x, lookPt.y + 0.25, lookPt.z);
      } else {
        const { theta, phi, radius, target } = cameraStateRef.current;
        camera.position.set(
          target.x + radius * Math.sin(phi) * Math.cos(theta),
          target.y + radius * Math.cos(phi),
          target.z + radius * Math.sin(phi) * Math.sin(theta)
        );
        camera.lookAt(target);
      }

      if (routePulseRef.current && routePulseRef.current.points.length > 1) {
        const pts = routePulseRef.current.points;
        const t = ((performance.now() * 0.00028) % 1) * (pts.length - 1);
        const idx = Math.floor(t);
        const frac = t - idx;
        const a = pts[idx];
        const b = pts[Math.min(pts.length - 1, idx + 1)];
        routePulseRef.current.mesh.position.lerpVectors(a, b, frac);
        routePulseRef.current.mesh.position.y += 0.25;
      }

      renderer.render(scene, camera);

      frameCount += 1;
      if (frameCount % 3 === 0 && container) {
        const w = container.clientWidth;
        const h = container.clientHeight;
        // Zona segura dentro de la mesa proyectora holográfica
        const safeLeft = 18;
        const safeRight = w - 18;
        const safeTop = 44;
        const safeBottom = h - 32;

        const rawProjected: ProjectedPoi[] = poisRef.current.map((poi) => {
          const s = sampleBilinearGrid(grid, poi.x, poi.y);
          const pos = toWorld(poi.x, poi.y, s.elevationM);
          pos.y += 2.35;
          tempVec.copy(pos).project(camera);
          const px = (tempVec.x * 0.5 + 0.5) * w;
          const py = (-tempVec.y * 0.5 + 0.5) * h;
          const inSafeRect =
            tempVec.z < 1 &&
            tempVec.z > -1 &&
            px >= safeLeft &&
            px <= safeRight &&
            py >= safeTop &&
            py <= safeBottom;
          return {
            poi,
            x: px,
            y: py,
            elevM: Math.round(s.elevationM),
            visible: inSafeRect && !cleanVisorRef.current,
          };
        });
        // De-overlap screen-space POI pills prioritizing selectedPoiId
        const placedBoxes: Array<{ l: number; r: number; t: number; b: number }> = [];
        const sortedIndices = rawProjected
          .map((_, idx) => idx)
          .sort((a, b) => {
            const aSel = rawProjected[a].poi.id === selectedPoiIdRef.current ? -1 : 0;
            const bSel = rawProjected[b].poi.id === selectedPoiIdRef.current ? -1 : 0;
            if (aSel !== bSel) return aSel - bSel;
            return rawProjected[a].y - rawProjected[b].y;
          });
        const nextProjected = rawProjected.map((item) => ({ ...item }));
        for (const idx of sortedIndices) {
          const item = nextProjected[idx];
          if (!item.visible) continue;
          const isSel = item.poi.id === selectedPoiIdRef.current;
          const boxW = isSel ? 172 : 138;
          const boxH = isSel ? 38 : 24;
          let cx = item.x;
          let cy = item.y;
          const overlaps = (testX: number, testY: number) => {
            const l = testX - boxW / 2 - 4;
            const r = testX + boxW / 2 + 4;
            const t = testY - boxH - 4;
            const b = testY + 4;
            return placedBoxes.some((p) => l < p.r && r > p.l && t < p.b && b > p.t);
          };
          if (overlaps(cx, cy)) {
            const offsets = [
              [0, -26],
              [0, 28],
              [-48, -22],
              [48, -22],
              [0, -50],
              [0, 52],
              [-76, 0],
              [76, 0],
            ];
            for (const [ox, oy] of offsets) {
              const candX = Math.max(safeLeft + boxW / 2, Math.min(safeRight - boxW / 2, item.x + ox));
              const candY = Math.max(safeTop + boxH, Math.min(safeBottom, item.y + oy));
              if (!overlaps(candX, candY)) {
                cx = candX;
                cy = candY;
                break;
              }
            }
          }
          item.x = cx;
          item.y = cy;
          placedBoxes.push({
            l: cx - boxW / 2,
            r: cx + boxW / 2,
            t: cy - boxH,
            b: cy,
          });
        }
        setProjectedPois(nextProjected);

        if (detailedMarkersRef.current && !cleanVisorRef.current) {
          const nextBanners: ProjectedFormationBanner[] = FORMATION_ANCHORS_BY_LANG[
            langRef.current
          ].map((b) => {
            const s = sampleBilinearGrid(grid, b.wx, b.wy);
            const pos = toWorld(b.wx, b.wy, s.elevationM);
            pos.y += 0.95;
            tempVec.copy(pos).project(camera);
            const px = (tempVec.x * 0.5 + 0.5) * w;
            const py = (-tempVec.y * 0.5 + 0.5) * h;
            const visible =
              tempVec.z < 1 &&
              tempVec.z > -1 &&
              px >= safeLeft + 40 &&
              px <= safeRight - 40 &&
              py >= safeTop + 20 &&
              py <= safeBottom - 20;
            return {
              id: b.id,
              title: b.title,
              subtitle: b.subtitle,
              badgeColor: b.badgeColor,
              x: px,
              y: py,
              visible,
            };
          });
          setProjectedBanners(nextBanners);
        } else {
          setProjectedBanners([]);
        }
      }

      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      holoPlatenGroup.traverse((obj) => {
        if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
        const m = (obj as THREE.Mesh | THREE.LineSegments).material;
        if (m) (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
      });
      map.dispose();
      bumpMap.dispose();
      geom.dispose();
      mat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [grid, trueScale1to1, baseDatum]);

  useEffect(() => {
    const mesh = terrainMeshRef.current;
    if (!mesh) return;
    const colorAttr = mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    const subdiv = 180;
    const half = grid.quadrantSizeMeters / 2;
    const stepM = grid.quadrantSizeMeters / (subdiv - 1);

    for (let r = 0; r < subdiv; r++) {
      for (let c = 0; c < subdiv; c++) {
        const idx = r * subdiv + c;
        const wx = -half + c * stepM;
        const wy = -half + r * stepM;
        const s = sampleBilinearGrid(grid, wx, wy);
        const gc = Math.max(
          0,
          Math.min(grid.size - 1, Math.floor((wx + half) / grid.cellSizeMeters))
        );
        const gr = Math.max(
          0,
          Math.min(grid.size - 1, Math.floor((wy + half) / grid.cellSizeMeters))
        );
        const node = grid.nodes[gr * grid.size + gc];
        const col = getRealisticMarsColor(
          node,
          wx,
          wy,
          s.elevationM,
          activeLayer,
          spePreview,
          cartoStyle,
          baseDatum
        );
        colorAttr.setXYZ(idx, col.r, col.g, col.b);
      }
    }
    colorAttr.needsUpdate = true;

    const mat = terrainMatRef.current;
    if (mat) {
      const targetMap =
        cartoStyle === 'ctx-orbital' && orbitalMosaicTexRef.current
          ? orbitalMosaicTexRef.current
          : regolithMapRef.current;
      if (targetMap && mat.map !== targetMap) {
        mat.map = targetMap;
        mat.needsUpdate = true;
      }
    }
  }, [grid, activeLayer, spePreview, cartoStyle, baseDatum, trueScale1to1, wmtsLoaded]);

  useEffect(() => {
    const group = overlayGroupRef.current;
    if (!group) return;
    while (group.children.length > 0) {
      const ch = group.children[0];
      ch.userData.cancelled = true;
      group.remove(ch);
    }
    routePulseRef.current = null;

    const findElev = (x: number, y: number) => sampleBilinearGrid(grid, x, y).elevationM;

    if (showDimensionRings) {
      const half = 2480;
      const borderPts = [
        toWorld(-half, -half, findElev(-half, -half)),
        toWorld(half, -half, findElev(half, -half)),
        toWorld(half, half, findElev(half, half)),
        toWorld(-half, half, findElev(-half, half)),
        toWorld(-half, -half, findElev(-half, -half)),
      ];
      borderPts.forEach((p) => (p.y += 0.12));
      group.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(borderPts),
          new THREE.LineBasicMaterial({ color: 0x38e8ff, transparent: true, opacity: 0.55 })
        )
      );

      group.add(buildConformalCircleLine(0, 0, 2450, 96, 0x38e8ff, 0.32, toWorld, findElev));
      group.add(buildConformalCircleLine(0, 0, 500, 64, 0x10b981, 0.72, toWorld, findElev));
      group.add(buildConformalCircleLine(-420, 780, 190, 48, 0xff2a4b, 0.8, toWorld, findElev));
      group.add(buildConformalCircleLine(-40, 480, 160, 44, 0xd98cb3, 0.65, toWorld, findElev));
      group.add(buildConformalCircleLine(1180, -540, 340, 56, 0xffae24, 0.72, toWorld, findElev));
      group.add(buildConformalCircleLine(-860, -620, 360, 56, 0x38e8ff, 0.72, toWorld, findElev));

      // Real USGS SIM 3292 (Tanaka 2014) Tectonic Structures (#1662) & Geologic Contacts (#3637)
      for (const vec of usgsVectors) {
        if (vec.geomType !== 'LineString') continue;
        for (const poly of vec.localPolylines) {
          if (poly.length < 2) continue;
          const pts3d = poly.map((p) => {
            const w = toWorld(p.x, p.y, findElev(p.x, p.y));
            w.y += 0.2;
            return w;
          });
          const lineMat = new THREE.LineDashedMaterial({
            color: vec.objectId === 1662 ? 0xf472b6 : 0x67e8f9,
            dashSize: 0.7,
            gapSize: 0.35,
            transparent: true,
            opacity: 0.85,
          });
          const lineObj = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts3d), lineMat);
          lineObj.computeLineDistances();
          group.add(lineObj);
        }
      }
    }

    const basePos = toWorld(0, 0, findElev(0, 0));
    const habitatBase = buildHabitatBaseMesh();
    habitatBase.position.copy(basePos);
    group.add(habitatBase);

    for (const poi of pois) {
      const pos = toWorld(poi.x, poi.y, findElev(poi.x, poi.y));
      const isSelected = poi.id === selectedPoiId;
      const color = isSelected
        ? 0x38e8ff
        : poi.kind === 'base'
          ? 0xf4efe6
          : poi.kind === 'shelter'
            ? 0x38e8ff
            : 0xffae24;

      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 2.0, 8),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 })
      );
      stem.position.set(pos.x, pos.y + 1.0, pos.z);
      group.add(stem);

      const diamond = new THREE.Mesh(
        new THREE.OctahedronGeometry(isSelected ? 0.42 : 0.28, 0),
        new THREE.MeshBasicMaterial({ color })
      );
      diamond.position.set(pos.x, pos.y + 2.05, pos.z);
      group.add(diamond);

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(
          isSelected ? 0.55 : 0.35,
          isSelected ? 0.78 : 0.48,
          28
        ),
        new THREE.MeshBasicMaterial({
          color,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: isSelected ? 0.92 : 0.5,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(pos.x, pos.y + 0.09, pos.z);
      group.add(ring);
    }

    if (abortedRoute && abortedRoute.points.length > 1) {
      const abortedPts = abortedRoute.points.map((p) => {
        const w = toWorld(p.x, p.y, findElev(p.x, p.y));
        w.y += 0.22;
        return w;
      });
      const curve = new THREE.CatmullRomCurve3(abortedPts);
      const tubeGeo = new THREE.TubeGeometry(curve, Math.max(24, abortedPts.length * 4), 0.1, 8, false);
      const tubeMesh = new THREE.Mesh(
        tubeGeo,
        new THREE.MeshBasicMaterial({ color: 0xff2a4b, transparent: true, opacity: 0.55 })
      );
      group.add(tubeMesh);
    }

    if (plannedRoute && !plannedRoute.blocked && plannedRoute.points.length > 1) {
      const pts = plannedRoute.points.map((p) => {
        const w = toWorld(p.x, p.y, findElev(p.x, p.y));
        w.y += 0.28;
        return w;
      });
      const curve = new THREE.CatmullRomCurve3(pts);
      const tubeGeo = new THREE.TubeGeometry(curve, Math.max(32, pts.length * 5), 0.16, 10, false);
      const routeColor = spePreview ? 0xffae24 : 0x38e8ff;
      const tubeMesh = new THREE.Mesh(
        tubeGeo,
        new THREE.MeshBasicMaterial({ color: routeColor, transparent: true, opacity: 0.95 })
      );
      group.add(tubeMesh);

      const pulseSphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.26, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      pulseSphere.position.copy(pts[0]);
      group.add(pulseSphere);
      routePulseRef.current = { mesh: pulseSphere, points: pts };

      for (const rep of plannedRoute.repeaterDeployPoints) {
        const w = toWorld(rep.x, rep.y, findElev(rep.x, rep.y));
        const beacon = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.2),
          new THREE.MeshBasicMaterial({ color: 0xc084fc })
        );
        beacon.position.set(w.x, w.y + 0.55, w.z);
        group.add(beacon);
      }
    }

    const pRover = toWorld(rover.x, rover.y, findElev(rover.x, rover.y));
    const { roverGroup: miniRover } = buildDetailedRoverMesh({
      scale: 0.28,
      detailed: false,
    });
    miniRover.position.copy(pRover);
    miniRover.rotation.y = (-rover.headingDeg * Math.PI) / 180 + Math.PI;
    group.add(miniRover);

    if (selectedNode) {
      const selPos = toWorld(selectedNode.x, selectedNode.y, selectedNode.elevationM);
      const selRing = new THREE.Mesh(
        new THREE.RingGeometry(0.55, 0.78, 28),
        new THREE.MeshBasicMaterial({ color: 0xf4efe6, side: THREE.DoubleSide })
      );
      selRing.rotation.x = -Math.PI / 2;
      selRing.position.set(selPos.x, selPos.y + 0.12, selPos.z);
      group.add(selRing);
    }
  }, [
    grid,
    pois,
    plannedRoute,
    abortedRoute,
    selectedNode,
    selectedPoiId,
    rover,
    astronautPos,
    spePreview,
    usgsVectors,
    trueScale1to1,
    showDimensionRings,
    baseDatum,
  ]);

  const activeAtlasItem =
    STUDY_AREA_VISUAL_REFERENCES.find((r) => r.id === selectedAtlasId) ??
    STUDY_AREA_VISUAL_REFERENCES[0];
  const activeZoneCopy = getZoneCopy(activeZone, lang);
  const activeAtlasCopy = getStudyRefCopy(activeAtlasItem, lang);
  const cartoStyleLabels = CARTO_STYLE_BY_LANG[lang];
  const gisLayersMeta = GIS_LAYERS_BY_LANG[lang];
  const cartoBib = CARTO_BIB_BY_LANG[lang];
  const layerBib = LAYER_BIB_BY_LANG[lang];

  const closeModal = () => onChangeModal && onChangeModal('none');

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-transparent">
      {/* PÍLDORA SUPERIOR MINIMALISTA ESTILO NO MAN'S SKY (CERO SATURACIÓN VISUAL) */}
      {!cleanVisor && (
        <div className="pointer-events-auto absolute left-1/2 top-2.5 z-10 flex -translate-x-1/2 items-center gap-2 nms-panel nms-chamfer-sm border border-[#38e8ff]/35 bg-[#04070d]/80 px-3 py-1 font-mono text-[9.5px] backdrop-blur-md transition-all whitespace-nowrap">
          <button
            type="button"
            onClick={() => onChangeModal && onChangeModal('geodesic')}
            className="flex items-center gap-1.5 font-bold text-[#38e8ff] hover:underline"
            title={t('Open zones, coordinates & Ø dimensions modal', 'Abrir modal de zonas, coordenadas y medidas Ø')}
          >
            <span className="h-1.5 w-1.5 nms-diamond bg-[#38e8ff]" />
            <span>
              {activeZoneCopy.code} ({activeZone.centerLatDeg.toFixed(2)}°N,{' '}
              {activeZone.centerLonWestDeg.toFixed(2)}°{lonDir(lang)})
            </span>
          </button>
          <span className="text-white/25">|</span>
          <button
            type="button"
            onClick={() => onChangeModal && onChangeModal('layers')}
            className="text-[#ffae24] hover:underline"
            title={t('Open GIS layers & NASA cartography modal', 'Abrir modal de capas GIS y estilo NASA')}
          >
            {cartoStyleLabels[cartoStyle]}
          </button>
          <span className="text-white/25">|</span>
          <button
            type="button"
            onClick={() => onChangeModal && onChangeModal('atlas')}
            className="font-bold text-amber-200 hover:text-[#ffae24] hover:underline"
            title={t(
              'Open NASA Geology Atlas (USGS, Curiosity Path, Perseverance Raw & Worldview) [4]',
              'Abrir Atlas Geológico NASA (USGS, Ruta Curiosity, Perseverance Raw y Worldview) [4]'
            )}
          >
            {t('NASA Atlas', 'Atlas NASA')}
          </button>
          <span className="text-white/25">|</span>
          <span
            className={`font-bold ${
              plannedRoute?.blocked
                ? 'text-[#ff2a4b]'
                : spePreview
                  ? 'text-[#ff2a4b] animate-pulse'
                  : 'text-emerald-300'
            }`}
          >
            {plannedRoute?.blocked
              ? t('⛔ ROUTE BLOCKED (STEEP/COSPAR)', '⛔ RUTA BLOQUEADA (PENDIENTE/COSPAR)')
              : spePreview
                ? t('☀ SPE DIVERSION → POI-05', '☀ DESVÍO SPE → POI-05')
                : t('● SAFE ROUTE', '● RUTA SEGURA')}
          </span>
        </div>
      )}

      {/* INDICADOR DISCRETO EN ESQUINA CUANDO VISOR LIMPIO ESTÁ ACTIVO */}
      {cleanVisor && (
        <div className="pointer-events-none absolute left-4 top-3 z-10 rounded border border-white/15 bg-[#04070d]/70 px-2.5 py-1 font-mono text-[9px] text-[#38e8ff]/80 backdrop-blur-sm">
          {t(
            'CLEAN VISOR // PRESS [V] TO RESTORE FOREARM PANELS',
            'VISOR LIMPIO // PULSA [V] PARA RESTAURAR PANELES DE ANTEBRAZO'
          )}
        </div>
      )}

      {/* ETIQUETAS 3D COMPACTAS SOBRE POIs (CLIPADAS PARA NO PISAR PANELES NI CONSOLA) */}
      {projectedPois.map(({ poi, x, y, elevM, visible }) => {
        if (!visible) return null;
        const selected = poi.id === selectedPoiId;
        const hovered = poi.id === hoveredPoiId;
        const expanded = selected || hovered;
        const poiCopy = getPoiCopy(poi, lang);
        return (
          <button
            key={poi.id}
            type="button"
            onClick={() => onSelectPoi(poi)}
            onMouseEnter={() => setHoveredPoiId(poi.id)}
            onMouseLeave={() => setHoveredPoiId((cur) => (cur === poi.id ? null : cur))}
            style={{ transform: `translate(${x}px, ${y}px) translate(-50%, -100%)` }}
            className={`absolute left-0 top-0 z-[5] flex flex-col items-start nms-chamfer-sm border px-2 py-0.5 font-mono text-left backdrop-blur-sm transition ${
              selected
                ? 'z-[6] border-[#38e8ff] bg-[#04070d]/92 text-[#38e8ff] shadow-lg shadow-[#38e8ff]/25'
                : 'border-white/20 bg-[#04070d]/72 text-[#f4efe6]/85 hover:border-[#38e8ff]'
            }`}
          >
            <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider">
              <span
                className={`inline-block h-1.5 w-1.5 nms-diamond ${
                  selected
                    ? 'bg-[#38e8ff]'
                    : poi.kind === 'shelter'
                      ? 'bg-[#38e8ff]'
                      : 'bg-[#ffae24]'
                }`}
              />
              <span>
                {poi.id} · {poiCopy.viewport3d}
              </span>
            </div>
            {expanded && (
              <div className="mt-0.5 text-[8px] text-[#f4efe6]/75">
                ({poi.x >= 0 ? `+${poi.x}` : poi.x}m, {poi.y >= 0 ? `+${poi.y}` : poi.y}m) ·{' '}
                {t('Elev', 'Cota')} {elevM}m · {poiCopy.featureDiameterLabel ?? poi.unit}
              </div>
            )}
          </button>
        );
      })}

      {/* BANNERS OPCIONALES DE FORMACIONES 1, 2 Y 5 Y VÉRTICES (SÓLO SI [5] MARCADORES 3D ESTÁ ACTIVO) */}
      {projectedBanners.map((b) => {
        if (!b.visible) return null;
        const isVertex = b.id.startsWith('BANNER-V');
        return (
          <div
            key={b.id}
            style={{
              transform: `translate(${b.x}px, ${b.y}px) translate(-50%, -50%)`,
              borderColor: b.badgeColor,
            }}
            className={`pointer-events-none absolute left-0 top-0 z-[3] rounded border px-2 py-0.5 font-mono backdrop-blur-sm ${
              isVertex
                ? 'bg-[#04070d]/80 text-[8px] text-[#38e8ff]'
                : 'bg-[#04070d]/85 text-[9px] text-white shadow-md'
            }`}
          >
            <div className="font-bold tracking-wider" style={{ color: b.badgeColor }}>
              {b.title}
            </div>
            {!isVertex && <div className="text-[7px] text-[#f4efe6]/75">{b.subtitle}</div>}
          </div>
        );
      })}

      {/* ==================== MODALES UX/UI ACTIVADOS DESDE CONSOLA DE ANTEBRAZO ==================== */}
      {activeModal !== 'none' &&
        activeModal !== 'poi-detail' && (
          <div
            onClick={closeModal}
            className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/72 p-4 backdrop-blur-md"
          >
            {/* MODAL 1: [2] CAPAS GIS Y ESTILO CARTOGRÁFICO NASA */}
            {activeModal === 'layers' && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="max-h-[86vh] w-full max-w-2xl overflow-y-auto nms-panel nms-chamfer border border-[#38e8ff]/55 bg-[#04070d]/95 p-4 font-mono text-xs text-[#f4efe6] shadow-2xl"
              >
                <div className="flex items-center justify-between border-b border-white/15 pb-2.5">
                  <div>
                    <div className="text-xs font-bold tracking-wider text-[#38e8ff]">
                      {t(
                        'GIS ANALYTICAL LAYERS & NASA / ARCGIS CARTOGRAPHY',
                        'CAPAS ANALÍTICAS GIS Y CARTOGRAFÍA NASA / ARCGIS'
                      )}
                    </div>
                    <div className="text-[9px] text-[#f4efe6]/60">
                      {t(
                        'Real isohypse contour lines every 2.5 m / 10 m + 500 m metric grid',
                        'Curvas de nivel isóhipsas reales cada 2,5 m / 10 m + Grilla métrica 500 m'
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="rounded border border-white/20 p-1 text-white/75 hover:border-[#38e8ff] hover:text-[#38e8ff]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-3">
                  <div className="mb-1.5 text-[10px] font-bold text-[#ffae24]">
                    {t(
                      '1. SCIENTIFIC ANALYSIS & EVA SAFETY LAYER',
                      '1. CAPA DE ANÁLISIS CIENTÍFICO Y SEGURIDAD EVA'
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {gisLayersMeta.map((layerItem) => {
                      const isActive = activeLayer === layerItem.id;
                      return (
                        <button
                          key={layerItem.id}
                          type="button"
                          onClick={() => onChangeLayer && onChangeLayer(layerItem.id)}
                          className={`nms-chamfer-sm border p-2 text-left transition ${
                            isActive
                              ? 'border-[#38e8ff] bg-[#38e8ff]/20 text-white'
                              : 'border-white/15 bg-white/5 text-[#f4efe6]/80 hover:border-[#38e8ff]/50'
                          }`}
                        >
                          <div className="text-[10px] font-bold text-[#38e8ff]">
                            {layerItem.label}
                          </div>
                          <div className="mt-0.5 text-[8px] text-[#f4efe6]/65">
                            {layerItem.desc}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="mb-1.5 text-[10px] font-bold text-[#ffae24]">
                    {t('2. SURFACE CARTOGRAPHIC STYLE', '2. ESTILO CARTOGRÁFICO DE SUPERFICIE')}
                  </div>
                  <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                    {(Object.keys(cartoStyleLabels) as NasaCartographicStyle[]).map((styleKey) => {
                      const active = cartoStyle === styleKey;
                      return (
                        <button
                          key={styleKey}
                          type="button"
                          onClick={() => setCartoStyle(styleKey)}
                          className={`nms-chamfer-sm border px-2 py-2 text-center text-[9px] font-bold transition ${
                            active
                              ? 'border-[#ffae24] bg-[#ffae24] text-[#04070d]'
                              : 'border-white/15 bg-white/5 text-[#f4efe6]/80 hover:border-[#ffae24]/50'
                          }`}
                        >
                          {cartoStyleLabels[styleKey]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/15 pt-3">
                  <div className="flex gap-2">
                    <div className="flex items-center overflow-hidden rounded border border-white/15 bg-black/30">
                      <button
                        type="button"
                        onClick={() => setTrueScale1to1(true)}
                        className={`px-2.5 py-1.5 text-[10px] font-bold transition ${
                          trueScale1to1
                            ? 'bg-emerald-500/30 text-emerald-200'
                            : 'text-[#f4efe6]/65 hover:text-white'
                        }`}
                      >
                        {t('1x SCALE', 'ESCALA 1x')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setTrueScale1to1(false)}
                        className={`px-2.5 py-1.5 text-[10px] font-bold transition ${
                          !trueScale1to1
                            ? 'bg-cyan-500/30 text-cyan-200'
                            : 'text-[#f4efe6]/65 hover:text-white'
                        }`}
                      >
                        {t('3x DTM RELIEF', '3x RELIEVE DTM')}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowDimensionRings((v) => !v)}
                      className={`rounded border px-3 py-1.5 text-[10px] font-bold transition ${
                        showDimensionRings
                          ? 'border-[#ffae24] bg-[#ffae24]/20 text-[#ffae24]'
                          : 'border-white/15 text-[#f4efe6]/60'
                      }`}
                    >
                      {t('DIAMETER RINGS Ø', 'ANILLOS DE DIÁMETRO Ø')}:{' '}
                      {showDimensionRings ? 'ON' : 'OFF'}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="nms-chamfer-sm bg-[#38e8ff] px-4 py-1.5 text-[10px] font-bold text-[#04070d] hover:bg-[#70f0ff]"
                  >
                    {t('APPLY & RETURN TO MAP', 'APLICAR Y VOLVER AL MAPA')}
                  </button>
                </div>
              </div>
            )}

            {/* MODAL 2: [3] ZONAS DEL ÁREA DE ESTUDIO, MEDIDAS Ø, POLÍGONO ARCGIS Y APIs NASA */}
            {activeModal === 'geodesic' && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="max-h-[86vh] w-full max-w-3xl overflow-y-auto nms-panel nms-chamfer border border-[#38e8ff]/55 bg-[#04070d]/95 p-4 font-mono text-xs text-[#f4efe6] shadow-2xl"
              >
                <div className="flex items-center justify-between border-b border-white/15 pb-2.5">
                  <div>
                    <div className="text-xs font-bold tracking-wider text-[#38e8ff]">
                      {t(
                        'ARCADIA PLANITIA ZONES · GEODESY, DIAMETERS & NASA APIs',
                        'ZONAS DE ARCADIA PLANITIA · GEODESIA, DIÁMETROS Y APIs NASA'
                      )}
                    </div>
                    <div className="text-[9px] text-[#ffae24]">{activeZoneCopy.missionPriority}</div>
                  </div>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="rounded border border-white/20 p-1 text-white/75 hover:border-[#38e8ff] hover:text-[#38e8ff]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Selector de las 4 zonas dentro del Polígono de Estudio */}
                <div className="mt-3">
                  <div className="mb-1.5 text-[10px] font-bold text-[#38e8ff]">
                    {t(
                      'SELECT STUDY ZONE (SYNCED ACROSS PRE-EVA AND EVA)',
                      'SELECCIONAR ZONA DE ESTUDIO (SINCRONIZADA CON PRE-EVA Y EVA)'
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {ARCADIA_ZONES.map((z) => {
                      const active = z.id === activeZone.id;
                      const zCopy = getZoneCopy(z, lang);
                      return (
                        <button
                          key={z.id}
                          type="button"
                          onClick={() => onChangeZoneId && onChangeZoneId(z.id)}
                          className={`nms-chamfer-sm border p-2 text-left transition ${
                            active
                              ? 'border-[#38e8ff] bg-[#38e8ff]/20 text-white'
                              : 'border-white/15 bg-white/5 text-[#f4efe6]/80 hover:border-[#38e8ff]/50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 text-[10px] font-bold">
                            <span className="min-w-0 leading-snug text-[#38e8ff]">{zCopy.code}</span>
                            <span className="shrink-0 whitespace-nowrap text-[#ffae24]">
                              {z.centerLatDeg.toFixed(2)}°N, {z.centerLonWestDeg.toFixed(2)}°
                              {lonDir(lang)}
                            </span>
                          </div>
                          <div className="mt-0.5 text-[9px] text-[#f4efe6]/80">{zCopy.subtitle}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Medidas Exactas y Polígono ArcGIS */}
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded border border-white/15 bg-black/40 p-2.5 text-[9px]">
                    <div className="mb-1 font-bold text-[#38e8ff]">
                      {t('EXACT QUADRANT DIMENSIONS', 'DIMENSIONES EXACTAS DEL CUADRANTE')}
                    </div>
                    <div className="space-y-1">
                      <div>
                        {t('Mapped area', 'Área mapeada')}:{' '}
                        <strong className="text-white">
                          {t('5.00 × 5.00 km (25 km²)', '5,00 × 5,00 km (25 km²)')}
                        </strong>
                      </div>
                      <div>
                        {t('Diagonal diameter', 'Diámetro diagonal')}:{' '}
                        <strong className="text-[#ffae24]">
                          {t('Ø 7.07 km (7,071 m)', 'Ø 7,07 km (7.071 m)')}
                        </strong>
                      </div>
                      <div>
                        {t('EVA operational radius', 'Radio operativo EVA')}:{' '}
                        <strong className="text-[#38e8ff]">
                          {t('R = 2.50 km (Ø 5.0 km)', 'R = 2,50 km (Ø 5,0 km)')}
                        </strong>
                      </div>
                      <div>
                        {t('COSPAR perimeter', 'Perímetro COSPAR')}:{' '}
                        <strong className="text-emerald-300">
                          {t('Ø 1.00 km (R = 500 m)', 'Ø 1,00 km (R = 500 m)')}
                        </strong>
                      </div>
                      <div>
                        {t('MOLA range', 'Rango MOLA')}:{' '}
                        <strong className="text-white">
                          {grid.metadata?.elevationRangeM
                            ? `${grid.metadata.elevationRangeM[0]} m ${t('to', 'a')} ${grid.metadata.elevationRangeM[1]} m`
                            : `${activeZone.datumElevationBaseM} m`}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {activeZone.polygonVertices && (
                    <div className="rounded border border-[#ffae24]/40 bg-[#ffae24]/10 p-2.5 text-[9px] text-amber-100">
                      <div className="mb-1 font-bold text-[#ffae24]">
                        {t(
                          'OFFICIAL ARCGIS POLYGON (INTERSECTION 1·2·5)',
                          'POLÍGONO OFICIAL ARCGIS (INTERSECCIÓN 1·2·5)'
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-1">
                        {activeZone.polygonVertices.map((v) => (
                          <div key={v.id}>
                            <strong>{getVertexLabel(v.id, lang)}:</strong> {v.lat}° N, {v.lon}°{' '}
                            {lonDir(lang)}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Formaciones 1, 2 y 5 + Ventajas/Riesgos del Documento */}
                <div className="mt-3 rounded border border-white/15 bg-white/5 p-2.5 text-[9px] space-y-1">
                  <div className="font-bold text-[#38e8ff]">
                    {t('DOCUMENT DOSSIER', 'FICHADO DOCUMENTAL')}: {activeZoneCopy.name}
                  </div>
                  <div>
                    <strong className="text-emerald-300">{t('Advantage', 'Ventaja')}:</strong>{' '}
                    {activeZoneCopy.advantagesDoc}
                  </div>
                  <div>
                    <strong className="text-amber-300">{t('Risk', 'Riesgo')}:</strong>{' '}
                    {activeZoneCopy.risksDoc}
                  </div>
                </div>

                {/* APIs del Documento */}
                <div className="mt-3 rounded border border-[#38e8ff]/30 bg-black/45 p-2.5 text-[9px]">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#ffae24]">
                      {t(
                        'MISSION API FEEDS (NASA DONKI + MARS TREK WMTS)',
                        'HERRAMIENTAS API DEL DOCUMENTO (NASA DONKI + MARS TREK WMTS)'
                      )}
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 text-[8px] font-bold ${
                        donkiStatus?.online
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-cyan-500/20 text-cyan-300'
                      }`}
                    >
                      {donkiStatus?.online ? 'DONKI ONLINE' : 'EDGE FALLBACK'} ·{' '}
                      {wmtsLoaded
                        ? t('WMTS ACTIVE', 'WMTS ACTIVO')
                        : t('VECTOR DTM', 'DTM VECTORIAL')}
                    </span>
                  </div>
                  <div className="mt-1 text-[#f4efe6]/80">
                    {getDonkiSummaryText(donkiStatus ?? null, lang)}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <a
                      href={activeZone.arcgisExperienceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 rounded border border-[#38e8ff]/50 bg-[#38e8ff]/15 px-3 py-1.5 text-center font-bold text-[#38e8ff] hover:bg-[#38e8ff]/30"
                    >
                      {t('OPEN ARCGIS USGS POLYGON ↗', 'ABRIR POLÍGONO ARCGIS USGS ↗')}
                    </a>
                    <a
                      href={activeZone.marsTrekPortalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 rounded border border-[#ffae24]/50 bg-[#ffae24]/15 px-3 py-1.5 text-center font-bold text-[#ffae24] hover:bg-[#ffae24]/30"
                    >
                      {t('OPEN JPL MARS TREK PORTAL ↗', 'ABRIR PORTAL JPL MARS TREK ↗')}
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* MODAL 3: [4] ATLAS VISUAL, PERSEVERANCE RAW & NASA WORLDVIEW */}
            {activeModal === 'atlas' && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="max-h-[86vh] w-full max-w-2xl overflow-y-auto nms-panel nms-chamfer border border-[#ffae24]/65 bg-[#04070d]/95 p-4 font-mono text-[#f4efe6] shadow-2xl"
              >
                <div className="flex items-center justify-between border-b border-white/15 pb-2">
                  <div>
                    <div className="text-xs font-bold tracking-wider text-[#ffae24]">
                      {t(
                        'NASA GEOLOGY ATLAS · PERSEVERANCE & WORLDVIEW',
                        'ATLAS GEOLÓGICO NASA · PERSEVERANCE Y WORLDVIEW'
                      )}
                    </div>
                    <div className="text-[9px] text-[#38e8ff]">
                      {activeZone.centerLatDeg.toFixed(4)}° N, {activeZone.centerLonWestDeg.toFixed(4)}° W ({activeZone.centerLonEastDeg.toFixed(2)}° E) · {t('6 Cited NASA Sources', '6 Fuentes NASA Citadas')}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="rounded border border-white/20 p-1 text-white/75 hover:border-[#ff2a4b] hover:text-[#ff2a4b]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Sub-tabs for NASA Portal Integration */}
                <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-[9.5px]">
                  <button
                    type="button"
                    onClick={() => setAtlasTab('atlas')}
                    className={`rounded border px-2 py-1.5 font-bold transition ${
                      atlasTab === 'atlas'
                        ? 'border-[#ffae24] bg-[#ffae24]/20 text-[#ffae24]'
                        : 'border-white/15 bg-white/5 text-white/70 hover:border-white/35'
                    }`}
                  >
                    {t('USGS + Curiosity Path', 'USGS + Ruta Curiosity')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAtlasTab('perseverance')}
                    className={`rounded border px-2 py-1.5 font-bold transition ${
                      atlasTab === 'perseverance'
                        ? 'border-[#38e8ff] bg-[#38e8ff]/20 text-[#38e8ff]'
                        : 'border-white/15 bg-white/5 text-white/70 hover:border-white/35'
                    }`}
                  >
                    {t('Perseverance Raw Gallery', 'Perseverance Galería Raw')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAtlasTab('worldview')}
                    className={`rounded border px-2 py-1.5 font-bold transition ${
                      atlasTab === 'worldview'
                        ? 'border-emerald-400 bg-emerald-400/20 text-emerald-200'
                        : 'border-white/15 bg-white/5 text-white/70 hover:border-white/35'
                    }`}
                  >
                    {t('Worldview Temporal & Earth', 'Worldview Temporal y Tierra')}
                  </button>
                </div>

                {atlasTab === 'atlas' && (
                  <>
                    <div className="mt-2.5 grid grid-cols-5 gap-1.5">
                      {STUDY_AREA_VISUAL_REFERENCES.map((refItem) => {
                        const active = refItem.id === activeAtlasItem.id;
                        const refCopy = getStudyRefCopy(refItem, lang);
                        return (
                          <button
                            key={refItem.id}
                            type="button"
                            onClick={() => setSelectedAtlasId(refItem.id)}
                            className={`overflow-hidden rounded border p-1 text-left transition ${
                              active
                                ? 'border-[#ffae24] bg-[#ffae24]/20 text-white'
                                : 'border-white/15 bg-white/5 text-[#f4efe6]/70 hover:border-white/40'
                            }`}
                          >
                            <img
                              src={refItem.imageUrl}
                              alt={refCopy.title}
                              className="h-12 w-full rounded object-cover"
                            />
                            <div className="mt-1 truncate text-[8px] font-bold">{refCopy.title}</div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-2.5 overflow-hidden rounded border border-white/20 bg-black/50">
                      <img
                        src={activeAtlasItem.imageUrl}
                        alt={activeAtlasCopy.title}
                        className="max-h-[260px] w-full bg-black object-contain"
                      />
                    </div>

                    <div className="mt-2 space-y-1 text-[10px]">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-bold text-[#38e8ff]">{activeAtlasCopy.title}</div>
                        {onToggleFlyover && (
                          <button
                            type="button"
                            onClick={() => {
                              onToggleFlyover();
                              closeModal();
                            }}
                            className="rounded border border-[#38e8ff] bg-[#38e8ff]/15 px-2 py-0.5 text-[9px] font-bold text-[#38e8ff] hover:bg-[#38e8ff]/30"
                          >
                            {t('Launch 3D Route Flyover ↗', 'Iniciar Sobrevuelo 3D ↗')}
                          </button>
                        )}
                      </div>
                      <div className="text-[9px] font-bold text-[#ffae24]">
                        {activeAtlasCopy.formationsShown} · {activeAtlasCopy.coordsLabel}
                      </div>
                      <p className="text-[9px] leading-relaxed text-[#f4efe6]/85">
                        {activeAtlasCopy.description}
                      </p>
                      <div className="text-[8.5px] text-white/65">
                        {t(
                          `USGS Vectors Active: ${usgsVectors.length} features (I-1802 Aa5/Aa2/Aa1 + SIM 3292 Structure #1662 & Contact #3637)`,
                          `Vectores USGS Activos: ${usgsVectors.length} capas (I-1802 Aa5/Aa2/Aa1 + SIM 3292 Estructura #1662 y Contacto #3637)`
                        )}
                      </div>
                    </div>
                  </>
                )}

                {atlasTab === 'perseverance' && (
                  <div className="mt-3 space-y-2.5 text-[10px]">
                    <div className="flex items-center justify-between rounded border border-[#38e8ff]/35 bg-[#38e8ff]/10 px-2.5 py-1.5 text-[9px] text-cyan-100">
                      <span>
                        {t(
                          'NASA Mars 2020 Raw Images Gallery — Regolith Texture, Clast Size & Photometric Contrast Calibration',
                          'Galería Raw Mars 2020 Perseverance — Calibración de Regolito, Bloques Rocosos y Contraste Fotométrico'
                        )}
                      </span>
                      <a
                        href="https://mars.nasa.gov/mars2020/multimedia/raw-images/"
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 font-bold text-[#38e8ff] underline"
                      >
                        NASA ↗
                      </a>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {perseSamples.map((im) => (
                        <div
                          key={im.key}
                          className="overflow-hidden rounded border border-white/15 bg-black/50 p-1.5"
                        >
                          <img
                            src={im.localUrl}
                            alt={im.title}
                            className="h-32 w-full rounded object-cover"
                          />
                          <div className="mt-1.5 text-[9px] font-bold text-[#38e8ff]">
                            {im.instrument} · Sol {im.sol}
                          </div>
                          <div className="text-[8px] text-[#ffae24]">{im.role}</div>
                          <div className="mt-0.5 truncate text-[8px] text-white/65">{im.imageId}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {atlasTab === 'worldview' && (
                  <div className="mt-3 space-y-3 text-[10px]">
                    {(() => {
                      const activeSol =
                        WORLDVIEW_TEMPORAL_SOLS[worldviewSolIdx] ?? WORLDVIEW_TEMPORAL_SOLS[1];
                      const spinoff = WORLDVIEW_EARTH_SPINOFF_PRESETS[0];
                      return (
                        <>
                          <div className="rounded border border-emerald-400/35 bg-emerald-400/10 p-2.5">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-emerald-200">
                                {t(
                                  'NASA Worldview Temporal Sol Layer Scrubber (Dust τ & SPE)',
                                  'Línea Temporal NASA Worldview (Capas Polvo τ y Tormenta SPE)'
                                )}
                              </span>
                              {onApplyWorldviewSol && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onApplyWorldviewSol(activeSol);
                                    closeModal();
                                  }}
                                  className="rounded border border-emerald-300 bg-emerald-400/20 px-2 py-0.5 text-[8.5px] font-bold text-emerald-100 hover:bg-emerald-400/35"
                                >
                                  {t('Apply Sol Environment', 'Aplicar Entorno Sol')}
                                </button>
                              )}
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={WORLDVIEW_TEMPORAL_SOLS.length - 1}
                              value={worldviewSolIdx}
                              onChange={(e) => setWorldviewSolIdx(Number(e.target.value))}
                              className="mt-2 h-1.5 w-full accent-emerald-300"
                            />
                            <div className="mt-1.5 flex items-center justify-between text-[9px]">
                              <span className="font-bold text-[#38e8ff]">{activeSol.utcLabel}</span>
                              <span>
                                τ={activeSol.dustTau.toFixed(2)} · {activeSol.protonPfu.toFixed(1)} pfu ·{' '}
                                {activeSol.minTempC}..{activeSol.maxTempC}°C
                              </span>
                            </div>
                            <div className="mt-1 text-[8.5px] text-white/80">
                              {lang === 'en' ? activeSol.noteEn : activeSol.noteEs}
                            </div>
                          </div>

                          <div className="rounded border border-white/15 bg-black/50 p-2.5">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-[#ffae24]">
                                {lang === 'en' ? spinoff.titleEn : spinoff.titleEs}
                              </span>
                              <a
                                href="https://worldview.earthdata.nasa.gov/"
                                target="_blank"
                                rel="noreferrer"
                                className="text-[8.5px] text-[#38e8ff] underline"
                              >
                                worldview.earthdata.nasa.gov ↗
                              </a>
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-2">
                              <img
                                src={spinoff.localTileUrl}
                                alt="NASA GIBS MODIS Terra Tile West"
                                className="h-28 w-full rounded border border-white/15 object-cover"
                              />
                              <img
                                src={spinoff.secondaryTileUrl}
                                alt="NASA GIBS MODIS Terra Tile East"
                                className="h-28 w-full rounded border border-white/15 object-cover"
                              />
                            </div>
                            <p className="mt-1.5 text-[8.5px] leading-relaxed text-white/80">
                              {lang === 'en' ? spinoff.mappingEn : spinoff.mappingEs}
                            </p>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      {/* PRE-EVA BOTTOM-LEFT TRANSLUCENT WATERMARK CITATION CARD */}
      {!hideWatermark && !cleanVisor && (
        <div className="pointer-events-none absolute bottom-5 left-6 z-10 w-[335px] rounded-3xl border border-white/10 bg-slate-950/24 px-4 py-2.5 font-sans backdrop-blur-md shadow-[0_12px_32px_rgba(0,0,0,0.22)]">
          <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-1">
            <span className="truncate text-[10.5px] font-semibold tracking-wide text-slate-200/75">
              A.R.E.S HUD - Ares Arcadia Team
            </span>
            <span className="shrink-0 font-mono text-[9px] text-slate-300/60">
              {trueScale1to1 ? t('1x Scale', 'Escala 1x') : '3x DTM'}
            </span>
          </div>
          <p className="mt-1.5 text-[10px] leading-snug text-slate-200/80">
            <strong className="font-medium text-slate-100/85">
              {t('Simulated Module Interior', 'Interior del módulo simulado')}
            </strong>{' '}
            · {cartoBib[cartoStyle]} · {layerBib[activeLayer]}
          </p>
        </div>
      )}
    </div>
  );
};
