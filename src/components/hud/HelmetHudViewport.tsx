import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type {
  ArcadiaMacroGrid,
  DeployableRepeater,
  MarsEphemerisState,
  PoiStation,
  ReturnStatusColor,
  RouteMetrics,
  RoutePoint,
  RoverTelemetry,
  SubgridHazardCheck,
} from '../../types/mission';
import { useI18n, type AppLanguage } from '../../i18n/I18nContext';
import { getPoiCopy } from '../../i18n/catalog';
import { MISSION_CONFIG } from '../../config/missionConfig';
import { buildDetailedRoverMesh } from '../shared/buildRoverMesh';

const EGRESS_DURATION_S = 4.2;

interface HelmetHudViewportProps {
  grid: ArcadiaMacroGrid;
  pois: PoiStation[];
  astronautPos: { x: number; y: number };
  headingRad: number;
  pitchRad: number;
  onChangeLook: (headingRad: number, pitchRad: number) => void;
  activeRoute: RouteMetrics | null;
  crossedOutRoute: RouteMetrics | null;
  returnStatusColor: ReturnStatusColor;
  contourLinesEnabled: boolean;
  dustTau: number;
  speActive: boolean;
  sosActive?: boolean;
  tunnelVisionMode: boolean;
  marsTime?: MarsEphemerisState;
  subgridCheck: SubgridHazardCheck;
  rover: RoverTelemetry;
  ridingRover?: boolean;
  buddyPos: { x: number; y: number };
  cacheNode: PoiStation | null;
  repeaters?: DeployableRepeater[];
  breadcrumbs?: RoutePoint[];
  evaEgressActive?: boolean;
  evaEgressRunId?: number;
  onEgressComplete?: () => void;
  onSkipEgress?: () => void;
  onHeadMotionFreeze?: (frozen: boolean) => void;
  onPerfSample: (fps: number, frameMs: number) => void;
}

interface ProjectedWorldMarker {
  id: string;
  label: string;
  distM: number;
  x: number;
  y: number;
  isTarget: boolean;
  kind: 'poi' | 'shelter' | 'base' | 'rover' | 'cache' | 'repeater';
  visible: boolean;
}

function clearThreeGroup(group: THREE.Group): void {
  while (group.children.length > 0) {
    const child = group.children[0];
    child.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.geometry.dispose();
        if (Array.isArray(m.material)) {
          m.material.forEach((mat) => mat.dispose());
        } else {
          m.material.dispose();
        }
      }
    });
    group.remove(child);
  }
}

const RELIEF_GAIN = 1.48;
const BASE_DATUM = -3000;
const GUIDE_PULSE_STEP_M = 2.0; // Fixed 2.0 m collimated guide pulse spacing along static EVA path

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function getCleanShortPoiName(poi: PoiStation, lang: AppLanguage): string {
  return getPoiCopy(poi, lang).hudShort;
}

function sampleTerrainBilinear(
  grid: ArcadiaMacroGrid,
  x: number,
  y: number
): { elevationM: number; visualY: number; hazard: number; svf: number } {
  const half = grid.quadrantSizeMeters / 2;
  const fx = Math.max(
    0,
    Math.min(grid.size - 1.001, (x + half - grid.cellSizeMeters / 2) / grid.cellSizeMeters)
  );
  const fy = Math.max(
    0,
    Math.min(grid.size - 1.001, (y + half - grid.cellSizeMeters / 2) / grid.cellSizeMeters)
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

  const elev =
    n00.elevationM * (1 - tx) * (1 - ty) +
    n10.elevationM * tx * (1 - ty) +
    n01.elevationM * (1 - tx) * ty +
    n11.elevationM * tx * ty;

  const svf =
    n00.svf * (1 - tx) * (1 - ty) +
    n10.svf * tx * (1 - ty) +
    n01.svf * (1 - tx) * ty +
    n11.svf * tx * ty;

  const slope =
    n00.slopeDeg * (1 - tx) * (1 - ty) +
    n10.slopeDeg * tx * (1 - ty) +
    n01.slopeDeg * (1 - tx) * ty +
    n11.slopeDeg * tx * ty;

  // Natural multi-octave aeolian micro-relief (non-repetitive)
  const microRipples =
    Math.sin(x * 0.042 + y * 0.011) * Math.cos(y * 0.044 - x * 0.009) * 0.68 +
    Math.sin(x * 0.13 + y * 0.11) * 0.18 +
    Math.cos(x * 0.27 - y * 0.19) * 0.06;

  const visualY = (elev - BASE_DATUM) * RELIEF_GAIN + microRipples;
  const hazard = Math.min(1, slope / 25);

  return { elevationM: elev, visualY, hazard, svf };
}

/**
 * Generates high-detail matte Martian regolith PBR maps (sRGB albedo, true tangent-space normal map,
 * micro-roughness map, and height bump map) calibrated to Perseverance Arcadia/Jezero basaltic silt.
 */
function createPhotorealRegolithTextures(maxAnisotropy = 4): {
  albedoMap: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 1024;
  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const aCtx = albedoCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rCtx = roughCanvas.getContext('2d')!;

  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = size;
  normalCanvas.height = size;
  const nCtx = normalCanvas.getContext('2d')!;

  // Toroidal periodic Float32 noise tables -> mathematically seamless with zero square-pixel fillRect edges
  const makePeriodicGrid = (period: number, seed: number): Float32Array => {
    const arr = new Float32Array(period * period);
    for (let y = 0; y < period; y++) {
      for (let x = 0; x < period; x++) {
        arr[y * period + x] = hash2(x * 13.7 + y * 57.3, seed);
      }
    }
    return arr;
  };

  const samplePeriodicSmooth = (
    grid: Float32Array,
    period: number,
    u: number,
    v: number
  ): number => {
    const gx = u * period;
    const gy = v * period;
    const x0 = Math.floor(gx) % period;
    const y0 = Math.floor(gy) % period;
    const x1 = (x0 + 1) % period;
    const y1 = (y0 + 1) % period;
    const fx = gx - Math.floor(gx);
    const fy = gy - Math.floor(gy);
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const v00 = grid[y0 * period + x0];
    const v10 = grid[y0 * period + x1];
    const v01 = grid[y1 * period + x0];
    const v11 = grid[y1 * period + x1];
    return (v00 * (1 - sx) + v10 * sx) * (1 - sy) + (v01 * (1 - sx) + v11 * sx) * sy;
  };

  const gMacro = makePeriodicGrid(16, 1.37);
  const gMed = makePeriodicGrid(40, 4.91);
  const gFine = makePeriodicGrid(96, 9.73);
  const gGrain = makePeriodicGrid(256, 17.53);

  const heightBuf = new Float32Array(size * size);
  const albedoImg = aCtx.createImageData(size, size);
  const bumpImg = bCtx.createImageData(size, size);
  const roughImg = rCtx.createImageData(size, size);
  const aData = albedoImg.data;
  const bData = bumpImg.data;
  const rData = roughImg.data;

  // Synthesize smooth continuous regolith fBm + curved aeolian ripples in Float32
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const nMacro = samplePeriodicSmooth(gMacro, 16, u, v);
      const nMed = samplePeriodicSmooth(gMed, 40, u, v);
      const nFine = samplePeriodicSmooth(gFine, 96, u, v);
      const nGrain = samplePeriodicSmooth(gGrain, 256, u, v);

      // Organic wind-warped aeolian ripples (non-banded curves)
      const warp = (nMacro - 0.5) * 0.42 + (nMed - 0.5) * 0.14;
      const phase = (v * 7.0 + u * 1.0 + warp) * Math.PI * 2;
      const ripple = Math.pow(0.5 + 0.5 * Math.sin(phase), 1.35);

      const h =
        0.34 * nMacro + 0.28 * nMed + 0.22 * nFine + 0.16 * nGrain + (ripple - 0.5) * 0.22;
      const idx = y * size + x;
      heightBuf[idx] = h;

      // Ferric hematite dust crests + darker mafic basaltic silt in troughs
      const tone = 0.55 * h + 0.28 * nFine + 0.17 * nGrain;
      const speck = (hash2(x * 0.73, y * 1.19) - 0.5) * 14;
      const rCol = Math.min(255, Math.max(24, Math.round(96 + tone * 86 + speck)));
      const gCol = Math.min(255, Math.max(18, Math.round(52 + tone * 50 + speck * 0.72)));
      const bCol = Math.min(255, Math.max(14, Math.round(36 + tone * 34 + speck * 0.55)));

      const p4 = idx * 4;
      aData[p4] = rCol;
      aData[p4 + 1] = gCol;
      aData[p4 + 2] = bCol;
      aData[p4 + 3] = 255;

      // High matte roughness (0.86 - 0.98)
      const rVal = Math.min(252, Math.max(218, Math.round(224 + (1.0 - nFine) * 26)));
      rData[p4] = rVal;
      rData[p4 + 1] = rVal;
      rData[p4 + 2] = rVal;
      rData[p4 + 3] = 255;
    }
  }

  // Stamp smooth toroidal radial cobbles & shallow micrometeorite pits directly into Float32 buffer
  for (let i = 0; i < 650; i++) {
    const cx = Math.floor(hash2(i, 3.17) * size);
    const cy = Math.floor(hash2(i, 7.83) * size);
    const radius = 3.0 + hash2(i, 12.41) * 9.5;
    const rCeil = Math.ceil(radius);
    const isPit = i % 5 === 0;
    const isDarkBasalt = i % 2 === 0;
    const amp = isPit ? -0.14 : 0.08 + hash2(i, 19.7) * 0.1;

    for (let dy = -rCeil; dy <= rCeil; dy++) {
      const py = (cy + dy + size) & (size - 1);
      for (let dx = -rCeil; dx <= rCeil; dx++) {
        const d2 = (dx * dx + dy * dy) / (radius * radius);
        if (d2 >= 1.0) continue;
        const px = (cx + dx + size) & (size - 1);
        const w = (1.0 - d2) * (1.0 - d2); // C1 smooth quadratic dome falloff
        const idx = py * size + px;
        heightBuf[idx] += amp * w;

        const p4 = idx * 4;
        const blend = w * 0.34;
        const targetR = isPit ? 78 : isDarkBasalt ? 64 : 158;
        const targetG = isPit ? 46 : isDarkBasalt ? 48 : 98;
        const targetB = isPit ? 32 : isDarkBasalt ? 44 : 68;
        aData[p4] = Math.round(aData[p4] * (1 - blend) + targetR * blend);
        aData[p4 + 1] = Math.round(aData[p4 + 1] * (1 - blend) + targetG * blend);
        aData[p4 + 2] = Math.round(aData[p4 + 2] * (1 - blend) + targetB * blend);
      }
    }
  }

  // Fill smooth 8-bit bump image (for rock meshes) and compute continuous Float32 tangent-space normals
  const normalImg = nCtx.createImageData(size, size);
  const nData = normalImg.data;
  const strength = 0.92;

  for (let y = 0; y < size; y++) {
    const yUp = (y - 1 + size) & (size - 1);
    const yDn = (y + 1) & (size - 1);
    for (let x = 0; x < size; x++) {
      const xLt = (x - 1 + size) & (size - 1);
      const xRt = (x + 1) & (size - 1);
      const idx = y * size + x;
      const p4 = idx * 4;

      const bByte = Math.min(255, Math.max(0, Math.round((heightBuf[idx] * 0.72 + 0.14) * 255)));
      bData[p4] = bByte;
      bData[p4 + 1] = bByte;
      bData[p4 + 2] = bByte;
      bData[p4 + 3] = 255;

      const hL = heightBuf[y * size + xLt];
      const hR = heightBuf[y * size + xRt];
      const hU = heightBuf[yUp * size + x];
      const hD = heightBuf[yDn * size + x];

      const dx = (hL - hR) * strength;
      const dy = (hU - hD) * strength;
      const invLen = 1 / Math.hypot(dx, dy, 1.0);

      nData[p4] = Math.round((dx * invLen * 0.5 + 0.5) * 255);
      nData[p4 + 1] = Math.round((dy * invLen * 0.5 + 0.5) * 255);
      nData[p4 + 2] = Math.round((invLen * 0.5 + 0.5) * 255);
      nData[p4 + 3] = 255;
    }
  }

  aCtx.putImageData(albedoImg, 0, 0);
  bCtx.putImageData(bumpImg, 0, 0);
  rCtx.putImageData(roughImg, 0, 0);
  nCtx.putImageData(normalImg, 0, 0);

  const aniso = Math.min(16, Math.max(4, maxAnisotropy));

  const setupTiled = (canvas: HTMLCanvasElement, repeatVal: number, isSrgb: boolean) => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatVal, repeatVal);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.anisotropy = aniso;
    if (isSrgb) {
      tex.colorSpace = THREE.SRGBColorSpace;
    }
    tex.needsUpdate = true;
    return tex;
  };

  return {
    albedoMap: setupTiled(albedoCanvas, 300, true),
    normalMap: setupTiled(normalCanvas, 300, false),
    roughnessMap: setupTiled(roughCanvas, 300, false),
    bumpMap: setupTiled(bumpCanvas, 300, false),
  };
}

export const HelmetHudViewport: React.FC<HelmetHudViewportProps> = ({
  grid,
  pois,
  astronautPos,
  headingRad,
  pitchRad,
  onChangeLook,
  activeRoute,
  crossedOutRoute,
  returnStatusColor,
  contourLinesEnabled,
  dustTau,
  speActive,
  sosActive = false,
  tunnelVisionMode,
  marsTime,
  subgridCheck,
  rover,
  ridingRover = false,
  buddyPos,
  cacheNode,
  repeaters = [],
  breadcrumbs = [],
  evaEgressActive = false,
  evaEgressRunId = 0,
  onEgressComplete,
  onSkipEgress,
  onHeadMotionFreeze,
  onPerfSample,
}) => {
  const { lang, t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const markersOverlayRef = useRef<HTMLDivElement>(null);
  const horizonBarRef = useRef<HTMLDivElement>(null);
  const egressPhaseLabelRef = useRef<HTMLSpanElement>(null);
  const egressPressureTextRef = useRef<HTMLSpanElement>(null);
  const egressProgressBarRef = useRef<HTMLDivElement>(null);
  const egressDotRef = useRef<HTMLSpanElement>(null);
  const egressFlashRef = useRef<HTMLDivElement>(null);
  const [worldMarkers, setWorldMarkers] = useState<ProjectedWorldMarker[]>([]);
  const forearmRaisedRef = useRef(true);
  const pickupStateRef = useRef<{
    active: boolean;
    startMs: number;
    durationMs: number;
    worldX: number;
    worldY: number;
    visualY: number;
  }>({
    active: false,
    startMs: 0,
    durationMs: 1350,
    worldX: 0,
    worldY: 20,
    visualY: 0,
  });
  const egressStateRef = useRef<{
    runId: number;
    elapsed: number;
    active: boolean;
    doneNotified: boolean;
  }>({
    runId: evaEgressRunId,
    elapsed: 0,
    active: evaEgressActive,
    doneNotified: !evaEgressActive,
  });

  useEffect(() => {
    egressStateRef.current = {
      runId: evaEgressRunId,
      elapsed: 0,
      active: evaEgressActive,
      doneNotified: !evaEgressActive,
    };
    if (markersOverlayRef.current) {
      markersOverlayRef.current.style.opacity = evaEgressActive ? '0' : '1';
    }
  }, [evaEgressActive, evaEgressRunId]);

  const propsRef = useRef({
    astronautPos,
    headingRad,
    pitchRad,
    activeRoute,
    crossedOutRoute,
    returnStatusColor,
    contourLinesEnabled,
    dustTau,
    speActive,
    sosActive,
    tunnelVisionMode,
    marsTime,
    subgridCheck,
    rover,
    ridingRover,
    buddyPos,
    cacheNode,
    repeaters,
    lang,
    onChangeLook,
    onEgressComplete,
    onHeadMotionFreeze,
    onPerfSample,
  });
  propsRef.current = {
    astronautPos,
    headingRad,
    pitchRad,
    activeRoute,
    crossedOutRoute,
    returnStatusColor,
    contourLinesEnabled,
    dustTau,
    speActive,
    sosActive,
    tunnelVisionMode,
    marsTime,
    subgridCheck,
    rover,
    ridingRover,
    buddyPos,
    cacheNode,
    repeaters,
    lang,
    onChangeLook,
    onEgressComplete,
    onHeadMotionFreeze,
    onPerfSample,
  };

  // Listen to diegetic forearm raise/lower state from HudOverlay
  useEffect(() => {
    const onForearmEvent = (ev: Event) => {
      const custom = ev as CustomEvent<{ raised: boolean }>;
      if (custom.detail && typeof custom.detail.raised === 'boolean') {
        forearmRaisedRef.current = custom.detail.raised;
      }
    };
    window.addEventListener('ares-forearm-state', onForearmEvent);
    return () => window.removeEventListener('ares-forearm-state', onForearmEvent);
  }, []);

  // Listen to floor/outcrop sample pickup events to trigger 1st-person crouch & glove grab animation
  useEffect(() => {
    const onPickupEvent = (ev: Event) => {
      const d = (ev as CustomEvent<{ full?: boolean }>).detail;
      if (d?.full) return;
      const p = propsRef.current;
      const h = p.headingRad;
      const reachM = p.ridingRover ? 2.2 : 1.55;
      const worldX = p.astronautPos.x + Math.sin(h) * reachM + Math.cos(h) * 0.05;
      const worldY = p.astronautPos.y + Math.cos(h) * reachM - Math.sin(h) * 0.05;
      const visualY = sampleTerrainBilinear(grid, worldX, worldY).visualY;
      pickupStateRef.current = {
        active: true,
        startMs: performance.now(),
        durationMs: 1350,
        worldX,
        worldY,
        visualY,
      };
    };
    window.addEventListener('ares-sample-pickup', onPickupEvent);
    return () => window.removeEventListener('ares-sample-pickup', onPickupEvent);
  }, [grid]);

  const sceneRefs = useRef<{
    scene: THREE.Scene;
    routeGroup: THREE.Group;
    crossedGroup: THREE.Group;
    breadcrumbGroup: THREE.Group;
    cacheGroup: THREE.Group;
    repeaterGroup: THREE.Group;
    routeCurve: THREE.CatmullRomCurve3 | null;
    routeTotalLen: number;
    leadPulseGroup: THREE.Group;
    leadCoreMesh: THREE.Mesh;
    leadRingInner: THREE.Mesh;
    leadRingOuter: THREE.Mesh;
    pulseNodes: Array<{
      group: THREE.Group;
      distAlongM: number;
      worldPos: THREE.Vector3;
      orbMat: THREE.MeshBasicMaterial;
      ringMat: THREE.MeshBasicMaterial;
      ringMesh: THREE.Mesh;
      mappedSampleIdx: number;
    }>;
    bakedRouteSamples: Array<{
      worldPos: THREE.Vector3;
      groundY: number;
      distAlongM: number;
    }>;
    emergencyTubeMat: THREE.MeshBasicMaterial | null;
    forearm3DGroup: THREE.Group;
    forearmScreenGlow: THREE.Mesh;
    pickupArmGroup: THREE.Group;
    pickupClawLeft: THREE.Mesh;
    pickupClawRight: THREE.Mesh;
    pickupClawTip: THREE.Object3D;
    pickupLaserRing: THREE.Mesh;
    pickupSpecimenGroup: THREE.Group;
    pickupRockMesh: THREE.Mesh;
    pickupGroundRing: THREE.Mesh;
    contourUniforms: {
      uShowContours: { value: number };
      uAlertMode: { value: number };
      uTime: { value: number };
      uFrost: { value: number };
      uDust: { value: number };
      uAstroPos: { value: THREE.Vector3 };
    };
    skyUniforms: {
      uDust: { value: number };
      uSpe: { value: number };
      uTime: { value: number };
      uSunDir: { value: THREE.Vector3 };
      uSunElevDeg: { value: number };
      uBlueSunset: { value: number };
      uPhobosDir: { value: THREE.Vector3 };
      uDeimosDir: { value: THREE.Vector3 };
    };
    skyMesh: THREE.Mesh;
    fog: THREE.FogExp2;
    sunLight: THREE.DirectionalLight;
    hemiLight: THREE.HemisphereLight;
    helmetHeadlamp: THREE.SpotLight;
    visorFillLight: THREE.PointLight;
    roverFloodLight: THREE.SpotLight;
    habExteriorLight: THREE.PointLight;
    roverGroup: THREE.Group;
    roverDish: THREE.Group;
    roverWheels: THREE.Object3D[];
    roverBeaconMat: THREE.MeshBasicMaterial;
    roverMastHeadRef: { current: THREE.Object3D | null };
    roverUsingNasaGlbRef: { current: boolean };
    buddyGroup: THREE.Group;
    poiMeshes: Array<{ ring: THREE.Mesh; diamond: THREE.Mesh }>;
    orbitalBeaconGroup: THREE.Group;
    orbitalBeaconBeamMat: THREE.MeshBasicMaterial;
    orbitalBeaconRing: THREE.Mesh;
    dustPoints: THREE.Points;
    dustMat: THREE.PointsMaterial;
    airlockLeftDoor: THREE.Group;
    airlockRightDoor: THREE.Group;
    airlockInteriorLight: THREE.PointLight;
    airlockBeaconLight: THREE.PointLight;
    airlockStatusMat: THREE.MeshBasicMaterial;
    airlockLatches: {
      upperLeft: THREE.Mesh;
      upperRight: THREE.Mesh;
      lowerLeft: THREE.Mesh;
      lowerRight: THREE.Mesh;
    };
    airlockVentPoints: THREE.Points;
    airlockVentMat: THREE.PointsMaterial;
    airlockVentBase: Float32Array;
    renderer: THREE.WebGLRenderer;
    confidenceHaloGroup: THREE.Group;
    confidenceHaloInnerMat: THREE.MeshBasicMaterial;
    confidenceHaloOuterMat: THREE.MeshBasicMaterial;
    groundWireMesh: THREE.Mesh;
    groundWireMat: THREE.MeshBasicMaterial;
  } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    const marsSkyHex = 0x9c5a3c;
    scene.background = new THREE.Color(marsSkyHex);
    // UX-balanced exponential fog: conveys dust/sandstorm without ever blinding navigation
    const fog = new THREE.FogExp2(0x9c5a3c, 0.00065);
    scene.fog = fog;

    const camera = new THREE.PerspectiveCamera(64, width / height, 0.08, 3800);
    scene.add(camera);

    // Spacesuit mEMU Dual-LED Helmet Headlamp + Near-Field Visor Fill (engages smoothly at Dusk, Night & Whiteout)
    const helmetHeadlamp = new THREE.SpotLight(0xe8f6ff, 0, 86, Math.PI * 0.30, 0.56, 1.12);
    helmetHeadlamp.position.set(0.06, 0.14, -0.08);
    const headlampTarget = new THREE.Object3D();
    headlampTarget.position.set(0, -1.05, -13.0);
    camera.add(headlampTarget);
    helmetHeadlamp.target = headlampTarget;
    camera.add(helmetHeadlamp);

    const visorFillLight = new THREE.PointLight(0xaad8ff, 0, 26, 1.15);
    visorFillLight.position.set(0, 0.1, -0.35);
    camera.add(visorFillLight);

    // 1ST-PERSON SPACESUIT RIGHT FOREARM 3D RIG ATTACHED TO CAMERA (Bottom-Right; animates up on [Tab] / [B])
    const forearm3DGroup = new THREE.Group();
    forearm3DGroup.position.set(0.28, -0.62, -0.46);
    forearm3DGroup.rotation.set(-0.75, -0.25, 0.18);

    // Orthofabric matte thermal sleeve
    const sleeveMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.068, 0.082, 0.44, 20),
      new THREE.MeshStandardMaterial({
        color: 0xdcd7ce,
        roughness: 0.88,
        metalness: 0.04,
      })
    );
    sleeveMesh.rotation.z = -Math.PI / 2.25;
    sleeveMesh.position.set(0.08, -0.04, 0.04);
    forearm3DGroup.add(sleeveMesh);

    // Anodized titanium wrist disconnect ring
    const wristRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.069, 0.009, 12, 28),
      new THREE.MeshStandardMaterial({
        color: 0x64748b,
        roughness: 0.35,
        metalness: 0.82,
      })
    );
    wristRing.rotation.y = -Math.PI / 2.2;
    wristRing.position.set(-0.07, 0.02, 0.02);
    forearm3DGroup.add(wristRing);

    // Carbon-composite AR projector cuff housing on dorsal right forearm
    const cuffHousing = new THREE.Mesh(
      new THREE.BoxGeometry(0.19, 0.032, 0.105),
      new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.42,
        metalness: 0.65,
      })
    );
    cuffHousing.position.set(0.04, 0.036, 0.02);
    cuffHousing.rotation.z = 0.14;
    forearm3DGroup.add(cuffHousing);

    // Meta-AR Waveguide micro-OLED emitter bar
    const forearmScreenGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.165, 0.082),
      new THREE.MeshBasicMaterial({
        color: 0x38e8ff,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
      })
    );
    forearmScreenGlow.rotation.x = -Math.PI / 2;
    forearmScreenGlow.rotation.y = 0.14;
    forearmScreenGlow.position.set(0.04, 0.054, 0.02);
    forearm3DGroup.add(forearmScreenGlow);

    // Subtle cyan point light illuminating the suit sleeve when raised
    const wristLight = new THREE.PointLight(0x38e8ff, 0.45, 0.8);
    wristLight.position.set(0.04, 0.12, 0.04);
    forearm3DGroup.add(wristLight);

    camera.add(forearm3DGroup);

    // 1ST-PERSON GEOLOGICAL SAMPLE PICKUP RIG (Attached to Camera: armored mEMU left arm + pincer sampler + laser scan ring)
    const pickupArmGroup = new THREE.Group();
    pickupArmGroup.visible = false;

    const puSleeveMat = new THREE.MeshStandardMaterial({
      color: 0xdad5cc,
      roughness: 0.84,
      metalness: 0.08,
    });
    const puJointMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.42,
      metalness: 0.72,
    });
    const puCrimsonCollarMat = new THREE.MeshStandardMaterial({
      color: 0xb91c1c,
      roughness: 0.44,
      metalness: 0.56,
    });
    const puToolMetalMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.28,
      metalness: 0.88,
    });

    const puForearm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.044, 0.054, 0.34, 16),
      puSleeveMat
    );
    puForearm.rotation.x = Math.PI / 2;
    puForearm.position.set(0, 0.006, -0.15);
    pickupArmGroup.add(puForearm);

    const puWristRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.046, 0.0085, 10, 24),
      puCrimsonCollarMat
    );
    puWristRing.position.set(0, 0.004, -0.32);
    pickupArmGroup.add(puWristRing);

    const puGlove = new THREE.Mesh(
      new THREE.BoxGeometry(0.076, 0.052, 0.11),
      puJointMat
    );
    puGlove.position.set(0, 0, -0.38);
    pickupArmGroup.add(puGlove);

    // Geological core/tongs shaft extending from EVA sampling gauntlet
    const puShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.25, 10),
      puToolMetalMat
    );
    puShaft.rotation.x = Math.PI / 2;
    puShaft.position.set(0, -0.004, -0.52);
    pickupArmGroup.add(puShaft);

    const pickupClawLeft = new THREE.Mesh(
      new THREE.BoxGeometry(0.014, 0.022, 0.11),
      puToolMetalMat
    );
    pickupClawLeft.position.set(-0.024, -0.004, -0.66);
    pickupArmGroup.add(pickupClawLeft);

    const pickupClawRight = new THREE.Mesh(
      new THREE.BoxGeometry(0.014, 0.022, 0.11),
      puToolMetalMat
    );
    pickupClawRight.position.set(0.024, -0.004, -0.66);
    pickupArmGroup.add(pickupClawRight);

    const pickupClawTip = new THREE.Object3D();
    pickupClawTip.position.set(0, -0.008, -0.69);
    pickupArmGroup.add(pickupClawTip);

    const pickupLaserRing = new THREE.Mesh(
      new THREE.RingGeometry(0.028, 0.044, 24),
      new THREE.MeshBasicMaterial({
        color: 0x38e8ff,
        transparent: true,
        opacity: 0.78,
        side: THREE.DoubleSide,
      })
    );
    pickupLaserRing.position.set(0, -0.008, -0.68);
    pickupArmGroup.add(pickupLaserRing);

    camera.add(pickupArmGroup);

    // Ground basalt/olivine core specimen rock + LIBS target reticle placed on Martian soil during pickup
    const pickupSpecimenGroup = new THREE.Group();
    pickupSpecimenGroup.visible = false;

    const pickupRockMesh = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.135, 1),
      new THREE.MeshStandardMaterial({
        color: 0x5c3a2d,
        roughness: 0.78,
        metalness: 0.18,
      })
    );
    pickupRockMesh.scale.set(1.28, 0.78, 1.02);
    pickupRockMesh.castShadow = true;
    pickupSpecimenGroup.add(pickupRockMesh);

    const pickupMineralFleck = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.044, 0),
      new THREE.MeshBasicMaterial({ color: 0x67e8f9 })
    );
    pickupMineralFleck.position.set(0.035, 0.045, 0.02);
    pickupRockMesh.add(pickupMineralFleck);

    const pickupGroundRing = new THREE.Mesh(
      new THREE.RingGeometry(0.16, 0.21, 28),
      new THREE.MeshBasicMaterial({
        color: 0x38e8ff,
        transparent: true,
        opacity: 0.88,
        side: THREE.DoubleSide,
      })
    );
    pickupGroundRing.rotation.x = -Math.PI / 2;
    pickupGroundRing.position.y = -0.025;
    pickupSpecimenGroup.add(pickupGroundRing);

    scene.add(pickupSpecimenGroup);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Physically-Inspired Martian Sky Dome Shader (Arcadia Planitia 47.55°N):
    // - Butterscotch Mie daytime sky -> Copper-Peach twilight -> Starry indigo CO2 night sky
    // - NASA Curiosity/Perseverance iconic BLUE/CYAN forward-scattering aureole around rising/setting Sun
    // - Phobos (large resolved sunlit moon disc) & Deimos + distant Earth "Evening Star"
    // - Dynamic SPE violet-emerald proton ionization aurora across twilight & night skies
    const sunDirVec = new THREE.Vector3(0.55, 0.52, 0.65).normalize();
    const phobosDirVec = new THREE.Vector3(-0.35, 0.55, -0.75).normalize();
    const deimosDirVec = new THREE.Vector3(0.62, 0.48, -0.62).normalize();
    const skyUniforms = {
      uDust: { value: 0.55 },
      uSpe: { value: 0.0 },
      uTime: { value: 0.0 },
      uSunDir: { value: sunDirVec },
      uSunElevDeg: { value: 32.0 },
      uBlueSunset: { value: 0.0 },
      uPhobosDir: { value: phobosDirVec },
      uDeimosDir: { value: deimosDirVec },
    };
    const skyGeo = new THREE.SphereGeometry(2900, 48, 32);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: skyUniforms,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vDir;
        uniform float uDust;
        uniform float uSpe;
        uniform float uTime;
        uniform vec3 uSunDir;
        uniform float uSunElevDeg;
        uniform float uBlueSunset;
        uniform vec3 uPhobosDir;
        uniform vec3 uDeimosDir;

        float hash31(vec3 p) {
          p = fract(p * vec3(443.897, 441.423, 437.195));
          p += dot(p, p.yzx + 19.19);
          return fract((p.x + p.y) * p.z);
        }

        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y, 0.0, 1.0);
          float belowHorizon = clamp(-d.y * 8.0, 0.0, 1.0);
          float dustClamp = clamp((uDust - 0.15) / 2.35, 0.0, 1.0);

          // Diurnal weights derived strictly from real Martian solar elevation (deg)
          float dayFactor = smoothstep(-2.0, 14.0, uSunElevDeg);
          float twilightBand = smoothstep(-15.0, -1.5, uSunElevDeg) * (1.0 - smoothstep(4.0, 16.0, uSunElevDeg));
          float nightFactor = 1.0 - smoothstep(-14.0, 1.5, uSunElevDeg);

          // Daytime Martian palette (6.1 mbar CO2 + ferric dust suspension)
          vec3 dayHorizon = mix(vec3(0.76, 0.45, 0.30), vec3(0.84, 0.48, 0.25), dustClamp);
          vec3 dayMid = mix(vec3(0.45, 0.26, 0.20), vec3(0.66, 0.36, 0.21), dustClamp);
          vec3 dayZenith = mix(vec3(0.08, 0.09, 0.14), vec3(0.32, 0.19, 0.13), dustClamp * 0.85);

          // Extended dusty twilight palette (rose-copper band -> deep cobalt zenith)
          vec3 twiHorizon = mix(vec3(0.42, 0.22, 0.20), vec3(0.55, 0.28, 0.17), dustClamp * 0.6);
          vec3 twiMid = vec3(0.14, 0.11, 0.20);
          vec3 twiZenith = vec3(0.02, 0.03, 0.08);

          // Crisp Martian night palette
          vec3 nightHorizon = mix(vec3(0.032, 0.036, 0.068), vec3(0.065, 0.045, 0.045), dustClamp * 0.5);
          vec3 nightMid = vec3(0.014, 0.020, 0.044);
          vec3 nightZenith = vec3(0.005, 0.008, 0.020);

          vec3 horizon = mix(nightHorizon, dayHorizon, dayFactor);
          horizon = mix(horizon, twiHorizon, twilightBand * 0.82);

          vec3 midSky = mix(nightMid, dayMid, dayFactor);
          midSky = mix(midSky, twiMid, twilightBand * 0.78);

          vec3 zenith = mix(nightZenith, dayZenith, dayFactor);
          zenith = mix(zenith, twiZenith, twilightBand * 0.65);

          vec3 col = mix(horizon, midSky, smoothstep(0.0, 0.22, h));
          col = mix(col, zenith, smoothstep(0.18, 0.76, h));

          // Solar forward-Mie & NASA Blue/Cyan Sunset-Sunrise Halo (when Sun is near horizon)
          float sunDot = max(dot(d, normalize(uSunDir)), 0.0);
          float sunAboveCut = smoothstep(-0.08, 0.025, d.y);
          float sunVis = smoothstep(-6.0, 1.5, uSunElevDeg) * sunAboveCut;

          // Warm butterscotch dust backscatter halo vs NASA ~1-2 um particle BLUE solar glow
          vec3 warmMie = vec3(0.96, 0.70, 0.48) * pow(sunDot, 7.0) * (0.30 + dustClamp * 0.18) * dayFactor;
          vec3 blueSunsetHalo =
            vec3(0.28, 0.58, 0.96) * pow(sunDot, 10.0) * (0.48 + (1.0 - dustClamp * 0.4) * 0.24) * uBlueSunset +
            vec3(0.55, 0.80, 1.00) * pow(sunDot, 48.0) * 0.65 * uBlueSunset;

          // Smaller Mars solar disc (~0.35 deg at 1.52 AU)
          vec3 discTint = mix(vec3(1.0, 0.97, 0.92), vec3(0.76, 0.91, 1.0), uBlueSunset * 0.72);
          float discExtinction = mix(1.0, 0.45, dustClamp) * smoothstep(-2.0, 4.0, uSunElevDeg);
          vec3 sunCore = discTint * pow(sunDot, 95.0) * 0.52 * mix(dayFactor, 0.65, uBlueSunset)
                       + discTint * smoothstep(0.99945, 0.99988, sunDot) * 1.65 * discExtinction;

          col += (warmMie + blueSunsetHalo + sunCore) * sunVis;

          // Horizon-opposite Belt of Venus warm purple-pink dust reflection at twilight
          float antiSun = max(dot(d, normalize(vec3(-uSunDir.x, 0.06, -uSunDir.z))), 0.0);
          col += vec3(0.32, 0.15, 0.22) * pow(antiSun, 3.0) * twilightBand * smoothstep(0.32, 0.0, h) * 0.42;

          // Rich Multi-Octave Martian Starfield + Milky Way Galactic Band (overhead by day, full dome at night)
          float domeStarVis = mix(smoothstep(0.14, 0.56, h) * 0.68, smoothstep(0.01, 0.12, h), max(nightFactor, twilightBand * 0.65));
          float starVis = domeStarVis * (1.0 - dustClamp * 0.82);
          if (starVis > 0.01) {
            // Primary navigational bright stars
            vec3 cellA = floor(d * 280.0);
            float rndA = hash31(cellA);
            if (rndA > 0.992) {
              vec3 centerA = normalize(cellA + 0.5);
              float distA = length(d - centerA) * 280.0;
              float twinkle = 0.82 + 0.18 * sin(uTime * 2.1 + rndA * 62.8);
              float intensity = smoothstep(0.42, 0.03, distA) * ((rndA - 0.992) / 0.008);
              vec3 starTint = mix(vec3(0.76, 0.88, 1.0), vec3(1.0, 0.84, 0.70), fract(rndA * 91.3));
              col += starTint * intensity * starVis * twinkle * (0.95 + nightFactor * 0.65);
            }
            // Faint dense star dust
            vec3 cellB = floor(d * 520.0);
            float rndB = hash31(cellB);
            if (rndB > 0.989 && nightFactor > 0.15) {
              vec3 centerB = normalize(cellB + 0.5);
              float distB = length(d - centerB) * 520.0;
              float intenB = smoothstep(0.35, 0.05, distB) * ((rndB - 0.989) / 0.011);
              col += vec3(0.75, 0.82, 0.95) * intenB * starVis * nightFactor * 0.62;
            }
            // Milky Way dust lane & core haze
            float planeCoord = d.x * 0.64 - d.y * 0.52 + d.z * 0.56;
            float galacticLane = exp(-pow(planeCoord, 2.0) * 18.0);
            float galacticCore = exp(-pow(length(d - normalize(vec3(-0.35, 0.45, -0.82))), 2.0) * 5.0);
            float dustSplit = 1.0 - 0.42 * exp(-pow(planeCoord * 5.5, 2.0));
            col += vec3(0.24, 0.30, 0.46) * (galacticLane * 0.065 + galacticCore * 0.055) * dustSplit * starVis * (0.35 + nightFactor * 0.95);
          }

          // Phobos (largest resolved fast-orbiting Martian moon, warm charcoal-regolith illuminated disc)
          float phobosDot = dot(d, normalize(uPhobosDir));
          if (phobosDot > 0.9992 && d.y > 0.02) {
            float phobosEdge = smoothstep(0.99945, 0.99972, phobosDot);
            float phaseLit = clamp(dot(normalize(uPhobosDir), normalize(uSunDir)) * 0.5 + 0.62, 0.18, 1.0);
            col = mix(col, vec3(0.72, 0.64, 0.58) * (0.55 + 0.45 * phaseLit) * (1.0 - dustClamp * 0.65), phobosEdge * 0.88);
          }

          // Deimos (tiny outer pale moon / crisp starlike disc)
          float deimosDot = dot(d, normalize(uDeimosDir));
          if (deimosDot > 0.99982 && d.y > 0.02) {
            float deimosEdge = smoothstep(0.99985, 0.99994, deimosDot);
            col += vec3(0.88, 0.86, 0.82) * deimosEdge * (1.0 - dustClamp * 0.7) * 0.95;
          }

          // Subtle nightside Martian upper-atmosphere O2/NO green airglow limb
          if (nightFactor > 0.1 && h > 0.02 && h < 0.25) {
            float airglow = sin(h * 14.0) * smoothstep(0.25, 0.04, h) * nightFactor * 0.045;
            col += vec3(0.22, 0.72, 0.55) * max(0.0, airglow);
          }

          // Solar Energetic Particle (SPE) Martian Ionization Aurora in upper atmosphere
          if (uSpe > 0.01 && h > 0.06) {
            float waveA = sin(d.x * 10.5 + uTime * 1.45) * cos(d.z * 8.0 - uTime * 1.1);
            float waveB = cos(d.x * 16.0 - uTime * 1.9 + d.z * 6.0);
            float curtain = smoothstep(-0.1, 0.72, waveA * 0.7 + waveB * 0.3) * smoothstep(0.06, 0.42, h) * smoothstep(0.98, 0.32, h);
            vec3 auroraCol = mix(vec3(0.18, 0.92, 0.74), vec3(0.86, 0.30, 0.96), smoothstep(0.20, 0.70, h));
            col += auroraCol * curtain * uSpe * (0.48 + nightFactor * 0.45);
          }

          // Clean ground-level horizon attenuation under sky skirt
          col = mix(col, horizon * 0.65, belowHorizon);

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const skyMesh = new THREE.Mesh(skyGeo, skyMat);
    scene.add(skyMesh);

    // Low-horizon Martian Sun (47.55°N Arcadia Planitia) with crisp dynamic shadows
    const sunLight = new THREE.DirectionalLight(0xffe6cc, 1.95);
    sunLight.position.set(120, 82, -140);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.bias = -0.00035;
    sunLight.shadow.normalBias = 0.035;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 360;
    const dShadow = 88;
    sunLight.shadow.camera.left = -dShadow;
    sunLight.shadow.camera.right = dShadow;
    sunLight.shadow.camera.top = dShadow;
    sunLight.shadow.camera.bottom = -dShadow;
    scene.add(sunLight);
    scene.add(sunLight.target);

    const hemiLight = new THREE.HemisphereLight(0xd9926c, 0x2e160d, 0.78);
    scene.add(hemiLight);

    // High-detail PBR matte Martian regolith textures (albedo sRGB + normal + roughness + bump)
    const { albedoMap, normalMap, roughnessMap, bumpMap } = createPhotorealRegolithTextures(
      renderer.capabilities.getMaxAnisotropy()
    );

    // 2.5D Arcadia Planitia Terrain Mesh with higher geometric density & mineral vertex colors
    const segs = 320;
    const sizeM = grid.quadrantSizeMeters;
    const groundGeo = new THREE.PlaneGeometry(sizeM, sizeM, segs, segs);
    groundGeo.rotateX(-Math.PI / 2);

    const posAttr = groundGeo.attributes.position as THREE.BufferAttribute;
    const colorsArr = new Float32Array(posAttr.count * 3);

    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);
      const worldX = vx;
      const worldY = -vz;
      const sample = sampleTerrainBilinear(grid, worldX, worldY);
      posAttr.setY(i, sample.visualY);

      const half = grid.quadrantSizeMeters / 2;
      const gc = Math.max(
        0,
        Math.min(grid.size - 1, Math.floor((worldX + half) / grid.cellSizeMeters))
      );
      const gr = Math.max(
        0,
        Math.min(grid.size - 1, Math.floor((worldY + half) / grid.cellSizeMeters))
      );
      const node = grid.nodes[gr * grid.size + gc];
      const unit = node?.unit ?? 'Aa5';

      const rCraterPoi2 = Math.hypot(worldX - -420, worldY - 780);
      const rScarpPoi5 = Math.hypot(worldX - -860, worldY - -620);
      const ripple =
        Math.sin(vx * 0.032 + vz * 0.019) * Math.cos(vz * 0.038 - vx * 0.014);
      const fineStrata = Math.sin(vx * 0.14 - vz * 0.09) * 0.035;

      if (rCraterPoi2 < 210 && rCraterPoi2 > 62) {
        // Subsurface water-ice frost exposed on crater terrace
        colorsArr[i * 3] = 0.88;
        colorsArr[i * 3 + 1] = 0.91;
        colorsArr[i * 3 + 2] = 0.95;
      } else if (sample.elevationM < -3020 || rCraterPoi2 <= 62) {
        colorsArr[i * 3] = 0.78;
        colorsArr[i * 3 + 1] = 0.83;
        colorsArr[i * 3 + 2] = 0.89;
      } else if (rScarpPoi5 < 240 || sample.svf < 0.52) {
        // Dark basaltic scarp shadow
        colorsArr[i * 3] = 0.34;
        colorsArr[i * 3 + 1] = 0.25;
        colorsArr[i * 3 + 2] = 0.21;
      } else if (unit === 'Aa1') {
        const darkSand = (ripple < -0.25 ? -0.12 : 0.04 * ripple) + fineStrata;
        colorsArr[i * 3] = 0.79 + darkSand;
        colorsArr[i * 3 + 1] = 0.64 + darkSand * 0.85;
        colorsArr[i * 3 + 2] = 0.49 + darkSand * 0.7;
      } else if (unit === 'Aa2') {
        const n = ripple * 0.05 + fineStrata;
        colorsArr[i * 3] = 0.64 + n;
        colorsArr[i * 3 + 1] = 0.45 + n * 0.7;
        colorsArr[i * 3 + 2] = 0.42 + n * 0.8;
      } else {
        const darkDune = (ripple < -0.2 ? -0.14 : ripple * 0.05) + fineStrata;
        colorsArr[i * 3] = 0.74 + darkDune;
        colorsArr[i * 3 + 1] = 0.48 + darkDune * 0.8;
        colorsArr[i * 3 + 2] = 0.35 + darkDune * 0.65;
      }
    }
    groundGeo.setAttribute('color', new THREE.BufferAttribute(colorsArr, 3));
    groundGeo.computeVertexNormals();

    const contourUniforms = {
      uShowContours: { value: propsRef.current.contourLinesEnabled ? 1.0 : 0.0 },
      uAlertMode: { value: propsRef.current.speActive ? 1.0 : 0.0 },
      uTime: { value: 0.0 },
      uFrost: { value: propsRef.current.marsTime?.frostCover01 ?? 0.0 },
      uDust: { value: propsRef.current.dustTau ?? 0.55 },
      uAstroPos: { value: new THREE.Vector3(0, 0, -20) },
    };

    // Strict matte mineral surface with smooth continuous tangent-space normals + micro-roughness (no quantized bumpMap blocks)
    const groundMat = new THREE.MeshStandardMaterial({
      map: albedoMap,
      normalMap,
      normalScale: new THREE.Vector2(0.82, 0.82),
      roughnessMap,
      vertexColors: true,
      roughness: 0.94,
      metalness: 0.02,
    });

    groundMat.onBeforeCompile = (shader) => {
      shader.uniforms.uShowContours = contourUniforms.uShowContours;
      shader.uniforms.uAlertMode = contourUniforms.uAlertMode;
      shader.uniforms.uTime = contourUniforms.uTime;
      shader.uniforms.uFrost = contourUniforms.uFrost;
      shader.uniforms.uDust = contourUniforms.uDust;
      shader.uniforms.uAstroPos = contourUniforms.uAstroPos;

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNormal;`
        )
        .replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
          vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `
          #include <common>
          varying vec3 vWorldPos;
          varying vec3 vWorldNormal;
          uniform float uShowContours;
          uniform float uAlertMode;
          uniform float uTime;
          uniform float uFrost;
          uniform float uDust;
          uniform vec3 uAstroPos;

          // Precision-safe trig-free hash (eliminates 32-bit float sin() aliasing blocks at world scales)
          float marsTerrHash(vec2 p) {
            vec3 p3 = fract(vec3(p.xyx) * 0.1031);
            p3 += dot(p3, p3.yzx + 33.33);
            return fract((p3.x + p3.y) * p3.z);
          }
          float marsTerrNoise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            float a = marsTerrHash(i);
            float b = marsTerrHash(i + vec2(1.0, 0.0));
            float c = marsTerrHash(i + vec2(0.0, 1.0));
            float d = marsTerrHash(i + vec2(1.0, 1.0));
            return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
          }
        `
        )
        .replace(
          '#include <color_fragment>',
          `
          #include <color_fragment>
          // World-space multi-scale regolith grain + anti-tiling basaltic/ferric strata + winter frost
          float gritFine = marsTerrNoise(vWorldPos.xz * 3.4) * 0.58 + marsTerrNoise(vWorldPos.xz * 11.2) * 0.42;
          float gritMed = marsTerrNoise(vWorldPos.xz * 0.42 + vec2(3.1, 7.4));
          float macroDrift = marsTerrNoise(vWorldPos.xz * 0.028);
          float basaltClasts = smoothstep(0.68, 0.94, marsTerrNoise(vWorldPos.xz * 6.5));
          diffuseColor.rgb *= (0.86 + 0.26 * gritFine) * (0.90 + 0.20 * gritMed);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.20, 0.14, 0.12), basaltClasts * 0.22);
          diffuseColor.rgb = mix(
            diffuseColor.rgb,
            vec3(0.68, 0.41, 0.24),
            clamp((uDust - 0.5) * 0.16, 0.0, 0.30) * (0.5 + 0.5 * macroDrift)
          );
          if (uFrost > 0.01) {
            float flatSlope = smoothstep(0.74, 0.97, clamp(vWorldNormal.y, 0.0, 1.0));
            float frostPatch =
              marsTerrNoise(vWorldPos.xz * 0.22) * 0.56 +
              marsTerrNoise(vWorldPos.xz * 1.45) * 0.30 +
              marsTerrNoise(vWorldPos.xz * 5.2) * 0.14;
            float frostMask = smoothstep(0.48 - uFrost * 0.26, 0.88, frostPatch) * flatSlope * uFrost;
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.84, 0.88, 0.94), clamp(frostMask * 0.68, 0.0, 0.64));
          }
        `
        )
        .replace(
          '#include <dithering_fragment>',
          `
          if (uShowContours > 0.01) {
            float elev = vWorldPos.y * 0.65;
            float contourLine = abs(fract(elev - 0.5) - 0.5) / fwidth(elev);
            float lineMask = 1.0 - min(contourLine, 1.0);

            float distToAstro = length(vWorldPos.xz - uAstroPos.xz);
            float distFade = smoothstep(220.0, 10.0, distToAstro);
            float scanPulse = 0.82 + 0.18 * sin(distToAstro * 0.10 - uTime * 2.6);
            float totalOverlay = clamp(lineMask * 0.55 * distFade * scanPulse * uShowContours, 0.0, 0.65);

            vec3 cyanContour = vec3(0.22, 0.91, 1.0);
            vec3 alertContour = vec3(1.0, 0.42, 0.24);
            vec3 hudColor = mix(cyanContour, alertContour, uAlertMode);

            gl_FragColor.rgb = mix(gl_FragColor.rgb, hudColor, totalOverlay);
          }
          #include <dithering_fragment>
        `
        );
    };

    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    // PDR Whiteout Dust Wireframe Grid (tau > 2.5 optical opacity overlay)
    const groundWireMat = new THREE.MeshBasicMaterial({
      color: 0x38e8ff,
      wireframe: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const groundWireMesh = new THREE.Mesh(groundGeo, groundWireMat);
    groundWireMesh.position.y = 0.08;
    groundWireMesh.visible = false;
    scene.add(groundWireMesh);

    // Amber Confidence Halo Mesh under Astronaut (mmWave 77 GHz / Low Cohesion Warning)
    const confidenceHaloGroup = new THREE.Group();
    const confidenceHaloInnerMat = new THREE.MeshBasicMaterial({
      color: 0xffae24,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    const confidenceHaloInner = new THREE.Mesh(
      new THREE.RingGeometry(1.15, 1.42, 48),
      confidenceHaloInnerMat
    );
    confidenceHaloInner.rotation.x = -Math.PI / 2;
    confidenceHaloGroup.add(confidenceHaloInner);

    const confidenceHaloOuterMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    const confidenceHaloOuter = new THREE.Mesh(
      new THREE.RingGeometry(2.15, 2.38, 48),
      confidenceHaloOuterMat
    );
    confidenceHaloOuter.rotation.x = -Math.PI / 2;
    confidenceHaloGroup.add(confidenceHaloOuter);
    confidenceHaloGroup.visible = false;
    scene.add(confidenceHaloGroup);

    // High-Density Instanced Martian Geology (3 draw calls total: 520 jagged boulders, 240 layered slabs, 2,400 near-field pebbles)
    const boulderProtoGeo = new THREE.DodecahedronGeometry(1.0, 2);
    const bpAttr = boulderProtoGeo.attributes.position;
    for (let k = 0; k < bpAttr.count; k++) {
      const vx = bpAttr.getX(k);
      const vy = bpAttr.getY(k);
      const vz = bpAttr.getZ(k);
      // Angular basalt fracture + wind-carved facets + flatter bedded undersides
      const facet =
        0.74 +
        0.26 * Math.sin(vx * 4.3 + vz * 2.9) * Math.cos(vz * 3.7 - vy * 2.1) +
        0.12 * Math.sin(vy * 7.5 + vx * 5.2);
      const flatBot = vy < -0.25 ? 0.55 : 1.0;
      bpAttr.setXYZ(k, vx * facet, vy * facet * 0.62 * flatBot, vz * facet);
    }
    boulderProtoGeo.computeVertexNormals();

    const boulderMat = new THREE.MeshStandardMaterial({
      map: albedoMap,
      normalMap,
      normalScale: new THREE.Vector2(1.4, 1.4),
      roughnessMap,
      bumpMap,
      bumpScale: 0.24,
      roughness: 0.94,
      metalness: 0.03,
    });

    const boulderCount = 520;
    const boulderInst = new THREE.InstancedMesh(boulderProtoGeo, boulderMat, boulderCount);
    boulderInst.castShadow = true;
    boulderInst.receiveShadow = true;
    boulderInst.frustumCulled = false;

    const geoDummy = new THREE.Object3D();
    const rockTintTmp = new THREE.Color();
    for (let i = 0; i < boulderCount; i++) {
      const nearCorridor = i < 280;
      const rx = nearCorridor
        ? (hash2(i, 1.13) - 0.5) * 320
        : (hash2(i, 3.71) - 0.5) * 2100;
      const ryWorld = nearCorridor
        ? hash2(i, 2.31) * 420 - 80
        : (hash2(i, 7.91) - 0.5) * 2100;

      if (Math.hypot(rx, ryWorld - 20) < 6.5 || Math.hypot(rx, ryWorld) < 12.0) {
        geoDummy.scale.set(0, 0, 0);
        geoDummy.updateMatrix();
        boulderInst.setMatrixAt(i, geoDummy.matrix);
        boulderInst.setColorAt(i, rockTintTmp.setHex(0x4a2c1d));
        continue;
      }

      const radius = nearCorridor
        ? 0.28 + Math.pow(hash2(i, 4.51), 1.6) * 1.15
        : 0.85 + hash2(i, 4.51) * 2.4;
      const tSample = sampleTerrainBilinear(grid, rx, ryWorld);
      geoDummy.position.set(rx, tSample.visualY - radius * 0.14, -ryWorld);
      geoDummy.rotation.set(
        (hash2(i, 5.13) - 0.5) * 0.45,
        hash2(i, 6.23) * Math.PI * 2,
        (hash2(i, 8.41) - 0.5) * 0.45
      );
      geoDummy.scale.set(
        radius * (0.85 + hash2(i, 9.1) * 0.55),
        radius * (0.65 + hash2(i, 9.7) * 0.55),
        radius * (0.85 + hash2(i, 10.3) * 0.55)
      );
      geoDummy.updateMatrix();
      boulderInst.setMatrixAt(i, geoDummy.matrix);

      // Authentic Mars Perseverance basalt / ferric-dusted rock variation
      const shadeRoll = hash2(i, 11.4);
      if (shadeRoll < 0.35) {
        rockTintTmp.setRGB(0.24, 0.21, 0.22); // Dark vesicular basalt
      } else if (shadeRoll < 0.72) {
        rockTintTmp.setRGB(0.52, 0.31, 0.22); // Rust-coated pyroxene basalt
      } else {
        rockTintTmp.setRGB(0.68, 0.48, 0.36); // Dust-mantled cobble
      }
      boulderInst.setColorAt(i, rockTintTmp);
    }
    boulderInst.instanceMatrix.needsUpdate = true;
    if (boulderInst.instanceColor) boulderInst.instanceColor.needsUpdate = true;
    scene.add(boulderInst);

    // Light-toned fractured volcanic tuff / mudstone plates (stratified outcrops)
    const slabProtoGeo = new THREE.BoxGeometry(1.0, 1.0, 1.0, 2, 1, 2);
    const spAttr = slabProtoGeo.attributes.position;
    for (let k = 0; k < spAttr.count; k++) {
      const vx = spAttr.getX(k);
      const vy = spAttr.getY(k);
      const vz = spAttr.getZ(k);
      const warp = 1.0 + 0.18 * Math.sin(vx * 5.0 + vz * 4.0);
      spAttr.setXYZ(k, vx * warp, vy * (0.85 + 0.2 * Math.cos(vx * 3.0)), vz * warp);
    }
    slabProtoGeo.computeVertexNormals();

    const slabMat = new THREE.MeshStandardMaterial({
      map: albedoMap,
      normalMap,
      normalScale: new THREE.Vector2(1.1, 1.1),
      bumpMap,
      bumpScale: 0.16,
      roughness: 0.94,
      metalness: 0.0,
    });
    const slabCount = 240;
    const slabInst = new THREE.InstancedMesh(slabProtoGeo, slabMat, slabCount);
    slabInst.castShadow = true;
    slabInst.receiveShadow = true;
    slabInst.frustumCulled = false;

    for (let i = 0; i < slabCount; i++) {
      const nearSlab = i < 150;
      const sx = nearSlab ? (hash2(i, 9.17) - 0.5) * 260 : (hash2(i, 10.31) - 0.5) * 1600;
      const syWorld = nearSlab ? hash2(i, 11.73) * 340 - 60 : (hash2(i, 12.97) - 0.5) * 1600;
      if (Math.hypot(sx, syWorld - 20) < 5.0 || Math.hypot(sx, syWorld) < 11.5) {
        geoDummy.scale.set(0, 0, 0);
        geoDummy.updateMatrix();
        slabInst.setMatrixAt(i, geoDummy.matrix);
        slabInst.setColorAt(i, rockTintTmp.setHex(0xb88b69));
        continue;
      }

      const wSlab = 0.75 + hash2(i, 13.5) * 2.3;
      const dSlab = 0.6 + hash2(i, 14.2) * 1.8;
      const hSlab = 0.06 + hash2(i, 15.8) * 0.16;
      const tSample = sampleTerrainBilinear(grid, sx, syWorld);
      geoDummy.position.set(sx, tSample.visualY + hSlab * 0.24, -syWorld);
      geoDummy.rotation.set(
        (hash2(i, 16.1) - 0.5) * 0.16,
        hash2(i, 17.4) * Math.PI * 2,
        (hash2(i, 18.9) - 0.5) * 0.16
      );
      geoDummy.scale.set(wSlab, hSlab, dSlab);
      geoDummy.updateMatrix();
      slabInst.setMatrixAt(i, geoDummy.matrix);

      const toneShift = 0.88 + hash2(i, 19.3) * 0.22;
      rockTintTmp.setRGB(0.76 * toneShift, 0.57 * toneShift, 0.44 * toneShift);
      slabInst.setColorAt(i, rockTintTmp);
    }
    slabInst.instanceMatrix.needsUpdate = true;
    if (slabInst.instanceColor) slabInst.instanceColor.needsUpdate = true;
    scene.add(slabInst);

    // Subtle No Man's Sky style ground rings + floating diamond crystal at POIs (no heavy sky beams)
    const poiMeshes: Array<{ ring: THREE.Mesh; diamond: THREE.Mesh }> = [];
    for (const poi of pois) {
      const sample = sampleTerrainBilinear(grid, poi.x, poi.y);
      const isShelter = poi.kind === 'shelter';
      const isBase = poi.kind === 'base';
      const markerColor = isShelter ? 0xfbbf24 : isBase ? 0x34d399 : 0x38e8ff;

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(3.6, 4.4, 36),
        new THREE.MeshBasicMaterial({
          color: markerColor,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.55,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(poi.x, sample.visualY + 0.22, -poi.y);
      scene.add(ring);

      const diamond = new THREE.Mesh(
        new THREE.OctahedronGeometry(1.6, 0),
        new THREE.MeshBasicMaterial({
          color: markerColor,
          wireframe: true,
          transparent: true,
          opacity: 0.78,
        })
      );
      diamond.position.set(poi.x, sample.visualY + 6.5, -poi.y);
      scene.add(diamond);

      poiMeshes.push({ ring, diamond });
    }

    // Detailed Ares Arcadia Habitat Module at Base POI-01 (0, 0)
    const baseSample = sampleTerrainBilinear(grid, 0, 0);
    const baseGroundY = baseSample.visualY;
    const rampEndWorldY = sampleTerrainBilinear(grid, 0, 12.2).visualY;
    const rampEndLocalY = rampEndWorldY - baseGroundY;
    const habitatGroup = new THREE.Group();
    habitatGroup.position.set(0, baseGroundY, 0);

    const habShell = new THREE.Mesh(
      new THREE.SphereGeometry(5.2, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.52),
      new THREE.MeshStandardMaterial({
        map: bumpMap,
        bumpMap,
        bumpScale: 0.03,
        color: 0xd8d3c8,
        roughness: 0.78,
        metalness: 0.08,
      })
    );
    habShell.castShadow = true;
    habShell.receiveShadow = true;
    habitatGroup.add(habShell);

    // Gold Kapton MLI thermal skirt
    const habSkirt = new THREE.Mesh(
      new THREE.CylinderGeometry(5.32, 5.58, 1.15, 32),
      new THREE.MeshStandardMaterial({
        color: 0xc5932e,
        roughness: 0.48,
        metalness: 0.62,
      })
    );
    habSkirt.position.y = 0.57;
    habSkirt.castShadow = true;
    habitatGroup.add(habSkirt);

    // Hollow Pressurized Airlock Chamber + Animated Split Blast Doors + Egress Ramp
    const airlockWallMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.56,
      metalness: 0.48,
    });
    const airlockTrimMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.42,
      metalness: 0.65,
    });
    const airlockDeckMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.68,
      metalness: 0.52,
    });
    const airlockStripMat = new THREE.MeshBasicMaterial({ color: 0x38e8ff });
    const airlockHazardMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
    const airlockStatusMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
    const doorGlassMat = new THREE.MeshStandardMaterial({
      color: 0x101c2c,
      roughness: 0.34,
      metalness: 0.2,
      transparent: true,
      opacity: 0.78,
    });

    const airlockFloor = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.16, 4.1), airlockDeckMat);
    airlockFloor.position.set(0, 0.0, -7.45);
    airlockFloor.receiveShadow = true;
    habitatGroup.add(airlockFloor);

    // Steel floor grate cleats & interior wall ribs + handrails for 1st-person depth parallax
    for (const zRib of [-6.05, -7.15, -8.3] as const) {
      const floorCleat = new THREE.Mesh(new THREE.BoxGeometry(2.75, 0.014, 0.09), airlockTrimMat);
      floorCleat.position.set(0, 0.085, zRib);
      habitatGroup.add(floorCleat);

      const ceilingRib = new THREE.Mesh(new THREE.BoxGeometry(3.16, 0.12, 0.16), airlockTrimMat);
      ceilingRib.position.set(0, 2.66, zRib);
      habitatGroup.add(ceilingRib);

      for (const side of [-1, 1] as const) {
        const wallRib = new THREE.Mesh(new THREE.BoxGeometry(0.11, 2.66, 0.16), airlockTrimMat);
        wallRib.position.set(side * 1.42, 1.38, zRib);
        habitatGroup.add(wallRib);
      }
    }

    for (const side of [-1, 1] as const) {
      const floorGuide = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.012, 3.85),
        airlockStripMat
      );
      floorGuide.position.set(side * 1.24, 0.086, -7.45);
      habitatGroup.add(floorGuide);

      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.28, 2.74, 4.1), airlockWallMat);
      wall.position.set(side * 1.59, 1.38, -7.45);
      wall.castShadow = true;
      wall.receiveShadow = true;
      habitatGroup.add(wall);

      const handrail = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 3.4), airlockTrimMat);
      handrail.position.set(side * 1.37, 1.12, -7.45);
      habitatGroup.add(handrail);

      const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.36, 2.78, 0.28), airlockTrimMat);
      jamb.position.set(side * 1.58, 1.38, -9.42);
      jamb.castShadow = true;
      habitatGroup.add(jamb);
    }

    const airlockCeiling = new THREE.Mesh(new THREE.BoxGeometry(3.52, 0.28, 4.2), airlockWallMat);
    airlockCeiling.position.set(0, 2.82, -7.45);
    airlockCeiling.castShadow = true;
    habitatGroup.add(airlockCeiling);

    const overheadStrip = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 0.28), airlockStripMat);
    overheadStrip.position.set(0, 2.66, -7.55);
    habitatGroup.add(overheadStrip);

    const airlockInteriorLight = new THREE.PointLight(0xdcf6ff, 1.65, 11, 1.4);
    airlockInteriorLight.position.set(0, 2.42, -7.35);
    habitatGroup.add(airlockInteriorLight);

    const airlockBeaconLight = new THREE.PointLight(0xff9e2c, 0, 7.5, 1.5);
    airlockBeaconLight.position.set(0, 2.38, -8.88);
    habitatGroup.add(airlockBeaconLight);

    const rearBulkhead = new THREE.Mesh(new THREE.BoxGeometry(3.1, 2.72, 0.24), airlockTrimMat);
    rearBulkhead.position.set(0, 1.38, -5.42);
    habitatGroup.add(rearBulkhead);

    const rearInnerRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.52, 0.07, 10, 24),
      airlockHazardMat
    );
    rearInnerRing.position.set(0, 1.56, -5.29);
    habitatGroup.add(rearInnerRing);

    const portalHeader = new THREE.Mesh(new THREE.BoxGeometry(3.56, 0.36, 0.34), airlockTrimMat);
    portalHeader.position.set(0, 2.68, -9.42);
    portalHeader.castShadow = true;
    habitatGroup.add(portalHeader);

    const airlockStatusBar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.1), airlockStatusMat);
    airlockStatusBar.position.set(0, 2.54, -9.56);
    habitatGroup.add(airlockStatusBar);

    const buildAirlockDoorLeaf = (isLeft: boolean): THREE.Group => {
      const leaf = new THREE.Group();
      const centerSign = isLeft ? 1 : -1;

      const lowerArmor = new THREE.Mesh(new THREE.BoxGeometry(1.46, 1.28, 0.14), airlockTrimMat);
      lowerArmor.position.set(0, 0.64, 0);
      lowerArmor.castShadow = true;
      leaf.add(lowerArmor);

      const upperArmor = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.38, 0.14), airlockTrimMat);
      upperArmor.position.set(0, 2.35, 0);
      upperArmor.castShadow = true;
      leaf.add(upperArmor);

      const innerStile = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.88, 0.14), airlockTrimMat);
      innerStile.position.set(centerSign * 0.64, 1.72, 0);
      leaf.add(innerStile);

      const outerStile = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.88, 0.14), airlockWallMat);
      outerStile.position.set(-centerSign * 0.62, 1.72, 0);
      leaf.add(outerStile);

      const seamChevron = new THREE.Mesh(new THREE.BoxGeometry(0.045, 2.38, 0.155), airlockHazardMat);
      seamChevron.position.set(centerSign * 0.70, 1.25, 0);
      leaf.add(seamChevron);

      const viewportGlass = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.88, 0.05), doorGlassMat);
      viewportGlass.position.set(-centerSign * 0.01, 1.72, 0);
      leaf.add(viewportGlass);

      return leaf;
    };

    const airlockLeftDoor = buildAirlockDoorLeaf(true);
    airlockLeftDoor.position.set(-0.74, 0.08, -9.24);
    habitatGroup.add(airlockLeftDoor);

    const airlockRightDoor = buildAirlockDoorLeaf(false);
    airlockRightDoor.position.set(0.74, 0.08, -9.24);
    habitatGroup.add(airlockRightDoor);

    // Hydraulic locking bolts at center door seam that retract before doors open
    const latchGeo = new THREE.BoxGeometry(0.34, 0.09, 0.19);
    const makeLatch = (x: number, y: number) => {
      const latch = new THREE.Mesh(latchGeo, airlockHazardMat);
      latch.position.set(x, y, -9.15);
      habitatGroup.add(latch);
      return latch;
    };
    const airlockLatches = {
      upperLeft: makeLatch(-0.19, 2.02),
      upperRight: makeLatch(0.19, 2.02),
      lowerLeft: makeLatch(-0.19, 0.72),
      lowerRight: makeLatch(0.19, 0.72),
    };

    // Depressurization CO2 / frost condensation vapor plume right at the airlock threshold
    const ventCount = 140;
    const airlockVentBase = new Float32Array(ventCount * 6);
    const ventPositions = new Float32Array(ventCount * 3);
    for (let i = 0; i < ventCount; i++) {
      const px = (Math.random() - 0.5) * 2.2;
      const py = 0.15 + Math.random() * 2.15;
      const pz = -9.22 + (Math.random() - 0.5) * 0.16;
      const vx = px * (0.95 + Math.random() * 1.15);
      const vy = 0.25 + Math.random() * 1.15;
      const vz = -1.6 - Math.random() * 2.8;
      airlockVentBase[i * 6] = px;
      airlockVentBase[i * 6 + 1] = py;
      airlockVentBase[i * 6 + 2] = pz;
      airlockVentBase[i * 6 + 3] = vx;
      airlockVentBase[i * 6 + 4] = vy;
      airlockVentBase[i * 6 + 5] = vz;
      ventPositions[i * 3] = px;
      ventPositions[i * 3 + 1] = py;
      ventPositions[i * 3 + 2] = pz;
    }
    const ventGeo = new THREE.BufferGeometry();
    ventGeo.setAttribute('position', new THREE.BufferAttribute(ventPositions, 3));
    const airlockVentMat = new THREE.PointsMaterial({
      color: 0xdcf6ff,
      size: 0.24,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const airlockVentPoints = new THREE.Points(ventGeo, airlockVentMat);
    airlockVentPoints.visible = false;
    habitatGroup.add(airlockVentPoints);

    // Exterior sloped ramp from airlock deck (z = -9.4, y = 0.08) to terrain (z = -12.2, y = rampEndLocalY)
    const rampDy = 0.08 - rampEndLocalY;
    const rampLen = Math.hypot(2.8, rampDy);
    const rampGroup = new THREE.Group();
    rampGroup.position.set(0, (0.08 + rampEndLocalY) * 0.5 - 0.07, -10.8);
    rampGroup.rotation.x = -Math.atan2(rampDy, 2.8);
    const rampDeck = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.14, rampLen), airlockDeckMat);
    rampDeck.receiveShadow = true;
    rampGroup.add(rampDeck);
    for (let s = 0; s < 8; s++) {
      const cleatZ = -rampLen * 0.44 + (s / 7) * (rampLen * 0.88);
      const cleat = new THREE.Mesh(new THREE.BoxGeometry(2.74, 0.022, 0.075), airlockTrimMat);
      cleat.position.set(0, 0.08, cleatZ);
      rampGroup.add(cleat);
    }
    for (const side of [-1, 1] as const) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.025, rampLen), airlockStripMat);
      curb.position.set(side * 1.44, 0.075, 0);
      rampGroup.add(curb);

      const railBar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, rampLen), airlockTrimMat);
      railBar.position.set(side * 1.44, 0.92, 0);
      rampGroup.add(railBar);

      for (const postFrac of [-0.42, 0, 0.42] as const) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.88, 0.05), airlockTrimMat);
        post.position.set(side * 1.44, 0.48, postFrac * rampLen);
        rampGroup.add(post);
      }
    }
    habitatGroup.add(rampGroup);
    // Exterior warm-amber airlock/apron navigation floodlight (activates brightly at dusk/night)
    const habExteriorLight = new THREE.PointLight(0xffb46b, 2.0, 58, 1.18);
    habExteriorLight.position.set(0, 4.8, -9.8);
    habitatGroup.add(habExteriorLight);

    const habMastBeacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffc66d })
    );
    habMastBeacon.position.set(0, 5.45, 0);
    habitatGroup.add(habMastBeacon);

    scene.add(habitatGroup);

    // Orbital SOS VITAL Return Guidance Beacon over Martian Habitat Module (POI-01)
    const orbitalBeaconGroup = new THREE.Group();
    orbitalBeaconGroup.position.set(0, baseSample.visualY, 0);
    const orbitalBeaconBeamMat = new THREE.MeshBasicMaterial({
      color: 0xff1f4b,
      transparent: true,
      opacity: 0.62,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const orbitalBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.65, 3.2, 260, 20, 1, true),
      orbitalBeaconBeamMat
    );
    orbitalBeam.position.y = 135;
    orbitalBeaconGroup.add(orbitalBeam);

    const orbitalBeaconRing = new THREE.Mesh(
      new THREE.RingGeometry(6.8, 8.6, 40),
      new THREE.MeshBasicMaterial({
        color: 0xff3b5c,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      })
    );
    orbitalBeaconRing.rotation.x = -Math.PI / 2;
    orbitalBeaconRing.position.y = 9.5;
    orbitalBeaconGroup.add(orbitalBeaconRing);
    orbitalBeaconGroup.visible = false;
    scene.add(orbitalBeaconGroup);

    // High-density InstancedMesh basalt gravel & angular stones (2,400 instances with corridor focus, matte PBR)
    const pebbleCount = 2400;
    const pebbleGeo = new THREE.DodecahedronGeometry(0.14, 0);
    const pebbleMat = new THREE.MeshStandardMaterial({
      map: albedoMap,
      roughness: 0.96,
      metalness: 0.0,
    });
    const pebbleInst = new THREE.InstancedMesh(pebbleGeo, pebbleMat, pebbleCount);
    pebbleInst.receiveShadow = true;
    pebbleInst.frustumCulled = false;
    const dummyObj = new THREE.Object3D();
    const pebColor = new THREE.Color();
    for (let i = 0; i < pebbleCount; i++) {
      // Cluster 1,400 pebbles densely within ±75m around Base/EVA corridor so foreground soil looks razor-sharp
      const closeField = i < 1400;
      const px = closeField ? (hash2(i, 21.3) - 0.5) * 145 : (hash2(i, 21.3) - 0.5) * 460;
      const pyW = closeField ? hash2(i, 22.7) * 185 - 25 : hash2(i, 22.7) * 620 - 130;
      const tS = sampleTerrainBilinear(grid, px, pyW);
      dummyObj.position.set(px, tS.visualY + 0.015, -pyW);
      const baseScale = closeField ? 0.38 : 0.62;
      dummyObj.scale.set(
        baseScale + hash2(i, 23.1) * 1.65,
        baseScale * 0.45 + hash2(i, 24.4) * 0.55,
        baseScale + hash2(i, 25.8) * 1.55
      );
      dummyObj.rotation.set(
        hash2(i, 26.2) * 0.5,
        hash2(i, 27.5) * Math.PI,
        hash2(i, 28.9) * 0.5
      );
      dummyObj.updateMatrix();
      pebbleInst.setMatrixAt(i, dummyObj.matrix);

      const shade = hash2(i, 29.7);
      if (shade < 0.42) {
        pebColor.setRGB(0.26, 0.21, 0.19);
      } else if (shade < 0.78) {
        pebColor.setRGB(0.49, 0.29, 0.21);
      } else {
        pebColor.setRGB(0.66, 0.46, 0.34);
      }
      pebbleInst.setColorAt(i, pebColor);
    }
    pebbleInst.instanceMatrix.needsUpdate = true;
    if (pebbleInst.instanceColor) pebbleInst.instanceColor.needsUpdate = true;
    scene.add(pebbleInst);

    // Distant Layered Arcadia Mesa / Escarpe Horizon Rim (matte basaltic cliffs)
    const mesaMat = new THREE.MeshStandardMaterial({
      map: albedoMap,
      bumpMap,
      bumpScale: 0.18,
      color: 0x633420,
      roughness: 0.97,
      metalness: 0.0,
    });
    for (let i = 0; i < 20; i++) {
      const ang = (i / 20) * Math.PI * 2 + 0.14;
      const dist = 1950 + hash2(i, 31.1) * 320;
      const mx = Math.cos(ang) * dist;
      const mz = Math.sin(ang) * dist;
      const mW = 190 + hash2(i, 32.4) * 260;
      const mH = 22 + hash2(i, 33.7) * 42;
      const mesa = new THREE.Mesh(
        new THREE.CylinderGeometry(mW * 0.52, mW, mH, 9),
        mesaMat
      );
      mesa.position.set(mx, mH * 0.32 - 8, mz);
      mesa.rotation.y = hash2(i, 34.9) * Math.PI;
      scene.add(mesa);
    }

    // Official NASA Mars 2020 Perseverance GLB Model (/models/perseverance-rover.glb) with MastCam-Z & rocker-bogie
    const {
      roverGroup,
      dishGroup,
      roverWheels,
      roverBeaconMat,
      mastHeadRef,
      usingNasaGlbRef,
    } = buildDetailedRoverMesh({
      scale: 1.22,
      bumpMap,
      detailed: true,
    });

    // Forward Dual-LED Rover Headlamp Beam (local +Z points along rover travel forward)
    const roverFloodLight = new THREE.SpotLight(0xeef6ff, 0, 74, Math.PI * 0.28, 0.52, 1.15);
    roverFloodLight.position.set(0, 1.15, 1.25);
    const roverFloodTarget = new THREE.Object3D();
    roverFloodTarget.position.set(0, -0.45, 12.0);
    roverGroup.add(roverFloodTarget);
    roverFloodLight.target = roverFloodTarget;
    roverGroup.add(roverFloodLight);

    scene.add(roverGroup);

    // EV2 Buddy Exosuit Marker
    const buddyGroup = new THREE.Group();
    const buddyRing = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 1.25, 24),
      new THREE.MeshBasicMaterial({
        color: 0x38e8ff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.65,
      })
    );
    buddyRing.rotation.x = -Math.PI / 2;
    buddyRing.position.y = 0.15;
    buddyGroup.add(buddyRing);
    scene.add(buddyGroup);

    // Route Groups: 1.5 m Celeste Guide Pulse + 1.5 m Pulse Wave Chain
    const routeGroup = new THREE.Group();
    const crossedGroup = new THREE.Group();
    const breadcrumbGroup = new THREE.Group();
    const cacheGroup = new THREE.Group();
    const repeaterGroup = new THREE.Group();
    scene.add(routeGroup);
    scene.add(crossedGroup);
    scene.add(breadcrumbGroup);
    scene.add(cacheGroup);
    scene.add(repeaterGroup);

    // Primary Leading Celeste Pulse locked 1.5 m ahead of the astronaut
    const leadPulseGroup = new THREE.Group();
    const leadCoreMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 20, 20),
      new THREE.MeshBasicMaterial({
        color: 0x70f0ff,
        transparent: true,
        opacity: 0.95,
      })
    );
    leadCoreMesh.position.y = 0.34;
    leadPulseGroup.add(leadCoreMesh);

    const leadRingInner = new THREE.Mesh(
      new THREE.RingGeometry(0.24, 0.34, 32),
      new THREE.MeshBasicMaterial({
        color: 0x38e8ff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      })
    );
    leadRingInner.rotation.x = -Math.PI / 2;
    leadRingInner.position.y = 0.12;
    leadPulseGroup.add(leadRingInner);

    const leadRingOuter = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.52, 32),
      new THREE.MeshBasicMaterial({
        color: 0x38e8ff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      })
    );
    leadRingOuter.rotation.x = -Math.PI / 2;
    leadRingOuter.position.y = 0.10;
    leadPulseGroup.add(leadRingOuter);
    scene.add(leadPulseGroup);

    // Atmospheric Dust Particles in suspension (wind-driven, exaggerated storms while preserving forward clarity)
    const dustCount = 1800;
    const dustGeo = new THREE.BufferGeometry();
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount * 3; i += 3) {
      dustPos[i] = (Math.random() - 0.5) * 140;
      dustPos[i + 1] = Math.random() * 20 + 0.25;
      dustPos[i + 2] = (Math.random() - 0.5) * 140;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({
      color: 0xedb88d,
      size: 0.20,
      transparent: true,
      opacity: 0.32,
    });
    const dustPoints = new THREE.Points(dustGeo, dustMat);
    scene.add(dustPoints);

    sceneRefs.current = {
      scene,
      routeGroup,
      crossedGroup,
      breadcrumbGroup,
      cacheGroup,
      repeaterGroup,
      routeCurve: null,
      routeTotalLen: 0,
      leadPulseGroup,
      leadCoreMesh,
      leadRingInner,
      leadRingOuter,
      pulseNodes: [],
      bakedRouteSamples: [],
      emergencyTubeMat: null,
      forearm3DGroup,
      forearmScreenGlow,
      pickupArmGroup,
      pickupClawLeft,
      pickupClawRight,
      pickupClawTip,
      pickupLaserRing,
      pickupSpecimenGroup,
      pickupRockMesh,
      pickupGroundRing,
      contourUniforms,
      skyUniforms,
      skyMesh,
      fog,
      sunLight,
      hemiLight,
      helmetHeadlamp,
      visorFillLight,
      roverFloodLight,
      habExteriorLight,
      roverGroup,
      roverDish: dishGroup,
      roverWheels,
      roverBeaconMat,
      roverMastHeadRef: mastHeadRef,
      roverUsingNasaGlbRef: usingNasaGlbRef,
      buddyGroup,
      poiMeshes,
      orbitalBeaconGroup,
      orbitalBeaconBeamMat,
      orbitalBeaconRing,
      dustPoints,
      dustMat,
      airlockLeftDoor,
      airlockRightDoor,
      airlockInteriorLight,
      airlockBeaconLight,
      airlockStatusMat,
      airlockLatches,
      airlockVentPoints,
      airlockVentMat,
      airlockVentBase,
      renderer,
      confidenceHaloGroup,
      confidenceHaloInnerMat,
      confidenceHaloOuterMat,
      groundWireMesh,
      groundWireMat,
    };

    // Mouse / Touch Look Controls
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    const onPointerDown = (e: PointerEvent) => {
      if (egressStateRef.current.active) return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging || egressStateRef.current.active) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      const nextH = propsRef.current.headingRad + dx * 0.0042;
      const nextP = Math.max(-0.62, Math.min(0.65, propsRef.current.pitchRad - dy * 0.0038));
      propsRef.current.onChangeLook(nextH, nextP);
    };
    const onPointerUp = () => {
      dragging = false;
    };

    const domEl = renderer.domElement;
    domEl.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    let animId = 0;
    let lastPerfUpdate = performance.now();
    let frameCounter = 0;
    let lastFrameTime = performance.now();
    let stepPhase = 0;
    let lastAstroX = propsRef.current.astronautPos.x;
    let lastAstroY = propsRef.current.astronautPos.y;
    let forearmAnimProgress = 0;
    let prevLookYaw = propsRef.current.headingRad;
    let prevLookPitch = propsRef.current.pitchRad;
    let freezeHoldUntil = 0;
    let lastMotionFreezeSent = false;

    const initialRoverGround = sampleTerrainBilinear(
      grid,
      propsRef.current.rover.x,
      propsRef.current.rover.y
    ).visualY;
    const smoothRoverPos = new THREE.Vector3(
      propsRef.current.rover.x,
      initialRoverGround,
      -propsRef.current.rover.y
    );
    let smoothRoverYaw = (-propsRef.current.rover.headingDeg * Math.PI) / 180;
    const projVec = new THREE.Vector3();
    const tmpClawWorldPos = new THREE.Vector3();
    const sosCrimsonColor = new THREE.Color(0xff1448);
    const sosCoralAmberColor = new THREE.Color(0xffea00);
    const sosRingFlashColor = new THREE.Color(0xff5228);
    const airlockAmberColor = new THREE.Color(0xf59e0b);
    const airlockCyanColor = new THREE.Color(0x38e8ff);
    const animColorTmp = new THREE.Color();
    const fogDayColor = new THREE.Color(0xc58560);
    const fogStormColor = new THREE.Color(0xb86f49);
    const fogTwilightColor = new THREE.Color(0x52363d);
    const fogNightColor = new THREE.Color(0x0a0e19);
    const sunDayColor = new THREE.Color(0xffe6cc);
    const sunSunsetColor = new THREE.Color(0xcde2ff);
    const hemiDaySky = new THREE.Color(0xd9926c);
    const hemiTwilightSky = new THREE.Color(0x6d505e);
    const hemiNightSky = new THREE.Color(0x1f304f);
    const hemiDayGround = new THREE.Color(0x2e160d);
    const hemiNightGround = new THREE.Color(0x090a10);

    const animate = (now: number) => {
      animId = requestAnimationFrame(animate);
      const dt = Math.min(0.1, (now - lastFrameTime) / 1000);
      lastFrameTime = now;

      const p = propsRef.current;
      const refs = sceneRefs.current;
      if (!refs) return;

      // Head-motion stabilization freeze threshold (~1.35 rad/s angular look velocity)
      if (!egressStateRef.current.active && dt > 0.002) {
        let dYaw = Math.abs(p.headingRad - prevLookYaw);
        if (dYaw > Math.PI) dYaw = Math.PI * 2 - dYaw;
        const dPitch = Math.abs(p.pitchRad - prevLookPitch);
        const angVel = Math.hypot(dYaw, dPitch) / dt;
        prevLookYaw = p.headingRad;
        prevLookPitch = p.pitchRad;
        if (angVel >= 1.35) {
          freezeHoldUntil = now + 320;
        }
        const shouldFreeze = now < freezeHoldUntil;
        if (shouldFreeze !== lastMotionFreezeSent) {
          lastMotionFreezeSent = shouldFreeze;
          p.onHeadMotionFreeze?.(shouldFreeze);
        }
      }

      const tSec = now * 0.001;
      refs.contourUniforms.uTime.value = tSec;
      refs.contourUniforms.uShowContours.value = p.contourLinesEnabled ? 1.0 : 0.0;
      refs.contourUniforms.uAlertMode.value = p.speActive || p.tunnelVisionMode ? 1.0 : 0.0;

      // Martian Diurnal Solar Ephemeris, Blue Sunset Scattering, Seasonal CO2/H2O Frost & Suit Illumination
      const clampedTau = Math.min(3.2, Math.max(0.15, p.dustTau));
      const stormIntensity = THREE.MathUtils.clamp((clampedTau - 0.6) / 2.4, 0, 1);
      const marsTime = p.marsTime;
      const solarElevDeg = marsTime?.solarElevationDeg ?? 28;
      const solarAzDeg = marsTime?.solarAzimuthDeg ?? 142;
      const blueSunset = THREE.MathUtils.clamp(marsTime?.blueSunsetFactor01 ?? 0, 0, 1);
      const ltstHours = marsTime?.ltstMarsHours ?? 11.2;
      const solNum = marsTime?.solNumber ?? 198;

      const elevRad = THREE.MathUtils.degToRad(solarElevDeg);
      const azRad = THREE.MathUtils.degToRad(solarAzDeg);
      const cosElev = Math.cos(elevRad);
      const sunDirX = cosElev * Math.sin(azRad);
      const sunDirY = Math.sin(elevRad);
      const sunDirZ = -cosElev * Math.cos(azRad);

      refs.skyUniforms.uSunDir.value.set(sunDirX, sunDirY, sunDirZ).normalize();
      refs.skyUniforms.uSunElevDeg.value = solarElevDeg;
      refs.skyUniforms.uBlueSunset.value = blueSunset;

      // Phobos rises West (-X) -> South -> East (+X) due to sub-synchronous 7.66h orbit
      const phobosAngle = ((ltstHours / 24) * 2.15 + solNum * 0.21) * Math.PI * 2;
      const phobosCos = Math.cos(phobosAngle);
      refs.skyUniforms.uPhobosDir.value
        .set(Math.sin(phobosAngle), phobosCos * Math.sin(0.74), phobosCos * Math.cos(0.74))
        .normalize();

      // Deimos drifts slowly East (+X) -> South -> West (-X)
      const deimosAngle = -((ltstHours / 24) * 0.21 + solNum * 0.79) * Math.PI * 2 + 0.35;
      const deimosCos = Math.cos(deimosAngle);
      refs.skyUniforms.uDeimosDir.value
        .set(Math.sin(deimosAngle), deimosCos * Math.sin(0.68), deimosCos * Math.cos(0.68))
        .normalize();

      // Adaptive day -> twilight -> night darkness curves
      const dayFactor = THREE.MathUtils.smoothstep(solarElevDeg, -4.5, 16.0);
      const twilightBand = Math.exp(-Math.pow((solarElevDeg - 1.0) / 6.2, 2));
      const nightFactor = 1.0 - THREE.MathUtils.smoothstep(solarElevDeg, -10.0, 2.5);
      const darkness01 = THREE.MathUtils.clamp(
        1.0 - THREE.MathUtils.smoothstep(solarElevDeg, -5.0, 12.0) + stormIntensity * 0.22,
        0,
        1
      );
      const targetExposure = THREE.MathUtils.lerp(1.06, 1.24, darkness01 * (1.0 - stormIntensity * 0.35));

      refs.fog.density = 0.00052 + clampedTau * 0.00122 + nightFactor * 0.00038;
      refs.fog.color
        .copy(fogNightColor)
        .lerp(fogDayColor, dayFactor)
        .lerp(fogStormColor, stormIntensity * 0.45 * dayFactor)
        .lerp(fogTwilightColor, twilightBand * 0.72);
      if (refs.scene.background instanceof THREE.Color) {
        refs.scene.background.copy(refs.fog.color);
      }

      // Directional Sun & Hemisphere skylight (never lets scene crush pitch-black)
      const dustSunAtten = 1.0 - stormIntensity * 0.36;
      const shadowElevRad = THREE.MathUtils.degToRad(Math.max(7.5, solarElevDeg));
      const shadowCos = Math.cos(shadowElevRad);
      const shadowSunX = shadowCos * Math.sin(azRad);
      const shadowSunY = Math.sin(shadowElevRad);
      const shadowSunZ = -shadowCos * Math.cos(azRad);

      const elevIntensityScale = THREE.MathUtils.smoothstep(solarElevDeg, -5.5, 22.0);
      refs.sunLight.color.copy(sunDayColor).lerp(sunSunsetColor, blueSunset * 0.65);
      refs.sunLight.intensity = Math.max(0.0, elevIntensityScale * 2.15 * dustSunAtten);

      refs.hemiLight.color
        .copy(hemiNightSky)
        .lerp(hemiDaySky, dayFactor)
        .lerp(hemiTwilightSky, twilightBand * 0.65);
      refs.hemiLight.groundColor.copy(hemiNightGround).lerp(hemiDayGround, dayFactor);
      refs.hemiLight.intensity = THREE.MathUtils.lerp(0.38, 0.88, dayFactor) + twilightBand * 0.16;

      // mEMU Spacesuit LED Headlamp, Rover Floodlights & Base Habitat Beacon (calibrated for Three r169 physical candela decay)
      const lampOnFactor = THREE.MathUtils.clamp(
        THREE.MathUtils.smoothstep(10.0 - solarElevDeg, 0, 15.0) + stormIntensity * 0.3,
        0,
        1
      );
      refs.helmetHeadlamp.intensity = THREE.MathUtils.lerp(0.6, 115.0, lampOnFactor);
      refs.visorFillLight.intensity = THREE.MathUtils.lerp(0.0, 10.5, nightFactor);
      refs.roverFloodLight.intensity = THREE.MathUtils.lerp(1.2, 78.0, lampOnFactor);
      refs.habExteriorLight.intensity = THREE.MathUtils.lerp(2.0, 56.0, lampOnFactor);

      // Terrain winter CO2/H2O surface frost & airborne optical depth uniform updates
      refs.contourUniforms.uFrost.value = THREE.MathUtils.lerp(
        refs.contourUniforms.uFrost.value,
        marsTime?.frostCover01 ?? 0.0,
        Math.min(1, dt * 3.0)
      );
      refs.contourUniforms.uDust.value = clampedTau;

      refs.skyUniforms.uDust.value = clampedTau;
      refs.skyUniforms.uSpe.value = THREE.MathUtils.lerp(
        refs.skyUniforms.uSpe.value,
        p.speActive ? 1.0 : 0.0,
        dt * 3.0
      );
      // Toggle synthetic PDR Wireframe terrain overlay during severe whiteout dust storms (tau > 2.5)
      const wireframeStrength = THREE.MathUtils.clamp(
        (clampedTau - (MISSION_CONFIG.thresholds.dustOpacityCriticalTau - 0.15)) / 0.65,
        0,
        1
      );
      refs.groundWireMat.opacity = wireframeStrength * 0.24;
      refs.groundWireMesh.visible = wireframeStrength > 0.02;
      if (wireframeStrength > 0.02) {
        refs.contourUniforms.uShowContours.value = Math.max(
          refs.contourUniforms.uShowContours.value,
          0.7 + wireframeStrength * 0.65
        );
      }
      refs.skyUniforms.uTime.value = tSec;
      refs.dustMat.size = 0.17 + stormIntensity * 0.11;

      // First-person step bobbing + subtle sandstorm wind buffet
      const movedDelta = Math.hypot(
        p.astronautPos.x - lastAstroX,
        p.astronautPos.y - lastAstroY
      );
      lastAstroX = p.astronautPos.x;
      lastAstroY = p.astronautPos.y;

      const isWalking = movedDelta > 0.01;
      if (isWalking) {
        stepPhase += dt * 7.2;
      }

      const groundSample = sampleTerrainBilinear(grid, p.astronautPos.x, p.astronautPos.y);
      const windRoll = stormIntensity * Math.sin(tSec * 2.4) * 0.0065;
      const egress = egressStateRef.current;

      if (egress.active) {
        egress.elapsed = Math.min(EGRESS_DURATION_S, egress.elapsed + Math.min(dt, 0.045));
        const u = egress.elapsed / EGRESS_DURATION_S;

        // Stage 1 (0.00..0.28): Depressurize chamber 101.3 kPa -> 0.61 kPa Mars ambient
        const depressU = THREE.MathUtils.smoothstep(u, 0.02, 0.27);
        const chamberPressureKpa = 0.61 + 100.69 * Math.pow(1 - depressU, 1.65);

        // Stage 2 (0.20..0.55): Hydraulic bolts unlatch, equalized seal opens & CO2 mist vents
        const latchRetract = THREE.MathUtils.smoothstep(u, 0.19, 0.30);
        const latchX = THREE.MathUtils.lerp(0.19, 0.56, latchRetract);
        refs.airlockLatches.upperLeft.position.x = -latchX;
        refs.airlockLatches.upperRight.position.x = latchX;
        refs.airlockLatches.lowerLeft.position.x = -latchX;
        refs.airlockLatches.lowerRight.position.x = latchX;

        const doorOpen = THREE.MathUtils.smoothstep(u, 0.28, 0.55);
        const doorX = THREE.MathUtils.lerp(0.74, 2.26, doorOpen);
        refs.airlockLeftDoor.position.x = -doorX;
        refs.airlockRightDoor.position.x = doorX;

        const sealColorBlend = THREE.MathUtils.smoothstep(u, 0.24, 0.34);
        refs.airlockStatusMat.color.lerpColors(airlockAmberColor, airlockCyanColor, sealColorBlend);
        const beaconPulse = u < 0.27 ? 0.5 + 0.5 * Math.sin(u * Math.PI * 18) : Math.max(0, 1 - (u - 0.27) * 2.5);
        refs.airlockBeaconLight.color.lerpColors(airlockAmberColor, airlockCyanColor, sealColorBlend);
        refs.airlockBeaconLight.intensity = beaconPulse * 2.4;
        refs.airlockInteriorLight.intensity = THREE.MathUtils.lerp(
          1.72,
          0.55,
          THREE.MathUtils.smoothstep(u, 0.28, 0.85)
        );

        // Vent plume animation at pressure equalization (u = 0.26..0.72)
        const ventPhase = THREE.MathUtils.clamp((u - 0.26) / 0.44, 0, 1);
        if (ventPhase > 0 && ventPhase < 1) {
          refs.airlockVentPoints.visible = true;
          const posArr = (
            refs.airlockVentPoints.geometry.getAttribute('position') as THREE.BufferAttribute
          ).array as Float32Array;
          const count = posArr.length / 3;
          for (let i = 0; i < count; i++) {
            const b = i * 6;
            const spread = ventPhase * 1.45;
            posArr[i * 3] = refs.airlockVentBase[b] + refs.airlockVentBase[b + 3] * spread;
            posArr[i * 3 + 1] = refs.airlockVentBase[b + 1] + refs.airlockVentBase[b + 4] * spread;
            posArr[i * 3 + 2] = refs.airlockVentBase[b + 2] + refs.airlockVentBase[b + 5] * spread;
          }
          refs.airlockVentPoints.geometry.getAttribute('position').needsUpdate = true;
          refs.airlockVentMat.opacity = Math.sin(ventPhase * Math.PI) * 0.62;
        } else {
          refs.airlockVentPoints.visible = false;
        }

        // Photochromic iris adaptation as astronaut steps from airlock into Arcadia light cycle
        const sunlightBloom =
          Math.exp(-Math.pow((u - 0.44) / 0.14, 2)) * 0.22 * dayFactor;
        refs.renderer.toneMappingExposure =
          THREE.MathUtils.lerp(0.88, targetExposure, THREE.MathUtils.smoothstep(u, 0.28, 0.68)) +
          sunlightBloom;
        if (egressFlashRef.current) {
          const glareOpacity = Math.exp(-Math.pow((u - 0.42) / 0.11, 2)) * 0.34;
          egressFlashRef.current.style.opacity = glareOpacity.toFixed(3);
        }

        // Stage 3 & 4 (0.32..1.00): Heavy spacesuit gait over sill, down grated ramp & onto terrain
        const walkU = THREE.MathUtils.smoothstep(u, 0.32, 0.96);
        const walkX = THREE.MathUtils.lerp(
          0,
          p.astronautPos.x,
          THREE.MathUtils.smoothstep(walkU, 0.46, 1.0)
        );
        const walkY = THREE.MathUtils.lerp(6.2, p.astronautPos.y, walkU);

        let floorY: number;
        if (walkY <= 9.4) {
          floorY = baseGroundY + 0.08;
        } else if (walkY <= 12.2) {
          floorY = THREE.MathUtils.lerp(baseGroundY + 0.08, rampEndWorldY, (walkY - 9.4) / 2.8);
        } else {
          floorY = sampleTerrainBilinear(grid, walkX, walkY).visualY;
        }

        // Authentic 0.38g spacesuit lope + pneumatic unlatch micro-kick + ramp foot glance
        const strideEnv = Math.sin(THREE.MathUtils.clamp((u - 0.32) / 0.64, 0, 1) * Math.PI);
        const walkCycle = walkU * Math.PI * 6.0;
        const heelStrike = Math.pow(Math.abs(Math.sin(walkCycle)), 1.35) * 0.072;
        const idleBreath = Math.sin(u * Math.PI * 3.0) * 0.005 * (1 - strideEnv);
        const latchJolt =
          Math.exp(-Math.pow((u - 0.22) / 0.025, 2)) * 0.012 +
          Math.exp(-Math.pow((u - 0.29) / 0.03, 2)) * 0.009;
        const egressBobY = heelStrike * strideEnv + idleBreath;
        const egressRoll =
          Math.sin(walkCycle) * 0.0125 * strideEnv +
          Math.sin(u * 65) * latchJolt * 0.45;

        const lookU = THREE.MathUtils.smoothstep(u, 0.68, 1.0);
        let yawDelta = ((p.headingRad + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        if (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
        const camHeading = yawDelta * lookU;

        const chamberCheckPitch = -0.055 * Math.sin(THREE.MathUtils.clamp(u / 0.24, 0, 1) * Math.PI);
        const rampGlancePitch =
          -0.095 * Math.sin(THREE.MathUtils.clamp((walkY - 8.8) / 4.2, 0, 1) * Math.PI);
        const baseEgressPitch = THREE.MathUtils.lerp(0.01, p.pitchRad, lookU);
        const camPitch = baseEgressPitch + chamberCheckPitch + rampGlancePitch - latchJolt;

        camera.position.set(walkX, floorY + 1.75 + egressBobY, -walkY);
        camera.rotation.order = 'YXZ';
        camera.rotation.y = -camHeading;
        camera.rotation.x = camPitch;
        camera.rotation.z = windRoll + egressRoll;

        refs.dustMat.opacity =
          THREE.MathUtils.smoothstep(u, 0.36, 0.78) * Math.min(0.72, 0.18 + clampedTau * 0.18);
        if (markersOverlayRef.current) {
          markersOverlayRef.current.style.opacity = String(
            THREE.MathUtils.smoothstep(u, 0.66, 0.96)
          );
        }

        // Update zero-GC DOM airlock cycle telemetry banner
        if (egressPressureTextRef.current) {
          egressPressureTextRef.current.textContent = `${chamberPressureKpa.toFixed(1)} kPa`;
        }
        if (egressProgressBarRef.current) {
          egressProgressBarRef.current.style.width = `${Math.round(u * 100)}%`;
        }
        if (egressPhaseLabelRef.current && egressDotRef.current) {
          if (u < 0.27) {
            egressPhaseLabelRef.current.textContent =
              p.lang === 'en'
                ? 'AIRLOCK SEALED · DEPRESSURIZING CHAMBER'
                : 'ESCLUSA SELLADA · DESPRESURIZANDO CÁMARA';
            egressDotRef.current.className = 'h-2 w-2 rounded-full bg-amber-400 animate-ping';
          } else if (u < 0.56) {
            egressPhaseLabelRef.current.textContent =
              p.lang === 'en'
                ? 'PRESSURE EQUALIZED (0.61 kPa) · OPENING HATCH'
                : 'PRESIÓN IGUALADA (0.61 kPa) · ABRIENDO COMPUERTA';
            egressDotRef.current.className = 'h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_8px_#38e8ff]';
          } else {
            egressPhaseLabelRef.current.textContent =
              p.lang === 'en'
                ? 'SURFACE EGRESS · ARCADIA PLANITIA'
                : 'SALIDA A SUPERFICIE · ARCADIA PLANITIA';
            egressDotRef.current.className = 'h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]';
          }
        }

        if (egress.elapsed >= EGRESS_DURATION_S && !egress.doneNotified) {
          egress.doneNotified = true;
          egress.active = false;
          refs.airlockVentPoints.visible = false;
          refs.renderer.toneMappingExposure = targetExposure;
          if (egressFlashRef.current) {
            egressFlashRef.current.style.opacity = '0';
          }
          if (markersOverlayRef.current) {
            markersOverlayRef.current.style.opacity = '1';
          }
          p.onEgressComplete?.();
        }
      } else {
        refs.airlockLeftDoor.position.x = -2.26;
        refs.airlockRightDoor.position.x = 2.26;
        refs.airlockLatches.upperLeft.position.x = -0.56;
        refs.airlockLatches.upperRight.position.x = 0.56;
        refs.airlockLatches.lowerLeft.position.x = -0.56;
        refs.airlockLatches.lowerRight.position.x = 0.56;
        refs.airlockVentPoints.visible = false;
        refs.airlockBeaconLight.intensity = 0;
        refs.renderer.toneMappingExposure = targetExposure;
        if (egressFlashRef.current && egressFlashRef.current.style.opacity !== '0') {
          egressFlashRef.current.style.opacity = '0';
        }
        refs.airlockStatusMat.color.copy(airlockCyanColor);
        refs.airlockInteriorLight.intensity = 0.65;
        refs.dustMat.opacity = Math.min(0.72, 0.18 + clampedTau * 0.18);
        if (markersOverlayRef.current && markersOverlayRef.current.style.opacity !== '1') {
          markersOverlayRef.current.style.opacity = '1';
        }

        const bobY = p.ridingRover
          ? isWalking
            ? Math.sin(tSec * 22) * 0.018
            : Math.sin(now * 0.002) * 0.004
          : isWalking
            ? Math.abs(Math.sin(stepPhase)) * 0.075
            : Math.sin(now * 0.0018) * 0.007;

        const roverSway = p.ridingRover && isWalking ? Math.sin(tSec * 8.5) * 0.0045 : 0;

        // First-Person Martian Floor Sample Pickup Sequence (crouch + mEMU arm reach + basalt grab + visor inspect)
        const pu = pickupStateRef.current;
        let puCamDipY = 0;
        let puCamPitchOffset = 0;
        if (pu.active) {
          const pNorm = (now - pu.startMs) / pu.durationMs;
          if (pNorm >= 1) {
            pu.active = false;
            refs.pickupArmGroup.visible = false;
            refs.pickupSpecimenGroup.visible = false;
          } else {
            const crouchUp = THREE.MathUtils.smoothstep(pNorm, 0.02, 0.34);
            const standBack = THREE.MathUtils.smoothstep(pNorm, 0.56, 0.90);
            const crouchEnv = Math.max(0, crouchUp - standBack);
            puCamDipY = (p.ridingRover ? -0.1 : -0.62) * crouchEnv;
            puCamPitchOffset = (p.ridingRover ? -0.22 : -0.44) * crouchEnv;
          }
        }

        const eyeY = groundSample.visualY + (p.ridingRover ? 2.86 : 1.75) + bobY + puCamDipY;
        camera.position.set(p.astronautPos.x, eyeY, -p.astronautPos.y);
        camera.rotation.order = 'YXZ';
        camera.rotation.y = -p.headingRad;
        camera.rotation.x = THREE.MathUtils.clamp(p.pitchRad + puCamPitchOffset, -1.12, 0.72);
        camera.rotation.z = windRoll + roverSway;

        if (pu.active) {
          const pNorm = (now - pu.startMs) / pu.durationMs;
          refs.pickupArmGroup.visible = true;
          refs.pickupSpecimenGroup.visible = pNorm < 0.92;

          // Reach diagonally from lower-left mEMU shoulder -> pincer grasp on Martian basalt -> chest lift
          let armX = -0.36;
          let armY = -0.36;
          let armZ = -0.14;
          let armRotX = -0.22;
          let armRotY = -0.44;
          let armRotZ = 0.14;
          let clawSpread = 0.44;

          if (pNorm < 0.42) {
            const k = THREE.MathUtils.smoothstep(pNorm, 0.0, 0.40);
            armX = THREE.MathUtils.lerp(-0.42, -0.30, k);
            armY = THREE.MathUtils.lerp(-0.38, -0.22, k);
            armZ = THREE.MathUtils.lerp(-0.10, -0.22, k);
            armRotX = THREE.MathUtils.lerp(-0.14, -0.22, k);
            armRotY = THREE.MathUtils.lerp(-0.48, -0.40, k);
            armRotZ = THREE.MathUtils.lerp(0.10, 0.16, k);
            clawSpread = THREE.MathUtils.lerp(0.50, 0.28, k);
          } else if (pNorm < 0.60) {
            const k = THREE.MathUtils.smoothstep(pNorm, 0.42, 0.56);
            armX = -0.30;
            armY = THREE.MathUtils.lerp(-0.22, -0.17, k);
            armZ = THREE.MathUtils.lerp(-0.22, -0.20, k);
            armRotX = THREE.MathUtils.lerp(-0.22, -0.06, k);
            armRotY = THREE.MathUtils.lerp(-0.40, -0.42, k);
            armRotZ = 0.16;
            clawSpread = THREE.MathUtils.lerp(0.28, 0.03, k);
          } else if (pNorm < 0.84) {
            const k = THREE.MathUtils.smoothstep(pNorm, 0.60, 0.80);
            armX = THREE.MathUtils.lerp(-0.30, -0.26, k);
            armY = THREE.MathUtils.lerp(-0.17, -0.11, k);
            armZ = THREE.MathUtils.lerp(-0.20, -0.14, k);
            armRotX = THREE.MathUtils.lerp(-0.06, 0.22, k);
            armRotY = THREE.MathUtils.lerp(-0.42, -0.36, k);
            armRotZ = THREE.MathUtils.lerp(0.16, 0.24, k);
            clawSpread = 0.03;
          } else {
            const k = THREE.MathUtils.smoothstep(pNorm, 0.84, 1.0);
            armX = THREE.MathUtils.lerp(-0.26, -0.44, k);
            armY = THREE.MathUtils.lerp(-0.11, -0.48, k);
            armZ = THREE.MathUtils.lerp(-0.14, -0.12, k);
            armRotX = THREE.MathUtils.lerp(0.22, -0.34, k);
            armRotY = THREE.MathUtils.lerp(-0.36, -0.48, k);
            armRotZ = THREE.MathUtils.lerp(0.24, 0.08, k);
            clawSpread = THREE.MathUtils.lerp(0.03, 0.28, k);
          }

          refs.pickupArmGroup.position.set(armX, armY, armZ);
          refs.pickupArmGroup.rotation.set(armRotX, armRotY, armRotZ);
          refs.pickupClawLeft.rotation.y = clawSpread;
          refs.pickupClawLeft.position.x = -0.018 - clawSpread * 0.04;
          refs.pickupClawRight.rotation.y = -clawSpread;
          refs.pickupClawRight.position.x = 0.018 + clawSpread * 0.04;
          (refs.pickupLaserRing.material as THREE.MeshBasicMaterial).opacity =
            pNorm < 0.48 ? 0.45 + 0.45 * Math.sin(tSec * 22) : 0.2;

          camera.updateMatrixWorld();
          if (pNorm < 0.46) {
            // Specimen resting directly on Martian terrain with pulsing cyan scan halo
            refs.pickupSpecimenGroup.position.set(pu.worldX, pu.visualY + 0.075, -pu.worldY);
            refs.pickupRockMesh.rotation.set(0.2, pu.worldX * 0.4, 0.1);
            refs.pickupGroundRing.visible = true;
            const scanPulse = 0.92 + 0.22 * Math.sin(tSec * 14);
            refs.pickupGroundRing.scale.set(scanPulse, scanPulse, 1);
          } else {
            // Rock grasped smoothly inside pincer tip & lifted toward suit chest pouch
            refs.pickupGroundRing.visible = false;
            refs.pickupClawTip.getWorldPosition(tmpClawWorldPos);
            refs.pickupSpecimenGroup.position.copy(tmpClawWorldPos);
            refs.pickupRockMesh.rotation.y += dt * 1.4;
          }
        } else {
          refs.pickupArmGroup.visible = false;
          refs.pickupSpecimenGroup.visible = false;
        }
      }

      refs.contourUniforms.uAstroPos.value.set(camera.position.x, 0, camera.position.z);

      // Update Passive IMU Artificial Horizon Line (sub-frame DOM transform = < 1ms motion-to-photon)
      if (horizonBarRef.current) {
        const pitchOffsetPx = THREE.MathUtils.clamp(camera.rotation.x * 240, -90, 90);
        const bankDeg = (-camera.rotation.z * 180) / Math.PI;
        horizonBarRef.current.style.transform = `translate3d(-50%, calc(-50% + ${pitchOffsetPx.toFixed(1)}px), 0) rotate(${bankDeg.toFixed(2)}deg)`;
      }

      // Update 3D Amber Confidence Halo Mesh under Astronaut (mmWave 77 GHz / Low Cohesion)
      const showHalo = Boolean(p.subgridCheck?.confidenceHaloActive && !egress.active);
      refs.confidenceHaloGroup.visible = showHalo;
      if (showHalo) {
        const haloPulse = 0.5 + 0.5 * Math.sin(tSec * 4.5);
        refs.confidenceHaloGroup.position.set(
          p.astronautPos.x,
          groundSample.visualY + 0.14,
          -p.astronautPos.y
        );
        const scale = 1.0 + haloPulse * 0.14;
        refs.confidenceHaloGroup.scale.set(scale, 1, scale);
        refs.confidenceHaloInnerMat.opacity = 0.45 + haloPulse * 0.42;
        refs.confidenceHaloOuterMat.opacity = 0.2 + haloPulse * 0.3;
      }

      // Animate 1st-Person Right Spacesuit Forearm lifting into Bottom-Right view on EVA exit ([Tab] / [B])
      const targetArm = !egress.active && forearmRaisedRef.current ? 1.0 : 0.0;
      forearmAnimProgress = THREE.MathUtils.lerp(forearmAnimProgress, targetArm, Math.min(1, dt * 9.5));
      const easeArm = forearmAnimProgress * forearmAnimProgress * (3 - 2 * forearmAnimProgress);
      refs.forearm3DGroup.position.set(
        THREE.MathUtils.lerp(0.28, 0.23, easeArm),
        THREE.MathUtils.lerp(-0.62, -0.32, easeArm) + Math.sin(tSec * 2.2) * 0.003,
        THREE.MathUtils.lerp(-0.48, -0.46, easeArm)
      );
      refs.forearm3DGroup.rotation.set(
        THREE.MathUtils.lerp(-0.82, -0.05, easeArm),
        THREE.MathUtils.lerp(-0.28, -0.24, easeArm),
        THREE.MathUtils.lerp(0.22, 0.08, easeArm)
      );
      (refs.forearmScreenGlow.material as THREE.MeshBasicMaterial).opacity =
        easeArm * (0.68 + 0.15 * Math.sin(tSec * 6.0));
      refs.forearm3DGroup.visible = easeArm > 0.01;

      // Orbital SOS VITAL Return Beacon over Habitat Module (POI-01)
      refs.orbitalBeaconGroup.visible = Boolean(p.sosActive);
      if (p.sosActive) {
        const pastelPulse = 0.45 + 0.45 * (0.5 + 0.5 * Math.sin(tSec * 4.2));
        refs.orbitalBeaconBeamMat.opacity = pastelPulse * 0.52;
        refs.orbitalBeaconRing.rotation.z = tSec * 1.1;
        const ringPulse = 1 + 0.18 * Math.sin(tSec * 4.2);
        refs.orbitalBeaconRing.scale.set(ringPulse, ringPulse, 1);
      }

      // Keep directional sun shadow frustum aligned with Arcadia Planitia solar ephemeris around astronaut
      refs.sunLight.position.set(
        p.astronautPos.x + shadowSunX * 135,
        groundSample.visualY + shadowSunY * 135,
        -p.astronautPos.y + shadowSunZ * 135
      );
      refs.sunLight.target.position.set(
        p.astronautPos.x,
        groundSample.visualY,
        -p.astronautPos.y
      );
      refs.sunLight.target.updateMatrixWorld();

      // Animate light pulse wave over STATIC fixed-coordinate waypoints along precomputed activeRoute
      if (
        refs.routeCurve &&
        refs.routeTotalLen > 0.5 &&
        refs.bakedRouteSamples.length > 0 &&
        refs.pulseNodes.length > 0
      ) {
        const astroX = p.astronautPos.x;
        const astroZ = -p.astronautPos.y;
        const samples = refs.bakedRouteSamples;
        let bestIdx = 0;
        let bestDistSq = Infinity;
        for (let i = 0; i < samples.length; i++) {
          const wp = samples[i].worldPos;
          const dSq = (wp.x - astroX) * (wp.x - astroX) + (wp.z - astroZ) * (wp.z - astroZ);
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            bestIdx = i;
          }
        }

        const astroDistAlong = samples[bestIdx].distAlongM;
        const goalPt = samples[samples.length - 1].worldPos;
        const remGoalDist = Math.hypot(goalPt.x - astroX, goalPt.z - astroZ);

        // Anchor leading collimated reticle cleanly onto the precomputed static path ~3.2 m ahead (inside standing FOV)
        const leadDistAlong = Math.min(refs.routeTotalLen, astroDistAlong + 3.2);
        const leadU = Math.max(0, Math.min(1, leadDistAlong / refs.routeTotalLen));
        const leadCurvePt = refs.routeCurve.getPointAt(leadU);
        const leadGroundY = sampleTerrainBilinear(grid, leadCurvePt.x, -leadCurvePt.z).visualY;

        refs.leadPulseGroup.visible = remGoalDist > 0.35;
        refs.leadPulseGroup.position.set(leadCurvePt.x, leadGroundY, leadCurvePt.z);
        const leadScale = p.sosActive ? 1.32 : 1.0;
        refs.leadPulseGroup.scale.set(leadScale, leadScale, leadScale);

        const rippleSpeed = p.sosActive ? 3.2 : 2.2;
        const ripplePhase = (tSec * rippleSpeed) % 1;
        const sInner = 0.78 + ripplePhase * 1.15;
        const sOuter = 0.95 + ((ripplePhase + 0.5) % 1) * 1.45;
        refs.leadRingInner.scale.set(sInner, sInner, 1);
        (refs.leadRingInner.material as THREE.MeshBasicMaterial).opacity = (1 - ripplePhase) * 0.92;
        refs.leadRingOuter.scale.set(sOuter, sOuter, 1);
        (refs.leadRingOuter.material as THREE.MeshBasicMaterial).opacity =
          (1 - ((ripplePhase + 0.5) % 1)) * (p.sosActive ? 0.85 : 0.65);
        refs.leadCoreMesh.position.y = 0.30 + Math.sin(tSec * (p.sosActive ? 6.5 : 4.5)) * 0.04;

        // Vibrante color de emergencia cuando Alerta SOS está activa (carmesí neón <-> oro luminoso)
        const sosFlash = 0.5 + 0.5 * Math.sin(tSec * 7.0);
        if (p.sosActive) {
          animColorTmp.lerpColors(sosCrimsonColor, sosCoralAmberColor, sosFlash);
          (refs.leadCoreMesh.material as THREE.MeshBasicMaterial).color.copy(animColorTmp);
          animColorTmp.lerpColors(sosCrimsonColor, sosRingFlashColor, sosFlash * 0.65);
          (refs.leadRingInner.material as THREE.MeshBasicMaterial).color.copy(animColorTmp);
          (refs.leadRingOuter.material as THREE.MeshBasicMaterial).color.copy(sosCoralAmberColor);
          if (refs.emergencyTubeMat) {
            refs.emergencyTubeMat.opacity = 0.55 + 0.38 * sosFlash;
          }
        }

        // Pool nodes via deterministic modulo world-index (k % poolCount) so nodes NEVER slide with astronaut motion
        const waveSpeedMPerSec = p.sosActive ? 14.0 : 9.0;
        const maxVisibleDistM = p.sosActive ? 120.0 : 108.0;
        const poolCount = refs.pulseNodes.length;
        const firstIdx = Math.min(samples.length - 1, bestIdx + 1);
        const lastIdx = Math.min(samples.length - 1, firstIdx + Math.min(poolCount - 1, Math.floor(maxVisibleDistM / GUIDE_PULSE_STEP_M)));

        for (let slot = 0; slot < poolCount; slot++) {
          refs.pulseNodes[slot].group.visible = false;
        }

        for (let k = firstIdx; k <= lastIdx; k++) {
          const sample = samples[k];
          const relM = sample.distAlongM - astroDistAlong;
          if (relM < 1.5 || relM > maxVisibleDistM) continue;

          const node = refs.pulseNodes[k % poolCount];
          if (node.mappedSampleIdx !== k) {
            node.mappedSampleIdx = k;
            node.distAlongM = sample.distAlongM;
            node.worldPos.copy(sample.worldPos);
            node.group.position.set(sample.worldPos.x, sample.groundY, sample.worldPos.z);
          }
          node.group.visible = true;

          const distFade = 1.0 - THREE.MathUtils.smoothstep(relM, 24.0, maxVisibleDistM);
          // Continuous wave offset tied to FIXED sample.distAlongM so the light wave travels forward along stationary orbs!
          const phase = ((sample.distAlongM - tSec * waveSpeedMPerSec) % 10.0 + 10.0) % 10.0;
          const pulsePeak = Math.exp(-0.5 * Math.pow((phase - 1.6) / 1.4, 2));

          if (p.sosActive) {
            animColorTmp.lerpColors(sosCrimsonColor, sosCoralAmberColor, pulsePeak * 0.85 + sosFlash * 0.15);
            node.orbMat.color.copy(animColorTmp);
            animColorTmp.lerpColors(sosCrimsonColor, sosRingFlashColor, pulsePeak * 0.55);
            node.ringMat.color.copy(animColorTmp);
          }

          node.orbMat.opacity = ((p.sosActive ? 0.56 : 0.42) + (p.sosActive ? 0.44 : 0.58) * pulsePeak) * distFade;
          node.ringMat.opacity = ((p.sosActive ? 0.45 : 0.28) + (p.sosActive ? 0.55 : 0.68) * pulsePeak) * distFade;
          const ringScale = (p.sosActive ? 1.05 : 0.88) + (p.sosActive ? 0.72 : 0.52) * pulsePeak;
          node.ringMesh.scale.set(ringScale, ringScale, 1);
        }
      } else {
        refs.leadPulseGroup.visible = false;
        for (let slot = 0; slot < refs.pulseNodes.length; slot++) {
          refs.pulseNodes[slot].group.visible = false;
        }
      }

      // Smoothly interpolate Rover position, windshield-forward orientation, wheels & SOS beacon
      const targetRoverGround = sampleTerrainBilinear(grid, p.rover.x, p.rover.y).visualY;
      const targetRoverVec = new THREE.Vector3(p.rover.x, targetRoverGround, -p.rover.y);
      const distStep = smoothRoverPos.distanceTo(targetRoverVec);
      if (p.ridingRover && !egress.active) {
        smoothRoverPos.copy(targetRoverVec);
      } else {
        smoothRoverPos.lerp(targetRoverVec, Math.min(1, dt * 6.5));
      }
      refs.roverGroup.position.copy(smoothRoverPos);

      // Local +Z windshield faces -Z world forward when rotated by +Math.PI
      const targetYaw = p.ridingRover && !egress.active
        ? -p.headingRad + Math.PI
        : (-p.rover.headingDeg * Math.PI) / 180 + Math.PI;
      if (p.ridingRover && !egress.active) {
        smoothRoverYaw = targetYaw;
      } else {
        let yawDiff = ((targetYaw - smoothRoverYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        if (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
        smoothRoverYaw += yawDiff * Math.min(1, dt * 5.0);
      }
      refs.roverGroup.rotation.y = smoothRoverYaw;

      if (p.sosActive && !p.ridingRover) {
        const strobe = 0.5 + 0.5 * Math.sin(tSec * 12.0);
        refs.roverBeaconMat.color.lerpColors(sosCrimsonColor, sosCoralAmberColor, strobe);
      } else if (p.ridingRover) {
        refs.roverBeaconMat.color.setHex(0x34d399);
      } else {
        refs.roverBeaconMat.color.copy(airlockCyanColor);
      }

      if (distStep > 0.002) {
        for (const wheel of refs.roverWheels) {
          wheel.rotation.x += distStep * 1.4;
        }
        // Rocker-bogie suspension micro-pitch & roll heave over Martian regolith while driving/escorting
        refs.roverGroup.rotation.x = Math.sin(tSec * 8.5) * 0.016;
        refs.roverGroup.rotation.z = Math.cos(tSec * 6.2) * 0.014;
      } else {
        refs.roverGroup.rotation.x = THREE.MathUtils.lerp(refs.roverGroup.rotation.x, 0, dt * 6);
        refs.roverGroup.rotation.z = THREE.MathUtils.lerp(refs.roverGroup.rotation.z, 0, dt * 6);
      }
      if (refs.roverMastHeadRef.current) {
        refs.roverMastHeadRef.current.rotation.y = p.ridingRover
          ? 0
          : Math.sin(tSec * 0.68) * 0.42;
      }
      if (!refs.roverUsingNasaGlbRef.current) {
        refs.roverDish.lookAt(camera.position);
      }

      // Update EV2 Buddy position
      const buddyGround = sampleTerrainBilinear(grid, p.buddyPos.x, p.buddyPos.y).visualY;
      refs.buddyGroup.position.set(p.buddyPos.x, buddyGround, -p.buddyPos.y);

      // Wind-driven dust drift
      refs.dustPoints.position.set(camera.position.x, camera.position.y - 1.75, camera.position.z);
      refs.dustPoints.rotation.y = now * (0.00012 + clampedTau * 0.00015);

      refs.skyMesh.position.copy(camera.position);

      refs.poiMeshes.forEach(({ ring, diamond }, idx) => {
        const s = 1 + 0.12 * Math.sin(now * 0.0035 + idx);
        ring.scale.set(s, s, 1);
        diamond.rotation.y = tSec * 1.1 + idx;
      });

      renderer.render(scene, camera);

      // Project No Man's Sky style 3D world markers every 3 frames for zero React overhead
      frameCounter++;
      if (frameCounter % 3 === 0 && container) {
        const w = container.clientWidth || window.innerWidth;
        const h = container.clientHeight || window.innerHeight;
        const nextMarkers: ProjectedWorldMarker[] = [];

        for (const poi of pois) {
          const distM = Math.hypot(poi.x - p.astronautPos.x, poi.y - p.astronautPos.y);
          const isTarget = p.activeRoute?.targetId === poi.id;
          // Show active target always, and other POIs within 1400 m
          if (!isTarget && distM > 1400) continue;

          const s = sampleTerrainBilinear(grid, poi.x, poi.y);
          projVec.set(poi.x, s.visualY + 7.2, -poi.y).project(camera);
          if (projVec.z > -1 && projVec.z < 1) {
            const sx = (projVec.x * 0.5 + 0.5) * w;
            const sy = (-projVec.y * 0.5 + 0.5) * h;
            if (sx > 60 && sx < w - 60 && sy > 70 && sy < h - 70) {
              nextMarkers.push({
                id: poi.id,
                label: getCleanShortPoiName(poi, p.lang),
                distM: Math.round(distM),
                x: sx,
                y: sy,
                isTarget,
                kind:
                  poi.kind === 'shelter'
                    ? 'shelter'
                    : poi.kind === 'base'
                      ? 'base'
                      : 'poi',
                visible: true,
              });
            }
          }
        }

        // Rover NMS marker (hidden when piloting the rover)
        if (!p.ridingRover) {
          const roverDistM = Math.hypot(
            p.rover.x - p.astronautPos.x,
            p.rover.y - p.astronautPos.y
          );
          projVec.set(smoothRoverPos.x, smoothRoverPos.y + 3.4, smoothRoverPos.z).project(camera);
          if (projVec.z > -1 && projVec.z < 1) {
            const sx = (projVec.x * 0.5 + 0.5) * w;
            const sy = (-projVec.y * 0.5 + 0.5) * h;
            if (sx > 60 && sx < w - 60 && sy > 70 && sy < h - 70) {
              nextMarkers.push({
                id: 'ROVER',
                label: p.sosActive
                  ? p.lang === 'en'
                    ? 'Escort Rover - Perseverance → Base'
                    : 'Rover Escolta - Perseverance → Base'
                  : p.lang === 'en'
                    ? 'Escort Rover - Perseverance'
                    : 'Rover Escolta - Perseverance',
                distM: Math.round(roverDistM),
                x: sx,
                y: sy,
                isTarget: p.sosActive,
                kind: 'rover',
                visible: true,
              });
            }
          }
        }

        // Deployed POI-CACHE geological drop beacon
        if (p.cacheNode) {
          const cacheDistM = Math.hypot(
            p.cacheNode.x - p.astronautPos.x,
            p.cacheNode.y - p.astronautPos.y
          );
          const cs = sampleTerrainBilinear(grid, p.cacheNode.x, p.cacheNode.y);
          projVec.set(p.cacheNode.x, cs.visualY + 3.2, -p.cacheNode.y).project(camera);
          if (projVec.z > -1 && projVec.z < 1) {
            const sx = (projVec.x * 0.5 + 0.5) * w;
            const sy = (-projVec.y * 0.5 + 0.5) * h;
            if (sx > 60 && sx < w - 60 && sy > 70 && sy < h - 70) {
              nextMarkers.push({
                id: 'POI-CACHE',
                label: p.cacheNode.name,
                distM: Math.round(cacheDistM),
                x: sx,
                y: sy,
                isTarget: false,
                kind: 'cache',
                visible: true,
              });
            }
          }
        }

        // Deployed UWB/UHF Micro-Repeaters (CU-01)
        for (const rep of p.repeaters ?? []) {
          const repDistM = Math.hypot(rep.x - p.astronautPos.x, rep.y - p.astronautPos.y);
          if (repDistM > 1400) continue;
          const rs = sampleTerrainBilinear(grid, rep.x, rep.y);
          projVec.set(rep.x, rs.visualY + 2.8, -rep.y).project(camera);
          if (projVec.z > -1 && projVec.z < 1) {
            const sx = (projVec.x * 0.5 + 0.5) * w;
            const sy = (-projVec.y * 0.5 + 0.5) * h;
            if (sx > 60 && sx < w - 60 && sy > 70 && sy < h - 70) {
              nextMarkers.push({
                id: rep.id,
                label: p.lang === 'en' ? `${rep.id} UWB Relay` : `${rep.id} Relé UWB`,
                distM: Math.round(repDistM),
                x: sx,
                y: sy,
                isTarget: false,
                kind: 'repeater',
                visible: true,
              });
            }
          }
        }

        setWorldMarkers(nextMarkers);
      }

      if (now - lastPerfUpdate >= 600) {
        const currentFps = Math.min(
          60,
          Math.round((frameCounter * 1000) / (now - lastPerfUpdate))
        );
        p.onPerfSample(currentFps, Number((1000 / Math.max(1, currentFps)).toFixed(1)));
        frameCounter = 0;
        lastPerfUpdate = now;
      }
    };

    animId = requestAnimationFrame(animate);

    return () => {
      roverGroup.userData.cancelled = true;
      cancelAnimationFrame(animId);
      domEl.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('resize', onResize);
      albedoMap.dispose();
      bumpMap.dispose();
      renderer.dispose();
    };
  }, [grid, pois]);

  // Build 1.5 m ("un metro y medio") Celeste Guide Pulse Nodes along activeRoute
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs) return;

    while (refs.routeGroup.children.length > 0) {
      const child = refs.routeGroup.children[0];
      child.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh || (obj as THREE.Line).isLine) {
          const m = obj as THREE.Mesh | THREE.Line;
          m.geometry.dispose();
          if (Array.isArray(m.material)) {
            m.material.forEach((mat) => mat.dispose());
          } else {
            m.material.dispose();
          }
        }
      });
      refs.routeGroup.remove(child);
    }
    while (refs.crossedGroup.children.length > 0) {
      const child = refs.crossedGroup.children[0];
      refs.crossedGroup.remove(child);
    }
    refs.pulseNodes = [];
    refs.bakedRouteSamples = [];
    refs.emergencyTubeMat = null;
    refs.routeCurve = null;
    refs.routeTotalLen = 0;

    if (activeRoute && !activeRoute.blocked && activeRoute.points.length >= 2) {
      // Celestial cyan (#38e8ff) nominal; vibrant neon crimson-gold (#ff1448 / #ffe600) under SOS alert
      const pulseColor = sosActive ? 0xff1448 : 0x38e8ff;
      const coreColor = sosActive ? 0xffe600 : 0xb8f8ff;

      const rawPts = activeRoute.points.map((pt) => {
        const s = sampleTerrainBilinear(grid, pt.x, pt.y);
        return new THREE.Vector3(pt.x, s.visualY + 0.18, -pt.y);
      });

      const curve = new THREE.CatmullRomCurve3(rawPts);
      const totalLen = Math.max(2, curve.getLength());
      refs.routeCurve = curve;
      refs.routeTotalLen = totalLen;

      // Update Lead Pulse colors (all 3 meshes turn luminous crimson/gold under SOS alert)
      (refs.leadCoreMesh.material as THREE.MeshBasicMaterial).color.setHex(coreColor);
      (refs.leadRingInner.material as THREE.MeshBasicMaterial).color.setHex(pulseColor);
      (refs.leadRingOuter.material as THREE.MeshBasicMaterial).color.setHex(coreColor);

      // Static holographic corridor guide ribbon & tube hugging Martian terrain across the entire locked EVA route
      const ribbonPts = curve.getPoints(Math.min(360, Math.max(40, Math.round(totalLen / 3))));
      for (const rp of ribbonPts) {
        rp.y = sampleTerrainBilinear(grid, rp.x, -rp.z).visualY + 0.14;
      }
      const corridorCurve = new THREE.CatmullRomCurve3(ribbonPts);
      const railGeo = new THREE.TubeGeometry(
        corridorCurve,
        Math.min(260, Math.max(60, Math.round(totalLen / 3))),
        sosActive ? 0.088 : 0.068,
        6,
        false
      );
      const railMat = new THREE.MeshBasicMaterial({
        color: pulseColor,
        transparent: true,
        opacity: sosActive ? 0.85 : 0.68,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const railMesh = new THREE.Mesh(railGeo, railMat);
      refs.routeGroup.add(railMesh);
      if (sosActive) {
        refs.emergencyTubeMat = railMat;
      }

      // Bake ALL fixed world sample coordinates every GUIDE_PULSE_STEP_M along the entire static path
      const totalSampleCount = Math.max(1, Math.floor(totalLen / GUIDE_PULSE_STEP_M));
      for (let k = 0; k <= totalSampleCount; k++) {
        const distAlongM = Math.min(totalLen, k * GUIDE_PULSE_STEP_M);
        const u = Math.min(1, distAlongM / totalLen);
        const pt = curve.getPointAt(u);
        const groundY = sampleTerrainBilinear(grid, pt.x, -pt.z).visualY;
        refs.bakedRouteSamples.push({
          distAlongM,
          groundY,
          worldPos: new THREE.Vector3(pt.x, groundY, pt.z),
        });
      }

      // Fixed reusable mesh pool rendered strictly onto stationary bakedRouteSamples indices
      const sharedOrbGeo = new THREE.SphereGeometry(sosActive ? 0.25 : 0.20, 12, 12);
      const sharedRingGeo = new THREE.RingGeometry(sosActive ? 0.28 : 0.25, sosActive ? 0.52 : 0.48, 24);
      sharedRingGeo.rotateX(-Math.PI / 2);

      const poolSize = sosActive ? 72 : 60;
      for (let i = 0; i < poolSize; i++) {
        const nodeGroup = new THREE.Group();
        nodeGroup.visible = false;

        const orbMat = new THREE.MeshBasicMaterial({
          color: coreColor,
          transparent: true,
          opacity: 0.88,
          depthWrite: false,
        });
        const orbMesh = new THREE.Mesh(sharedOrbGeo, orbMat);
        orbMesh.position.y = 0.36;
        nodeGroup.add(orbMesh);

        const ringMat = new THREE.MeshBasicMaterial({
          color: pulseColor,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.62,
          depthWrite: false,
        });
        const ringMesh = new THREE.Mesh(sharedRingGeo, ringMat);
        ringMesh.position.y = 0.16;
        nodeGroup.add(ringMesh);

        refs.routeGroup.add(nodeGroup);
        refs.pulseNodes.push({
          group: nodeGroup,
          distAlongM: 0,
          worldPos: new THREE.Vector3(),
          orbMat,
          ringMat,
          ringMesh,
          mappedSampleIdx: -1,
        });
      }
    }
  }, [activeRoute?.points, activeRoute?.blocked, crossedOutRoute?.points, returnStatusColor, speActive, sosActive, grid]);

  // Digital Breadcrumb Vector Backtracking Trail ("Migas de Pan Digitales")
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs) return;
    clearThreeGroup(refs.breadcrumbGroup);
    if (!breadcrumbs || breadcrumbs.length < 2) return;
    const stride = Math.max(1, Math.floor(breadcrumbs.length / 40));
    const pinGeo = new THREE.OctahedronGeometry(0.085, 0);
    for (let i = 0; i < breadcrumbs.length; i += stride) {
      const pt = breadcrumbs[i];
      const groundY = sampleTerrainBilinear(grid, pt.x, pt.y).visualY;
      const pinMat = new THREE.MeshBasicMaterial({
        color: 0xffc857,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      });
      const pin = new THREE.Mesh(pinGeo, pinMat);
      pin.position.set(pt.x, groundY + 0.14, -pt.y);
      refs.breadcrumbGroup.add(pin);
    }
  }, [breadcrumbs, grid]);

  // 3D Deployed POI-CACHE Beacon & UWB Micro-Repeaters
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs) return;
    clearThreeGroup(refs.cacheGroup);
    clearThreeGroup(refs.repeaterGroup);

    if (cacheNode) {
      const gy = sampleTerrainBilinear(grid, cacheNode.x, cacheNode.y).visualY;
      const crateMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.68, 0.42, 0.52),
        new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.48, metalness: 0.42 })
      );
      crateMesh.position.set(cacheNode.x, gy + 0.22, -cacheNode.y);
      refs.cacheGroup.add(crateMesh);

      const mastMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.04, 1.85, 8),
        new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
      );
      mastMesh.position.set(cacheNode.x, gy + 1.15, -cacheNode.y);
      refs.cacheGroup.add(mastMesh);

      const orbMesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.24, 0),
        new THREE.MeshBasicMaterial({ color: 0xfde68a, wireframe: true })
      );
      orbMesh.position.set(cacheNode.x, gy + 2.35, -cacheNode.y);
      refs.cacheGroup.add(orbMesh);
    }

    for (const rep of repeaters) {
      const gy = sampleTerrainBilinear(grid, rep.x, rep.y).visualY;
      const tripod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.12, 1.65, 8),
        new THREE.MeshStandardMaterial({ color: 0xc4b5fd, metalness: 0.65, roughness: 0.35 })
      );
      tripod.position.set(rep.x, gy + 0.85, -rep.y);
      refs.repeaterGroup.add(tripod);

      const antenna = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: 0.9 })
      );
      antenna.position.set(rep.x, gy + 1.82, -rep.y);
      refs.repeaterGroup.add(antenna);

      const waveRing = new THREE.Mesh(
        new THREE.RingGeometry(0.6, 0.85, 24),
        new THREE.MeshBasicMaterial({
          color: 0xa78bfa,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
        })
      );
      waveRing.rotation.x = -Math.PI / 2;
      waveRing.position.set(rep.x, gy + 0.14, -rep.y);
      refs.repeaterGroup.add(waveRing);
    }
  }, [cacheNode, repeaters, grid]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* 1. PHOTOREALISTIC THREE.JS CANVAS */}
      <div
        ref={containerRef}
        className="h-full w-full cursor-grab active:cursor-grabbing select-none"
      />

      {/* 1.2 SOLAR PHOTOCHROMIC IRIS BLOOM FLASH ON HATCH OPENING */}
      <div
        ref={egressFlashRef}
        style={{ opacity: 0 }}
        className="pointer-events-none absolute inset-0 z-[4] bg-[radial-gradient(circle_at_center,rgba(255,214,170,0.92)_0%,rgba(232,148,92,0.38)_48%,transparent_80%)] mix-blend-screen"
      />

      {/* 1.3 DIEGETIC AIRLOCK DEPRESSURIZATION TELEMETRY BAR DURING EGRESS */}
      {evaEgressActive && (
        <div className="pointer-events-none absolute inset-x-0 top-5 z-30 flex flex-col items-center gap-2 px-4">
          <div className="flex w-full max-w-md flex-col gap-1.5 rounded-2xl border border-white/18 bg-slate-950/65 px-4 py-2.5 text-white shadow-[0_18px_45px_rgba(0,0,0,0.55)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  ref={egressDotRef}
                  className="h-2 w-2 shrink-0 rounded-full bg-amber-400 animate-ping"
                />
                <span
                  ref={egressPhaseLabelRef}
                  className="truncate font-mono text-[10px] font-semibold tracking-[0.12em] text-cyan-100"
                >
                  {t(
                    'AIRLOCK SEALED · DEPRESSURIZING CHAMBER',
                    'ESCLUSA SELLADA · DESPRESURIZANDO CÁMARA'
                  )}
                </span>
              </div>
              <span
                ref={egressPressureTextRef}
                className="shrink-0 font-mono text-[11px] font-semibold text-amber-200"
              >
                101.3 kPa
              </span>
            </div>

            <div className="h-1 w-full overflow-hidden rounded-full bg-white/12">
              <div
                ref={egressProgressBarRef}
                style={{ width: '0%' }}
                className="h-full bg-gradient-to-r from-amber-400 via-cyan-300 to-emerald-300"
              />
            </div>

            <div className="flex items-center justify-between font-mono text-[9.5px] text-white/60">
              <span>
                {t('SUIT ΔP 29.6 kPa · SEAL LOCKED', 'TRAJE ΔP 29.6 kPa · SELLO OK')}
              </span>
              {onSkipEgress && (
                <button
                  type="button"
                  onClick={onSkipEgress}
                  className="pointer-events-auto rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[9.5px] font-medium text-white/85 transition hover:border-cyan-300/50 hover:bg-cyan-400/20 hover:text-white"
                >
                  {t('Skip [Space]', 'Saltar [Space]')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 1.5 PASSIVE IMU ARTIFICIAL HORIZON (STABILIZED COLLIMATED RETICLE < 1 ms GPU TRANSFORM) */}
      {!evaEgressActive && (
        <div
          ref={horizonBarRef}
          className="pointer-events-none absolute left-1/2 top-1/2 z-[5] flex items-center gap-7 opacity-45 will-change-transform"
          style={{ transform: 'translate3d(-50%, -50%, 0)' }}
        >
          <div className="flex items-center">
            <div className="h-[1px] w-7 bg-cyan-200/75" />
            <div className="h-2 w-[1px] bg-cyan-200/75" />
          </div>
          <div className="h-1 w-1 rounded-full bg-cyan-200/70" />
          <div className="flex items-center">
            <div className="h-2 w-[1px] bg-cyan-200/75" />
            <div className="h-[1px] w-7 bg-cyan-200/75" />
          </div>
        </div>
      )}

      {/* 2. NO MAN'S SKY STYLE DIEGETIC 3D WORLD MARKERS (MINIMAL, ZERO VISUAL CLUTTER) */}
      <div
        ref={markersOverlayRef}
        style={{ opacity: evaEgressActive ? 0 : 1 }}
        className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
      >
        {worldMarkers.map((m) => {
          const ringColor =
            m.kind === 'shelter' || m.kind === 'cache'
              ? 'border-amber-300/80 text-amber-200'
              : m.kind === 'base'
                ? 'border-emerald-300/80 text-emerald-200'
                : m.kind === 'rover'
                  ? 'border-sky-300/75 text-sky-200'
                  : m.kind === 'repeater'
                    ? 'border-violet-300/85 text-violet-200'
                    : 'border-cyan-300/85 text-cyan-100';

          return (
            <div
              key={m.id}
              className=" absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center transition-all duration-75"
              style={{ left: `${m.x}px`, top: `${m.y}px` }}
            >
              {/* No Man's Sky Diamond Icon */}
              <div
                className={`flex h-5 w-5 rotate-45 items-center justify-center border bg-slate-950/45 backdrop-blur-md ${ringColor} ${
                  m.isTarget
                    ? sosActive
                      ? 'scale-125 border-[#ff2a4b] shadow-[0_0_22px_rgba(255,20,72,0.85)]'
                      : 'scale-110 border-cyan-300 shadow-[0_0_18px_rgba(56,232,255,0.55)]'
                    : 'opacity-80 shadow-[0_0_12px_rgba(56,232,255,0.28)]'
                }`}
              >
                <div
                  className={`h-1.5 w-1.5 ${
                    m.isTarget
                      ? sosActive
                        ? 'bg-[#ff2a4b] animate-ping'
                        : 'bg-cyan-300 animate-ping'
                      : m.kind === 'shelter' || m.kind === 'cache'
                        ? 'bg-amber-300'
                        : m.kind === 'base'
                          ? 'bg-emerald-300'
                          : m.kind === 'repeater'
                            ? 'bg-violet-300'
                            : 'bg-sky-300'
                  }`}
                />
              </div>

              {/* Minimal AR Label + Distance */}
              <div
                className={`mt-1.5 flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-sans text-[10px] font-medium tracking-wide text-white/95 backdrop-blur-md ${
                  m.isTarget && sosActive
                    ? 'border-[#ff2a4b]/75 bg-rose-950/75 shadow-[0_0_14px_rgba(255,20,72,0.45)]'
                    : 'border-white/10 bg-slate-950/40'
                }`}
              >
                <span>{m.label}</span>
                <span
                  className={`font-mono text-[9px] ${
                    m.isTarget && sosActive ? 'font-bold text-amber-300' : 'text-cyan-300/90'
                  }`}
                >
                  {m.distM} m
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
