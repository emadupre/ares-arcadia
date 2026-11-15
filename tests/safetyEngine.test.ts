import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MISSION_CONFIG } from '../src/config/missionConfig';
import {
  computeArcadiaWeight,
  computeJointTorqueNm,
  computeO2BurnMultiplier,
  computePandolfSanteeMarsWatts,
} from '../src/engine/bioenergetics';
import { buildMarsMissionGeoJson } from '../src/engine/gisExport';
import { computeHybridPositioning, computeTerrainDiffractionLossDb } from '../src/engine/positioning';
import { computeInstantDoseRateMicroSvH } from '../src/engine/radiation';
import {
  computeOptimalMultiPoiCircuit,
  findDirectionalRoute,
  findNearestNode,
  replanRouteIncrementalDStarLite,
} from '../src/engine/routing';
import { evaluateSosRisk } from '../src/engine/sosRisk';
import { evaluateMicroSubgrid } from '../src/engine/subgrid';
import { ARCADIA_ZONES, WORLDVIEW_EARTH_SPINOFF_PRESETS, WORLDVIEW_TEMPORAL_SOLS } from '../src/services/nasaApiService';
import type { ArcadiaMacroGrid, DeployableRepeater, PoiStation } from '../src/types/mission';

const gridPath = path.resolve(__dirname, '../public/data/arcadia-grid-50x50.json');
const poisPath = path.resolve(__dirname, '../public/data/pois.json');
const grid = JSON.parse(fs.readFileSync(gridPath, 'utf-8')) as ArcadiaMacroGrid;
const poisPayload = JSON.parse(fs.readFileSync(poisPath, 'utf-8')) as { pois: PoiStation[] };
const pois = poisPayload.pois;

describe('Ares Arcadia Safety & Navigation Engine', () => {
  it('anchors canonical Arcadia Planitia datum and POI-01..POI-05 coordinates', () => {
    const p1 = pois.find((p) => p.id === 'POI-01');
    const p2 = pois.find((p) => p.id === 'POI-02');
    const p5 = pois.find((p) => p.id === 'POI-05');
    expect(p1).toMatchObject({ x: 0, y: 0 });
    expect(p2).toMatchObject({ x: -420, y: 780 });
    expect(p5).toMatchObject({ x: -860, y: -620, kind: 'shelter' });

    const craterRimNode = findNearestNode(grid, -420, 780);
    const craterCheck = evaluateMicroSubgrid(-420, 780, craterRimNode, 0.65, 'en');
    expect(craterCheck.confidenceHaloActive).toBe(true);
  });

  it('computes Arcadia Planitia gravity weights accurately (7.00 kg max sample ≈ 26.06 N)', () => {
    const sampleWeight = computeArcadiaWeight(MISSION_CONFIG.suit.maxSampleMassKg);
    expect(sampleWeight.weightN).toBeCloseTo(26.06, 1);
    expect(sampleWeight.apparentEarthKgf).toBeCloseTo(2.66, 2);
  });

  it('calculates Pandolf-Santee 0.38g metabolic cost increasing with slope, loose dust, and suit stiffness/pressure', () => {
    const flatConsolidated = computePandolfSanteeMarsWatts({
      astronautMassKg: 75,
      sampleMassKg: 0,
      speedMs: 1.2,
      slopeDeg: 0,
      thermalInertiaNorm: 0.85,
      stiffnessKThetaNmRad: MISSION_CONFIG.suit.stiffnessKThetaNmRad,
      suitDeltaPKpa: MISSION_CONFIG.suit.nominalPressureKpa,
    });
    const uphillLoose = computePandolfSanteeMarsWatts({
      astronautMassKg: 75,
      sampleMassKg: 6.5,
      speedMs: 1.2,
      slopeDeg: 11,
      thermalInertiaNorm: 0.35,
      stiffnessKThetaNmRad: MISSION_CONFIG.suit.stiffnessKThetaNmRad,
      suitDeltaPKpa: MISSION_CONFIG.suit.nominalPressureKpa,
    });
    const stiffHighPressure = computePandolfSanteeMarsWatts({
      astronautMassKg: 75,
      sampleMassKg: 0,
      speedMs: 1.2,
      slopeDeg: 0,
      thermalInertiaNorm: 0.85,
      stiffnessKThetaNmRad: 24.0,
      suitDeltaPKpa: 38.0,
    });
    expect(uphillLoose).toBeGreaterThan(flatConsolidated * 1.45);
    expect(stiffHighPressure).toBeGreaterThan(flatConsolidated);
    expect(computeJointTorqueNm(38, 1.2, 180, 24)).toBeGreaterThan(
      computeJointTorqueNm(29.6, 1.2, 180, 11.4)
    );

    const standingRest = computePandolfSanteeMarsWatts({
      astronautMassKg: 75,
      sampleMassKg: 0,
      speedMs: 0,
      slopeDeg: 0,
      thermalInertiaNorm: 0.85,
      stiffnessKThetaNmRad: MISSION_CONFIG.suit.stiffnessKThetaNmRad,
      suitDeltaPKpa: MISSION_CONFIG.suit.nominalPressureKpa,
    });
    expect(standingRest).toBeGreaterThanOrEqual(120);
    expect(standingRest).toBeLessThan(145);
    expect(computeO2BurnMultiplier(standingRest)).toBeLessThan(computeO2BurnMultiplier(flatConsolidated));
  });

  it('reduces SPE solar storm radiation dose dramatically inside low-SVF sheltered terrain (POI-05 vs POI-01)', () => {
    const exposedSpe = computeInstantDoseRateMicroSvH(-3000, 0.977, true);
    const shelteredSpe = computeInstantDoseRateMicroSvH(-3015, 0.483, true);
    expect(shelteredSpe).toBeLessThan(exposedSpe * 0.6);
  });

  it('converges A* directional route across 2,500 nodes in < 12 ms after JIT warmup', () => {
    const p2 = pois.find((p) => p.id === 'POI-02')!;
    const p3 = pois.find((p) => p.id === 'POI-03')!;

    // Warmup call
    findDirectionalRoute(grid, { x: 0, y: 0 }, { x: p2.x, y: p2.y }, {
      speActive: false,
      sosEmergency: false,
      astronautMassKg: 75,
      sampleMassKg: 2.0,
    });

    const route = findDirectionalRoute(grid, { x: 0, y: 0 }, { x: p3.x, y: p3.y }, {
      speActive: false,
      sosEmergency: false,
      astronautMassKg: 75,
      sampleMassKg: 2.0,
    });

    expect(route.blocked).toBeFalsy();
    expect(route.points.length).toBeGreaterThan(4);
    expect(route.distanceMeters).toBeGreaterThan(600);
    expect(route.convergenceMs).toBeLessThan(12);
    expect(route.metabolicSavingPct).toBeGreaterThanOrEqual(0);
  });

  it('enforces COSPAR shallow-ice (<5m) exclusion in nominal EVA and only relaxes under SOS', () => {
    const restricted = grid.nodes.filter((n) => n.cosparRestricted);
    expect(restricted.length).toBeGreaterThan(0);

    const minX = Math.min(...restricted.map((n) => n.x));
    const maxX = Math.max(...restricted.map((n) => n.x));
    const avgY = restricted.reduce((acc, n) => acc + n.y, 0) / restricted.length;

    const startNode = findNearestNode(grid, minX - 250, avgY);
    const goalNode = findNearestNode(grid, maxX + 250, avgY);
    expect(startNode.cosparRestricted).toBe(false);
    expect(goalNode.cosparRestricted).toBe(false);

    const nominal = findDirectionalRoute(grid, startNode, goalNode, {
      speActive: false,
      sosEmergency: false,
      astronautMassKg: 75,
      sampleMassKg: 1.5,
    });

    expect(nominal.blocked).toBeFalsy();
    expect(nominal.usedCosparOverride).toBe(false);
    for (const pt of nominal.points) {
      const node = findNearestNode(grid, pt.x, pt.y);
      expect(node.cosparRestricted).toBe(false);
    }

    const sosEmergencyRoute = findDirectionalRoute(grid, startNode, goalNode, {
      speActive: false,
      sosEmergency: true,
      astronautMassKg: 75,
      sampleMassKg: 1.5,
    });
    expect(sosEmergencyRoute.blocked).toBeFalsy();
    expect(sosEmergencyRoute.points.length).toBeGreaterThan(2);
  });

  it('never falls back to a straight geodesic through >18 deg impassable cliffs when blocked', () => {
    const blockedGrid: ArcadiaMacroGrid = {
      ...grid,
      nodes: grid.nodes.map((n) => ({ ...n })),
    };
    const goalNode = findNearestNode(blockedGrid, 500, 500);
    // Surround goal ring with 26-degree cliffs so A* cannot enter
    for (const n of blockedGrid.nodes) {
      const d = Math.hypot(n.x - goalNode.x, n.y - goalNode.y);
      if (d > 50 && d <= 260) {
        n.slopeDeg = 26.0;
      }
    }

    const blockedRoute = findDirectionalRoute(blockedGrid, { x: 0, y: 0 }, goalNode, {
      speActive: false,
      sosEmergency: false,
      astronautMassKg: 75,
      sampleMassKg: 1.5,
    });
    expect(blockedRoute.blocked).toBe(true);
    expect(blockedRoute.routeStatus).toBe('blocked');
    expect(blockedRoute.points.length).toBe(0);
    expect(blockedRoute.o2RequiredMin).toBeGreaterThan(900);
  });

  it('computes sheltered diversion toward POI-05 (-860, -620) under SPE mode with strict radiation reduction', () => {
    const p5 = pois.find((p) => p.id === 'POI-05')!;
    const speRoute = findDirectionalRoute(
      grid,
      { x: 0, y: 0 },
      { x: p5.x, y: p5.y },
      {
        speActive: true,
        sosEmergency: false,
        astronautMassKg: 75,
        sampleMassKg: 1.5,
        targetId: 'POI-05',
      }
    );
    expect(speRoute.blocked).toBeFalsy();
    expect(speRoute.points.length).toBeGreaterThan(5);
    expect(speRoute.radiationReductionPct).toBeGreaterThan(0);
    expect(speRoute.usedCosparOverride).toBe(false);
  });

  it('activates SOS system when any astronaut risk factor increases while keeping nominal EVA clear', () => {
    const nominal = evaluateSosRisk({
      anomaly: 'none',
      dustTau: 0.65,
      suitPintKpa: 29.6,
      safetyOutput: null,
    });
    expect(nominal.sosActive).toBe(false);

    const solarStorm = evaluateSosRisk({
      anomaly: 'spe',
      dustTau: 0.65,
      suitPintKpa: 29.6,
      safetyOutput: null,
    });
    expect(solarStorm.speActive).toBe(true);
    expect(solarStorm.sosActive).toBe(true);

    const dustStorm = evaluateSosRisk({
      anomaly: 'none',
      dustTau: 2.8,
      suitPintKpa: 29.6,
      safetyOutput: null,
    });
    expect(dustStorm.dustCritical).toBe(true);
    expect(dustStorm.sosActive).toBe(true);

    const lowPressure = evaluateSosRisk({
      anomaly: 'none',
      dustTau: 0.65,
      suitPintKpa: 25.4,
      safetyOutput: null,
    });
    expect(lowPressure.suitDepressurized).toBe(true);
    expect(lowPressure.sosActive).toBe(true);
  });

  it('routes directly back to Module (POI-01 at 0,0) under SPE + SOS emergency', () => {
    const p2 = pois.find((p) => p.id === 'POI-02')!;
    const emergencyReturn = findDirectionalRoute(
      grid,
      { x: p2.x, y: p2.y },
      { x: 0, y: 0 },
      {
        speActive: true,
        sosEmergency: true,
        astronautMassKg: 75,
        sampleMassKg: 1.5,
        targetId: 'POI-01',
      }
    );
    expect(emergencyReturn.blocked).toBeFalsy();
    const lastPt = emergencyReturn.points[emergencyReturn.points.length - 1];
    expect(Math.hypot(lastPt.x, lastPt.y)).toBeLessThanOrEqual(80);
    expect(emergencyReturn.targetId).toBe('POI-01');
  });

  it('halts nominal POI-02 ice-crater prospecting safely at the COSPAR Category IVb rim standoff', () => {
    const p2 = pois.find((p) => p.id === 'POI-02')!;
    const route = findDirectionalRoute(
      grid,
      { x: 0, y: 0 },
      { x: p2.x, y: p2.y },
      {
        speActive: false,
        sosEmergency: false,
        astronautMassKg: 75,
        sampleMassKg: 1.5,
        targetId: 'POI-02',
      }
    );
    expect(route.blocked).toBeFalsy();
    expect(route.usedCosparOverride).toBe(false);
    expect(route.points.length).toBeGreaterThan(4);
    for (const pt of route.points) {
      expect(findNearestNode(grid, pt.x, pt.y).cosparRestricted).toBe(false);
    }
    const lastPt = route.points[route.points.length - 1];
    expect(Math.hypot(lastPt.x - p2.x, lastPt.y - p2.y)).toBeLessThanOrEqual(270);
  });

  it('solves an optimal closed-loop Multi-POI circuit within O2, ALARA, and 7.0 kg payload budgets', () => {
    const basePoi = pois.find((p) => p.id === 'POI-01')!;
    const circuit = computeOptimalMultiPoiCircuit(
      grid,
      basePoi,
      pois,
      {
        speActive: false,
        sosEmergency: false,
        astronautMassKg: 75,
        sampleMassKg: 0,
        speedMs: 1.8,
      },
      {
        maxO2BudgetMin: 168,
        alaraBudgetMicroSv: 350,
        maxSampleMassKg: 7.0,
      }
    );

    expect(circuit.withinSafetyBudgets).toBe(true);
    expect(circuit.orderedPoiIds.length).toBeGreaterThanOrEqual(2);
    expect(circuit.fullSequenceIds[0]).toBe('POI-01');
    expect(circuit.fullSequenceIds[circuit.fullSequenceIds.length - 1]).toBe('POI-01');
    expect(circuit.totalO2RequiredMin).toBeLessThanOrEqual(168);
    expect(circuit.totalRadiationDoseMicroSv).toBeLessThanOrEqual(350);
    expect(circuit.totalSampleMassKg).toBeLessThanOrEqual(7.0);
    expect(circuit.combinedPoints.length).toBeGreaterThan(10);
  });

  it('exports standards-compliant IAU 2000 Mars GeoJSON (RFC 7946) with 3D route and POI features', () => {
    const p3 = pois.find((p) => p.id === 'POI-03')!;
    const route = findDirectionalRoute(
      grid,
      { x: 0, y: 0 },
      { x: p3.x, y: p3.y },
      {
        speActive: false,
        sosEmergency: false,
        astronautMassKg: 75,
        sampleMassKg: 1.0,
        targetId: 'POI-03',
        targetLabel: p3.name,
      }
    );

    const geojson = buildMarsMissionGeoJson({
      grid,
      pois,
      plannedRoute: route,
      astronautPos: { x: 0, y: 20 },
    });

    expect(geojson.type).toBe('FeatureCollection');
    expect(geojson.crs.properties.name).toBe('urn:ogc:def:crs:IAU:2000:49900');
    const routeFeature = geojson.features.find((f) => f.properties.featureType === 'eva_astar_route');
    expect(routeFeature).toBeDefined();
    expect(routeFeature?.geometry.type).toBe('LineString');
    if (routeFeature?.geometry.type === 'LineString') {
      const [lonEast, latNorth, elevM] = routeFeature.geometry.coordinates[0];
      expect(lonEast).toBeGreaterThan(196);
      expect(lonEast).toBeLessThan(198);
      expect(latNorth).toBeGreaterThan(47.4);
      expect(latNorth).toBeLessThan(47.7);
      expect(elevM).toBeLessThan(-2900);
    }
  });

  it('clears latched SOS risk when anomaly resets to none and supports POI-04 volcanic cone refuge', () => {
    const active = evaluateSosRisk({
      anomaly: 'sos',
      dustTau: 0.65,
      suitPintKpa: 29.6,
      safetyOutput: {
        timestamp: Date.now(),
        heartbeatTick: 10,
        o2RemainingMin: 43.2,
        o2Percent: 18,
        batteryRemainingMin: 180,
        batteryPercent: 75,
        suitDeltaPKpa: 23.4,
        heartRateBpm: 152,
        metabolicWatts: 340,
        jointTorqueNm: 18,
        co2MmHg: 3.2,
        hypercapniaAlert: false,
        hypercapniaReason: null,
        instantDoseRateMicroSvH: 9.8,
        accumulatedDoseMicroSv: 12,
        alaraBudgetPct: 3.4,
        turnbackTimeMin: 20,
        returnMarginMin: 15,
        returnStatusColor: 'red',
        tunnelVisionMode: true,
        executiveOrder: 'SOS VITAL',
        positioningMode: 'EKF_HYBRID_UWB_OPTICAL',
        positioningErrorM: 0.9,
        rfSignalDbm: -62,
        rfMode: 'UWB_802_15_4z',
        rfAlert: false,
        activeReturnRoute: null,
        activeRefugeType: 'base',
        workerComputeMs: 2.1,
        cryoHeaterWatts: 14.5,
        hudLuminanceCdM2: 1580,
      },
    });
    expect(active.sosActive).toBe(true);

    const cleared = evaluateSosRisk({
      anomaly: 'none',
      dustTau: 0.65,
      suitPintKpa: 29.6,
      safetyOutput: {
        timestamp: Date.now(),
        heartbeatTick: 11,
        o2RemainingMin: 192,
        o2Percent: 80,
        batteryRemainingMin: 260,
        batteryPercent: 78,
        suitDeltaPKpa: 29.0,
        heartRateBpm: 76,
        metabolicWatts: 280,
        jointTorqueNm: 14,
        co2MmHg: 3.0,
        hypercapniaAlert: false,
        hypercapniaReason: null,
        instantDoseRateMicroSvH: 9.8,
        accumulatedDoseMicroSv: 12,
        alaraBudgetPct: 3.4,
        turnbackTimeMin: 20,
        returnMarginMin: 172,
        returnStatusColor: 'cyan',
        tunnelVisionMode: false,
        executiveOrder: 'SEGUIR CORREDOR',
        positioningMode: 'EKF_HYBRID_UWB_OPTICAL',
        positioningErrorM: 0.8,
        rfSignalDbm: -58,
        rfMode: 'UWB_802_15_4z',
        rfAlert: false,
        activeReturnRoute: null,
        activeRefugeType: 'poi-04',
        workerComputeMs: 1.9,
        cryoHeaterWatts: 14.5,
        hudLuminanceCdM2: 1584,
      },
    });
    expect(cleared.sosActive).toBe(false);

    const p4 = pois.find((p) => p.id === 'POI-04')!;
    const coneRefugeRoute = findDirectionalRoute(
      grid,
      { x: 920, y: -320 },
      { x: p4.x, y: p4.y },
      {
        speActive: false,
        sosEmergency: true,
        astronautMassKg: 75,
        sampleMassKg: 1.5,
        targetId: 'POI-04',
      }
    );
    expect(coneRefugeRoute.blocked).toBe(false);
    expect(coneRefugeRoute.points.length).toBeGreaterThan(2);
  });

  it('calibrates Curiosity RAD GCR dose at -3000 m datum (27.5 uSv/h at SVF=1.0) and increases shielding deeper', () => {
    const radDatum = computeInstantDoseRateMicroSvH(-3000, 1.0, false);
    const radDeep44N = computeInstantDoseRateMicroSvH(-3850, 1.0, false);
    expect(radDatum).toBeCloseTo(27.5, 2);
    expect(radDeep44N).toBeLessThan(radDatum);
  });

  it('models 415 MHz Fresnel diffraction, Rover Comms Fault (CU-07) failover, and Micro-Repeater mesh recovery', () => {
    const farNode = {
      ...findNearestNode(grid, 1450, -900),
      rfBaseDbm: -102,
    };
    const farRover = {
      x: 1200,
      y: -850,
      headingDeg: 90,
      batteryPercent: 88,
      uwbSignalDbm: -70,
      uhfSignalDbm: -64,
      interceptMode: false,
    };

    const withRover = computeHybridPositioning(1450, -900, farNode, farRover, 0.5, 10, {
      grid,
      roverCommsOffline: false,
    });
    expect(withRover.activeLinkSource).toBe('ROVER_RELAY');

    const roverFaultNoRep = computeHybridPositioning(1450, -900, farNode, farRover, 0.5, 10, {
      grid,
      roverCommsOffline: true,
    });
    expect(roverFaultNoRep.activeLinkSource).not.toBe('ROVER_RELAY');

    const repeater: DeployableRepeater = {
      id: 'REP-1',
      x: 1410,
      y: -880,
      elevationM: farNode.elevationM,
      deployedAtSec: 12,
      batteryPct: 100,
      relayGainDb: 5.5,
    };
    const withRepeater = computeHybridPositioning(1450, -900, farNode, farRover, 0.5, 10, {
      grid,
      repeaters: [repeater],
      roverCommsOffline: true,
    });
    expect(withRepeater.activeLinkSource).toBe('MICRO_REPEATER');
    expect(withRepeater.rfSignalDbm).toBeGreaterThan(roverFaultNoRep.rfSignalDbm);

    const losClear = computeTerrainDiffractionLossDb(0, 0, -3000, 100, 100, -3000, grid, 5);
    expect(losClear.lossDb).toBe(0);
  });

  it('executes incremental D* Lite repair with dynamic cost deltas and emits elevation profile samples', () => {
    const p3 = pois.find((p) => p.id === 'POI-03')!;
    const initial = findDirectionalRoute(
      grid,
      { x: 0, y: 0 },
      { x: p3.x, y: p3.y },
      { speActive: false, sosEmergency: false, astronautMassKg: 75, sampleMassKg: 1.0 }
    );
    expect(initial.profile && initial.profile.length).toBe(initial.points.length);

    const midPt = initial.points[Math.floor(initial.points.length / 2)];
    const repaired = replanRouteIncrementalDStarLite(
      grid,
      initial,
      initial.points[1],
      { x: p3.x, y: p3.y },
      { speActive: false, sosEmergency: false, astronautMassKg: 75, sampleMassKg: 1.0 },
      [{ x: midPt.x, y: midPt.y, radiusM: 180, costMultiplier: 4.5 }]
    );
    expect(repaired.blocked).toBe(false);
    expect(repaired.dStarReplanMs).toBeDefined();
    expect(repaired.points.length).toBeGreaterThan(3);
  });

  it('evaluates dynamic COSPAR crater targets and includes NASA Trek 44.66N, Worldview & Perseverance provenance', () => {
    const synthNode = {
      ...findNearestNode(grid, 450, -350),
      cosparRestricted: true,
    };
    const subCheck = evaluateMicroSubgrid(450, -350, synthNode, 0.65, 'en', [
      { x: 450, y: -350 },
    ]);
    expect(subCheck.confidenceHaloActive).toBe(true);

    const trek44N = ARCADIA_ZONES.find((z) => z.id === 'zona-5-trek-44n');
    expect(trek44N).toMatchObject({ centerLatDeg: 44.66, centerLonEastDeg: 185 });
    expect(WORLDVIEW_TEMPORAL_SOLS.length).toBeGreaterThanOrEqual(4);
    expect(WORLDVIEW_EARTH_SPINOFF_PRESETS.length).toBeGreaterThanOrEqual(1);

    const nasaServiceSrc = fs.readFileSync(
      path.resolve(__dirname, '../src/services/nasaApiService.ts'),
      'utf-8'
    );
    expect(nasaServiceSrc.includes('DEMO_KEY')).toBe(false);
    expect(nasaServiceSrc.includes('services.swpc.noaa.gov')).toBe(true);

    const manifestPath = path.resolve(__dirname, '../public/nasa-layers/manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as {
      perseveranceRawSamples?: unknown[];
      layers?: Record<string, { file?: string }>;
    };
    expect((manifest.perseveranceRawSamples ?? []).length).toBeGreaterThanOrEqual(3);
    expect(grid.nodes.some((n) => Boolean(n.usgsRegionalUnit))).toBe(true);
  });
});
