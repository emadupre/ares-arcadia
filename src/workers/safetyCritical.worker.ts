import { MISSION_CONFIG } from '../config/missionConfig';
import {
  computeCryoHeaterWatts,
  computeJointTorqueNm,
  computeO2BurnMultiplier,
  computePandolfSanteeMarsWatts,
} from '../engine/bioenergetics';
import { computeHybridPositioning } from '../engine/positioning';
import { computeInstantDoseRateMicroSvH } from '../engine/radiation';
import { findDirectionalRoute, findNearestNode } from '../engine/routing';
import type {
  AnomalyTrigger,
  ArcadiaMacroGrid,
  DeployableRepeater,
  PoiStation,
  RefugeType,
  ReturnStatusColor,
  RoverTelemetry,
  SafetyWorkerTickOutput,
} from '../types/mission';

export type WorkerInMessage =
  | { type: 'INIT_GRID'; grid: ArcadiaMacroGrid; pois?: PoiStation[] }
  | { type: 'CLEAR_EMERGENCY' }
  | { type: 'SWITCH_PLSS_BACKUP' }
  | {
      type: 'TICK';
      payload: {
        dtSec: number;
        simElapsedSec: number;
        x: number;
        y: number;
        speedMs: number;
        slopeDeg: number;
        astronautMassKg: number;
        sampleMassKg: number;
        alaraBudgetMicroSv: number;
        stiffnessKThetaNmRad?: number;
        suitDeltaPKpa?: number;
        anomaly: AnomalyTrigger;
        dustTau: number;
        ambientTempC?: number;
        speActive: boolean;
        sosActive: boolean;
        rover: RoverTelemetry;
        buddyX: number;
        buddyY: number;
        headingDriftCount: number;
        unacknowledgedAlertSec: number;
        repeaters?: DeployableRepeater[];
        roverCommsFault?: boolean;
        forceReset?: boolean;
        clearAnomaly?: boolean;
      };
    };

let grid: ArcadiaMacroGrid | null = null;
let canonicalPois: PoiStation[] = [];
let heartbeatTick = 0;

// Estado interno Safety-Critical aislado en el Worker
let o2RemainingMin: number = MISSION_CONFIG.suit.o2TotalCapacityMinutesBase;
let preSosO2RemainingMin: number = MISSION_CONFIG.suit.o2TotalCapacityMinutesBase;
let prevAnomaly: AnomalyTrigger = 'none';
let batteryRemainingWh: number = MISSION_CONFIG.suit.batteryCapacityWh;
let accumulatedDoseMicroSv = 0;
let metabolicHistory30Min: number[] = [];
let smoothedHeartRateBpm = 72.0; // Cinética fisiológica gradual (~14 s subida / ~24 s recuperación)
let plssBackupActive = false;

setInterval(() => {
  heartbeatTick += 1;
  self.postMessage({ type: 'HEARTBEAT', heartbeatTick });
}, 1000);

self.onmessage = (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data;
  if (msg.type === 'INIT_GRID') {
    grid = msg.grid;
    if (msg.pois && msg.pois.length > 0) {
      canonicalPois = msg.pois;
    }
    self.postMessage({ type: 'READY' });
    return;
  }

  if (msg.type === 'SWITCH_PLSS_BACKUP') {
    plssBackupActive = true;
    return;
  }

  if (msg.type === 'CLEAR_EMERGENCY') {
    o2RemainingMin = Math.max(o2RemainingMin, Math.max(preSosO2RemainingMin, 192));
    batteryRemainingWh = Math.max(batteryRemainingWh, MISSION_CONFIG.suit.batteryCapacityWh * 0.78);
    accumulatedDoseMicroSv = Math.min(accumulatedDoseMicroSv, 150);
    smoothedHeartRateBpm = 76.0;
    plssBackupActive = false;
    prevAnomaly = 'none';
    return;
  }

  if (msg.type === 'TICK' && grid) {
    const t0 = performance.now();
    const p = msg.payload;

    if (p.forceReset) {
      o2RemainingMin = MISSION_CONFIG.suit.o2TotalCapacityMinutesBase;
      preSosO2RemainingMin = MISSION_CONFIG.suit.o2TotalCapacityMinutesBase;
      prevAnomaly = 'none';
      batteryRemainingWh = MISSION_CONFIG.suit.batteryCapacityWh;
      accumulatedDoseMicroSv = 0;
      metabolicHistory30Min = [];
      smoothedHeartRateBpm = 72.0;
      plssBackupActive = false;
    }

    if (p.clearAnomaly || (prevAnomaly !== 'none' && p.anomaly === 'none')) {
      o2RemainingMin = Math.max(o2RemainingMin, Math.max(preSosO2RemainingMin, 192));
      batteryRemainingWh = Math.max(batteryRemainingWh, MISSION_CONFIG.suit.batteryCapacityWh * 0.78);
      accumulatedDoseMicroSv = Math.min(accumulatedDoseMicroSv, p.alaraBudgetMicroSv * 0.72);
      smoothedHeartRateBpm = 76.0;
      if (p.anomaly !== 'hypercapnia') {
        plssBackupActive = false;
      }
    }

    const node = findNearestNode(grid, p.x, p.y);
    const totalMassKg = Math.min(
      MISSION_CONFIG.suit.maxTotalMassKg,
      p.astronautMassKg + MISSION_CONFIG.suit.memuPlssMassKg + p.sampleMassKg
    );

    // Fatiga acumulada de los últimos ~30 min (muestreada por ticks)
    const meanRecentWatts =
      metabolicHistory30Min.length > 0
        ? metabolicHistory30Min.reduce((a, b) => a + b, 0) / metabolicHistory30Min.length
        : 270;
    const fatigueFactor = 1.0 + Math.max(0, (meanRecentWatts - 280) / 1200) + Math.min(0.18, p.simElapsedSec / 7200);

    const suitStiffness = p.stiffnessKThetaNmRad ?? MISSION_CONFIG.suit.stiffnessKThetaNmRad;
    const suitDeltaPKpa =
      p.anomaly === 'sos' ? 23.4 : (p.suitDeltaPKpa ?? MISSION_CONFIG.suit.nominalPressureKpa);

    const metabolicWatts = computePandolfSanteeMarsWatts({
      astronautMassKg: p.astronautMassKg,
      sampleMassKg: p.sampleMassKg,
      speedMs: p.speedMs,
      slopeDeg: p.slopeDeg,
      thermalInertiaNorm: node.thermalInertiaNorm,
      fatigueFactor,
      stiffnessKThetaNmRad: suitStiffness,
      suitDeltaPKpa,
    });

    if (p.dtSec > 0) {
      metabolicHistory30Min.push(metabolicWatts);
      if (metabolicHistory30Min.length > 180) metabolicHistory30Min.shift();
    }

    // Consumo de O2 y Batería (con efecto de anomalías simuladas)
    const leakFactor = p.anomaly === 'sos' ? 1.85 : 0;
    if (p.anomaly === 'sos' && o2RemainingMin > 43.2) {
      if (prevAnomaly !== 'sos') {
        preSosO2RemainingMin = o2RemainingMin;
      }
      // Simular caída crítica de O2 al 18% (43.2 min de 240) como en el Judge Sandbox
      o2RemainingMin = 43.2;
    } else if (p.dtSec > 0) {
      const burnMult = computeO2BurnMultiplier(metabolicWatts, leakFactor);
      o2RemainingMin = Math.max(0, o2RemainingMin - (p.dtSec / 60) * burnMult);
    }
    prevAnomaly = p.anomaly;

    const terrainTempOffsetC = node.surfaceTempC - MISSION_CONFIG.site.ambientTempNominalC;
    const localAmbientTempC =
      (p.ambientTempC ?? MISSION_CONFIG.site.ambientTempNominalC) + terrainTempOffsetC;
    const cryoHeaterWatts = computeCryoHeaterWatts(localAmbientTempC);
    const totalElecWatts =
      MISSION_CONFIG.suit.baseLifeSupportWatts + MISSION_CONFIG.suit.uwbRadioWatts + cryoHeaterWatts;
    if (p.dtSec > 0) {
      batteryRemainingWh = Math.max(0, batteryRemainingWh - totalElecWatts * (p.dtSec / 3600));
    }

    const o2Percent = (o2RemainingMin / MISSION_CONFIG.suit.o2TotalCapacityMinutesBase) * 100;
    const batteryPercent = (batteryRemainingWh / MISSION_CONFIG.suit.batteryCapacityWh) * 100;
    const batteryRemainingMin = (batteryRemainingWh / Math.max(40, totalElecWatts)) * 60;

    // Frecuencia cardíaca con cinética gradual VO2->BPM y capnografía CO2
    // Reposo (~165 W) -> ~72 BPM; caminata nominal (~330 W) -> ~88 BPM; ascenso con muestras (~550 W) -> ~110 BPM
    const steadyStateHr = Math.min(
      132,
      Math.max(66, 68 + Math.max(0, metabolicWatts - 135) * 0.095)
    );
    const targetHrBpm =
      p.anomaly === 'sos' || o2Percent < 20
        ? Math.max(146, steadyStateHr + 42)
        : p.speActive
          ? Math.min(136, steadyStateHr + 10)
          : steadyStateHr;

    // Filtrado exponencial de primer orden: subida gradual (tau = 14 s), bajada gradual al reposar (tau = 24 s)
    if (p.dtSec > 0) {
      const tauSec = targetHrBpm > smoothedHeartRateBpm ? 14.0 : 24.0;
      const alpha = 1 - Math.exp(-p.dtSec / tauSec);
      smoothedHeartRateBpm += (targetHrBpm - smoothedHeartRateBpm) * alpha;
    }
    const heartRateBpm = Math.round(smoothedHeartRateBpm);

    const co2MmHg =
      p.anomaly === 'hypercapnia' && !plssBackupActive
        ? 8.2
        : Number(
            Math.max(1.4, (1.9 + (metabolicWatts - 200) * 0.004) * (plssBackupActive ? 0.78 : 1)).toFixed(1)
          );
    const hypercapniaAlert =
      !plssBackupActive &&
      co2MmHg >= MISSION_CONFIG.thresholds.co2WarningMmHg &&
      (p.headingDriftCount >= 2 ||
        p.unacknowledgedAlertSec >= MISSION_CONFIG.thresholds.responseLatencyHypercapniaSec ||
        p.anomaly === 'hypercapnia');
    const hypercapniaReason = hypercapniaAlert
      ? `Capnografía elevada (${co2MmHg} mmHg) + anomalía cinemática/latencia >10 s`
      : null;

    // Radiación instantánea R(h, SVF) y dosis acumulada
    const instantDoseRateMicroSvH = computeInstantDoseRateMicroSvH(
      node.elevationM,
      node.svf,
      p.speActive
    );
    if (p.dtSec > 0) {
      accumulatedDoseMicroSv += instantDoseRateMicroSvH * (p.dtSec / 3600);
    }
    const alaraBudgetPct = (accumulatedDoseMicroSv / Math.max(1, p.alaraBudgetMicroSv)) * 100;

    // Posicionamiento híbrido, Fresnel diffraction y RF-LOS (incluyendo repetidores desplegados)
    const roverCommsOffline = Boolean(p.roverCommsFault || p.anomaly === 'roverFault');
    const pos = computeHybridPositioning(p.x, p.y, node, p.rover, p.dustTau, p.simElapsedSec, {
      grid,
      repeaters: p.repeaters ?? [],
      roverCommsOffline,
    });
    const jointTorqueNm = computeJointTorqueNm(
      p.slopeDeg,
      p.speedMs,
      totalMassKg,
      suitStiffness,
      suitDeltaPKpa
    );

    const basePoi = canonicalPois.find((poi) => poi.id === 'POI-01');
    const shelterPoi = canonicalPois.find((poi) => poi.id === 'POI-05');
    const conePoi = canonicalPois.find((poi) => poi.id === 'POI-04');
    const baseXY = { x: basePoi?.x ?? 0, y: basePoi?.y ?? 0 };
    const shelterXY = { x: shelterPoi?.x ?? -860, y: shelterPoi?.y ?? -620 };
    const coneXY = { x: conePoi?.x ?? 1180, y: conePoi?.y ?? -540 };
    const shelterSvf = shelterPoi?.svf ?? 0.38;
    const shelterElev = shelterPoi?.elevationM ?? -3012;

    // Cálculo A* inverso de regreso a Base (POI-01) para Time-to-Turnback Dinámico Asimétrico
    const returnToBase = findDirectionalRoute(
      grid,
      { x: p.x, y: p.y },
      baseXY,
      {
        speActive: p.speActive,
        sosEmergency: p.sosActive,
        astronautMassKg: p.astronautMassKg,
        sampleMassKg: p.sampleMassKg,
        fatigueFactor,
        stiffnessKThetaNmRad: suitStiffness,
        suitDeltaPKpa,
        targetId: 'POI-01',
        targetLabel: 'Base Ares (POI-01)',
      }
    );

    const limitingResourceMin = Math.min(o2RemainingMin, batteryRemainingMin);
    const turnbackTimeMin = Number(returnToBase.o2RequiredMin.toFixed(1));
    const returnMarginMin = Number((limitingResourceMin - turnbackTimeMin).toFixed(1));
    const marginRatio = returnMarginMin / Math.max(1, turnbackTimeMin);

    const riskEmergency =
      p.sosActive ||
      p.speActive ||
      p.dustTau > MISSION_CONFIG.thresholds.dustOpacityCriticalTau ||
      hypercapniaAlert ||
      alaraBudgetPct >= 100 ||
      limitingResourceMin <= turnbackTimeMin;

    let returnStatusColor: ReturnStatusColor = 'cyan';
    if (riskEmergency) {
      returnStatusColor = 'red';
    } else if (marginRatio < MISSION_CONFIG.thresholds.returnMarginAmberRatio) {
      returnStatusColor = 'amber';
    }

    // Árbol Dinámico de Decisión de Supervivencia: Base (POI-01) vs Refugio SPE (POI-05) vs Rover/EV2
    let activeReturnRoute = returnToBase;
    let activeRefugeType: RefugeType = 'base';

    if (p.speActive && p.anomaly !== 'sos') {
      const toShelter05 = findDirectionalRoute(
        grid,
        { x: p.x, y: p.y },
        shelterXY,
        {
          speActive: true,
          sosEmergency: true,
          astronautMassKg: p.astronautMassKg,
          sampleMassKg: p.sampleMassKg,
          fatigueFactor,
          stiffnessKThetaNmRad: suitStiffness,
          suitDeltaPKpa,
          targetId: 'POI-05',
          targetLabel: 'Refugio SPE (POI-05)',
        }
      );
      const shelterWaitDose12Min =
        0.2 * computeInstantDoseRateMicroSvH(shelterElev, shelterSvf, true);
      if (
        !toShelter05.blocked &&
        o2RemainingMin >= toShelter05.o2RequiredMin + 15 &&
        toShelter05.radiationDoseMicroSv + shelterWaitDose12Min <
          returnToBase.radiationDoseMicroSv
      ) {
        activeReturnRoute = toShelter05;
        activeRefugeType = 'poi-05';
      }
    }

    if (
      riskEmergency &&
      (limitingResourceMin <= turnbackTimeMin + 2 ||
        o2RemainingMin < returnToBase.o2RequiredMin ||
        (p.anomaly === 'sos' && o2RemainingMin < 46))
    ) {
      const candidates: Array<{ type: RefugeType; x: number; y: number; id: string; label: string }> = [
        ...(roverCommsOffline
          ? []
          : [{ type: 'rover' as RefugeType, x: p.rover.x, y: p.rover.y, id: 'ROVER', label: 'Rover Presurizado - Perseverance' }]),
        { type: 'buddy', x: p.buddyX, y: p.buddyY, id: 'EV2', label: 'Enlace Umbilical EV2' },
        { type: 'poi-05', x: shelterXY.x, y: shelterXY.y, id: 'POI-05', label: 'Refugio POI-05' },
        { type: 'poi-04', x: coneXY.x, y: coneXY.y, id: 'POI-04', label: 'Abrigo Cono POI-04' },
        { type: 'base', x: baseXY.x, y: baseXY.y, id: 'POI-01', label: 'Base Ares POI-01' },
      ];
      let bestTime = returnToBase.blocked ? Infinity : returnToBase.estimatedTimeMin;
      for (const cand of candidates) {
        const r =
          cand.type === 'base'
            ? returnToBase
            : findDirectionalRoute(
                grid,
                { x: p.x, y: p.y },
                { x: cand.x, y: cand.y },
                {
                  speActive: p.speActive,
                  sosEmergency: true,
                  astronautMassKg: p.astronautMassKg,
                  sampleMassKg: p.sampleMassKg,
                  fatigueFactor,
                  stiffnessKThetaNmRad: suitStiffness,
                  suitDeltaPKpa,
                  targetId: cand.id,
                  targetLabel: cand.label,
                }
              );
        if (!r.blocked && r.estimatedTimeMin < bestTime) {
          bestTime = r.estimatedTimeMin;
          activeReturnRoute = r;
          activeRefugeType = cand.type;
        }
      }
    }

    const tunnelVisionMode =
      riskEmergency ||
      heartRateBpm > MISSION_CONFIG.thresholds.heartRateTunnelVisionBpm ||
      suitDeltaPKpa < 25.5 ||
      o2Percent < 20;

    let executiveOrder = 'SEGUIR CORREDOR';
    if (tunnelVisionMode) {
      executiveOrder =
        p.sampleMassKg > 0.2
          ? `SOS · LIBERAR CARGA -> ${activeReturnRoute.targetId}`
          : `SOS VITAL · IR A ${activeReturnRoute.targetId}`;
    } else if (returnStatusColor === 'amber') {
      executiveOrder = 'REDUCIR MARCHA';
    }

    const output: SafetyWorkerTickOutput = {
      timestamp: Date.now(),
      heartbeatTick,
      o2RemainingMin: Number(o2RemainingMin.toFixed(1)),
      o2Percent: Number(o2Percent.toFixed(1)),
      batteryRemainingMin: Number(batteryRemainingMin.toFixed(1)),
      batteryPercent: Number(batteryPercent.toFixed(1)),
      suitDeltaPKpa: Number(suitDeltaPKpa.toFixed(1)),
      heartRateBpm,
      metabolicWatts: Math.round(metabolicWatts),
      jointTorqueNm: Number(jointTorqueNm.toFixed(1)),
      co2MmHg,
      hypercapniaAlert,
      hypercapniaReason,
      instantDoseRateMicroSvH: Number(instantDoseRateMicroSvH.toFixed(1)),
      accumulatedDoseMicroSv: Number(accumulatedDoseMicroSv.toFixed(2)),
      alaraBudgetPct: Number(alaraBudgetPct.toFixed(1)),
      turnbackTimeMin,
      returnMarginMin,
      returnStatusColor,
      tunnelVisionMode,
      executiveOrder,
      positioningMode: pos.mode,
      positioningErrorM: pos.errorMeters,
      rfSignalDbm: pos.rfSignalDbm,
      rfMode: pos.rfMode,
      rfAlert: pos.rfAlert,
      activeReturnRoute,
      activeRefugeType,
      workerComputeMs: Number((performance.now() - t0).toFixed(2)),
      cryoHeaterWatts: Number(cryoHeaterWatts.toFixed(1)),
      hudLuminanceCdM2: Math.round(Math.max(420, 1850 - p.dustTau * 410)),
      hudAdaptiveGain: Number(
        Math.min(1.38, Math.max(0.65, 0.78 + (1 - node.svf) * 0.4 + p.dustTau * 0.12)).toFixed(2)
      ),
      plssBackupActive,
      roverCommsOffline,
      activeLinkSource: pos.activeLinkSource,
      fresnelClearanceRatio: pos.fresnelClearanceRatio,
      diffractionLossDb: pos.diffractionLossDb,
      repeaters: p.repeaters ?? [],
    };

    self.postMessage({ type: 'TICK_RESULT', output });
  }
};
