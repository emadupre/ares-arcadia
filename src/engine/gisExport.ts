import { MISSION_CONFIG } from '../config/missionConfig';
import type {
  ArcadiaMacroGrid,
  PoiStation,
  RouteMetrics,
  RoutePoint,
  WazeSuggestion,
} from '../types/mission';
import type { MultiPoiCircuitPlan } from './routing';
import { findNearestNode } from './routing';

export interface MarsGeoJsonFeature {
  type: 'Feature';
  id?: string;
  geometry:
    | {
        type: 'Point';
        coordinates: [number, number, number]; // [lonEastDeg, latNorthDeg, elevationM]
      }
    | {
        type: 'LineString';
        coordinates: Array<[number, number, number]>;
      };
  properties: Record<string, unknown>;
}

export interface MarsGeoJsonCollection {
  type: 'FeatureCollection';
  name: string;
  crs: {
    type: 'name';
    properties: {
      name: string;
    };
  };
  metadata: {
    system: string;
    region: string;
    datumCenterLatNorthDeg: number;
    datumCenterLonWestDeg: number;
    datumCenterLonEastDeg: number;
    usgsReference: string;
    generatedAtIso: string;
  };
  features: MarsGeoJsonFeature[];
}

/**
 * Convierte coordenadas cartesianas locales (x, y en metros respecto a POI-01) a coordenadas
 * planetocéntricas marcianas IAU 2000 (lonEastDeg, latNorthDeg, elevationM).
 */
export function localXYToMarsLonLatElev(
  grid: ArcadiaMacroGrid | null,
  x: number,
  y: number,
  fallbackElevM = -3005
): [number, number, number] {
  const centerLat = grid?.metadata?.centerLat ?? MISSION_CONFIG.site.centerLatDeg;
  const centerLonWest = grid?.metadata?.centerLon ?? MISSION_CONFIG.site.centerLonTrekDeg;
  const node = grid ? findNearestNode(grid, x, y) : null;

  const latDeg = Number((node ? node.latDeg : centerLat + y / 59158.0).toFixed(6));
  const lonWestDeg = node ? node.lonDeg : centerLonWest + x / 39928.0;
  const lonEastDeg = Number((((lonWestDeg % 360) + 360) % 360).toFixed(6));
  const elevM = Number((node ? node.elevationM : fallbackElevM).toFixed(2));

  return [lonEastDeg, latDeg, elevM];
}

function routePointsToCoords(
  grid: ArcadiaMacroGrid | null,
  points: RoutePoint[]
): Array<[number, number, number]> {
  return points.map((pt) => localXYToMarsLonLatElev(grid, pt.x, pt.y, pt.elevationM));
}

/**
 * Construye una colección GeoJSON estándar (IAU2000:49900 Mars 2000) lista para abrir en
 * QGIS, ArcGIS Pro, JMARS o herramientas SIG planetarias.
 */
export function buildMarsMissionGeoJson(params: {
  grid: ArcadiaMacroGrid | null;
  pois: PoiStation[];
  customPoiIds?: Set<string>;
  plannedRoute?: RouteMetrics | null;
  circuitPlan?: MultiPoiCircuitPlan | null;
  anomaliesCaptured?: WazeSuggestion[];
  astronautPos?: { x: number; y: number };
}): MarsGeoJsonCollection {
  const {
    grid,
    pois,
    customPoiIds,
    plannedRoute,
    circuitPlan,
    anomaliesCaptured = [],
    astronautPos,
  } = params;

  const features: MarsGeoJsonFeature[] = [];

  // 1. Ruta A* planificada / activa (LineString 3D)
  if (plannedRoute && !plannedRoute.blocked && plannedRoute.points.length >= 2) {
    features.push({
      type: 'Feature',
      id: `route-${plannedRoute.targetId}`,
      geometry: {
        type: 'LineString',
        coordinates: routePointsToCoords(grid, plannedRoute.points),
      },
      properties: {
        featureType: 'eva_astar_route',
        targetId: plannedRoute.targetId,
        targetLabel: plannedRoute.targetLabel,
        distanceMeters: plannedRoute.distanceMeters,
        estimatedTimeMin: plannedRoute.estimatedTimeMin,
        o2RequiredMin: plannedRoute.o2RequiredMin,
        metabolicCostWattsAvg: plannedRoute.metabolicCostWattsAvg,
        radiationDoseMicroSv: plannedRoute.radiationDoseMicroSv,
        radiationReductionPct: plannedRoute.radiationReductionPct,
        metabolicSavingPct: plannedRoute.metabolicSavingPct,
        convergenceMs: plannedRoute.convergenceMs,
        usedCosparOverride: plannedRoute.usedCosparOverride,
        rfDropZonesCount: plannedRoute.rfDropZonesCount,
      },
    });

    // Nodos sugeridos para repetidores UWB/UHF en sombra RF (<-84 dBm)
    plannedRoute.repeaterDeployPoints.forEach((rep, idx) => {
      features.push({
        type: 'Feature',
        id: `rf-repeater-${idx + 1}`,
        geometry: {
          type: 'Point',
          coordinates: localXYToMarsLonLatElev(grid, rep.x, rep.y, rep.elevationM),
        },
        properties: {
          featureType: 'rf_repeater_deploy_node',
          index: idx + 1,
          localXMeters: rep.x,
          localYMeters: rep.y,
          elevationM: rep.elevationM,
        },
      });
    });
  }

  // 2. Circuito Óptimo Multi-POI cerrado (si está calculado)
  if (circuitPlan && circuitPlan.combinedPoints.length >= 2) {
    features.push({
      type: 'Feature',
      id: 'optimal-multi-poi-circuit',
      geometry: {
        type: 'LineString',
        coordinates: routePointsToCoords(grid, circuitPlan.combinedPoints),
      },
      properties: {
        featureType: 'eva_multi_poi_circuit',
        orderedPoiIds: circuitPlan.orderedPoiIds,
        fullSequenceIds: circuitPlan.fullSequenceIds,
        totalDistanceMeters: circuitPlan.totalDistanceMeters,
        totalEstimatedTimeMin: circuitPlan.totalEstimatedTimeMin,
        totalO2RequiredMin: circuitPlan.totalO2RequiredMin,
        totalRadiationDoseMicroSv: circuitPlan.totalRadiationDoseMicroSv,
        totalSampleMassKg: circuitPlan.totalSampleMassKg,
        withinSafetyBudgets: circuitPlan.withinSafetyBudgets,
        solverComputeMs: circuitPlan.solverComputeMs,
      },
    });
  }

  // 3. Estaciones POI (canónicas y agregadas manualmente por el usuario)
  for (const poi of pois) {
    const isCustom = Boolean(customPoiIds?.has(poi.id));
    features.push({
      type: 'Feature',
      id: poi.id,
      geometry: {
        type: 'Point',
        coordinates: localXYToMarsLonLatElev(grid, poi.x, poi.y, poi.elevationM ?? -3005),
      },
      properties: {
        featureType: 'poi_station',
        id: poi.id,
        name: poi.name,
        kind: poi.kind,
        origin: isCustom ? 'user_manual' : 'ares_canonical',
        localXMeters: poi.x,
        localYMeters: poi.y,
        geologicUnit: poi.unit,
        iceDepthLabel: poi.iceDepthLabel,
        iceDepthM: poi.iceDepthM ?? null,
        skyViewFactor: poi.svf ?? null,
        cosparRestricted: Boolean(poi.cosparZone),
        sampleRewardKg: poi.sampleRewardKg ?? 0,
        objective: poi.objective,
      },
    });
  }

  // 4. Hallazgos y muestras geológicas capturadas durante la EVA
  for (const finding of anomaliesCaptured) {
    features.push({
      type: 'Feature',
      id: `finding-${finding.id}`,
      geometry: {
        type: 'Point',
        coordinates: localXYToMarsLonLatElev(grid, finding.x, finding.y, -3005),
      },
      properties: {
        featureType: 'captured_geological_finding',
        id: finding.id,
        title: finding.title,
        mineralSignature: finding.mineralSignature,
        sampleMassKg: finding.sampleMassKg,
        localXMeters: finding.x,
        localYMeters: finding.y,
      },
    });
  }

  // 5. Posición actual del astronauta (si está disponible)
  if (astronautPos) {
    features.push({
      type: 'Feature',
      id: 'ev1-astronaut-position',
      geometry: {
        type: 'Point',
        coordinates: localXYToMarsLonLatElev(grid, astronautPos.x, astronautPos.y, -3005),
      },
      properties: {
        featureType: 'astronaut_position',
        localXMeters: Number(astronautPos.x.toFixed(1)),
        localYMeters: Number(astronautPos.y.toFixed(1)),
      },
    });
  }

  return {
    type: 'FeatureCollection',
    name: 'ARES_Arcadia_Planitia_EVA_Traverse',
    crs: {
      type: 'name',
      properties: {
        name: 'urn:ogc:def:crs:IAU:2000:49900',
      },
    },
    metadata: {
      system: 'A.R.E.S HUD — Autonomous Routing & Environmental Survival System',
      region: MISSION_CONFIG.site.name,
      datumCenterLatNorthDeg: MISSION_CONFIG.site.centerLatDeg,
      datumCenterLonWestDeg: MISSION_CONFIG.site.centerLonTrekDeg,
      datumCenterLonEastDeg: MISSION_CONFIG.site.centerLonEastDeg,
      usgsReference: MISSION_CONFIG.referenceNotes.usgsMapReference,
      generatedAtIso: new Date().toISOString(),
    },
    features,
  };
}

export function downloadMarsMissionGeoJson(
  collection: MarsGeoJsonCollection,
  filenamePrefix = 'ares-arcadia-mission'
): void {
  const blob = new Blob([JSON.stringify(collection, null, 2)], {
    type: 'application/geo+json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filenamePrefix}-${Date.now()}.geojson`;
  a.click();
  URL.revokeObjectURL(url);
}
