export type MissionPhase = 'pre-eva' | 'eva' | 'post-eva';

export type PreEvaModalId = 'none' | 'layers' | 'geodesic' | 'atlas' | 'poi-detail';

export type NasaCartographicStyle =
  | 'usgs-sim3292'
  | 'ctx-orbital'
  | 'hirise-regolith'
  | 'mola-hypsometric';

export type GeologicalUnit = 'Aa5' | 'Aa4' | 'Aa3' | 'Aa2' | 'Aa1';

export type HabitatLayerId =
  | 'geology'
  | 'radiation'
  | 'ice'
  | 'cospar'
  | 'rfLos'
  | 'slope';

export type AnomalyTrigger = 'none' | 'sos' | 'spe' | 'dust' | 'hypercapnia' | 'roverFault';

export type ReturnStatusColor = 'cyan' | 'amber' | 'red';

export type RefugeType = 'base' | 'rover' | 'poi-05' | 'poi-04' | 'buddy';

export interface GridNode {
  index: number;
  row: number;
  col: number;
  x: number; // metros relativos al módulo base (-2450..+2450)
  y: number; // metros relativos al módulo base (-2450..+2450), +Y = Norte
  latDeg: number;
  lonDeg: number;
  elevationM: number; // respecto al areoide (~ -3000 m)
  slopeDeg: number;
  aspectDeg: number;
  unit: GeologicalUnit;
  svf: number; // Sky View Factor [0..1]
  roughnessNorm: number; // [0..1] SHARAD/HiRISE
  thermalInertiaNorm: number; // [0..1] THEMIS/MCS (mayor = sustrato consolidado)
  iceDepthM: number; // profundidad estimada del hielo (m)
  shallowIceFlag: boolean; // < 5 m (Región Especial COSPAR)
  cosparRestricted: boolean;
  rfBaseDbm: number; // intensidad señal RF desde Base
  surfaceTempC: number;
  gcrDoseRateMicroSvH: number;
  geoUnit?: GeologicalUnit;
  usgsRegionalUnit?: string;
  usgsContactProximityM?: number;
}

export interface DeployableRepeater {
  id: string;
  x: number;
  y: number;
  elevationM: number;
  deployedAtSec: number;
  batteryPct: number;
  relayGainDb: number;
}

export interface RouteElevationSample {
  distM: number;
  elevationM: number;
  slopeDeg: number;
  svf: number;
  gcrRateMicroSvH: number;
  unit: string;
  x: number;
  y: number;
}

export interface ArcadiaMacroGrid {
  size: number;
  quadrantSizeMeters: number;
  cellSizeMeters: number;
  metadata?: {
    region?: string;
    centerLat?: number;
    centerLon?: number;
    centerLonEast?: number;
    elevationRangeM?: [number, number];
    studyAreaPolygonVertices?: Array<{ id: string; lat: number; lon: number }>;
  };
  nodes: GridNode[];
}

export interface PoiStation {
  id: string;
  name: string;
  x: number;
  y: number;
  unit: string;
  objective: string;
  iceDepthLabel: string;
  riskAndRestriction: string;
  kind: 'base' | 'science' | 'shelter' | 'landmark' | 'cache' | 'ai-suggested';
  svf?: number;
  sampleRewardKg?: number;
  elevationM?: number;
  geoUnit?: string;
  iceDepthM?: number;
  featureDiameterM?: number;
  featureDiameterLabel?: string;
  description?: string;
  scientificValue?: string;
  hazardWarning?: string;
  cosparZone?: boolean;
}

export interface RoutePoint {
  x: number;
  y: number;
  elevationM: number;
  row: number;
  col: number;
}

export interface RouteMetrics {
  points: RoutePoint[];
  distanceMeters: number;
  estimatedTimeMin: number;
  metabolicCostWattsAvg: number;
  o2RequiredMin: number;
  radiationDoseMicroSv: number;
  directGeodesicDoseMicroSv: number;
  radiationReductionPct: number;
  directMetabolicWattsAvg: number;
  metabolicSavingPct: number;
  convergenceMs: number;
  usedCosparOverride: boolean;
  blocked?: boolean;
  routeStatus?: 'optimal' | 'cospar_override' | 'blocked';
  rfDropZonesCount: number;
  repeaterDeployPoints: RoutePoint[];
  targetId: string;
  targetLabel: string;
  dStarDeltaNodes?: number;
  dStarReplanMs?: number;
  profile?: RouteElevationSample[];
}

export interface WazeSuggestion {
  id: string;
  title: string;
  mineralSignature: string;
  x: number;
  y: number;
  distanceM: number;
  o2CostMin: number;
  sampleMassKg: number;
  confidencePct: number;
}

export interface SubgridHazardCheck {
  hasLocalDiscrepancy: boolean;
  confidenceHaloActive: boolean;
  mmWaveCrackDetected: boolean;
  lowCohesionRegolith: boolean;
  reason: string;
  microBlocks: Array<{ dx: number; dy: number; radiusM: number; heightM: number }>;
}

export interface BuddyTelemetry {
  id: 'EV2';
  x: number;
  y: number;
  heartRateBpm: number;
  o2Percent: number;
  doseRateMicroSvH: number;
  metabolicWatts: number;
  distanceMeters: number;
  separationAlert: 'ok' | 'warn' | 'critical';
}

export interface RoverTelemetry {
  x: number;
  y: number;
  headingDeg: number;
  batteryPercent: number;
  uwbSignalDbm: number;
  uhfSignalDbm: number;
  interceptMode: boolean;
}

export interface SafetyWorkerTickOutput {
  timestamp: number;
  heartbeatTick: number;
  o2RemainingMin: number;
  o2Percent: number;
  batteryRemainingMin: number;
  batteryPercent: number;
  suitDeltaPKpa: number;
  heartRateBpm: number;
  metabolicWatts: number;
  jointTorqueNm: number;
  co2MmHg: number;
  hypercapniaAlert: boolean;
  hypercapniaReason: string | null;
  instantDoseRateMicroSvH: number;
  accumulatedDoseMicroSv: number;
  alaraBudgetPct: number;
  turnbackTimeMin: number;
  returnMarginMin: number;
  returnStatusColor: ReturnStatusColor;
  tunnelVisionMode: boolean;
  executiveOrder: string;
  positioningMode: 'EKF_HYBRID_UWB_OPTICAL' | 'PDR_IMU_UWB_WIREFRAME';
  positioningErrorM: number;
  rfSignalDbm: number;
  rfMode: 'UWB_802_15_4z' | 'UHF_400MHz' | 'LOST_BREADCRUMB';
  rfAlert: boolean;
  activeReturnRoute: RouteMetrics | null;
  activeRefugeType: RefugeType;
  workerComputeMs: number;
  cryoHeaterWatts?: number;
  hudLuminanceCdM2?: number;
  hudAdaptiveGain?: number;
  plssBackupActive?: boolean;
  roverCommsOffline?: boolean;
  activeLinkSource?: 'HAB_UHF' | 'ROVER_RELAY' | 'MICRO_REPEATER' | 'PDR_IMU_DEAD_RECKONING';
  fresnelClearanceRatio?: number;
  diffractionLossDb?: number;
  repeaters?: DeployableRepeater[];
}

export interface MissionLogEntry {
  tSec: number;
  category: 'info' | 'warn' | 'critical' | 'science';
  message: string;
}

export type HudLanguageMode = 'technical' | 'intuitive';

export type HabitatInteriorSectionId = 'pre-eva' | 'physical' | 'emotional';

export type HabitatJumpTarget = HabitatInteriorSectionId | 'gym' | 'galley';

export interface MusculoskeletalState {
  indexPct: number; // Estado Oseo-Muscular (0-100%)
  dailyExerciseMin: number; // Protocolo diario minimo 120 min (2h)
  aredVacuumLoadKg: number; // Pistones de vacio ARED (10-90 kg carga realista astronauta)
  aredRepsLogged: number;
  flywheelInertiaKgCm2: number; // Volante de inercia excentrico (25-75 kg·cm²)
  flywheelEccentricWorkKj: number;
  treadmillHarnessPctBw: number; // Arnes con bandas elasticas (70-80% peso terrestre)
  treadmillImpactKm: number;
  lastStimulusLabel: string;
}

export interface EmotionalHealthState {
  integrityPct: number; // Salud e integridad emocional (0-100%)
  circadianSyncPct: number; // Sincronia circadiana luz modulo (0-100%)
  isolationStressPct: number; // Carga de aislamiento/confinamiento (0-100%, menor es mejor)
  lightingMode: 'sol-morning' | 'nominal' | 'amber-dusk';
  familyCommsDelayMin: number; // Retardo unidireccional Tierra-Arcadia (min)
  messagesSentCount: number; // Mensajes asincronos enviados a familia/Tierra
  hydroponicCareSessions: number; // Sesiones de cuidado bio/invernadero
  mindfulnessMinToday: number; // Minutos de respiracion guiada / paisaje sonoro
  crewSocialCheckDone: boolean; // Chequeo psicosocial con companero EV-2
  lastActivityLabel: string;
}

export interface FoodInventoryState {
  dehydratedFreezeDriedKg: number; // Deshidratados y Liofilizados
  thermostabilizedKg: number; // Termoestabilizados
  intermediateMoistureKg: number; // Humedad Intermedia
  irradiatedKg: number; // Irradiados
  hydroponicGreensKg: number; // Vegetacion y verduras locales
  highBarrierPouches: number; // Envases multicapa de alta barrera
  spaceContainmentBags: number; // Bolsas de plastico de funcionamiento espacial
  potableWaterLiters: number; // De extraccion de hielo SHARAD
  sharadIceExtractedKg: number;
  earthSupplyDaysRemaining: number; // Provisiones terrestres < 3 meses (~90 d)
  isruAutonomyGainDays: number;
  caloriesKcalToday: number;
  dailyTargetKcal: number;
}

export interface PostEvaReport {
  durationMin: number;
  distanceWalkedM: number;
  plannedPoiId: string;
  plannedPoiName: string;
  reachedPlannedPoi: boolean;
  plannedDistanceM: number;
  plannedDoseMicroSv: number;
  totalDoseMicroSv: number;
  alaraBudgetMicroSv: number;
  samplesCollectedKg: number;
  samplesCachedKg: number;
  cacheNode: PoiStation | null;
  anomaliesCaptured: WazeSuggestion[];
  dustStormEncountered: boolean;
  speEncountered: boolean;
  sosTriggered: boolean;
  airlockDustRemovedPct: number;
  perchlorateCheckPassed: boolean;
  repressurizedKpa: number;
  datasetSynced: boolean;
  repeatersDeployedCount?: number;
  plssBackupSwitched?: boolean;
  musculoskeletalIndexPct?: number;
  emotionalIntegrityPct?: number;
  dailyExerciseMin?: number;
  earthSupplyDaysRemaining?: number;
  isruAutonomyGainDays?: number;
  hudMode?: HudLanguageMode;
}

export type MarsSeasonId = 'spring' | 'summer' | 'autumn' | 'winter';

export type MarsLightPhaseId =
  | 'night'
  | 'dawn'
  | 'day-low'
  | 'safe-sun'
  | 'sunset'
  | 'twilight';

export interface MarsEphemerisState {
  latDeg: number;
  lonEastDeg: number;
  solNumber: number; // Cumulative Mars mission Sols (1 Sol = 24h 39m 35.244s SI)
  orbitSol: number; // Sol within 668.6-sol Martian Tropical Year (Ls=0° -> 0)
  marsYearFraction: number; // [0..1)
  solarLongitudeLsDeg: number; // Aerocentric Solar Longitude Ls [0°, 360°)
  seasonId: MarsSeasonId; // Northern Hemisphere Mars seasons
  seasonProgressPct: number; // 0..100% through current Martian season
  mtcMarsHours: number; // Martian Coordinated Time (0° lon) [0..24 Mars-hours)
  lmstMarsHours: number; // Local Mean Solar Time at site lon [0..24 Mars-hours)
  ltstMarsHours: number; // Local True Solar Time (LMST + EOT) [0..24 Mars-hours)
  ltstLabel: string; // HH:MM (Mars-hours/min, NO Earth timezone)
  mtcLabel: string; // HH:MM MTC
  equationOfTimeMarsMin: number; // True minus Mean solar time in Mars minutes
  solarDeclinationDeg: number; // [-25.19°, +25.19°]
  solarElevationDeg: number; // Geometric solar altitude above horizon [-90°, +90°]
  solarAzimuthDeg: number; // Clockwise from True North (0=N, 90=E, 180=S, 270=W)
  noonMaxElevationDeg: number; // Peak solar altitude at local solar noon for this Ls
  daylightMarsHours: number; // Duration Sun above horizon at site latitude (Mars-h)
  nightMarsHours: number; // 24 - daylightMarsHours (Mars-h)
  sunriseLtstHours: number | null;
  sunsetLtstHours: number | null;
  safeSunStartLtstHours: number | null;
  safeSunEndLtstHours: number | null;
  safeSunWindowMarsHours: number;
  safeSunWindowLabel: string; // e.g. "05:20 – 18:40 LTST"
  safeSunActive: boolean; // True inside optimal Safe Sun solar corridor & no SPE/whiteout
  lightPhase: MarsLightPhaseId;
  heliocentricAu: number; // Mars-Sun distance [1.381..1.666 AU]
  solarFluxToaWm2: number; // Top-of-atmosphere solar irradiance (~490..715 W/m²)
  surfaceIrradianceWm2: number; // Direct + diffuse dust-attenuated irradiance (W/m²)
  ambientTempC: number; // Arcadia Planitia surface temperature (°C, Mars Climate Database curve)
  frostCover01: number; // Seasonal CO2/H2O surface frost factor [0..1]
  blueSunsetFactor01: number; // Forward-Mie blue/cyan halo weight near dawn/sunset [0..1]
  headlampFactor01: number; // Suit helmet LED beam engagement weight [0..1]
}
