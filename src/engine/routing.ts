import { MISSION_CONFIG } from '../config/missionConfig';
import type {
  ArcadiaMacroGrid,
  GridNode,
  PoiStation,
  RouteElevationSample,
  RouteMetrics,
  RoutePoint,
} from '../types/mission';
import { computeO2BurnMultiplier, computePandolfSanteeMarsWatts } from './bioenergetics';
import { computeInstantDoseRateMicroSvH } from './radiation';

export interface RouteDeltaConstraint {
  x: number;
  y: number;
  radiusM: number;
  costMultiplier: number; // e.g. 4.5 for localized fracture/dust vortex, 0.7 for repeater boost
}

export interface RouteOptions {
  speActive: boolean;
  sosEmergency: boolean;
  astronautMassKg: number;
  sampleMassKg: number;
  fatigueFactor?: number;
  speedMs?: number;
  stiffnessKThetaNmRad?: number;
  suitDeltaPKpa?: number;
  targetId?: string;
  targetLabel?: string;
  dynamicDeltas?: RouteDeltaConstraint[];
}

class MinHeap {
  private data: Array<{ idx: number; f: number }> = [];

  get size() {
    return this.data.length;
  }

  push(item: { idx: number; f: number }) {
    this.data.push(item);
    let i = this.data.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.data[p].f <= this.data[i].f) break;
      [this.data[p], this.data[i]] = [this.data[i], this.data[p]];
      i = p;
    }
  }

  pop(): { idx: number; f: number } | undefined {
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0 && last) {
      this.data[0] = last;
      let i = 0;
      const n = this.data.length;
      while (true) {
        let smallest = i;
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        if (l < n && this.data[l].f < this.data[smallest].f) smallest = l;
        if (r < n && this.data[r].f < this.data[smallest].f) smallest = r;
        if (smallest === i) break;
        [this.data[i], this.data[smallest]] = [this.data[smallest], this.data[i]];
        i = smallest;
      }
    }
    return top;
  }
}

export function findNearestNode(grid: ArcadiaMacroGrid, x: number, y: number): GridNode {
  const half = grid.quadrantSizeMeters / 2;
  const col = Math.max(0, Math.min(grid.size - 1, Math.floor((x + half) / grid.cellSizeMeters)));
  const row = Math.max(0, Math.min(grid.size - 1, Math.floor((y + half) / grid.cellSizeMeters)));
  return grid.nodes[row * grid.size + col];
}

function edgeTransitionCost(
  u: GridNode,
  v: GridNode,
  distM: number,
  options: RouteOptions
): { cost: number; usedCosparOverride: boolean } {
  const dh = v.elevationM - u.elevationM;
  const slopeDeg = (Math.atan2(dh, distM) * 180) / Math.PI;
  const absSlope = Math.abs(slopeDeg);

  // Bloqueo de pendientes superiores al umbral de estabilidad del traje (> 15°-20°)
  if (absSlope > MISSION_CONFIG.thresholds.maxSafeSlopeDeg || v.slopeDeg > MISSION_CONFIG.thresholds.hardBlockSlopeDeg) {
    return { cost: Infinity, usedCosparOverride: false };
  }

  // Barrera de Protección Planetaria COSPAR: Infinito nominal, degradado a penalización alta solo bajo SOS vital
  let pCospar = 0;
  let usedCosparOverride = false;
  if (v.cosparRestricted) {
    if (!options.sosEmergency) {
      return { cost: Infinity, usedCosparOverride: false };
    }
    pCospar = 650;
    usedCosparOverride = true;
  }

  // Término de pendiente direccional asimétrica S_hat [0..1]
  const sHat =
    slopeDeg >= 0
      ? Math.min(1, slopeDeg / 15)
      : Math.min(1, Math.abs(slopeDeg) / 18) * 0.65; // ascenso cuesta más que descenso moderado

  // Término de rugosidad e inercia térmica B_hat [0..1]
  const bHat = Math.min(1, 0.55 * v.roughnessNorm + 0.45 * (1 - v.thermalInertiaNorm));

  // Término radiológico R_hat [0..1]: en SPE penaliza fuertemente el cielo abierto (SVF alto) para forzar corredores protegidos
  const rDose = computeInstantDoseRateMicroSvH(v.elevationM, v.svf, options.speActive);
  const svfExposurePenalty = Math.pow(Math.max(0, (v.svf - 0.42) / 0.58), 2.2);
  const rHat = options.speActive
    ? Math.min(1.5, (rDose / 580) * 0.55 + svfExposurePenalty * 0.95)
    : Math.min(1, rDose / 45);

  // Conectividad RF-LOS P_hat_RF [0..1]
  const rfHat = v.rfBaseDbm < -82 ? Math.min(1, (-82 - v.rfBaseDbm) / 28) : 0;

  // Gasto metabólico M_hat [0..1] vía Pandolf-Santee 0.38g
  const watts = computePandolfSanteeMarsWatts({
    astronautMassKg: options.astronautMassKg,
    sampleMassKg: options.sampleMassKg,
    speedMs: options.speedMs ?? 1.05,
    slopeDeg,
    thermalInertiaNorm: v.thermalInertiaNorm,
    fatigueFactor: options.fatigueFactor ?? 1.0,
    stiffnessKThetaNmRad: options.stiffnessKThetaNmRad,
    suitDeltaPKpa: options.suitDeltaPKpa,
  });
  const mHat = Math.min(1, Math.max(0, (watts - 180) / 520));

  // Pesos adaptativos por estado de falla o evento solar
  const wS = options.sosEmergency && !options.speActive ? 1.85 : 0.95;
  const wB = 0.75;
  const wR = options.speActive ? 11.5 : 0.35; // escala ~1 orden de magnitud en SPE
  const wRf = options.sosEmergency ? 0.25 : 0.45;
  const wM = options.sosEmergency && !options.speActive ? 1.95 : 0.85;

  let deltaFactor = 1.0;
  if (options.dynamicDeltas && options.dynamicDeltas.length > 0) {
    for (const d of options.dynamicDeltas) {
      if (Math.hypot(v.x - d.x, v.y - d.y) <= d.radiusM) {
        deltaFactor *= Math.max(0.5, d.costMultiplier);
      }
    }
  }

  const cost = distM * (1 + wS * sHat + wB * bHat + wR * rHat + wRf * rfHat + wM * mHat) * deltaFactor + pCospar;
  return { cost, usedCosparOverride };
}

/**
 * Motor A* Direccional Jerárquico sobre la grilla macro 50x50 (2.500 nodos, < 12 ms).
 */
export function findDirectionalRoute(
  grid: ArcadiaMacroGrid,
  startXY: { x: number; y: number },
  goalXY: { x: number; y: number },
  options: RouteOptions
): RouteMetrics {
  const t0 = performance.now();
  const start = findNearestNode(grid, startXY.x, startXY.y);
  const rawGoal = findNearestNode(grid, goalXY.x, goalXY.y);

  // COSPAR Category IVb Standoff Protocol: when targeting a science POI whose center lies
  // inside a shallow-ice exclusion zone under nominal mode, halt safely at the closest
  // passable non-COSPAR rim observation node instead of traversing restricted ground.
  let goal = rawGoal;
  let cosparStandoffActive = false;
  if (rawGoal.cosparRestricted && !options.sosEmergency && !start.cosparRestricted) {
    const rimCandidates = grid.nodes
      .filter(
        (cand) =>
          !cand.cosparRestricted &&
          cand.slopeDeg <= MISSION_CONFIG.thresholds.hardBlockSlopeDeg &&
          Math.hypot(cand.x - rawGoal.x, cand.y - rawGoal.y) <= 420
      )
      .sort((a, b) => {
        const scoreA =
          Math.hypot(a.x - rawGoal.x, a.y - rawGoal.y) +
          0.12 * Math.hypot(a.x - start.x, a.y - start.y);
        const scoreB =
          Math.hypot(b.x - rawGoal.x, b.y - rawGoal.y) +
          0.12 * Math.hypot(b.x - start.x, b.y - start.y);
        return scoreA - scoreB;
      });
    if (rimCandidates.length > 0) {
      goal = rimCandidates[0];
      cosparStandoffActive = true;
    }
  }

  const n = grid.nodes.length;

  const gScore = new Float64Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  const cosparUsed = new Uint8Array(n);
  const closed = new Uint8Array(n);

  gScore[start.index] = 0;
  const open = new MinHeap();
  open.push({ idx: start.index, f: Math.hypot(goal.x - start.x, goal.y - start.y) });

  const neighbors = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];

  let found = false;
  while (open.size > 0) {
    const curr = open.pop()!;
    if (closed[curr.idx]) continue;
    if (curr.idx === goal.index) {
      found = true;
      break;
    }
    closed[curr.idx] = 1;
    const u = grid.nodes[curr.idx];

    for (const [dr, dc] of neighbors) {
      const nr = u.row + dr;
      const nc = u.col + dc;
      if (nr < 0 || nr >= grid.size || nc < 0 || nc >= grid.size) continue;
      const vIdx = nr * grid.size + nc;
      if (closed[vIdx]) continue;
      const v = grid.nodes[vIdx];
      const stepDist = Math.hypot(v.x - u.x, v.y - u.y);

      const { cost, usedCosparOverride } = edgeTransitionCost(u, v, stepDist, options);
      if (!Number.isFinite(cost)) continue;

      const tentativeG = gScore[u.index] + cost;
      if (tentativeG < gScore[vIdx]) {
        gScore[vIdx] = tentativeG;
        parent[vIdx] = u.index;
        cosparUsed[vIdx] = usedCosparOverride ? 1 : 0;
        const h = Math.hypot(goal.x - v.x, goal.y - v.y);
        open.push({ idx: vIdx, f: tentativeG + h });
      }
    }
  }

  const points: RoutePoint[] = [];
  let usedCosparOverride = false;
  const speedMs = options.speedMs ?? 1.05;
  const directPoints = sampleDirectGeodesic(grid, start, goal);
  const directMetrics = evaluateRouteMetrics(grid, directPoints, speedMs, options);

  if (!found) {
    const convergenceMs = Number((performance.now() - t0).toFixed(2));
    return {
      points: [],
      distanceMeters: 0,
      estimatedTimeMin: 0,
      metabolicCostWattsAvg: Math.round(directMetrics.metabolicCostWattsAvg),
      o2RequiredMin: 999.9,
      radiationDoseMicroSv: Number(directMetrics.radiationDoseMicroSv.toFixed(2)),
      directGeodesicDoseMicroSv: Number(directMetrics.radiationDoseMicroSv.toFixed(2)),
      radiationReductionPct: 0,
      directMetabolicWattsAvg: Math.round(directMetrics.metabolicCostWattsAvg),
      metabolicSavingPct: 0,
      convergenceMs,
      usedCosparOverride: false,
      blocked: true,
      routeStatus: 'blocked',
      rfDropZonesCount: directMetrics.rfDropZonesCount,
      repeaterDeployPoints: [],
      targetId: options.targetId ?? 'TARGET',
      targetLabel: options.targetLabel ?? 'Objetivo',
    };
  }

  let cur = goal.index;
  while (cur !== -1) {
    const node = grid.nodes[cur];
    if (cosparUsed[cur]) usedCosparOverride = true;
    points.push({ x: node.x, y: node.y, elevationM: node.elevationM, row: node.row, col: node.col });
    cur = parent[cur];
  }
  points.reverse();

  // Anclar el inicio y el fin de la ruta exactamente a la posición continua real (startXY / goalXY)
  // evitando que el nodo de grilla más cercano haga retroceder la guía visual 3D.
  if (points.length >= 2 && (Math.abs(startXY.x - points[0].x) > 0.5 || Math.abs(startXY.y - points[0].y) > 0.5)) {
    const v0x = points[0].x - startXY.x;
    const v0y = points[0].y - startXY.y;
    const v1x = points[1].x - startXY.x;
    const v1y = points[1].y - startXY.y;
    const dotForward = v0x * v1x + v0y * v1y;
    const startPoint: RoutePoint = {
      x: startXY.x,
      y: startXY.y,
      elevationM: start.elevationM,
      row: start.row,
      col: start.col,
    };
    if (dotForward <= 0 || Math.hypot(v0x, v0y) < 35) {
      points[0] = startPoint;
    } else {
      points.unshift(startPoint);
    }
  }
  if (
    !cosparStandoffActive &&
    points.length >= 2 &&
    (Math.abs(goalXY.x - points[points.length - 1].x) > 0.5 ||
      Math.abs(goalXY.y - points[points.length - 1].y) > 0.5)
  ) {
    points[points.length - 1] = {
      x: goalXY.x,
      y: goalXY.y,
      elevationM: goal.elevationM,
      row: goal.row,
      col: goal.col,
    };
  }

  const metrics = evaluateRouteMetrics(grid, points, speedMs, options);

  const radiationReductionPct =
    directMetrics.radiationDoseMicroSv > 0
      ? Number(
          Math.max(
            0,
            ((directMetrics.radiationDoseMicroSv - metrics.radiationDoseMicroSv) / directMetrics.radiationDoseMicroSv) *
              100
          ).toFixed(1)
        )
      : 0;

  const metabolicSavingPct =
    directMetrics.totalEnergyWh > 0
      ? Number(
          Math.max(
            0,
            ((directMetrics.totalEnergyWh - metrics.totalEnergyWh) / directMetrics.totalEnergyWh) * 100
          ).toFixed(1)
        )
      : 0;

  const convergenceMs = Number((performance.now() - t0).toFixed(2));

  return {
    points,
    distanceMeters: Number(metrics.distanceMeters.toFixed(1)),
    estimatedTimeMin: Number(metrics.estimatedTimeMin.toFixed(1)),
    metabolicCostWattsAvg: Math.round(metrics.metabolicCostWattsAvg),
    o2RequiredMin: Number(metrics.o2RequiredMin.toFixed(1)),
    radiationDoseMicroSv: Number(metrics.radiationDoseMicroSv.toFixed(2)),
    directGeodesicDoseMicroSv: Number(directMetrics.radiationDoseMicroSv.toFixed(2)),
    radiationReductionPct,
    directMetabolicWattsAvg: Math.round(directMetrics.metabolicCostWattsAvg),
    metabolicSavingPct,
    convergenceMs,
    usedCosparOverride,
    blocked: false,
    routeStatus: usedCosparOverride ? 'cospar_override' : 'optimal',
    rfDropZonesCount: metrics.rfDropZonesCount,
    repeaterDeployPoints: metrics.repeaterDeployPoints,
    targetId: options.targetId ?? 'TARGET',
    targetLabel: options.targetLabel ?? 'Objetivo',
    profile: metrics.profile,
  };
}

/**
 * Replanificación incremental tipo D* Lite sobre la ruta vigente:
 * Reutiliza el sufijo libre de perturbaciones cuando los deltas locales están fuera de la ventana próxima,
 * y repara localmente (sub-grilla acotada o bypass incremental) cuando aparece un obstáculo dinámico.
 */
export function replanRouteIncrementalDStarLite(
  grid: ArcadiaMacroGrid,
  previousRoute: RouteMetrics | null,
  currentXY: { x: number; y: number },
  goalXY: { x: number; y: number },
  options: RouteOptions,
  dynamicDeltas: RouteDeltaConstraint[] = []
): RouteMetrics {
  const t0 = performance.now();
  const mergedOptions: RouteOptions = { ...options, dynamicDeltas };

  if (previousRoute && !previousRoute.blocked && previousRoute.points.length >= 3) {
    let closestIdx = 0;
    let closestDist = Infinity;
    for (let i = 0; i < previousRoute.points.length; i++) {
      const d = Math.hypot(previousRoute.points[i].x - currentXY.x, previousRoute.points[i].y - currentXY.y);
      if (d < closestDist) {
        closestDist = d;
        closestIdx = i;
      }
    }
    const remainingPts = previousRoute.points.slice(closestIdx);
    const tailPt = remainingPts[remainingPts.length - 1];
    const goalStillMatches = Math.hypot(tailPt.x - goalXY.x, tailPt.y - goalXY.y) <= 140;
    const hitByDelta = remainingPts.some((pt) =>
      dynamicDeltas.some((d) => d.costMultiplier > 1.05 && Math.hypot(pt.x - d.x, pt.y - d.y) <= d.radiusM)
    );

    if (goalStillMatches && !hitByDelta && closestDist <= 180) {
      const startNode = findNearestNode(grid, currentXY.x, currentXY.y);
      const splicedPoints: RoutePoint[] = [
        { x: currentXY.x, y: currentXY.y, elevationM: startNode.elevationM, row: startNode.row, col: startNode.col },
        ...remainingPts.slice(1),
      ];
      const speedMs = options.speedMs ?? 1.2;
      const splicedMetrics = evaluateRouteMetrics(grid, splicedPoints, speedMs, mergedOptions);
      const directMetrics = evaluateRouteMetrics(
        grid,
        sampleDirectGeodesic(grid, startNode, findNearestNode(grid, goalXY.x, goalXY.y)),
        speedMs,
        mergedOptions
      );
      const radRed =
        directMetrics.radiationDoseMicroSv > 0
          ? Number(
              Math.max(
                0,
                ((directMetrics.radiationDoseMicroSv - splicedMetrics.radiationDoseMicroSv) /
                  directMetrics.radiationDoseMicroSv) *
                  100
              ).toFixed(1)
            )
          : 0;
      const metSav =
        directMetrics.totalEnergyWh > 0
          ? Number(
              Math.max(
                0,
                ((directMetrics.totalEnergyWh - splicedMetrics.totalEnergyWh) / directMetrics.totalEnergyWh) * 100
              ).toFixed(1)
            )
          : 0;
      const replanMs = Number((performance.now() - t0).toFixed(2));
      return {
        ...previousRoute,
        points: splicedPoints,
        distanceMeters: Number(splicedMetrics.distanceMeters.toFixed(1)),
        estimatedTimeMin: Number(splicedMetrics.estimatedTimeMin.toFixed(1)),
        metabolicCostWattsAvg: Math.round(splicedMetrics.metabolicCostWattsAvg),
        o2RequiredMin: Number(splicedMetrics.o2RequiredMin.toFixed(1)),
        radiationDoseMicroSv: Number(splicedMetrics.radiationDoseMicroSv.toFixed(2)),
        directGeodesicDoseMicroSv: Number(directMetrics.radiationDoseMicroSv.toFixed(2)),
        radiationReductionPct: radRed,
        directMetabolicWattsAvg: Math.round(directMetrics.metabolicCostWattsAvg),
        metabolicSavingPct: metSav,
        rfDropZonesCount: splicedMetrics.rfDropZonesCount,
        repeaterDeployPoints: splicedMetrics.repeaterDeployPoints,
        profile: splicedMetrics.profile,
        dStarDeltaNodes: splicedPoints.length,
        dStarReplanMs: replanMs,
      };
    }
  }

  const repaired = findDirectionalRoute(grid, currentXY, goalXY, mergedOptions);
  return {
    ...repaired,
    dStarDeltaNodes: repaired.points.length,
    dStarReplanMs: Number((performance.now() - t0).toFixed(2)),
  };
}

/**
 * Evaluates shortest perpendicular distance and remaining forward distance along a
 * pre-computed static `RoutePoint[]` corridor without shifting or splicing waypoints.
 */
export function evaluateStaticRouteProgress(
  points: RoutePoint[],
  currentXY: { x: number; y: number }
): { minDistToRouteM: number; remainingDistM: number; totalDistM: number } {
  if (points.length === 0) {
    return { minDistToRouteM: Infinity, remainingDistM: 0, totalDistM: 0 };
  }
  if (points.length === 1) {
    const d = Math.hypot(points[0].x - currentXY.x, points[0].y - currentXY.y);
    return { minDistToRouteM: d, remainingDistM: d, totalDistM: 0 };
  }

  let totalDistM = 0;
  let minDistToRouteM = Infinity;
  let closestAccumDistM = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const segLenSq = vx * vx + vy * vy;
    const segLen = Math.sqrt(segLenSq);
    const t =
      segLenSq > 1e-6
        ? Math.max(0, Math.min(1, ((currentXY.x - a.x) * vx + (currentXY.y - a.y) * vy) / segLenSq))
        : 0;
    const px = a.x + vx * t;
    const py = a.y + vy * t;
    const dist = Math.hypot(currentXY.x - px, currentXY.y - py);
    if (dist < minDistToRouteM) {
      minDistToRouteM = dist;
      closestAccumDistM = totalDistM + segLen * t;
    }
    totalDistM += segLen;
  }

  return {
    minDistToRouteM,
    remainingDistM: Math.max(0, totalDistM - closestAccumDistM),
    totalDistM,
  };
}

function sampleDirectGeodesic(grid: ArcadiaMacroGrid, start: GridNode, goal: GridNode): RoutePoint[] {
  const totalDist = Math.hypot(goal.x - start.x, goal.y - start.y);
  const steps = Math.max(2, Math.ceil(totalDist / grid.cellSizeMeters));
  const pts: RoutePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = start.x + (goal.x - start.x) * t;
    const y = start.y + (goal.y - start.y) * t;
    const node = findNearestNode(grid, x, y);
    if (pts.length === 0 || pts[pts.length - 1].row !== node.row || pts[pts.length - 1].col !== node.col) {
      pts.push({ x: node.x, y: node.y, elevationM: node.elevationM, row: node.row, col: node.col });
    }
  }
  return pts;
}

function evaluateRouteMetrics(
  grid: ArcadiaMacroGrid,
  points: RoutePoint[],
  speedMs: number,
  options: RouteOptions
) {
  let distanceMeters = 0;
  let totalSec = 0;
  let totalDoseMicroSv = 0;
  let weightedWattsSum = 0;
  let totalEnergyWh = 0;
  let rfDropZonesCount = 0;
  const repeaterDeployPoints: RoutePoint[] = [];
  const profile: RouteElevationSample[] = [];

  for (let i = 0; i < points.length; i++) {
    const currPt = points[i];
    const currNode = grid.nodes[currPt.row * grid.size + currPt.col];
    if (currNode.rfBaseDbm < -84) {
      rfDropZonesCount++;
      if (i > 0 && repeaterDeployPoints.length < 3) {
        const prevPt = points[i - 1];
        const prevNode = grid.nodes[prevPt.row * grid.size + prevPt.col];
        if (prevNode.rfBaseDbm >= -84) {
          repeaterDeployPoints.push(prevPt);
        }
      }
    }

    if (i === 0) {
      profile.push({
        distM: 0,
        elevationM: Number(currPt.elevationM.toFixed(2)),
        slopeDeg: Number(currNode.slopeDeg.toFixed(1)),
        svf: currNode.svf,
        gcrRateMicroSvH: Number(
          computeInstantDoseRateMicroSvH(currPt.elevationM, currNode.svf, options.speActive).toFixed(1)
        ),
        unit: currNode.unit,
        x: currPt.x,
        y: currPt.y,
      });
      continue;
    }
    const prevPt = points[i - 1];
    const segDist = Math.hypot(currPt.x - prevPt.x, currPt.y - prevPt.y);
    const dh = currPt.elevationM - prevPt.elevationM;
    const slopeDeg = (Math.atan2(dh, Math.max(1, segDist)) * 180) / Math.PI;

    // La velocidad efectiva cae en pendientes pronunciadas o polvo suelto
    const speedFactor = Math.max(0.45, 1 - Math.max(0, slopeDeg) / 28 - (1 - currNode.thermalInertiaNorm) * 0.25);
    const segSpeed = speedMs * speedFactor;
    const segSec = segDist / Math.max(0.35, segSpeed);

    const watts = computePandolfSanteeMarsWatts({
      astronautMassKg: options.astronautMassKg,
      sampleMassKg: options.sampleMassKg,
      speedMs: segSpeed,
      slopeDeg,
      thermalInertiaNorm: currNode.thermalInertiaNorm,
      fatigueFactor: options.fatigueFactor ?? 1.0,
      stiffnessKThetaNmRad: options.stiffnessKThetaNmRad,
      suitDeltaPKpa: options.suitDeltaPKpa,
    });

    const doseRate = computeInstantDoseRateMicroSvH(currNode.elevationM, currNode.svf, options.speActive);

    distanceMeters += segDist;
    totalSec += segSec;
    totalDoseMicroSv += doseRate * (segSec / 3600);
    weightedWattsSum += watts * segSec;
    totalEnergyWh += watts * (segSec / 3600);

    profile.push({
      distM: Number(distanceMeters.toFixed(1)),
      elevationM: Number(currPt.elevationM.toFixed(2)),
      slopeDeg: Number(Math.abs(slopeDeg).toFixed(1)),
      svf: currNode.svf,
      gcrRateMicroSvH: Number(doseRate.toFixed(1)),
      unit: currNode.unit,
      x: currPt.x,
      y: currPt.y,
    });
  }

  const estimatedTimeMin = totalSec / 60;
  const metabolicCostWattsAvg = totalSec > 0 ? weightedWattsSum / totalSec : 240;
  const o2RequiredMin = estimatedTimeMin * Math.max(0.7, computeO2BurnMultiplier(metabolicCostWattsAvg));

  return {
    distanceMeters,
    estimatedTimeMin,
    metabolicCostWattsAvg,
    o2RequiredMin,
    radiationDoseMicroSv: totalDoseMicroSv,
    totalEnergyWh,
    rfDropZonesCount,
    repeaterDeployPoints,
    profile,
  };
}

export interface MultiPoiCircuitLeg {
  fromId: string;
  toId: string;
  toName: string;
  route: RouteMetrics;
  cumulativeSampleKgAfterLeg: number;
}

export interface MultiPoiCircuitPlan {
  orderedPoiIds: string[];
  fullSequenceIds: string[];
  legs: MultiPoiCircuitLeg[];
  combinedPoints: RoutePoint[];
  totalDistanceMeters: number;
  totalEstimatedTimeMin: number;
  totalO2RequiredMin: number;
  totalRadiationDoseMicroSv: number;
  totalSampleMassKg: number;
  solverComputeMs: number;
  withinSafetyBudgets: boolean;
}

/**
 * Planificador Combinatorio Multi-Parada (Capacitated Orienteering / TSP Asimétrico sobre A*):
 * Determina la secuencia óptima cerrada (POI-01 -> POI_a -> POI_b -> ... -> POI-01) que maximiza
 * los objetivos científicos visitados y muestras recolectadas respetando estrictamente:
 * - Presupuesto operativo de O2 (por defecto 168 min = 70% de 240 min, preservando 30% de reserva),
 * - Presupuesto radiológico ALARA (350 o 250 uSv),
 * - Capacidad máxima de carga geológica (7.00 kg), recalculando el costo metabólico de cada tramo
 *   según la masa acumulada de muestras transportada en ese segmento.
 */
export function computeOptimalMultiPoiCircuit(
  grid: ArcadiaMacroGrid,
  basePoi: PoiStation,
  candidatePois: PoiStation[],
  options: RouteOptions,
  budgets?: {
    maxO2BudgetMin?: number;
    alaraBudgetMicroSv?: number;
    maxSampleMassKg?: number;
  }
): MultiPoiCircuitPlan {
  const t0 = performance.now();
  const maxO2Min =
    budgets?.maxO2BudgetMin ??
    MISSION_CONFIG.suit.o2TotalCapacityMinutesBase * (1 - MISSION_CONFIG.thresholds.returnMarginAmberRatio);
  const maxAlaraMicroSv = budgets?.alaraBudgetMicroSv ?? MISSION_CONFIG.radiation.defaultAlaraBudgetMicroSv;
  const maxSampleKg = budgets?.maxSampleMassKg ?? MISSION_CONFIG.suit.maxSampleMassKg;
  const speedMs = options.speedMs ?? 1.2 * 1.5;

  // Filtrar estaciones científicas válidas (excluyendo base) y limitar a las 6 más cercanas para tiempo real (<15 ms)
  const validCandidates = candidatePois
    .filter((p) => p.id !== basePoi.id && p.kind !== 'base' && p.kind !== 'shelter')
    .slice(0, 6);

  const allStations: PoiStation[] = [basePoi, ...validCandidates];
  const m = allStations.length;

  // Precalcular las trayectorias geométricas A* entre cada par (i, j)
  const basePairRoutes: Array<Array<RouteMetrics | null>> = Array.from({ length: m }, () =>
    Array.from({ length: m }, () => null)
  );

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) {
      if (i === j) continue;
      const r = findDirectionalRoute(
        grid,
        { x: allStations[i].x, y: allStations[i].y },
        { x: allStations[j].x, y: allStations[j].y },
        {
          ...options,
          sampleMassKg: options.sampleMassKg,
          speedMs,
          targetId: allStations[j].id,
          targetLabel: allStations[j].name,
        }
      );
      basePairRoutes[i][j] = r.blocked ? null : r;
    }
  }

  // Re-evalúa las métricas exactas de un tramo A* con el peso de muestras acumulado en ese instante
  const evaluateLegWithLoad = (i: number, j: number, carriedSampleKg: number): RouteMetrics | null => {
    const template = basePairRoutes[i][j];
    if (!template || template.blocked || template.points.length === 0) return null;
    const dyn = evaluateRouteMetrics(grid, template.points, speedMs, {
      ...options,
      sampleMassKg: carriedSampleKg,
      speedMs,
    });
    return {
      ...template,
      distanceMeters: Math.round(dyn.distanceMeters),
      estimatedTimeMin: Number(dyn.estimatedTimeMin.toFixed(1)),
      metabolicCostWattsAvg: Math.round(dyn.metabolicCostWattsAvg),
      o2RequiredMin: Number(dyn.o2RequiredMin.toFixed(1)),
      radiationDoseMicroSv: Number(dyn.radiationDoseMicroSv.toFixed(2)),
    };
  };

  let bestOrder: number[] = [];
  let bestLegs: MultiPoiCircuitLeg[] = [];
  let bestScore = -Infinity;
  let bestO2 = 0;
  let bestDose = 0;
  let bestDist = 0;
  let bestTime = 0;
  let bestSampleKg = 0;

  const visited = new Uint8Array(m);

  const dfs = (
    currIdx: number,
    order: number[],
    legsSoFar: MultiPoiCircuitLeg[],
    accO2: number,
    accDose: number,
    accDist: number,
    accTime: number,
    accSampleKg: number
  ) => {
    // Intentar cerrar el circuito regresando a Base (índice 0)
    if (order.length > 0) {
      const returnLeg = evaluateLegWithLoad(currIdx, 0, accSampleKg);
      if (returnLeg) {
        const totalO2 = accO2 + returnLeg.o2RequiredMin;
        const totalDose = accDose + returnLeg.radiationDoseMicroSv;
        if (totalO2 <= maxO2Min && totalDose <= maxAlaraMicroSv) {
          // Priorizar mayor número de POIs visitados, mayor masa de muestras y menor costo O2/radiación
          const score =
            order.length * 10000 +
            accSampleKg * 500 -
            totalO2 * 4.0 -
            totalDose * 0.8;
          if (score > bestScore) {
            bestScore = score;
            bestOrder = [...order];
            bestLegs = [
              ...legsSoFar,
              {
                fromId: allStations[currIdx].id,
                toId: basePoi.id,
                toName: basePoi.name,
                route: returnLeg,
                cumulativeSampleKgAfterLeg: accSampleKg,
              },
            ];
            bestO2 = totalO2;
            bestDose = totalDose;
            bestDist = accDist + returnLeg.distanceMeters;
            bestTime = accTime + returnLeg.estimatedTimeMin;
            bestSampleKg = accSampleKg;
          }
        }
      }
    }

    for (let nextIdx = 1; nextIdx < m; nextIdx++) {
      if (visited[nextIdx]) continue;
      const station = allStations[nextIdx];
      const rewardKg = station.sampleRewardKg ?? 1.6;
      const nextSampleKg = Math.min(maxSampleKg, Number((accSampleKg + rewardKg).toFixed(2)));
      const leg = evaluateLegWithLoad(currIdx, nextIdx, accSampleKg);
      if (!leg) continue;

      const nextO2 = accO2 + leg.o2RequiredMin;
      const nextDose = accDose + leg.radiationDoseMicroSv;
      if (nextO2 > maxO2Min || nextDose > maxAlaraMicroSv) continue;

      visited[nextIdx] = 1;
      order.push(nextIdx);
      legsSoFar.push({
        fromId: allStations[currIdx].id,
        toId: station.id,
        toName: station.name,
        route: leg,
        cumulativeSampleKgAfterLeg: nextSampleKg,
      });

      dfs(nextIdx, order, legsSoFar, nextO2, nextDose, accDist + leg.distanceMeters, accTime + leg.estimatedTimeMin, nextSampleKg);

      legsSoFar.pop();
      order.pop();
      visited[nextIdx] = 0;
    }
  };

  dfs(0, [], [], 0, 0, 0, 0, options.sampleMassKg);

  // Concatenar puntos sin duplicar vértices de empalme
  const combinedPoints: RoutePoint[] = [];
  for (const leg of bestLegs) {
    for (let k = 0; k < leg.route.points.length; k++) {
      if (combinedPoints.length > 0 && k === 0) continue;
      combinedPoints.push(leg.route.points[k]);
    }
  }

  const orderedPoiIds = bestOrder.map((idx) => allStations[idx].id);
  const fullSequenceIds = [basePoi.id, ...orderedPoiIds, basePoi.id];

  return {
    orderedPoiIds,
    fullSequenceIds,
    legs: bestLegs,
    combinedPoints,
    totalDistanceMeters: Math.round(bestDist),
    totalEstimatedTimeMin: Number(bestTime.toFixed(1)),
    totalO2RequiredMin: Number(bestO2.toFixed(1)),
    totalRadiationDoseMicroSv: Number(bestDose.toFixed(2)),
    totalSampleMassKg: Number(bestSampleKg.toFixed(2)),
    solverComputeMs: Number((performance.now() - t0).toFixed(2)),
    withinSafetyBudgets: bestOrder.length > 0 && bestO2 <= maxO2Min && bestDose <= maxAlaraMicroSv,
  };
}
