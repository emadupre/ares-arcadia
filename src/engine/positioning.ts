import { MISSION_CONFIG } from '../config/missionConfig';
import type {
  ArcadiaMacroGrid,
  DeployableRepeater,
  GridNode,
  RoutePoint,
  RoverTelemetry,
} from '../types/mission';

export interface PositioningOptions {
  grid?: ArcadiaMacroGrid;
  repeaters?: DeployableRepeater[];
  roverCommsOffline?: boolean;
  baseXY?: { x: number; y: number };
}

export interface PositioningResult {
  estimatedX: number;
  estimatedY: number;
  errorMeters: number;
  mode: 'EKF_HYBRID_UWB_OPTICAL' | 'PDR_IMU_UWB_WIREFRAME';
  rfSignalDbm: number;
  rfMode: 'UWB_802_15_4z' | 'UHF_400MHz' | 'LOST_BREADCRUMB';
  rfAlert: boolean;
  uwbAnchorTriangleActive: boolean;
  activeLinkSource?: 'HAB_UHF' | 'ROVER_RELAY' | 'MICRO_REPEATER' | 'PDR_IMU_DEAD_RECKONING';
  fresnelClearanceRatio?: number;
  diffractionLossDb?: number;
  nearestRepeaterDistM?: number;
}

/**
 * Knife-edge Fresnel diffraction loss (415 MHz UHF, lambda = 0.722 m) over terrain line-of-sight.
 */
export function computeTerrainDiffractionLossDb(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  grid?: ArcadiaMacroGrid,
  antennaHeightM = 4.5
): { lossDb: number; clearanceRatio: number } {
  const dist = Math.hypot(bx - ax, by - ay);
  if (!grid || dist < 80) {
    return { lossDb: 0, clearanceRatio: 1.8 };
  }
  const lambdaM = 0.722;
  const halfExtent = grid.quadrantSizeMeters / 2;
  const cell = grid.cellSizeMeters;
  const steps = 6;
  let worstNu = -2.0;
  let minClearanceRatio = 2.0;
  const zA = az + 1.65;
  const zB = bz + antennaHeightM;

  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const sx = ax + (bx - ax) * t;
    const sy = ay + (by - ay) * t;
    const col = Math.max(0, Math.min(grid.size - 1, Math.round((sx + halfExtent - cell / 2) / cell)));
    const row = Math.max(0, Math.min(grid.size - 1, Math.round((sy + halfExtent - cell / 2) / cell)));
    const terrainZ = grid.nodes[row * grid.size + col]?.elevationM ?? zA;
    const losZ = zA + (zB - zA) * t;
    const d1 = dist * t;
    const d2 = dist * (1 - t);
    const r1 = Math.sqrt((lambdaM * d1 * d2) / Math.max(1, dist));
    const hObs = terrainZ - losZ;
    const clearanceRatio = -hObs / Math.max(0.5, r1);
    if (clearanceRatio < minClearanceRatio) minClearanceRatio = clearanceRatio;
    const nu = (hObs * Math.SQRT2) / Math.max(0.5, r1);
    if (nu > worstNu) worstNu = nu;
  }

  if (worstNu <= -0.7) {
    return { lossDb: 0, clearanceRatio: Number(Math.min(3, Math.max(-2, minClearanceRatio)).toFixed(2)) };
  }
  const term = Math.sqrt((worstNu - 0.1) ** 2 + 1) + worstNu - 0.1;
  const rawLoss = 6.9 + 20 * Math.log10(Math.max(1.0, term));
  return {
    lossDb: Number(Math.min(26, Math.max(0, rawLoss)).toFixed(1)),
    clearanceRatio: Number(Math.min(3, Math.max(-2, minClearanceRatio)).toFixed(2)),
  };
}

/**
 * Posicionamiento Autónomo Híbrido:
 * 1) Multilateración UWB (IEEE 802.15.4z) entre Base, Rover, Micro-Repetidores y PLSS
 * 2) Pérdida por difracción de Fresnel (knife-edge) + ecuación Friis UHF 415 MHz
 * 3) Fusión EKF con IMU/PDR (< 0,15 m nominal; conmuta a PDR/IMU + UWB si tau > 2,5)
 */
export function computeHybridPositioning(
  trueX: number,
  trueY: number,
  node: GridNode,
  rover: RoverTelemetry,
  dustTau: number,
  tSec: number,
  options?: PositioningOptions
): PositioningResult {
  const dustStorm = dustTau > MISSION_CONFIG.thresholds.dustOpacityCriticalTau;
  const mode: PositioningResult['mode'] = dustStorm ? 'PDR_IMU_UWB_WIREFRAME' : 'EKF_HYBRID_UWB_OPTICAL';
  const repeaters = options?.repeaters ?? [];
  const baseXY = options?.baseXY ?? { x: 0, y: 0 };
  const baseElevM = -3003.5;

  // Error EKF acotado (< 0,15 m nominal; leve deriva en PDR puro durante tormenta de polvo)
  const baseErr = dustStorm ? 0.24 : 0.085;
  const jitterX = Math.sin(tSec * 1.7 + trueX * 0.05) * baseErr * 0.65;
  const jitterY = Math.cos(tSec * 1.3 + trueY * 0.05) * baseErr * 0.65;
  const errorMeters = Number(Math.hypot(jitterX, jitterY).toFixed(3));

  const distBase = Math.hypot(trueX - baseXY.x, trueY - baseXY.y);
  const baseDiff = computeTerrainDiffractionLossDb(
    trueX,
    trueY,
    node.elevationM,
    baseXY.x,
    baseXY.y,
    baseElevM,
    options?.grid,
    6.5
  );
  const habDbm =
    distBase < 45
      ? -46
      : Math.max(-114, Math.min(node.rfBaseDbm, -48 - 20 * Math.log10(Math.max(30, distBase) / 30) - baseDiff.lossDb * 0.65));

  const roverOnline = !options?.roverCommsOffline;
  const distRover = Math.hypot(trueX - rover.x, trueY - rover.y);
  const roverDiff = roverOnline
    ? computeTerrainDiffractionLossDb(trueX, trueY, node.elevationM, rover.x, rover.y, node.elevationM + 1.5, options?.grid, 2.8)
    : { lossDb: 26, clearanceRatio: -1.5 };
  const roverRelayDbm = roverOnline
    ? -42 - 20 * Math.log10(Math.max(12, distRover) / 12) - roverDiff.lossDb * 0.6
    : -125;

  let bestRepeaterDbm = -125;
  let nearestRepeaterDistM = Infinity;
  let bestRepeaterDiff = { lossDb: 0, clearanceRatio: 1.5 };
  for (const rep of repeaters) {
    const dRep = Math.hypot(trueX - rep.x, trueY - rep.y);
    if (dRep < nearestRepeaterDistM) nearestRepeaterDistM = dRep;
    const diffRep = computeTerrainDiffractionLossDb(
      trueX,
      trueY,
      node.elevationM,
      rep.x,
      rep.y,
      rep.elevationM,
      options?.grid,
      1.8
    );
    const sigRep = -38 + (rep.relayGainDb ?? 4) - 20 * Math.log10(Math.max(8, dRep) / 8) - diffRep.lossDb * 0.55;
    if (sigRep > bestRepeaterDbm) {
      bestRepeaterDbm = sigRep;
      bestRepeaterDiff = diffRep;
    }
  }

  let bestDbm = Math.max(node.rfBaseDbm, habDbm);
  let activeLinkSource: PositioningResult['activeLinkSource'] = 'HAB_UHF';
  let chosenDiff = baseDiff;
  if (roverRelayDbm > bestDbm) {
    bestDbm = roverRelayDbm;
    activeLinkSource = 'ROVER_RELAY';
    chosenDiff = roverDiff;
  }
  if (bestRepeaterDbm > bestDbm) {
    bestDbm = bestRepeaterDbm;
    activeLinkSource = 'MICRO_REPEATER';
    chosenDiff = bestRepeaterDiff;
  }

  let rfMode: PositioningResult['rfMode'] = 'UWB_802_15_4z';
  let rfAlert = false;
  if (bestDbm < -94) {
    rfMode = 'LOST_BREADCRUMB';
    activeLinkSource = 'PDR_IMU_DEAD_RECKONING';
    rfAlert = true;
  } else if (bestDbm < -82 || (activeLinkSource === 'HAB_UHF' && node.rfBaseDbm < -88)) {
    rfMode = 'UHF_400MHz';
    rfAlert = bestDbm < -86;
  }

  return {
    estimatedX: Number((trueX + jitterX).toFixed(2)),
    estimatedY: Number((trueY + jitterY).toFixed(2)),
    errorMeters,
    mode,
    rfSignalDbm: Number(bestDbm.toFixed(1)),
    rfMode,
    rfAlert,
    uwbAnchorTriangleActive:
      bestDbm >= -92 && ((roverOnline && distRover < 420) || nearestRepeaterDistM < 240 || distBase < 420),
    activeLinkSource,
    fresnelClearanceRatio: chosenDiff.clearanceRatio,
    diffractionLossDb: chosenDiff.lossDb,
    nearestRepeaterDistM: Number.isFinite(nearestRepeaterDistM) ? Number(nearestRepeaterDistM.toFixed(1)) : undefined,
  };
}

/**
 * Mantiene el rastro inercial exacto ("Migas de Pan Digitales") cada 25 m para retroceso seguro si cae RF-LOS.
 */
export function appendBreadcrumb(
  trail: RoutePoint[],
  x: number,
  y: number,
  node: GridNode
): RoutePoint[] {
  const last = trail[trail.length - 1];
  if (!last || Math.hypot(x - last.x, y - last.y) >= 25) {
    return [...trail.slice(-180), { x, y, elevationM: node.elevationM, row: node.row, col: node.col }];
  }
  return trail;
}
