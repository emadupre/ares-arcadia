import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  CornerDownLeft,
  Cpu,
  DoorOpen,
  Layers,
  ShieldCheck,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { MISSION_CONFIG } from './config/missionConfig';
import { computeArcadiaWeight, computePandolfSanteeMarsWatts } from './engine/bioenergetics';
import { buildMarsMissionGeoJson, downloadMarsMissionGeoJson } from './engine/gisExport';
import {
  computeArcadiaSolarEphemeris,
  MARS_HOUR_SI_SECONDS,
  MARS_TROPICAL_YEAR_SOLS,
  wrapDeg360,
  wrapMarsHours24,
} from './engine/marsEphemeris';
import { appendBreadcrumb, computeHybridPositioning } from './engine/positioning';
import { findContextualWazeSuggestion } from './engine/poiProspector';
import {
  computeOptimalMultiPoiCircuit,
  evaluateStaticRouteProgress,
  findDirectionalRoute,
  findNearestNode,
  type RouteDeltaConstraint,
} from './engine/routing';
import { evaluateSosRisk } from './engine/sosRisk';
import { evaluateMicroSubgrid } from './engine/subgrid';
import { speakAresCallout } from './utils/voiceAnnunciator';
import { useMultimodalInput } from './hooks/useMultimodalInput';
import { useSafetyCore } from './hooks/useSafetyCore';
import { HabitatViewport3D } from './components/habitat/HabitatViewport3D';
import { useI18n } from './i18n/I18nContext';
import {
  getPoiCopy,
  getWazeTitle,
  lonDir,
} from './i18n/catalog';
import {
  HABITAT_SCENES,
  MartianHabitatBackdrop,
} from './components/habitat/MartianHabitatBackdrop';
import { HabitatEmotionalConsole } from './components/habitat/HabitatEmotionalConsole';
import {
  HabitatPhysicalConsole,
  type PhysicalDivisionId,
} from './components/habitat/HabitatPhysicalConsole';
import { HabitatSectionsDock } from './components/habitat/HabitatSectionsDock';
import { PreEvaPlannerPanel } from './components/habitat/PreEvaPlannerPanel';
import { SpacecraftConsoleFrame } from './components/habitat/SpacecraftConsoleFrame';
import { PreEgressPreferencesModal } from './components/eva/PreEgressPreferencesModal';
import { CuffChecklistModal } from './components/hud/CuffChecklistModal';
import { HelmetHudViewport } from './components/hud/HelmetHudViewport';
import { HolographicStatusBar } from './components/hud/HolographicStatusBar';
import { HudOverlay } from './components/hud/HudOverlay';
import { PostEvaModal } from './components/postEva/PostEvaModal';
import { SoftwareOnboardingModal } from './components/shared/SoftwareOnboardingModal';
import { StealthControlsModal } from './components/shared/StealthControlsModal';
import { AdvancedTelemetryDrawer } from './components/sandbox/AdvancedTelemetryDrawer';
import { JudgeSandboxPanel } from './components/sandbox/JudgeSandboxPanel';
import {
  ARCADIA_ZONES,
  fetchNasaDonkiSpaceWeather,
  transformGridAndPoisForZone,
  type ArcadiaZoneId,
  type NasaDonkiSpaceWeatherStatus,
  type WorldviewTemporalSol,
} from './services/nasaApiService';
import type {
  AnomalyTrigger,
  ArcadiaMacroGrid,
  BuddyTelemetry,
  DeployableRepeater,
  EmotionalHealthState,
  FoodInventoryState,
  GridNode,
  HabitatInteriorSectionId,
  HabitatJumpTarget,
  HabitatLayerId,
  HudLanguageMode,
  MarsSeasonId,
  MissionLogEntry,
  MissionPhase,
  MusculoskeletalState,
  NasaCartographicStyle,
  PoiStation,
  PostEvaReport,
  PreEvaModalId,
  RouteMetrics,
  RoutePoint,
  RoverTelemetry,
  WazeSuggestion,
} from './types/mission';

function normalizeAngle(rad: number): number {
  let a = rad;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Physical body contact envelope for Martian Habitat Module + Airlock Ramp at POI-01 (0, 0)
function resolveMartianModuleContact(
  x: number,
  y: number
): { x: number; y: number; touching: boolean; nearHysteresis: boolean } {
  const onRampFootprint = Math.abs(x) <= 2.05 && y >= 4.5 && y <= 12.6;
  const distFromCenter = Math.hypot(x, y);

  let clampedX = x;
  let clampedY = y;
  let touching = false;

  if (onRampFootprint) {
    touching = true;
    // Allow stepping onto exterior grated ramp up to airlock sill without clipping inside doorway bulkhead
    if (clampedY < 11.1) {
      clampedY = 11.1;
    }
  } else if (distFromCenter <= 6.65) {
    touching = true;
    // Prevent camera from clipping inside dome shell (radius 5.58 m)
    const minOuterRadius = 6.48;
    if (distFromCenter < minOuterRadius) {
      if (distFromCenter > 0.001) {
        const scale = minOuterRadius / distFromCenter;
        clampedX = x * scale;
        clampedY = y * scale;
      } else {
        clampedX = 0;
        clampedY = minOuterRadius;
      }
    }
  }

  const nearHysteresis =
    Math.hypot(clampedX, clampedY) <= 7.6 ||
    (Math.abs(clampedX) <= 2.55 && clampedY >= 4.0 && clampedY <= 13.6);

  return { x: clampedX, y: clampedY, touching, nearHysteresis };
}

export default function App() {
  const { lang, setLang, t } = useI18n();
  const langRef = useRef(lang);
  langRef.current = lang;

  const [baseGrid, setBaseGrid] = useState<ArcadiaMacroGrid | null>(null);
  const [basePois, setBasePois] = useState<PoiStation[]>([]);
  const [customPois, setCustomPois] = useState<PoiStation[]>(() => {
    try {
      const raw = window.localStorage.getItem('ares_arcadia_custom_pois_v1');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as PoiStation[]) : [];
    } catch {
      return [];
    }
  });
  const [circuitModeEnabled, setCircuitModeEnabled] = useState<boolean>(false);
  const [voiceCalloutsMuted, setVoiceCalloutsMuted] = useState<boolean>(false);
  const [activeZoneId, setActiveZoneId] = useState<ArcadiaZoneId>('zona-1-marstrek');

  useEffect(() => {
    try {
      window.localStorage.setItem('ares_arcadia_custom_pois_v1', JSON.stringify(customPois));
    } catch {
      // Ignore storage quota errors in private browsing
    }
  }, [customPois]);
  const [donkiStatus, setDonkiStatus] = useState<NasaDonkiSpaceWeatherStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [phase, setPhase] = useState<MissionPhase>('pre-eva');
  const [telemetryDrawerOpen, setTelemetryDrawerOpen] = useState(false);
  const [sandboxOpen, setSandboxOpen] = useState(false);

  // Entorno animado compartido del módulo marciano (correlacionado Pre-EVA y Post-EVA)
  const [habitatSceneIdx, setHabitatSceneIdx] = useState(0);
  const [povOffset, setPovOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (phase !== 'pre-eva' && phase !== 'post-eva') return;
    const id = window.setInterval(() => {
      setHabitatSceneIdx((prev) => (prev + 1) % HABITAT_SCENES.length);
    }, 5500);
    return () => window.clearInterval(id);
  }, [phase]);

  // Pre-EVA Hábitat state
  const [activeLayer, setActiveLayer] = useState<HabitatLayerId>('geology');
  const [preEvaCartoStyle, setPreEvaCartoStyle] = useState<NasaCartographicStyle>('usgs-sim3292');
  const [preEvaTrueScale1to1, setPreEvaTrueScale1to1] = useState<boolean>(false);
  const [selectedPoiId, setSelectedPoiId] = useState<string>('POI-02');
  const [selectedNode, setSelectedNode] = useState<GridNode | null>(null);
  const [spePreview, setSpePreview] = useState(false);
  const [astronautMassKg, setAstronautMassKg] = useState<number>(
    MISSION_CONFIG.suit.defaultAstronautMassKg
  );
  const [alaraBudgetMicroSv, setAlaraBudgetMicroSv] = useState<number>(
    MISSION_CONFIG.radiation.defaultAlaraBudgetMicroSv
  );
  const [preEvaPlannerOpen, setPreEvaPlannerOpen] = useState(true);
  const [preEvaModal, setPreEvaModal] = useState<PreEvaModalId>('none');
  const [preEvaDetailedMarkers, setPreEvaDetailedMarkers] = useState(false);
  const [preEvaCleanVisor, setPreEvaCleanVisor] = useState(false);
  const [flyoverActive, setFlyoverActive] = useState(false);

  // Preferencias del astronauta + Secciones interactivas del Módulo Marciano (Sec 1-4)
  const [hudMode, setHudMode] = useState<HudLanguageMode>('technical');
  const [preEgressModalOpen, setPreEgressModalOpen] = useState<boolean>(false);
  const [tutorialOpen, setTutorialOpen] = useState<boolean>(true);
  const [controlsOpen, setControlsOpen] = useState<boolean>(false);
  const [habitatSection, setHabitatSection] = useState<HabitatInteriorSectionId>('pre-eva');
  const [physicalDivision, setPhysicalDivision] = useState<PhysicalDivisionId>('gym');
  const [musculoskeletal, setMusculoskeletal] = useState<MusculoskeletalState>({
    indexPct: 84,
    dailyExerciseMin: 68,
    aredVacuumLoadKg: 45,
    aredRepsLogged: 24,
    flywheelInertiaKgCm2: 50,
    flywheelEccentricWorkKj: 14.0,
    treadmillHarnessPctBw: 75,
    treadmillImpactKm: 2.8,
    lastStimulusLabel: 'ARED + 75% BW Harness',
  });
  const [emotional, setEmotional] = useState<EmotionalHealthState>({
    integrityPct: 78,
    circadianSyncPct: 74,
    isolationStressPct: 28,
    lightingMode: 'nominal',
    familyCommsDelayMin: 14.2,
    messagesSentCount: 1,
    hydroponicCareSessions: 0,
    mindfulnessMinToday: 10,
    crewSocialCheckDone: false,
    lastActivityLabel: 'Nominal Sol Rhythm (24h 39m)',
  });
  const emotionalStressAccRef = useRef<number>(0);
  const [supplies, setSupplies] = useState<FoodInventoryState>({
    earthSupplyDaysRemaining: 78,
    isruAutonomyGainDays: 14,
    dehydratedFreezeDriedKg: 28.4,
    thermostabilizedKg: 22.0,
    intermediateMoistureKg: 14.5,
    irradiatedKg: 18.0,
    hydroponicGreensKg: 6.4,
    highBarrierPouches: 36,
    spaceContainmentBags: 48,
    potableWaterLiters: 74.0,
    sharadIceExtractedKg: 38.0,
    caloriesKcalToday: 1420,
    dailyTargetKcal: 2850,
  });

  // EVA Simulation state (libre a voluntad por defecto; AUTO-EVA opcional)
  const [simPlaying, setSimPlaying] = useState(false);
  const [simSpeed, setSimSpeed] = useState<number>(3);
  const [simElapsedSec, setSimElapsedSec] = useState<number>(0);
  const [distanceWalkedM, setDistanceWalkedM] = useState<number>(0);
  const [targetPoiId, setTargetPoiId] = useState<string>('POI-02');
  const [evaEgressActive, setEvaEgressActive] = useState<boolean>(false);
  const [evaEgressRunId, setEvaEgressRunId] = useState<number>(0);
  const [evaFinishPromptOpen, setEvaFinishPromptOpen] = useState<boolean>(false);
  const [ridingRover, setRidingRover] = useState<boolean>(false);
  const moduleConfirmDismissedRef = useRef<boolean>(false);
  const roverSummonActiveRef = useRef<boolean>(false);

  // Seguimiento real Plan Pre-EVA vs Ejecución EVA
  const [plannedMission, setPlannedMission] = useState<{
    poiId: string;
    poiName: string;
    distanceM: number;
    doseMicroSv: number;
  }>({
    poiId: 'POI-02',
    poiName: 'Exposed Ice Crater (Aa1)',
    distanceM: 980,
    doseMicroSv: 6.4,
  });
  const [reachedPlannedPoi, setReachedPlannedPoi] = useState(false);
  const [dustEncountered, setDustEncountered] = useState(false);
  const [speEncountered, setSpeEncountered] = useState(false);
  const [sosEncountered, setSosEncountered] = useState(false);

  const [astronautPos, setAstronautPos] = useState<{ x: number; y: number }>({ x: 0, y: 20 });
  const [headingRad, setHeadingRad] = useState<number>(0.42);
  const [pitchRad, setPitchRad] = useState<number>(-0.08);
  const [currentSpeedMs, setCurrentSpeedMs] = useState<number>(0);

  const [buddyPos, setBuddyPos] = useState<{ x: number; y: number }>({ x: -18, y: -12 });
  const [rover, setRover] = useState<RoverTelemetry>({
    x: 10,
    y: 31,
    headingDeg: 24,
    batteryPercent: 94,
    uwbSignalDbm: -61,
    uhfSignalDbm: -54,
    interceptMode: false,
  });

  const [anomaly, setAnomaly] = useState<AnomalyTrigger>('none');
  const [customDustTau, setCustomDustTau] = useState<number>(0.65);
  const [marsSolNumber, setMarsSolNumber] = useState<number>(198);
  const [marsSolarLonLsDeg, setMarsSolarLonLsDeg] = useState<number>(95);
  const [marsLmstHours, setMarsLmstHours] = useState<number>(10.8);
  const [marsTimeRate, setMarsTimeRate] = useState<number>(12);
  const [suitPintKpa, setSuitPintKpa] = useState<number>(29.6);
  const [stiffnessKThetaNmRad, setStiffnessKThetaNmRad] = useState<number>(
    MISSION_CONFIG.suit.stiffnessKThetaNmRad
  );
  const [contourLinesEnabled, setContourLinesEnabled] = useState<boolean>(false);
  const [cuffOpen, setCuffOpen] = useState<boolean>(false);
  const [sampleMassKg, setSampleMassKg] = useState<number>(1.8);
  const [cachedMassKg, setCachedMassKg] = useState<number>(0);
  const [cacheNode, setCacheNode] = useState<PoiStation | null>(null);
  const [repeaters, setRepeaters] = useState<DeployableRepeater[]>([]);
  const [headMotionFreeze, setHeadMotionFreeze] = useState<boolean>(false);
  const [plssBackupSwitched, setPlssBackupSwitched] = useState<boolean>(false);

  const [dismissedWazeIds, setDismissedWazeIds] = useState<Set<string>>(() => new Set());
  const [capturedAnomalies, setCapturedAnomalies] = useState<WazeSuggestion[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<RoutePoint[]>([]);
  const [logs, setLogs] = useState<MissionLogEntry[]>([]);

  const [demo30sActive, setDemo30sActive] = useState(false);
  const [demo30sSec, setDemo30sSec] = useState(0);

  const [fps, setFps] = useState<number>(60);
  const [frameRenderMs, setFrameRenderMs] = useState<number>(4.2);

  const keysPressedRef = useRef<Set<string>>(new Set());
  const forceResetWorkerRef = useRef<boolean>(false);
  const clearAnomalyWorkerRef = useRef<boolean>(false);
  const unackAlertSecRef = useRef<number>(0);
  const headingDriftCountRef = useRef<number>(0);
  const workerTickTimerRef = useRef<number>(0);
  const simDtAccRef = useRef<number>(0);
  const prevMarsLmstForRolloverRef = useRef<number>(marsLmstHours);
  const prevHeadingSampleRef = useRef<number>(0.42);
  const prevTurnSignRef = useRef<number>(0);
  const headingReversalTimesRef = useRef<number[]>([]);
  const lockedNominalRouteRef = useRef<{ signature: string; route: RouteMetrics } | null>(null);
  const lockedEmergencyRouteRef = useRef<{ signature: string; route: RouteMetrics } | null>(null);

  const pushLog = useCallback(
    (category: MissionLogEntry['category'], message: string, tSec?: number) => {
      setLogs((prev) => [
        ...prev.slice(-60),
        {
          tSec: tSec ?? Math.round(simElapsedSec),
          category,
          message,
        },
      ]);
    },
    [simElapsedSec]
  );

  // Cargar grilla estática Arcadia Planitia y POIs
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/data/arcadia-grid-50x50.json').then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} leyendo arcadia-grid-50x50.json`);
        return r.json() as Promise<ArcadiaMacroGrid>;
      }),
      fetch('/data/pois.json').then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} leyendo pois.json`);
        return r.json() as Promise<{ pois: PoiStation[] }>;
      }),
    ])
      .then(([gridData, poiData]) => {
        if (cancelled) return;
        setBaseGrid(gridData);
        setBasePois(poiData.pois);
        const poi2 = poiData.pois.find((p) => p.id === 'POI-02') ?? poiData.pois[0];
        if (poi2) {
          setSelectedNode(findNearestNode(gridData, poi2.x, poi2.y));
        }
        setLogs([
          {
            tSec: 0,
            category: 'info',
            message:
              langRef.current === 'en'
                ? `Arcadia Planitia dataset loaded (${gridData.nodes.length} nodes · ${poiData.pois.length} POIs · g=${MISSION_CONFIG.physics.gravityMarsArcadia} m/s²).`
                : `Dataset Arcadia Planitia cargado (${gridData.nodes.length} nodos · ${poiData.pois.length} POIs · g=${MISSION_CONFIG.physics.gravityMarsArcadia} m/s²).`,
          },
        ]);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(
            err instanceof Error
              ? err.message
              : langRef.current === 'en'
                ? 'Error loading local telemetry datasets'
                : 'Error cargando datos locales'
          );
        }
      });

    fetchNasaDonkiSpaceWeather().then((status) => {
      if (!cancelled) setDonkiStatus(status);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const allBasePois = useMemo(() => [...basePois, ...customPois], [basePois, customPois]);
  const customPoiIds = useMemo(() => new Set(customPois.map((p) => p.id)), [customPois]);

  const zoneTransformed = useMemo(() => {
    if (!baseGrid || allBasePois.length === 0) return null;
    return transformGridAndPoisForZone(baseGrid, allBasePois, activeZoneId);
  }, [baseGrid, allBasePois, activeZoneId]);

  const grid = zoneTransformed?.grid ?? null;
  const pois = zoneTransformed?.pois ?? allBasePois;
  const activeZone =
    zoneTransformed?.zone ?? ARCADIA_ZONES.find((z) => z.id === activeZoneId) ?? ARCADIA_ZONES[0];

  const handleChangeZoneId = useCallback(
    (nextZoneId: ArcadiaZoneId) => {
      setActiveZoneId(nextZoneId);
      if (baseGrid && allBasePois.length > 0) {
        const nextTransformed = transformGridAndPoisForZone(baseGrid, allBasePois, nextZoneId);
        const targetPoi =
          nextTransformed.pois.find((p) => p.id === selectedPoiId) ??
          nextTransformed.pois.find((p) => p.id === 'POI-02') ??
          nextTransformed.pois[0];
        if (targetPoi) {
          setSelectedNode(findNearestNode(nextTransformed.grid, targetPoi.x, targetPoi.y));
        }
      }
    },
    [baseGrid, allBasePois, selectedPoiId]
  );

  const handleAddCustomPoi = useCallback(
    (input: { name: string; x: number; y: number; kind?: 'science' | 'shelter' }) => {
      const clampedX = Math.max(-2400, Math.min(2400, Math.round(input.x)));
      const clampedY = Math.max(-2400, Math.min(2400, Math.round(input.y)));
      const maxNum = allBasePois.reduce((acc, p) => {
        const m = /^POI-(\d+)$/.exec(p.id);
        return m ? Math.max(acc, parseInt(m[1], 10)) : acc;
      }, 5);
      const nextId = `POI-${String(maxNum + 1).padStart(2, '0')}`;
      const nearest = grid ? findNearestNode(grid, clampedX, clampedY) : null;
      const cleanName =
        input.name.trim() ||
        (lang === 'en' ? `Manual Waypoint (${clampedX}, ${clampedY})` : `Punto Manual (${clampedX}, ${clampedY})`);
      const kind = input.kind ?? 'science';

      const newPoi: PoiStation = {
        id: nextId,
        name: cleanName,
        x: clampedX,
        y: clampedY,
        elevationM: nearest ? nearest.elevationM : -3005,
        unit: nearest ? nearest.unit : 'Aa5',
        geoUnit: nearest ? nearest.unit : 'Aa5',
        iceDepthM: nearest ? nearest.iceDepthM : 20,
        iceDepthLabel: nearest
          ? `${nearest.iceDepthM.toFixed(1)} m (${nearest.shallowIceFlag ? 'SHARAD <5m' : 'SHARAD nominal'})`
          : 'SHARAD nominal',
        svf: nearest ? nearest.svf : 0.9,
        cosparZone: nearest ? nearest.cosparRestricted : false,
        kind,
        objective: t(
          `Manual EVA waypoint at (${clampedX} m, ${clampedY} m) · Unit ${nearest?.unit ?? 'Aa5'} · Slope ${nearest ? nearest.slopeDeg.toFixed(1) : '1.0'}°.`,
          `Destino EVA manual en (${clampedX} m, ${clampedY} m) · Unidad ${nearest?.unit ?? 'Aa5'} · Pendiente ${nearest ? nearest.slopeDeg.toFixed(1) : '1.0'}°.`
        ),
        riskAndRestriction: nearest?.cosparRestricted
          ? t(
              'COSPAR Category IVb proximity (<5 m ice): A* automatically holds rim standoff.',
              'Proximidad COSPAR Categoría IVb (hielo <5 m): A* mantiene parada en el borde seguro.'
            )
          : nearest && nearest.slopeDeg > MISSION_CONFIG.thresholds.hardBlockSlopeDeg
            ? t(
                `Steep terrain (${nearest.slopeDeg.toFixed(1)}° > 18°): check path accessibility.`,
                `Terreno escarpado (${nearest.slopeDeg.toFixed(1)}° > 18°): verificar accesibilidad.`
              )
            : t(
                `Validated manual destination on ${nearest?.unit ?? 'Aa5'} (SVF ${nearest ? nearest.svf.toFixed(2) : '0.90'}).`,
                `Destino manual validado sobre ${nearest?.unit ?? 'Aa5'} (SVF ${nearest ? nearest.svf.toFixed(2) : '0.90'}).`
              ),
        sampleRewardKg: kind === 'shelter' ? 0 : 1.5,
      };

      setCustomPois((prev) => [...prev, newPoi]);
      setSelectedPoiId(nextId);
      if (nearest) setSelectedNode(nearest);
      pushLog(
        'science',
        t(
          `Manual EVA destination added: ${nextId} · ${cleanName} (${clampedX}, ${clampedY}) m.`,
          `Destino EVA manual agregado: ${nextId} · ${cleanName} (${clampedX}, ${clampedY}) m.`
        )
      );
    },
    [allBasePois, grid, lang, pushLog, t]
  );

  const handleRemoveCustomPoi = useCallback(
    (id: string) => {
      setCustomPois((prev) => prev.filter((p) => p.id !== id));
      if (selectedPoiId === id) setSelectedPoiId('POI-02');
      if (targetPoiId === id) setTargetPoiId('POI-02');
    },
    [selectedPoiId, targetPoiId]
  );

  const {
    workerReady,
    heartbeatTick,
    safetyOutput,
    sendTick,
    clearWorkerEmergencyState,
    switchPlssBackupLoop,
  } = useSafetyCore(grid, pois);

  const dustTau = anomaly === 'dust' ? 3.2 : customDustTau;
  const {
    speActive,
    dustCritical,
    hypercapniaActive,
    sosActive,
  } = useMemo(
    () =>
      evaluateSosRisk({
        anomaly,
        dustTau,
        suitPintKpa,
        safetyOutput,
      }),
    [anomaly, dustTau, suitPintKpa, safetyOutput]
  );

  const marsTime = useMemo(
    () =>
      computeArcadiaSolarEphemeris({
        latDeg: activeZone.centerLatDeg,
        lonEastDeg: activeZone.centerLonEastDeg,
        solarLongitudeLsDeg: marsSolarLonLsDeg,
        lmstMarsHours: marsLmstHours,
        solNumber: marsSolNumber,
        dustTau,
        speActive,
      }),
    [
      activeZone.centerLatDeg,
      activeZone.centerLonEastDeg,
      marsSolarLonLsDeg,
      marsLmstHours,
      marsSolNumber,
      dustTau,
      speActive,
    ]
  );

  const handleSelectMarsLightPreset = useCallback(
    (preset: 'dawn' | 'safe-sun' | 'sunset' | 'night') => {
      const eotH = marsTime.equationOfTimeMarsMin / 60;
      let targetLtst = 12.0;
      if (preset === 'dawn') {
        targetLtst = (marsTime.sunriseLtstHours ?? 6.2) + 0.35;
      } else if (preset === 'safe-sun') {
        targetLtst = 12.0;
      } else if (preset === 'sunset') {
        targetLtst = (marsTime.sunsetLtstHours ?? 18.2) - 0.32;
      } else {
        targetLtst = 0.5;
      }
      setMarsLmstHours(wrapMarsHours24(targetLtst - eotH));
    },
    [marsTime.equationOfTimeMarsMin, marsTime.sunriseLtstHours, marsTime.sunsetLtstHours]
  );

  const handleSelectMarsSeasonPreset = useCallback((season: MarsSeasonId) => {
    const lsMap: Record<MarsSeasonId, number> = {
      spring: 18,
      summer: 95,
      autumn: 195,
      winter: 278,
    };
    setMarsSolarLonLsDeg(lsMap[season]);
  }, []);

  useEffect(() => {
    const prev = prevMarsLmstForRolloverRef.current;
    prevMarsLmstForRolloverRef.current = marsLmstHours;
    if (prev > 22 && marsLmstHours < 2) {
      setMarsSolNumber((s) => s + 1);
      setMarsSolarLonLsDeg((ls) => wrapDeg360(ls + 360 / MARS_TROPICAL_YEAR_SOLS));
    }
  }, [marsLmstHours]);

  const currentNode = useMemo(() => {
    if (!grid) return null;
    return findNearestNode(grid, astronautPos.x, astronautPos.y);
  }, [grid, astronautPos.x, astronautPos.y]);

  const subgridCheck = useMemo(() => {
    if (!currentNode) {
      return {
        hasLocalDiscrepancy: false,
        confidenceHaloActive: false,
        mmWaveCrackDetected: false,
        lowCohesionRegolith: false,
        reason: t(
          'Initializing LIDAR + 77 GHz mmWave radar...',
          'Inicializando LIDAR + radar mmWave 77 GHz...'
        ),
        microBlocks: [],
      };
    }
    return evaluateMicroSubgrid(astronautPos.x, astronautPos.y, currentNode, dustTau, lang);
  }, [astronautPos.x, astronautPos.y, currentNode, dustTau, lang, t]);

  // Nominal Pre-EVA Planned Route (Base POI-01 -> Selected POI, no SPE)
  const suitDeltaPKpa = Math.max(0, suitPintKpa - MISSION_CONFIG.site.surfacePressureKpa);
  const PHYS_GAIT_NOMINAL_MS = 1.25;
  const PHYS_GAIT_SOS_MS = 1.42;

  const nominalPlannedRoute: RouteMetrics | null = useMemo(() => {
    if (!grid || pois.length === 0) return null;
    const basePoi = pois.find((p) => p.id === 'POI-01') ?? {
      id: 'POI-01',
      name: 'Base Ares',
      x: 0,
      y: 0,
    };
    const destPoi = pois.find((p) => p.id === selectedPoiId) ?? pois.find((p) => p.id === 'POI-02');
    if (!destPoi) return null;
    return findDirectionalRoute(
      grid,
      { x: basePoi.x, y: basePoi.y },
      { x: destPoi.x, y: destPoi.y },
      {
        speActive: false,
        sosEmergency: false,
        astronautMassKg,
        sampleMassKg: 0,
        speedMs: PHYS_GAIT_NOMINAL_MS,
        stiffnessKThetaNmRad,
        suitDeltaPKpa,
        targetId: destPoi.id,
        targetLabel: destPoi.name,
      }
    );
  }, [grid, pois, selectedPoiId, astronautMassKg, stiffnessKThetaNmRad, suitDeltaPKpa]);

  // Pre-EVA Planned Route: when spePreview is active, diverts along low-SVF canyon to POI-05 (Escarpe Refugio)
  const plannedRoute: RouteMetrics | null = useMemo(() => {
    if (!grid || pois.length === 0) return null;
    if (!spePreview) return nominalPlannedRoute;
    const basePoi = pois.find((p) => p.id === 'POI-01') ?? {
      id: 'POI-01',
      name: 'Base Ares',
      x: 0,
      y: 0,
    };
    const shelterPoi =
      pois.find((p) => p.id === 'POI-05') ??
      pois.find((p) => p.kind === 'shelter') ??
      pois.find((p) => p.id === selectedPoiId);
    if (!shelterPoi) return nominalPlannedRoute;
    return findDirectionalRoute(
      grid,
      { x: basePoi.x, y: basePoi.y },
      { x: shelterPoi.x, y: shelterPoi.y },
      {
        speActive: true,
        sosEmergency: false,
        astronautMassKg,
        sampleMassKg: 0,
        speedMs: PHYS_GAIT_NOMINAL_MS,
        stiffnessKThetaNmRad,
        suitDeltaPKpa,
        targetId: shelterPoi.id,
        targetLabel: `${shelterPoi.name} (Desvío SPE ALARA)`,
      }
    );
  }, [
    grid,
    pois,
    selectedPoiId,
    spePreview,
    astronautMassKg,
    stiffnessKThetaNmRad,
    suitDeltaPKpa,
    nominalPlannedRoute,
  ]);

  // Multi-POI Optimal Circuit Plan (Capacitated Orienteering / Asymmetric A* TSP)
  const circuitPlan = useMemo(() => {
    if (!grid || pois.length === 0) return null;
    const basePoi = pois.find((p) => p.id === 'POI-01') ?? {
      id: 'POI-01',
      name: 'Base Ares',
      x: 0,
      y: 0,
      unit: 'Aa5',
      objective: 'Base',
      iceDepthLabel: 'N/A',
      riskAndRestriction: 'N/A',
      kind: 'base' as const,
    };
    return computeOptimalMultiPoiCircuit(
      grid,
      basePoi,
      pois,
      {
        speActive: spePreview,
        sosEmergency: false,
        astronautMassKg,
        sampleMassKg: 0,
        speedMs: PHYS_GAIT_NOMINAL_MS,
        stiffnessKThetaNmRad,
        suitDeltaPKpa,
      },
      {
        alaraBudgetMicroSv,
      }
    );
  }, [
    grid,
    pois,
    spePreview,
    astronautMassKg,
    stiffnessKThetaNmRad,
    suitDeltaPKpa,
    alaraBudgetMicroSv,
  ]);

  const handleToggleCircuitMode = useCallback(() => {
    setCircuitModeEnabled((prev) => {
      const next = !prev;
      if (next && circuitPlan && circuitPlan.orderedPoiIds.length > 0) {
        const firstId = circuitPlan.orderedPoiIds[0];
        setSelectedPoiId(firstId);
        pushLog(
          'science',
          t(
            `Multi-POI Optimal Circuit activated: ${circuitPlan.fullSequenceIds.join(' -> ')} (${circuitPlan.totalDistanceMeters} m · O₂ ${circuitPlan.totalO2RequiredMin} min).`,
            `Circuito Óptimo Multi-POI activado: ${circuitPlan.fullSequenceIds.join(' -> ')} (${circuitPlan.totalDistanceMeters} m · O₂ ${circuitPlan.totalO2RequiredMin} min).`
          )
        );
      }
      return next;
    });
  }, [circuitPlan, pushLog, t]);

  // EVA Active Route & Crossed-out Nominal Route (with Incremental D* Lite Local Cost Deltas)
  const dynamicRouteDeltas = useMemo<RouteDeltaConstraint[]>(() => {
    const deltas: RouteDeltaConstraint[] = [];
    if (dustTau > 1.2) {
      // Dynamic loose-silt aeolian drift penalty pocket during dust squalls
      deltas.push({ x: -160, y: 280, radiusM: 185, costMultiplier: 1.85 });
    }
    if (dustCritical) {
      deltas.push({ x: 240, y: -120, radiusM: 220, costMultiplier: 2.3 });
    }
    for (const rep of repeaters) {
      if (rep.batteryPct > 0) {
        // Deployed micro-repeater mitigates RF shadow penalty along local corridor
        deltas.push({ x: rep.x, y: rep.y, radiusM: 280, costMultiplier: 0.72 });
      }
    }
    return deltas;
  }, [dustTau, dustCritical, repeaters]);

  const { activeRoute, crossedOutRoute } = useMemo(() => {
    if (!grid || pois.length === 0) {
      return { activeRoute: null, crossedOutRoute: null };
    }

    const nominalPoi =
      pois.find((p) => p.id === targetPoiId) ??
      pois.find((p) => p.id === 'POI-02') ??
      pois[0];

    const deltaSig = dynamicRouteDeltas
      .map((d) => `${d.x}:${d.y}:${d.radiusM}:${d.costMultiplier.toFixed(2)}`)
      .join('|');
    const nominalSig = `${activeZoneId}|NOM|${nominalPoi.id}|${stiffnessKThetaNmRad.toFixed(1)}|${suitDeltaPKpa.toFixed(1)}|${deltaSig}`;

    const withStaticProgress = (baseRoute: RouteMetrics): RouteMetrics => {
      if (baseRoute.blocked || baseRoute.points.length < 2) return baseRoute;
      const prog = evaluateStaticRouteProgress(baseRoute.points, astronautPos);
      const ratio =
        baseRoute.distanceMeters > 1
          ? Math.max(0, Math.min(1, prog.remainingDistM / Math.max(1, prog.totalDistM)))
          : 1;
      return {
        ...baseRoute,
        points: baseRoute.points,
        distanceMeters: Number(prog.remainingDistM.toFixed(1)),
        estimatedTimeMin: Number((baseRoute.estimatedTimeMin * ratio).toFixed(1)),
        o2RequiredMin: Number((baseRoute.o2RequiredMin * ratio).toFixed(1)),
      };
    };

    const lockedNom = lockedNominalRouteRef.current;
    let baseNominalRoute: RouteMetrics;
    const lockedNomHazardHit =
      lockedNom &&
      dynamicRouteDeltas.some(
        (d) =>
          d.costMultiplier > 1.05 &&
          lockedNom.route.points.some((pt) => Math.hypot(pt.x - d.x, pt.y - d.y) <= d.radiusM)
      );
    const lockedNomDist =
      lockedNom && !lockedNom.route.blocked && lockedNom.route.points.length >= 2
        ? evaluateStaticRouteProgress(lockedNom.route.points, astronautPos).minDistToRouteM
        : Infinity;

    if (
      lockedNom &&
      lockedNom.signature === nominalSig &&
      !lockedNom.route.blocked &&
      !lockedNomHazardHit &&
      lockedNomDist <= 145
    ) {
      baseNominalRoute = lockedNom.route;
    } else {
      const startAnchor =
        Math.hypot(astronautPos.x, astronautPos.y - 20) <= 35
          ? { x: 0, y: 20 }
          : { x: astronautPos.x, y: astronautPos.y };
      baseNominalRoute = findDirectionalRoute(grid, startAnchor, nominalPoi, {
        speActive: false,
        sosEmergency: false,
        astronautMassKg,
        sampleMassKg,
        speedMs: PHYS_GAIT_NOMINAL_MS,
        stiffnessKThetaNmRad,
        suitDeltaPKpa,
        targetId: nominalPoi.id,
        targetLabel: nominalPoi.name,
        dynamicDeltas: dynamicRouteDeltas,
      });
      if (!baseNominalRoute.blocked && baseNominalRoute.points.length >= 2) {
        lockedNominalRouteRef.current = { signature: nominalSig, route: baseNominalRoute };
      }
    }

    const nominalRoute = withStaticProgress(baseNominalRoute);

    if (sosActive) {
      const refugeBase = pois.find((p) => p.id === 'POI-01') ?? {
        id: 'POI-01',
        name: 'Módulo Marciano Ares',
        x: 0,
        y: 0,
      };
      const shelterPoi = pois.find((p) => p.id === 'POI-05') ?? pois.find((p) => p.kind === 'shelter');
      const workerTargetId = safetyOutput?.activeReturnRoute?.targetId;
      const preferShelterImmediate =
        Boolean(shelterPoi) &&
        ((workerTargetId === 'POI-05' &&
          (!speActive || (safetyOutput?.instantDoseRateMicroSvH ?? 0) <= 100)) ||
          (speActive &&
            !dustCritical &&
            !hypercapniaActive &&
            Math.hypot(astronautPos.x, astronautPos.y) > 350));
      const fallbackTarget = preferShelterImmediate && shelterPoi ? shelterPoi : refugeBase;

      const sosSig = `${activeZoneId}|SOS|${fallbackTarget.id}|${speActive}|${dustCritical}|${hypercapniaActive}|${deltaSig}`;
      const lockedSos = lockedEmergencyRouteRef.current;
      const lockedSosDist =
        lockedSos && !lockedSos.route.blocked && lockedSos.route.points.length >= 2
          ? evaluateStaticRouteProgress(lockedSos.route.points, astronautPos).minDistToRouteM
          : Infinity;

      let baseEmergencyRoute: RouteMetrics;
      if (
        lockedSos &&
        lockedSos.signature === sosSig &&
        !lockedSos.route.blocked &&
        lockedSosDist <= 145
      ) {
        baseEmergencyRoute = lockedSos.route;
      } else {
        const targetLabel = speActive
          ? fallbackTarget.id === 'POI-05'
            ? 'DESVÍO SPE ALARA · Escarpe Refugio (POI-05)'
            : 'RETORNO SOS · TORMENTA SOLAR SPE · Módulo Marciano'
          : dustCritical
            ? 'RETORNO SOS · TORMENTA POLVO · Módulo Marciano'
            : hypercapniaActive
              ? 'RETORNO SOS · CO₂ HIPERCAPNIA · Módulo Marciano'
              : 'RETORNO ORBITAL SOS · Módulo Marciano';

        baseEmergencyRoute = findDirectionalRoute(grid, astronautPos, fallbackTarget, {
          speActive,
          sosEmergency: true,
          astronautMassKg,
          sampleMassKg,
          speedMs: PHYS_GAIT_SOS_MS,
          stiffnessKThetaNmRad,
          suitDeltaPKpa,
          targetId: fallbackTarget.id,
          targetLabel,
          dynamicDeltas: dynamicRouteDeltas,
        });
        if (!baseEmergencyRoute.blocked && baseEmergencyRoute.points.length >= 2) {
          lockedEmergencyRouteRef.current = { signature: sosSig, route: baseEmergencyRoute };
        }
      }

      return {
        activeRoute: withStaticProgress(baseEmergencyRoute),
        crossedOutRoute: nominalRoute,
      };
    }

    lockedEmergencyRouteRef.current = null;
    return { activeRoute: nominalRoute, crossedOutRoute: null };
  }, [
    grid,
    pois,
    activeZoneId,
    targetPoiId,
    astronautPos,
    astronautMassKg,
    sampleMassKg,
    stiffnessKThetaNmRad,
    suitDeltaPKpa,
    dynamicRouteDeltas,
    sosActive,
    speActive,
    dustCritical,
    hypercapniaActive,
    safetyOutput?.instantDoseRateMicroSvH,
    safetyOutput?.activeReturnRoute?.targetId,
  ]);

  // Context-aware Waze geological suggestion
  const wazeSuggestion = useMemo(() => {
    const o2MarginMin = safetyOutput?.returnMarginMin ?? 90;
    return findContextualWazeSuggestion(
      astronautPos.x,
      astronautPos.y,
      o2MarginMin,
      sampleMassKg,
      MISSION_CONFIG.suit.maxSampleMassKg,
      dismissedWazeIds,
      sosActive || speActive
    );
  }, [
    astronautPos.x,
    astronautPos.y,
    safetyOutput?.returnMarginMin,
    sampleMassKg,
    dismissedWazeIds,
    sosActive,
    speActive,
  ]);

  const handleTriggerAnomaly = useCallback(
    (next: AnomalyTrigger) => {
      setAnomaly(next);
      setSpePreview(next === 'spe');
      const refugeBase = pois.find((p) => p.id === 'POI-01') ?? { x: 0, y: 0 };
      const shelterPoi = pois.find((p) => p.id === 'POI-05') ?? pois.find((p) => p.kind === 'shelter');
      const speTargetPoi =
        next === 'spe' && shelterPoi && Math.hypot(astronautPos.x, astronautPos.y) > 350
          ? shelterPoi
          : refugeBase;

      if (next === 'none') {
        unackAlertSecRef.current = 0;
        headingDriftCountRef.current = 0;
        headingReversalTimesRef.current = [];
        prevTurnSignRef.current = 0;
        clearAnomalyWorkerRef.current = true;
        setCustomDustTau(0.65);
        setSuitPintKpa(29.6);
        setStiffnessKThetaNmRad(MISSION_CONFIG.suit.stiffnessKThetaNmRad);
        clearWorkerEmergencyState();
        const destPoi = pois.find((p) => p.id === targetPoiId);
        if (destPoi) {
          setHeadingRad(Math.atan2(destPoi.x - astronautPos.x, destPoi.y - astronautPos.y));
        }
        speakAresCallout(
          t(
            'SOS alert deactivated. Returning to nominal EVA telemetry.',
            'Alerta SOS desactivada. Retornando a telemetría EVA nominal.'
          ),
          lang,
          { key: 'sos-clear', priority: 'normal', muted: voiceCalloutsMuted }
        );
        pushLog(
          'info',
          t('SOS / Anomaly deactivated; returning to nominal EVA operation.', 'Alerta SOS / Anomalía desactivada; retorno a operación nominal.')
        );
      } else {
        setSosEncountered(true);
        const navPoi = next === 'spe' ? speTargetPoi : refugeBase;
        setHeadingRad(Math.atan2(navPoi.x - astronautPos.x, navPoi.y - astronautPos.y));
        if (next === 'sos') {
          speakAresCallout(
            t(
              'A.R.E.S Vital SOS alert active. Escort Rover - Perseverance leading back to Modular Base.',
              'Alerta SOS vital activa. Rover Escolta - Perseverance guiando hacia la Base Modular.'
            ),
            lang,
            { key: 'sos', priority: 'critical', muted: voiceCalloutsMuted }
          );
          pushLog(
            'critical',
            t(
              'SOS ALARM ACTIVE: immediate return to Martian Module (POI-01) with Escort Rover - Perseverance.',
              'ALARMA SOS ACTIVA: retorno inmediato al Módulo Marciano (POI-01) con Rover Escolta - Perseverance.'
            )
          );
        } else if (next === 'spe') {
          setSpeEncountered(true);
          speakAresCallout(
            t(
              `Solar storm detected. Diverting to ${speTargetPoi === shelterPoi ? 'shelter scarp POI 05' : 'Modular Base POI 01'}.`,
              `Tormenta solar detectada. Desviando hacia ${speTargetPoi === shelterPoi ? 'escarpe refugio POI 05' : 'Base Modular POI 01'}.`
            ),
            lang,
            { key: 'spe', priority: 'critical', muted: voiceCalloutsMuted }
          );
          pushLog(
            'critical',
            t(
              `SOLAR STORM (SPE) -> SOS ALERT ACTIVE: radiation w_r ×10 and ALARA shield diversion (${speTargetPoi === shelterPoi ? 'POI-05 Shelter' : 'POI-01 Module'}).`,
              `TORMENTA SOLAR (SPE) -> ALERTA SOS ACTIVA: radiación w_r ×10 y desvío de blindaje ALARA (${speTargetPoi === shelterPoi ? 'Refugio POI-05' : 'Módulo POI-01'}).`
            )
          );
        } else if (next === 'dust') {
          setDustEncountered(true);
          speakAresCallout(
            t(
              'Dust storm opacity critical. Activating 77 gigahertz radar and wireframe navigation.',
              'Opacidad por tormenta de polvo crítica. Activando radar de 77 gigahercios y malla vectorial.'
            ),
            lang,
            { key: 'dust', priority: 'critical', muted: voiceCalloutsMuted }
          );
          pushLog(
            'critical',
            t(
              'DUST STORM (τ > 2.5) -> SOS ALERT ACTIVE: LIDAR + 77 GHz mmWave and return to Martian Module (POI-01).',
              'TORMENTA DE POLVO (τ > 2,5) -> ALERTA SOS ACTIVA: LIDAR + mmWave 77 GHz y retorno al Módulo Marciano (POI-01).'
            )
          );
        } else if (next === 'hypercapnia') {
          unackAlertSecRef.current = 12;
          speakAresCallout(
            t(
              'Silent hypercapnia warning. Elevated carbon dioxide detected. Return to base or switch to backup PLSS loop.',
              'Alerta de hipercapnia silenciosa. Dióxido de carbono elevado. Regrese a la base o conmute al PLSS secundario.'
            ),
            lang,
            { key: 'hypercapnia', priority: 'critical', muted: voiceCalloutsMuted }
          );
          pushLog(
            'critical',
            t(
              'HYPERCAPNIA CO₂ > 7.5 mmHg -> SOS ALERT ACTIVE: immediate return to Martian Module (POI-01) or activate CU-06 Backup PLSS.',
              'HIPERCAPNIA CO₂ > 7,5 mmHg -> ALERTA SOS ACTIVA: retorno inmediato al Módulo Marciano (POI-01) o activar PLSS secundario CU-06.'
            )
          );
        } else if (next === 'roverFault') {
          speakAresCallout(
            t(
              'Rover communications fault detected. Failing over to Habitat UHF and micro-repeaters.',
              'Falla de enlace en Rover detectada. Conmutando a UHF del Hábitat y microrrepetidores.'
            ),
            lang,
            { key: 'roverFault', priority: 'normal', muted: voiceCalloutsMuted }
          );
          pushLog(
            'critical',
            t(
              'ROVER COMMS FAULT (CU-07): UWB Rover relay offline; failover to Hab UHF + deployable micro-repeaters / PDR IMU.',
              'FALLA ENLACE ROVER (CU-07): relé UWB Rover fuera de línea; failover a UHF Hábitat + microrrepetidores / PDR IMU.'
            )
          );
        }
      }
    },
    [
      pushLog,
      pois,
      targetPoiId,
      astronautPos.x,
      astronautPos.y,
      clearWorkerEmergencyState,
      lang,
      voiceCalloutsMuted,
      t,
    ]
  );

  const handleApplyWorldviewSol = useCallback(
    (sol: WorldviewTemporalSol) => {
      setCustomDustTau(sol.dustTau);
      setMarsSolNumber(sol.sol);
      setMarsSolarLonLsDeg(Math.round(wrapDeg360(sol.sol * (360 / MARS_TROPICAL_YEAR_SOLS))));
      setSpePreview(sol.speActive);
      if (sol.speActive) {
        setAnomaly('spe');
      } else if (anomaly === 'spe' || anomaly === 'dust') {
        setAnomaly('none');
      }
      pushLog(
        sol.speActive ? 'warn' : 'info',
        t(
          `NASA Worldview Temporal Sol ${sol.sol} applied: τ=${sol.dustTau.toFixed(2)}, >=10MeV=${sol.protonPfu} pfu.`,
          `NASA Worldview Sol Temporal ${sol.sol} aplicado: τ=${sol.dustTau.toFixed(2)}, >=10MeV=${sol.protonPfu} pfu.`
        )
      );
    },
    [anomaly, pushLog, t]
  );

  // Activar y reorientar hacia el Módulo Marciano si un slider/telemetría dispara un riesgo sin pulsar botón
  const prevSosActiveRef = useRef<boolean>(false);
  useEffect(() => {
    const activeInEva = phase === 'eva' && sosActive;
    if (activeInEva && !prevSosActiveRef.current) {
      setSosEncountered(true);
      if (dustCritical) setDustEncountered(true);
      if (anomaly === 'none') {
        const refugeBase = pois.find((p) => p.id === 'POI-01') ?? { x: 0, y: 0 };
        const shelterPoi = pois.find((p) => p.id === 'POI-05') ?? pois.find((p) => p.kind === 'shelter');
        const navPoi =
          speActive && shelterPoi && Math.hypot(astronautPos.x, astronautPos.y) > 350
            ? shelterPoi
            : refugeBase;
        setHeadingRad(Math.atan2(navPoi.x - astronautPos.x, navPoi.y - astronautPos.y));
        pushLog(
          'critical',
          t(
            `RISK FACTOR DETECTED -> SOS ALERT ACTIVE: route redirected to ${navPoi === shelterPoi ? 'Shelter Scarp (POI-05)' : 'Martian Module (POI-01)'}.`,
            `FACTOR DE RIESGO DETECTADO -> ALERTA SOS ACTIVA: ruta redirigida a ${navPoi === shelterPoi ? 'Escarpe Refugio (POI-05)' : 'Módulo Marciano (POI-01)'}.`
          )
        );
      }
    }
    prevSosActiveRef.current = activeInEva;
  }, [phase, sosActive, speActive, dustCritical, anomaly, pois, astronautPos.x, astronautPos.y, pushLog, t]);

  const handleAcceptWaze = useCallback(() => {
    if (!wazeSuggestion) return;
    setDismissedWazeIds((prev) => new Set(prev).add(wazeSuggestion.id));
    setCapturedAnomalies((prev) => [...prev, wazeSuggestion]);
    setSampleMassKg((prev) =>
      Math.min(MISSION_CONFIG.suit.maxSampleMassKg, Number((prev + wazeSuggestion.sampleMassKg).toFixed(2)))
    );
    pushLog(
      'science',
      t(
        `Waze detour accepted: ${getWazeTitle(wazeSuggestion, lang)} (+${wazeSuggestion.sampleMassKg} kg · ${wazeSuggestion.mineralSignature}).`,
        `Desvío Waze aceptado: ${getWazeTitle(wazeSuggestion, lang)} (+${wazeSuggestion.sampleMassKg} kg · ${wazeSuggestion.mineralSignature}).`
      )
    );
  }, [wazeSuggestion, pushLog, lang, t]);

  const handleRejectWaze = useCallback(() => {
    if (!wazeSuggestion) return;
    setDismissedWazeIds((prev) => new Set(prev).add(wazeSuggestion.id));
    pushLog(
      'info',
      t(
        `Suggestion ${wazeSuggestion.id} dismissed by EV1.`,
        `Sugerencia ${wazeSuggestion.id} descartada por EV1.`
      )
    );
  }, [wazeSuggestion, pushLog, t]);

  const handleReturnToBase = useCallback(() => {
    setTargetPoiId('POI-01');
    pushLog(
      'warn',
      t(
        'Return order locked to POI-01 (Ares Landing Base).',
        'Orden de retorno fijada a POI-01 (Base de Amartizaje Ares).'
      )
    );
  }, [pushLog, t]);

  const multimodal = useMultimodalInput({
    lang,
    onTriggerSos: (source) => {
      handleTriggerAnomaly(sosActive ? 'none' : 'sos');
      pushLog(
        sosActive ? 'info' : 'critical',
        sosActive
          ? t(`SOS deactivated via ${source}`, `SOS desactivado vía ${source}`)
          : t(`SOS activated via ${source}`, `SOS activado vía ${source}`)
      );
    },
    onClearSos: (source) => {
      handleTriggerAnomaly('none');
      pushLog('info', t(`SOS deactivated via ${source}`, `SOS desactivado vía ${source}`));
    },
    onToggleContours: () => {
      setContourLinesEnabled((v) => !v);
      pushLog('info', t('HUD topographic contour lines toggled.', 'Curvas de nivel HUD conmutadas.'));
    },
    onAcceptSuggestion: handleAcceptWaze,
    onRejectSuggestion: handleRejectWaze,
    onReturnToBase: handleReturnToBase,
  });

  // Teclado WASD / Flechas / tecla C / skip rápido animación salida con Space/Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (tutorialOpen || controlsOpen) {
        keysPressedRef.current.clear();
        return;
      }
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (phase === 'eva' && evaEgressActive && (k === ' ' || k === 'escape')) {
        setEvaEgressActive(false);
        return;
      }
      if ((k === 'c' || e.code === 'KeyC') && !e.repeat && phase === 'eva' && !evaEgressActive && !evaFinishPromptOpen) {
        setContourLinesEnabled((v) => !v);
        return;
      }
      keysPressedRef.current.add(k);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysPressedRef.current.delete(e.key.toLowerCase());
    };
    const onWindowBlur = () => {
      keysPressedRef.current.clear();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onWindowBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, [phase, evaEgressActive, evaFinishPromptOpen, tutorialOpen, controlsOpen]);

  // Ref para leer estado fresco dentro del bucle 20 Hz sin re-instanciar el interval
  const simRef = useRef({
    phase,
    simPlaying,
    simSpeed,
    astronautPos,
    headingRad,
    activeRoute,
    grid,
    astronautMassKg,
    sampleMassKg,
    alaraBudgetMicroSv,
    anomaly,
    dustTau,
    suitPintKpa,
    stiffnessKThetaNmRad,
    speActive,
    sosActive,
    rover,
    buddyPos,
    repeaters,
    simElapsedSec,
    demo30sActive,
    demo30sSec,
    evaEgressActive,
    evaFinishPromptOpen,
    ridingRover,
    marsTime,
    marsTimeRate,
    tutorialOpen,
  });
  simRef.current = {
    phase,
    simPlaying,
    simSpeed,
    astronautPos,
    headingRad,
    activeRoute,
    grid,
    astronautMassKg,
    sampleMassKg,
    alaraBudgetMicroSv,
    anomaly,
    dustTau,
    suitPintKpa,
    stiffnessKThetaNmRad,
    speActive,
    sosActive,
    rover,
    buddyPos,
    repeaters,
    simElapsedSec,
    demo30sActive,
    demo30sSec,
    evaEgressActive,
    evaFinishPromptOpen,
    ridingRover,
    marsTime,
    marsTimeRate,
    tutorialOpen,
  };

  // Bucle de simulación en tiempo real (20 Hz física / movimiento + 5 Hz Worker Watchdog)
  useEffect(() => {
    const intervalMs = 50; // 20 Hz
    const timer = window.setInterval(() => {
      const s = simRef.current;
      if (s.phase !== 'eva' || !s.grid || s.tutorialOpen) return;

      const DEFAULT_WALK_DISTANCE_MULT = 1.5;
      const realDt = intervalMs / 1000;
      const keys = keysPressedRef.current;
      const forward = keys.has('w') || keys.has('arrowup');
      const backward = keys.has('s') || keys.has('arrowdown');
      const turnLeft = keys.has('a') || keys.has('arrowleft');
      const turnRight = keys.has('d') || keys.has('arrowright');
      // [E] is reserved for sample collection (Recolectar muestra [E]) — do not bind Q/E to strafe
      const manualControl =
        !s.evaEgressActive &&
        !s.evaFinishPromptOpen &&
        (forward || backward || turnLeft || turnRight);

      let nextX = s.astronautPos.x;
      let nextY = s.astronautPos.y;
      let nextHeading = s.headingRad;
      let movedDist = 0;
      let instantSpeedMs = 0;

      const dirFwd = (forward ? 1 : 0) - (backward ? 1 : 0);
      const manualTranslating = manualControl && dirFwd !== 0;

      // Single-source-of-truth simulation timestep: speedMs * simDt === distanceMovedM
      // Scale time warp when translating so physical gait stays ~1.25 m/s in Pandolf-Santee
      const isTranslating =
        !s.evaEgressActive &&
        !s.evaFinishPromptOpen &&
        (manualTranslating ||
          (s.simPlaying &&
            Boolean(s.activeRoute) &&
            !s.activeRoute?.blocked &&
            (s.activeRoute?.points.length ?? 0) > 1));
      const simDt =
        s.evaEgressActive || s.evaFinishPromptOpen
          ? 0
          : manualTranslating
            ? Math.max(
                realDt * s.simSpeed * DEFAULT_WALK_DISTANCE_MULT,
                realDt * (s.ridingRover ? 12.0 : 15.0)
              )
            : s.simPlaying
              ? realDt * s.simSpeed * (isTranslating ? DEFAULT_WALK_DISTANCE_MULT : 1)
              : manualControl
                ? realDt * s.simSpeed
                : 0;

      if (manualControl) {
        const turnRate = s.ridingRover ? 1.55 : 1.85;
        if (turnLeft) nextHeading = normalizeAngle(nextHeading - turnRate * realDt);
        if (turnRight) nextHeading = normalizeAngle(nextHeading + turnRate * realDt);
        if (manualTranslating) {
          instantSpeedMs = s.ridingRover ? 6.5 : 1.25; // Physical Mars gait 1.25 m/s (~295 W) vs Rover 6.5 m/s
          const moveStep = instantSpeedMs * simDt;
          const vx = Math.sin(nextHeading) * dirFwd;
          const vy = Math.cos(nextHeading) * dirFwd;
          const vLen = Math.hypot(vx, vy) || 1;
          nextX = Math.max(-2400, Math.min(2400, nextX + (vx / vLen) * moveStep));
          nextY = Math.max(-2400, Math.min(2400, nextY + (vy / vLen) * moveStep));
          movedDist = moveStep;
        }
      } else if (
        !s.evaEgressActive &&
        !s.evaFinishPromptOpen &&
        s.simPlaying &&
        s.activeRoute &&
        !s.activeRoute.blocked &&
        s.activeRoute.points.length > 1
      ) {
        // Seguir el primer waypoint a >= 14 m
        let wp = s.activeRoute.points[s.activeRoute.points.length - 1];
        for (const pt of s.activeRoute.points) {
          if (Math.hypot(pt.x - nextX, pt.y - nextY) >= 14) {
            wp = pt;
            break;
          }
        }
        const dx = wp.x - nextX;
        const dy = wp.y - nextY;
        const distToWp = Math.hypot(dx, dy);

        if (distToWp > 6) {
          const targetHeading = Math.atan2(dx, dy);
          const diff = normalizeAngle(targetHeading - nextHeading);
          nextHeading = normalizeAngle(nextHeading + Math.max(-0.18, Math.min(0.18, diff)));

          instantSpeedMs = s.ridingRover
            ? s.sosActive || s.speActive
              ? 6.5
              : 5.8
            : s.sosActive || s.speActive
              ? 1.42
              : 1.25;
          const step = Math.min(distToWp, instantSpeedMs * simDt);
          nextX += (dx / distToWp) * step;
          nextY += (dy / distToWp) * step;
          movedDist = step;
        }
      }

      // Behavioral heading-drift reversal tracking (rolling 18 s window)
      const nowMs = Date.now();
      const headingDelta = normalizeAngle(nextHeading - prevHeadingSampleRef.current);
      if (Math.abs(headingDelta) >= 0.08) {
        const turnSign = Math.sign(headingDelta);
        if (prevTurnSignRef.current !== 0 && turnSign !== prevTurnSignRef.current) {
          headingReversalTimesRef.current.push(nowMs);
        }
        prevTurnSignRef.current = turnSign;
        prevHeadingSampleRef.current = nextHeading;
      }
      headingReversalTimesRef.current = headingReversalTimesRef.current.filter(
        (tStamp) => nowMs - tStamp <= 18_000
      );
      headingDriftCountRef.current = headingReversalTimesRef.current.length;

      if (!s.evaEgressActive) {
        const contact = resolveMartianModuleContact(nextX, nextY);
        nextX = contact.x;
        nextY = contact.y;

        if (contact.touching) {
          if (!moduleConfirmDismissedRef.current && !s.evaFinishPromptOpen) {
            keysPressedRef.current.clear();
            setSimPlaying(false);
            setEvaFinishPromptOpen(true);
          }
        } else if (!contact.nearHysteresis) {
          moduleConfirmDismissedRef.current = false;
          if (s.evaFinishPromptOpen) {
            setEvaFinishPromptOpen(false);
          }
        }
      }

      if (movedDist > 0.001 || nextX !== s.astronautPos.x || nextY !== s.astronautPos.y) {
        const actualStep = Math.hypot(nextX - s.astronautPos.x, nextY - s.astronautPos.y);
        setAstronautPos({ x: nextX, y: nextY });
        if (actualStep > 0.001) {
          setDistanceWalkedM((prev) => prev + actualStep);
        }
      }
      if (nextHeading !== s.headingRad) {
        setHeadingRad(nextHeading);
      }
      setCurrentSpeedMs(Math.abs(instantSpeedMs));

      if (simDt > 0) {
        setSimElapsedSec((prev) => prev + simDt);
        simDtAccRef.current += simDt;
      }

      if (!s.evaEgressActive && !s.evaFinishPromptOpen && s.marsTimeRate > 0) {
        const deltaMarsHours = (realDt * s.marsTimeRate) / MARS_HOUR_SI_SECONDS;
        setMarsLmstHours((prev) => wrapMarsHours24(prev + deltaMarsHours));
      }

      // Rover relé UWB móvil:
      // 1) Si vamos subidos (ridingRover), sigue nuestra conducción directa 1:1
      // 2) En ALERTA SOS, nos escolta activamente abriendo camino hacia la Base Modular (POI-01)
      // 3) En operación nominal o llamado [R], acompaña cerca para enlace UWB/abordaje rápido
      const intercept =
        s.sosActive ||
        s.speActive ||
        roverSummonActiveRef.current ||
        s.dustTau > MISSION_CONFIG.thresholds.dustOpacityCriticalTau;

      let nextRoverX = s.rover.x;
      let nextRoverY = s.rover.y;
      let nextRoverHeading = s.rover.headingDeg;

      if (s.ridingRover) {
        nextRoverX = nextX;
        nextRoverY = nextY;
        nextRoverHeading = (nextHeading * 180) / Math.PI;
        roverSummonActiveRef.current = false;
      } else {
        let targetRoverX = nextX;
        let targetRoverY = nextY;
        let escortHeadingDeg = (nextHeading * 180) / Math.PI;

        if (s.sosActive) {
          // Escolta SOS rumbo a la Base Modular (POI-01)
          let guideX = 0;
          let guideY = 0;
          if (
            s.activeRoute &&
            s.activeRoute.targetId === 'POI-01' &&
            s.activeRoute.points.length > 1
          ) {
            const aheadPt = s.activeRoute.points.find(
              (pt) => Math.hypot(pt.x - nextX, pt.y - nextY) >= 10
            );
            if (aheadPt) {
              guideX = aheadPt.x;
              guideY = aheadPt.y;
            }
          }
          const bx = guideX - nextX;
          const by = guideY - nextY;
          const distToGuide = Math.hypot(bx, by);
          const distToBase = Math.hypot(nextX, nextY);

          if (distToBase > 16 && distToGuide > 0.5) {
            const ux = bx / distToGuide;
            const uy = by / distToGuide;
            const px = -uy;
            const py = ux;
            targetRoverX = nextX + ux * 11.5 + px * 3.4;
            targetRoverY = nextY + uy * 11.5 + py * 3.4;
            escortHeadingDeg = (Math.atan2(ux, uy) * 180) / Math.PI;
          } else {
            // En las cercanías del módulo: espera escolta junto a la rampa de acceso
            targetRoverX = 4.4;
            targetRoverY = 15.0;
            escortHeadingDeg = 180;
          }
        } else if (roverSummonActiveRef.current) {
          targetRoverX =
            nextX + Math.sin(nextHeading) * 4.5 + Math.cos(nextHeading) * 3.0;
          targetRoverY =
            nextY + Math.cos(nextHeading) * 4.5 - Math.sin(nextHeading) * 3.0;
        } else {
          const escortFwdDist = intercept ? 7.5 : 10.5;
          const escortRightDist = intercept ? 4.2 : 6.0;
          targetRoverX =
            nextX +
            Math.sin(nextHeading) * escortFwdDist +
            Math.cos(nextHeading) * escortRightDist;
          targetRoverY =
            nextY +
            Math.cos(nextHeading) * escortFwdDist -
            Math.sin(nextHeading) * escortRightDist;
        }

        const rdx = targetRoverX - s.rover.x;
        const rdy = targetRoverY - s.rover.y;
        const rDist = Math.hypot(rdx, rdy);
        if (roverSummonActiveRef.current && Math.hypot(nextX - s.rover.x, nextY - s.rover.y) <= 10) {
          roverSummonActiveRef.current = false;
        }
        if (rDist > 0.6) {
          const roverSpeedMs =
            (s.sosActive ? 28.0 : roverSummonActiveRef.current ? 32.0 : intercept ? 19.0 : 16.5) *
            DEFAULT_WALK_DISTANCE_MULT;
          const rStep = Math.min(rDist, roverSpeedMs * Math.max(realDt, simDt || realDt));
          nextRoverX += (rdx / rDist) * rStep;
          nextRoverY += (rdy / rDist) * rStep;
          if (rDist > 2.2) {
            nextRoverHeading = (Math.atan2(rdx, rdy) * 180) / Math.PI;
          } else {
            nextRoverHeading = escortHeadingDeg;
          }
        } else {
          nextRoverHeading = escortHeadingDeg;
        }
      }

      // Compañero EV2 (mantiene cordón 22–32 m detrás de EV1 a la misma velocidad de marcha)
      const desiredBuddyX = nextX - Math.sin(nextHeading) * 24 - Math.cos(nextHeading) * 9;
      const desiredBuddyY = nextY - Math.cos(nextHeading) * 24 + Math.sin(nextHeading) * 9;
      const bdx = desiredBuddyX - s.buddyPos.x;
      const bdy = desiredBuddyY - s.buddyPos.y;
      const bDist = Math.hypot(bdx, bdy);
      let nextBuddyX = s.buddyPos.x;
      let nextBuddyY = s.buddyPos.y;
      if (bDist > 1.5) {
        const bStep = Math.min(
          bDist,
          14.5 * DEFAULT_WALK_DISTANCE_MULT * Math.max(realDt, simDt || realDt)
        );
        nextBuddyX += (bdx / bDist) * bStep;
        nextBuddyY += (bdy / bDist) * bStep;
        setBuddyPos({ x: nextBuddyX, y: nextBuddyY });
      }

      const node = findNearestNode(s.grid, nextX, nextY);
      const roverCommsOffline = s.anomaly === 'roverFault';
      const posRes = computeHybridPositioning(
        nextX,
        nextY,
        node,
        {
          ...s.rover,
          x: nextRoverX,
          y: nextRoverY,
        },
        s.dustTau,
        s.simElapsedSec,
        {
          grid: s.grid,
          repeaters: s.repeaters,
          roverCommsOffline,
        }
      );

      setRover((prev) => ({
        ...prev,
        x: Number(nextRoverX.toFixed(1)),
        y: Number(nextRoverY.toFixed(1)),
        headingDeg: Number(nextRoverHeading.toFixed(1)),
        uwbSignalDbm: posRes.rfSignalDbm,
        uhfSignalDbm: Number((posRes.rfSignalDbm + 6.5).toFixed(1)),
        interceptMode: intercept,
        batteryPercent: Math.max(
          45,
          Number(
            (
              prev.batteryPercent -
              (s.ridingRover && movedDist > 0.001 ? 0.0025 : 0.0004) * simDt
            ).toFixed(2)
          )
        ),
      }));

      setBreadcrumbs((prev) => appendBreadcrumb(prev, nextX, nextY, node));

      // Demo Pitch 30 s automático para jurado
      if (s.demo30sActive) {
        const nextDemo = s.demo30sSec + realDt;
        setDemo30sSec(nextDemo);
        if (nextDemo >= 6 && nextDemo < 6.1) {
          handleTriggerAnomaly('spe');
        } else if (nextDemo >= 13 && nextDemo < 13.1) {
          handleTriggerAnomaly('dust');
        } else if (nextDemo >= 20 && nextDemo < 20.1) {
          handleTriggerAnomaly('sos');
        } else if (nextDemo >= 28) {
          setDemo30sActive(false);
          setDemo30sSec(0);
          handleTriggerAnomaly('none');
          pushLog(
            'info',
            langRef.current === 'en' ? '30 s Pitch Demo completed.' : 'Demo Pitch 30 s completado.'
          );
        }
      }

      // Enviar tick al Web Worker cada 200 ms reales
      workerTickTimerRef.current += intervalMs;
      if (workerTickTimerRef.current >= 200 && workerReady) {
        const dtTick = simDtAccRef.current;
        simDtAccRef.current = 0;
        workerTickTimerRef.current = 0;

        if (s.anomaly === 'hypercapnia' || s.sosActive) {
          unackAlertSecRef.current += 0.2;
        } else if (s.anomaly === 'none') {
          unackAlertSecRef.current = 0;
        }

        if (s.sosActive || s.speActive || s.anomaly === 'hypercapnia') {
          emotionalStressAccRef.current += 0.25;
          if (emotionalStressAccRef.current >= 1) {
            const drop = Math.floor(emotionalStressAccRef.current);
            emotionalStressAccRef.current -= drop;
            setEmotional((prev) => ({
              ...prev,
              integrityPct: Math.max(18, prev.integrityPct - drop),
              isolationStressPct: Math.min(95, prev.isolationStressPct + drop),
            }));
          }
        } else {
          emotionalStressAccRef.current = 0;
        }

        const forceReset = forceResetWorkerRef.current;
        forceResetWorkerRef.current = false;
        const clearAnomaly = clearAnomalyWorkerRef.current;
        clearAnomalyWorkerRef.current = false;

        sendTick({
          dtSec: forceReset ? 0 : dtTick,
          simElapsedSec: s.simElapsedSec,
          x: nextX,
          y: nextY,
          // Al ir sentado conduciendo el Rover, el esfuerzo metabólico de marcha cae a reposo
          speedMs: s.ridingRover ? 0 : Math.abs(instantSpeedMs),
          slopeDeg: node.slopeDeg,
          astronautMassKg: s.astronautMassKg,
          sampleMassKg: s.sampleMassKg,
          alaraBudgetMicroSv: s.alaraBudgetMicroSv,
          stiffnessKThetaNmRad: s.stiffnessKThetaNmRad,
          suitDeltaPKpa: Math.max(
            0,
            s.suitPintKpa - MISSION_CONFIG.site.surfacePressureKpa
          ),
          anomaly: s.anomaly,
          dustTau: s.dustTau,
          ambientTempC: s.marsTime.ambientTempC,
          speActive: s.speActive,
          sosActive: s.sosActive,
          rover: {
            ...s.rover,
            x: nextRoverX,
            y: nextRoverY,
          },
          buddyX: nextBuddyX,
          buddyY: nextBuddyY,
          headingDriftCount: headingDriftCountRef.current,
          unacknowledgedAlertSec: unackAlertSecRef.current,
          repeaters: s.repeaters,
          roverCommsFault: roverCommsOffline,
          forceReset,
          clearAnomaly,
        });
      }
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [workerReady, sendTick, handleTriggerAnomaly, pushLog]);

  const buddyTelemetry: BuddyTelemetry = useMemo(() => {
    const dist = Math.hypot(buddyPos.x - astronautPos.x, buddyPos.y - astronautPos.y);
    const buddyNode = grid ? findNearestNode(grid, buddyPos.x, buddyPos.y) : null;
    const metab = computePandolfSanteeMarsWatts({
      astronautMassKg: 73,
      sampleMassKg: 1.1,
      speedMs: currentSpeedMs * 0.95,
      slopeDeg: buddyNode?.slopeDeg ?? 2,
      thermalInertiaNorm: buddyNode?.thermalInertiaNorm ?? 0.72,
    });
    let separationAlert: BuddyTelemetry['separationAlert'] = 'ok';
    if (dist > MISSION_CONFIG.thresholds.buddySeparationCriticalMeters) {
      separationAlert = 'critical';
    } else if (dist > MISSION_CONFIG.thresholds.buddySeparationWarnMeters) {
      separationAlert = 'warn';
    }
    return {
      id: 'EV2',
      x: buddyPos.x,
      y: buddyPos.y,
      heartRateBpm: Math.round(
        Math.min(136, Math.max(66, 70 + Math.max(0, metab - 140) * 0.09 + (speActive ? 10 : 0)))
      ),
      o2Percent: Number(Math.max(12, (safetyOutput?.o2Percent ?? 96) + 2.4).toFixed(1)),
      doseRateMicroSvH: buddyNode?.gcrDoseRateMicroSvH ?? 24.5,
      metabolicWatts: metab,
      distanceMeters: Math.round(dist),
      separationAlert,
    };
  }, [buddyPos, astronautPos, grid, currentSpeedMs, speActive, safetyOutput?.o2Percent]);

  const resetEvaSession = useCallback(
    (nextTargetPoiId: string) => {
      setAstronautPos({ x: 0, y: 20 });
      setBuddyPos({ x: -18, y: -12 });
      setRover({
        x: 10,
        y: 31,
        headingDeg: 24,
        batteryPercent: 95,
        uwbSignalDbm: -61,
        uhfSignalDbm: -54,
        interceptMode: false,
      });
      setHeadingRad(0.42);
      setPitchRad(-0.08);
      setAnomaly('none');
      setCustomDustTau(0.65);
      setMarsSolNumber(198);
      setMarsSolarLonLsDeg(95);
      setMarsLmstHours(10.8);
      setMarsTimeRate(12);
      setSuitPintKpa(29.6);
      setSimElapsedSec(0);
      setDistanceWalkedM(0);
      setSampleMassKg(0);
      setCachedMassKg(0);
      setCacheNode(null);
      setRepeaters([]);
      setHeadMotionFreeze(false);
      setPlssBackupSwitched(false);
      setContourLinesEnabled(false);
      lockedNominalRouteRef.current = null;
      lockedEmergencyRouteRef.current = null;
      setCapturedAnomalies([]);
      setDismissedWazeIds(new Set());
      setBreadcrumbs([]);
      setDemo30sActive(false);
      setDemo30sSec(0);
      setReachedPlannedPoi(false);
      setDustEncountered(false);
      setSpeEncountered(false);
      setSosEncountered(false);
      const resolvedId = nextTargetPoiId === 'POI-01' ? 'POI-02' : nextTargetPoiId;
      setTargetPoiId(resolvedId);
      const targetPoiObj = pois.find((p) => p.id === resolvedId);
      let initialYaw = targetPoiObj ? Math.atan2(targetPoiObj.x, targetPoiObj.y - 20) : 0.42;
      if (grid && targetPoiObj) {
        const preRoute = findDirectionalRoute(grid, { x: 0, y: 20 }, targetPoiObj, {
          speActive: false,
          sosEmergency: false,
          astronautMassKg,
          sampleMassKg: 0,
          speedMs: PHYS_GAIT_NOMINAL_MS,
          stiffnessKThetaNmRad,
          suitDeltaPKpa,
          targetId: targetPoiObj.id,
          targetLabel: targetPoiObj.name,
        });
        if (!preRoute.blocked && preRoute.points.length >= 2) {
          const wp = preRoute.points[Math.min(2, preRoute.points.length - 1)];
          initialYaw = Math.atan2(wp.x - 0, wp.y - 20);
        }
      }
      setHeadingRad(initialYaw);
      setSimPlaying(false);
      setRidingRover(false);
      roverSummonActiveRef.current = false;
      setEvaFinishPromptOpen(false);
      moduleConfirmDismissedRef.current = false;
      setEvaEgressRunId((n) => n + 1);
      setEvaEgressActive(true);
      forceResetWorkerRef.current = true;
      unackAlertSecRef.current = 0;
      headingDriftCountRef.current = 0;
      headingReversalTimesRef.current = [];
      prevTurnSignRef.current = 0;
      prevHeadingSampleRef.current = initialYaw;
      simDtAccRef.current = 0;
      const targetName = targetPoiObj ? getPoiCopy(targetPoiObj, lang).compactPreEva : resolvedId;
      pushLog(
        'info',
        t(
          `Free EVA launched from Ares Base toward ${targetName}.`,
          `EVA libre iniciada desde Base Ares rumbo a ${targetName}.`
        ),
        0
      );
    },
    [pushLog, pois, lang, t, grid, astronautMassKg, stiffnessKThetaNmRad, suitDeltaPKpa]
  );

  const handleSelectHabitatSection = useCallback((target: HabitatJumpTarget) => {
    if (target === 'gym' || target === 'galley') {
      setPhysicalDivision(target);
      setHabitatSection('physical');
      setHabitatSceneIdx(target === 'gym' ? 1 : 2);
      return;
    }
    setHabitatSection(target);
    if (target === 'pre-eva') setHabitatSceneIdx(0);
    else if (target === 'physical') setHabitatSceneIdx(1);
    else if (target === 'emotional') setHabitatSceneIdx(2);
  }, []);

  const handleConfirmEgressFromPrefs = useCallback(() => {
    setPreEgressModalOpen(false);
    const destPoi = pois.find((p) => p.id === selectedPoiId);
    setPlannedMission({
      poiId: selectedPoiId,
      poiName: destPoi ? getPoiCopy(destPoi, lang).compactPreEva : selectedPoiId,
      distanceM: Math.round(plannedRoute?.distanceMeters ?? 980),
      doseMicroSv: Number((plannedRoute?.radiationDoseMicroSv ?? 6.4).toFixed(2)),
    });
    resetEvaSession(selectedPoiId);
    if (spePreview) {
      setAnomaly('spe');
      setSpeEncountered(true);
      setSosEncountered(true);
      const basePoi = pois.find((p) => p.id === 'POI-01') ?? { x: 0, y: 0 };
      setHeadingRad(Math.atan2(basePoi.x, basePoi.y - 20));
    }
    setPhase('eva');
  }, [resetEvaSession, selectedPoiId, pois, plannedRoute, spePreview, lang]);

  const handleLaunchEva = useCallback(() => {
    setPreEgressModalOpen(true);
  }, []);

  const handleStartDemo30s = useCallback(() => {
    resetEvaSession('POI-02');
    setEvaEgressActive(false);
    setSimPlaying(true);
    setSimSpeed(6);
    setDemo30sSec(0);
    setDemo30sActive(true);
    pushLog(
      'info',
      t(
        '30 s Pitch Demo started: Nominal -> SPE -> Dust -> SOS.',
        'Demo Pitch 30 s iniciado: Nominal -> SPE -> Polvo -> SOS.'
      )
    );
  }, [resetEvaSession, pushLog, t]);

  const nearbySamplePoi = useMemo(() => {
    if (
      cacheNode &&
      cachedMassKg > 0.05 &&
      Math.hypot(cacheNode.x - astronautPos.x, cacheNode.y - astronautPos.y) <= 45
    ) {
      return cacheNode;
    }
    return (
      pois.find(
        (p) =>
          (p.kind === 'science' || (p.sampleRewardKg ?? 0) > 0) &&
          Math.hypot(p.x - astronautPos.x, p.y - astronautPos.y) <=
            (p.cosparZone ? 265 : 75)
      ) ?? null
    );
  }, [pois, astronautPos.x, astronautPos.y, cacheNode, cachedMassKg]);

  const handleCollectNearbySample = useCallback(
    (bypassProximityArg: boolean | unknown = false) => {
      const bypassProximity = bypassProximityArg === true;
      if (phase !== 'eva' || evaEgressActive || evaFinishPromptOpen) return;

      const nearOutcrop = Boolean(nearbySamplePoi);
      const baseStepKg = nearOutcrop || bypassProximity ? 0.85 : 0.45;
      const headroomKg = Math.max(0, MISSION_CONFIG.suit.maxSampleMassKg - sampleMassKg);

      if (headroomKg <= 0.02) {
        pushLog(
          'warn',
          t(
            'Structural cap 7.00 kg (26.06 N on Arcadia) reached. Stash excess at POI-CACHE.',
            'Tope estructural 7,00 kg (26,06 N en Arcadia) alcanzado. Descarta exceso en POI-CACHE.'
          )
        );
        window.dispatchEvent(
          new CustomEvent('ares-sample-pickup', {
            detail: { deltaKg: 0, nextMassKg: sampleMassKg, source: 'FULL', full: true },
          })
        );
        return;
      }

      const recoveringCache =
        !bypassProximity && nearbySamplePoi?.id === 'POI-CACHE' && cachedMassKg > 0.05;
      const deltaKg = recoveringCache
        ? Math.min(headroomKg, Math.min(baseStepKg, cachedMassKg))
        : Number(Math.min(headroomKg, baseStepKg).toFixed(2));
      if (deltaKg <= 0.01) return;

      const nextMass = Number((sampleMassKg + deltaKg).toFixed(2));
      setSampleMassKg(nextMass);
      const { weightN } = computeArcadiaWeight(nextMass);
      const sourceLabel = recoveringCache
        ? 'POI-CACHE'
        : nearOutcrop
          ? nearbySamplePoi!.id
          : t('Arcadia Basalt Core', 'Testigo Basalto Arcadia');

      window.dispatchEvent(
        new CustomEvent('ares-sample-pickup', {
          detail: {
            deltaKg,
            nextMassKg: nextMass,
            source: sourceLabel,
            isOutcrop: nearOutcrop,
            full: false,
          },
        })
      );

      if (recoveringCache) {
        const remainingCache = Number(Math.max(0, cachedMassKg - deltaKg).toFixed(2));
        setCachedMassKg(remainingCache);
        if (remainingCache <= 0.05) {
          setCacheNode(null);
        } else if (cacheNode) {
          setCacheNode({ ...cacheNode, name: `POI-CACHE (${remainingCache.toFixed(2)} kg)` });
        }
        pushLog(
          'science',
          t(
            `Recovered +${deltaKg.toFixed(2)} kg from POI-CACHE (${nextMass.toFixed(2)} kg / ${weightN} N in suit).`,
            `Recuperados +${deltaKg.toFixed(2)} kg desde POI-CACHE (${nextMass.toFixed(2)} kg / ${weightN} N en traje).`
          )
        );
        return;
      }

      pushLog(
        'science',
        t(
          `Sample collected (${sourceLabel}): +${deltaKg.toFixed(2)} kg -> ${nextMass.toFixed(2)} kg (${weightN} N).`,
          `Muestra recolectada (${sourceLabel}): +${deltaKg.toFixed(2)} kg -> ${nextMass.toFixed(2)} kg (${weightN} N).`
        )
      );

      // Si el Circuito Óptimo Multi-POI está activo, avanzar automáticamente al siguiente destino de la secuencia
      if (circuitModeEnabled && circuitPlan && circuitPlan.orderedPoiIds.length > 0 && nearOutcrop) {
        const idx = circuitPlan.orderedPoiIds.indexOf(targetPoiId);
        if (idx !== -1) {
          const nextPoiId =
            idx + 1 < circuitPlan.orderedPoiIds.length
              ? circuitPlan.orderedPoiIds[idx + 1]
              : 'POI-01';
          setTargetPoiId(nextPoiId);
          const nextPoiObj = pois.find((p) => p.id === nextPoiId);
          if (nextPoiObj) {
            setHeadingRad(Math.atan2(nextPoiObj.x - astronautPos.x, nextPoiObj.y - astronautPos.y));
          }
          speakAresCallout(
            nextPoiId === 'POI-01'
              ? t(
                  'Circuit sampling complete. Routing back to Modular Base POI 01.',
                  'Muestreo de circuito completado. Trazando retorno a Base Modular POI 01.'
                )
              : t(
                  `Sample secured. Advancing circuit to ${nextPoiId}.`,
                  `Muestra asegurada. Avanzando circuito hacia ${nextPoiId}.`
                ),
            lang,
            { key: `circuit-${nextPoiId}`, priority: 'normal', muted: voiceCalloutsMuted }
          );
          pushLog(
            'science',
            t(
              `Multi-POI Circuit auto-advance: next destination locked -> ${nextPoiId}.`,
              `Avance automático Circuito Multi-POI: siguiente destino fijado -> ${nextPoiId}.`
            )
          );
        }
      }
    },
    [
      phase,
      evaEgressActive,
      evaFinishPromptOpen,
      nearbySamplePoi,
      sampleMassKg,
      cachedMassKg,
      cacheNode,
      circuitModeEnabled,
      circuitPlan,
      targetPoiId,
      pois,
      astronautPos.x,
      astronautPos.y,
      lang,
      voiceCalloutsMuted,
      pushLog,
      t,
    ]
  );

  const handleDeployRepeater = useCallback(() => {
    if (phase !== 'eva') return;
    if (repeaters.length >= 3) {
      pushLog(
        'warn',
        t(
          'All 3 belt UWB/UHF micro-repeaters are already deployed.',
          'Los 3 microrrepetidores UWB/UHF de cinturón ya están desplegados.'
        )
      );
      return;
    }
    if (
      repeaters.some(
        (r) => Math.hypot(r.x - astronautPos.x, r.y - astronautPos.y) < 25
      )
    ) {
      pushLog(
        'info',
        t(
          'Micro-repeater already active within 25 m.',
          'Ya hay un microrrepetidor activo a menos de 25 m.'
        )
      );
      return;
    }
    const newRep: DeployableRepeater = {
      id: `REP-${repeaters.length + 1}`,
      x: Math.round(astronautPos.x),
      y: Math.round(astronautPos.y),
      elevationM: Number((currentNode?.elevationM ?? -3005).toFixed(2)),
      deployedAtSec: Math.round(simElapsedSec),
      batteryPct: 100,
      relayGainDb: 5.5,
    };
    setRepeaters((prev) => [...prev, newRep]);
    speakAresCallout(
      t(
        `Micro-repeater ${newRep.id} deployed. UWB Fresnel link restored.`,
        `Microrrepetidor ${newRep.id} desplegado. Enlace Fresnel UWB reforzado.`
      ),
      lang,
      { key: `rep-${newRep.id}`, priority: 'normal', muted: voiceCalloutsMuted }
    );
    pushLog(
      'info',
      t(
        `Micro-repeater ${newRep.id} deployed at (${newRep.x}, ${newRep.y}) m (+5.5 dB relay).`,
        `Microrrepetidor ${newRep.id} desplegado en (${newRep.x}, ${newRep.y}) m (+5,5 dB relé).`
      )
    );
  }, [phase, repeaters, astronautPos.x, astronautPos.y, currentNode, simElapsedSec, lang, voiceCalloutsMuted, pushLog, t]);

  const handleSwitchPlssBackup = useCallback(() => {
    switchPlssBackupLoop();
    setPlssBackupSwitched(true);
    unackAlertSecRef.current = 0;
    if (anomaly === 'hypercapnia') {
      setAnomaly('none');
    }
    speakAresCallout(
      t(
        'CU-06 backup LiOH scrubber loop engaged. CO2 levels normalizing.',
        'Circuito secundario LiOH CU-06 acoplado. Niveles de CO2 normalizándose.'
      ),
      lang,
      { key: 'plss-backup', priority: 'normal', muted: voiceCalloutsMuted }
    );
    pushLog(
      'info',
      t(
        'CU-06 Backup PLSS LiOH loop engaged: secondary CO₂ scrubber active.',
        'PLSS Secundario LiOH acoplado (CU-06): depurador de CO₂ de respaldo activo.'
      )
    );
  }, [switchPlssBackupLoop, anomaly, lang, voiceCalloutsMuted, pushLog, t]);

  const handleExportGeoJson = useCallback(() => {
    const collection = buildMarsMissionGeoJson({
      grid,
      pois,
      customPoiIds,
      plannedRoute: phase === 'eva' ? activeRoute : plannedRoute,
      circuitPlan: circuitModeEnabled ? circuitPlan : null,
      anomaliesCaptured: capturedAnomalies,
      astronautPos,
    });
    downloadMarsMissionGeoJson(collection, `ares-arcadia-${phase}`);
    pushLog(
      'info',
      t(
        `Planetary GeoJSON (IAU 2000 Mars) exported (${collection.features.length} GIS features).`,
        `GeoJSON Planetario (Marte IAU 2000) exportado (${collection.features.length} entidades SIG).`
      )
    );
  }, [
    grid,
    pois,
    customPoiIds,
    phase,
    activeRoute,
    plannedRoute,
    circuitModeEnabled,
    circuitPlan,
    capturedAnomalies,
    astronautPos,
    pushLog,
    t,
  ]);

  const handleDropSamples = useCallback(() => {
    if (sampleMassKg <= 0.05) return;
    const dropped = sampleMassKg;
    setCachedMassKg((prev) => Number((prev + dropped).toFixed(2)));
    setSampleMassKg(0);
    const marker: PoiStation = {
      id: 'POI-CACHE',
      name: `POI-CACHE (${dropped.toFixed(2)} kg)`,
      x: Math.round(astronautPos.x),
      y: Math.round(astronautPos.y),
      unit: currentNode?.unit ?? 'Aa5',
      objective: t(
        'Recoverable geological core cache marked by passive beacon.',
        'Caché recuperable de testigos geológicos marcada por baliza pasiva.'
      ),
      iceDepthLabel: currentNode ? `${currentNode.iceDepthM} m` : 'N/A',
      riskAndRestriction: t(
        'Scheduled recovery on next EVA / cargo rover.',
        'Recuperación programada en próxima EVA / rover de carga.'
      ),
      kind: 'cache',
    };
    setCacheNode(marker);
    pushLog(
      'warn',
      t(
        `POI-CACHE deployed at (${marker.x}, ${marker.y}) m with ${dropped.toFixed(2)} kg cached.`,
        `POI-CACHE generado en (${marker.x}, ${marker.y}) m con ${dropped.toFixed(2)} kg liberados.`
      )
    );
  }, [sampleMassKg, astronautPos.x, astronautPos.y, currentNode, pushLog, t]);

  const canEnterAirlock = useMemo(() => {
    return distanceWalkedM > 60 && Math.hypot(astronautPos.x, astronautPos.y) <= 65;
  }, [distanceWalkedM, astronautPos.x, astronautPos.y]);

  useEffect(() => {
    if (phase !== 'eva' || reachedPlannedPoi) return;
    const targetPoi = pois.find((p) => p.id === plannedMission.poiId);
    if (!targetPoi) return;
    const arrivalRadiusM = targetPoi.cosparZone ? 265 : 55;
    if (Math.hypot(targetPoi.x - astronautPos.x, targetPoi.y - astronautPos.y) <= arrivalRadiusM) {
      setReachedPlannedPoi(true);
      const targetName = getPoiCopy(targetPoi, lang).compactPreEva;
      pushLog(
        'science',
        t(
          `Pre-EVA planned objective reached: ${targetName}.`,
          `Objetivo planificado en Pre-EVA alcanzado: ${targetName}.`
        )
      );
    }
  }, [phase, reachedPlannedPoi, pois, plannedMission.poiId, astronautPos.x, astronautPos.y, pushLog, lang, t]);

  const canBoardRover = useMemo(() => {
    return (
      !evaEgressActive &&
      !evaFinishPromptOpen &&
      Math.hypot(rover.x - astronautPos.x, rover.y - astronautPos.y) <= 32
    );
  }, [evaEgressActive, evaFinishPromptOpen, rover.x, rover.y, astronautPos.x, astronautPos.y]);

  const handleToggleRideRover = useCallback(() => {
    if (phase !== 'eva' || evaEgressActive || evaFinishPromptOpen) return;
    if (ridingRover) {
      const stepOutX = astronautPos.x - Math.cos(headingRad) * 2.2;
      const stepOutY = astronautPos.y + Math.sin(headingRad) * 2.2;
      const safeOut = resolveMartianModuleContact(stepOutX, stepOutY);
      setAstronautPos({ x: safeOut.x, y: safeOut.y });
      setRidingRover(false);
      pushLog('info', t('Dismounted Escort Rover - Perseverance.', 'Descendiste del Rover Escolta - Perseverance.'));
      return;
    }

    const dist = Math.hypot(rover.x - astronautPos.x, rover.y - astronautPos.y);
    if (dist <= 32) {
      const boardedPos = resolveMartianModuleContact(rover.x, rover.y);
      setAstronautPos({ x: boardedPos.x, y: boardedPos.y });
      setRidingRover(true);
      pushLog(
        'info',
        t(
          'Boarded Escort Rover - Perseverance · High-speed POI traverse (3.5×) active. Press [R] to exit.',
          'Subiste al Rover Escolta - Perseverance · Conducción rápida hacia POIs (3,5×) activa. [R] para bajar.'
        )
      );
    } else {
      roverSummonActiveRef.current = true;
      pushLog(
        'info',
        t(
          'Summoning Escort Rover - Perseverance to your coordinates...',
          'Llamando al Rover Escolta - Perseverance hacia tus coordenadas...'
        )
      );
    }
  }, [
    phase,
    evaEgressActive,
    evaFinishPromptOpen,
    ridingRover,
    astronautPos.x,
    astronautPos.y,
    headingRad,
    rover.x,
    rover.y,
    pushLog,
    t,
  ]);

  const handleConfirmFinishEva = useCallback(() => {
    moduleConfirmDismissedRef.current = false;
    setEvaFinishPromptOpen(false);
    setEvaEgressActive(false);
    setRidingRover(false);
    setSimPlaying(false);
    keysPressedRef.current.clear();
    setPhase('post-eva');
  }, []);

  const handleDismissFinishEva = useCallback(() => {
    moduleConfirmDismissedRef.current = true;
    setEvaFinishPromptOpen(false);
    keysPressedRef.current.clear();
  }, []);

  useEffect(() => {
    if (phase !== 'eva') {
      setEvaFinishPromptOpen(false);
      setRidingRover(false);
      roverSummonActiveRef.current = false;
      moduleConfirmDismissedRef.current = false;
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== 'eva' || !evaFinishPromptOpen) return;
    const onPromptKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'Enter' && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        handleConfirmFinishEva();
      } else if (e.key === 'Escape' && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        handleDismissFinishEva();
      }
    };
    window.addEventListener('keydown', onPromptKey, true);
    return () => window.removeEventListener('keydown', onPromptKey, true);
  }, [phase, evaFinishPromptOpen, handleConfirmFinishEva, handleDismissFinishEva]);

  const handleSyncTutorialStage = useCallback(
    (stage: { phase: MissionPhase; habitatSection?: HabitatInteriorSectionId }) => {
      setEvaEgressActive(false);
      setEvaFinishPromptOpen(false);
      setPreEgressModalOpen(false);
      setPhase(stage.phase);
      if (stage.habitatSection) {
        setHabitatSection(stage.habitatSection);
      }
    },
    []
  );

  const handleDismissTutorial = useCallback(() => {
    setTutorialOpen(false);
    setEvaEgressActive(false);
    setEvaFinishPromptOpen(false);
    setPreEgressModalOpen(false);
    setPhase('pre-eva');
    setHabitatSection('pre-eva');
  }, []);

  // Atajo oculto de controles con la tecla [H] (sin presencia visual en HUD hasta presionarla)
  useEffect(() => {
    const onToggleControlsKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'SELECT' ||
        tag === 'TEXTAREA' ||
        target?.isContentEditable
      ) {
        return;
      }
      if (e.code === 'KeyH' || e.key.toLowerCase() === 'h') {
        e.preventDefault();
        e.stopPropagation();
        keysPressedRef.current.clear();
        setControlsOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onToggleControlsKey);
    return () => window.removeEventListener('keydown', onToggleControlsKey);
  }, []);

  useEffect(() => {
    const onShortcut = (e: KeyboardEvent) => {
      if (phase !== 'eva' || evaFinishPromptOpen || tutorialOpen || controlsOpen) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (k === 'f' && !e.repeat) {
        handleCollectNearbySample(false);
      } else if (k === 'u' && !e.repeat) {
        handleDeployRepeater();
      } else if (k === 'l' && !e.repeat) {
        handleSwitchPlssBackup();
      } else if (k === 'g' && canEnterAirlock && !e.repeat) {
        handleConfirmFinishEva();
      } else if (k === 'r' && !e.repeat) {
        handleToggleRideRover();
      }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, [
    phase,
    evaFinishPromptOpen,
    tutorialOpen,
    controlsOpen,
    nearbySamplePoi,
    canEnterAirlock,
    handleCollectNearbySample,
    handleDeployRepeater,
    handleSwitchPlssBackup,
    handleConfirmFinishEva,
    handleToggleRideRover,
  ]);

  const postEvaReport: PostEvaReport = useMemo(() => {
    const matchedPoi = pois.find((p) => p.id === plannedMission.poiId);
    const localizedPlannedPoiName = matchedPoi
      ? getPoiCopy(matchedPoi, lang).name
      : plannedMission.poiName;
    return {
      durationMin: Math.max(1.2, Number((simElapsedSec / 60).toFixed(1))),
      distanceWalkedM: Math.round(distanceWalkedM),
      plannedPoiId: plannedMission.poiId,
      plannedPoiName: localizedPlannedPoiName,
      reachedPlannedPoi,
      plannedDistanceM: plannedMission.distanceM,
      plannedDoseMicroSv: plannedMission.doseMicroSv,
      totalDoseMicroSv: Number((safetyOutput?.accumulatedDoseMicroSv ?? 1.2).toFixed(2)),
      alaraBudgetMicroSv,
      samplesCollectedKg: Number(sampleMassKg.toFixed(2)),
      samplesCachedKg: Number(cachedMassKg.toFixed(2)),
      cacheNode,
      anomaliesCaptured: capturedAnomalies,
      dustStormEncountered: dustEncountered,
      speEncountered: speEncountered,
      sosTriggered: sosEncountered,
      airlockDustRemovedPct: dustEncountered ? 99.2 : 99.6,
      perchlorateCheckPassed: true,
      repressurizedKpa: 101.3,
      datasetSynced: true,
      repeatersDeployedCount: repeaters.length,
      plssBackupSwitched,
      musculoskeletalIndexPct: musculoskeletal.indexPct,
      emotionalIntegrityPct: emotional.integrityPct,
      dailyExerciseMin: musculoskeletal.dailyExerciseMin,
      earthSupplyDaysRemaining: supplies.earthSupplyDaysRemaining,
      isruAutonomyGainDays: supplies.isruAutonomyGainDays,
      hudMode,
    };
  }, [
    pois,
    lang,
    simElapsedSec,
    distanceWalkedM,
    plannedMission,
    reachedPlannedPoi,
    safetyOutput?.accumulatedDoseMicroSv,
    alaraBudgetMicroSv,
    sampleMassKg,
    cachedMassKg,
    cacheNode,
    capturedAnomalies,
    dustEncountered,
    speEncountered,
    sosEncountered,
    repeaters.length,
    plssBackupSwitched,
    musculoskeletal.indexPct,
    emotional.integrityPct,
    musculoskeletal.dailyExerciseMin,
    supplies.earthSupplyDaysRemaining,
    supplies.isruAutonomyGainDays,
    hudMode,
  ]);

  if (loadError) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 p-6 text-rose-300">
        <div className="max-w-md rounded-2xl border border-rose-500/40 bg-rose-950/30 p-5 text-sm">
          <div className="font-bold">
            {t(
              'Error loading Arcadia Planitia telemetry',
              'Error cargando telemetría de Arcadia Planitia'
            )}
          </div>
          <div className="mt-2 font-mono text-xs text-rose-200">{loadError}</div>
        </div>
      </div>
    );
  }

  if (!grid || pois.length === 0) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-slate-950 text-slate-200">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
        <div className="font-mono text-xs uppercase tracking-widest text-cyan-300">
          {t(
            `Initializing Ares Arcadia · 47.55° N, -163.17° ${lonDir(lang)} · MRO CTX / MOLA DTM...`,
            `Inicializando Ares Arcadia · 47.55° N, -163.17° ${lonDir(lang)} · DTM MRO CTX / MOLA...`
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#04070d] text-[#f4efe6]">
      {/* Barra superior óptica AR minimalista con selector de etapa siempre centrado */}
      <header className="relative z-20 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-slate-950/75 px-3 py-1.5 backdrop-blur-xl md:grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
        <div className="flex min-w-0 items-center gap-2 md:justify-self-start">
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="text-xs font-semibold tracking-[0.12em] text-white">
              ARES ARCADIA
            </span>
            {/* Estrella Cardinal Norte · Sur · Este · Oeste */}
            <div
              title={`${t('Cardinal Compass Star (N·S·E·W)', 'Estrella Cardinal (N·S·E·O)')} · ${activeZone.centerLatDeg.toFixed(2)}° N · ${activeZone.centerLonWestDeg.toFixed(2)}° ${lonDir(lang)}`}
              className="flex items-center gap-1.5 rounded-full border border-[#38e8ff]/35 bg-white/[0.04] px-2 py-0.5"
            >
              <svg
                viewBox="0 0 64 64"
                className="h-6 w-6 shrink-0"
                role="img"
                aria-label={t('Compass star N S E W', 'Estrella cardinal N S E O')}
              >
                <circle
                  cx="32"
                  cy="32"
                  r="19"
                  fill="none"
                  stroke="rgba(56,232,255,0.28)"
                  strokeWidth="1.2"
                />
                {/* Puntas intercardinales */}
                <polygon
                  points="32,32 28,28 21,21 28,26"
                  fill="rgba(226,232,240,0.45)"
                />
                <polygon
                  points="32,32 36,28 43,21 34,26"
                  fill="rgba(226,232,240,0.45)"
                />
                <polygon
                  points="32,32 36,36 43,43 34,38"
                  fill="rgba(226,232,240,0.45)"
                />
                <polygon
                  points="32,32 28,36 21,43 28,38"
                  fill="rgba(226,232,240,0.45)"
                />
                {/* Estrella 4 puntas cardinales: Norte resaltado en cian */}
                <polygon points="32,12 36,28 32,32 28,28" fill="#38e8ff" />
                <polygon points="32,52 36,36 32,32 28,36" fill="#cbd5e1" fillOpacity="0.8" />
                <polygon points="52,32 36,36 32,32 36,28" fill="#cbd5e1" fillOpacity="0.8" />
                <polygon points="12,32 28,36 32,32 28,28" fill="#cbd5e1" fillOpacity="0.8" />
                <circle cx="32" cy="32" r="2.2" fill="#04070d" stroke="#38e8ff" strokeWidth="1.3" />
                {/* Etiquetas N · S · E · O/W */}
                <text
                  x="32"
                  y="9.5"
                  textAnchor="middle"
                  fill="#38e8ff"
                  fontSize="9.5"
                  fontWeight="700"
                  fontFamily="ui-monospace, monospace"
                >
                  N
                </text>
                <text
                  x="32"
                  y="62"
                  textAnchor="middle"
                  fill="#e2e8f0"
                  fontSize="8.5"
                  fontWeight="700"
                  fontFamily="ui-monospace, monospace"
                >
                  S
                </text>
                <text
                  x="58"
                  y="35"
                  textAnchor="middle"
                  fill="#e2e8f0"
                  fontSize="8.5"
                  fontWeight="700"
                  fontFamily="ui-monospace, monospace"
                >
                  E
                </text>
                <text
                  x="6"
                  y="35"
                  textAnchor="middle"
                  fill="#e2e8f0"
                  fontSize="8.5"
                  fontWeight="700"
                  fontFamily="ui-monospace, monospace"
                >
                  {lang === 'en' ? 'W' : 'O'}
                </text>
              </svg>
              <span className="hidden font-mono text-[9.5px] font-semibold tracking-wider text-[#38e8ff] xl:inline">
                {lang === 'en' ? 'N·S·E·W' : 'N·S·E·O'}
              </span>
            </div>
          </div>
        </div>

        {/* Selector de Etapa — siempre anclado exactamente al centro en todas las etapas */}
        <nav
          data-tour="stage-nav"
          className="flex items-center gap-1 rounded-full border border-white/12 bg-white/[0.04] p-0.5 text-[10px] whitespace-nowrap md:justify-self-center"
        >
          <button
            type="button"
            onClick={() => {
              setEvaEgressActive(false);
              setPhase('pre-eva');
            }}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 font-medium tracking-wide transition ${
              phase === 'pre-eva'
                ? 'bg-[#38e8ff] font-semibold text-slate-950 shadow-[0_0_12px_rgba(56,232,255,0.35)]'
                : 'text-white/70 hover:text-white'
            }`}
          >
            <Layers className="h-3 w-3" />
            <span>
              <span className="hidden xl:inline">{t('Planning · ', 'Planificación · ')}</span>
              Pre-EVA
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (phase === 'pre-eva' && Math.hypot(astronautPos.x, astronautPos.y) <= 45) {
                setPreEgressModalOpen(true);
                return;
              }
              if (phase !== 'eva') {
                const resolvedId = selectedPoiId === 'POI-01' ? 'POI-02' : selectedPoiId;
                setTargetPoiId(resolvedId);
                const destPoi = pois.find((p) => p.id === resolvedId);
                if (destPoi && plannedRoute) {
                  setPlannedMission({
                    poiId: resolvedId,
                    poiName: getPoiCopy(destPoi, lang).compactPreEva,
                    distanceM: Math.round(plannedRoute.distanceMeters),
                    doseMicroSv: Number(plannedRoute.radiationDoseMicroSv.toFixed(2)),
                  });
                }
              }
              if (phase === 'pre-eva') {
                setContourLinesEnabled(false);
              }
              if (phase !== 'eva' && Math.hypot(astronautPos.x, astronautPos.y) <= 45) {
                setEvaEgressRunId((n) => n + 1);
                setEvaEgressActive(true);
              }
              if (spePreview) {
                setAnomaly('spe');
                setSpeEncountered(true);
                setSosEncountered(true);
                const shelterPoi = pois.find((p) => p.id === 'POI-05');
                const navPoi =
                  shelterPoi && Math.hypot(astronautPos.x, astronautPos.y) > 350
                    ? shelterPoi
                    : (pois.find((p) => p.id === 'POI-01') ?? { x: 0, y: 0 });
                setHeadingRad(
                  Math.atan2(navPoi.x - astronautPos.x, navPoi.y - astronautPos.y)
                );
              }
              setPhase('eva');
            }}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-medium tracking-wide transition ${
              phase === 'eva'
                ? 'bg-[#38e8ff] font-semibold text-slate-950 shadow-[0_0_12px_rgba(56,232,255,0.35)]'
                : 'text-white/70 hover:text-white'
            }`}
          >
            <Activity className="h-3 w-3" />
            <span>
              <span className="hidden xl:inline">{t('Exploration · ', 'Exploración · ')}</span>
              EVA
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setEvaEgressActive(false);
              setPhase('post-eva');
            }}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-medium tracking-wide transition ${
              phase === 'post-eva'
                ? 'bg-[#38e8ff] font-semibold text-slate-950 shadow-[0_0_12px_rgba(56,232,255,0.35)]'
                : 'text-white/70 hover:text-white'
            }`}
          >
            <ShieldCheck className="h-3 w-3" />
            <span>
              <span className="hidden xl:inline">{t('Evaluation · ', 'Evaluación · ')}</span>
              Post-EVA
            </span>
          </button>
        </nav>

        {/* Controles rápidos de clima, telemetría e idioma (EN | ES) */}
        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap text-[10px] md:justify-self-end">
          {phase === 'eva' && (
            <>
              {sosActive && (
                <button
                  type="button"
                  onClick={() => handleTriggerAnomaly('none')}
                  className="rounded-full border border-[#ff3b5c] bg-[#ff2a4b] px-2.5 py-1 font-semibold tracking-wide text-white shadow-[0_0_12px_#ff2a4b] transition hover:bg-rose-500"
                >
                  {t('✕ Clear SOS', '✕ Desactivar SOS')}
                </button>
              )}
              <button
                type="button"
                onClick={() => handleTriggerAnomaly(speActive ? 'none' : 'spe')}
                className={`rounded-full border px-2 py-1 font-medium tracking-wide transition ${
                  speActive
                    ? 'border-[#ff2a4b] bg-[#ff2a4b] font-semibold text-white shadow-[0_0_12px_#ff2a4b]'
                    : 'border-amber-400/45 bg-amber-400/12 text-amber-300 hover:bg-amber-400/22'
                }`}
              >
                {speActive
                  ? t('☀ Clear SPE', '☀ Quitar SPE')
                  : t('☀ Solar SPE', '☀ Tormenta')}
              </button>
              <button
                type="button"
                onClick={() => handleTriggerAnomaly(anomaly === 'dust' ? 'none' : 'dust')}
                className={`hidden rounded-full border px-2.5 py-1 font-medium tracking-wide transition 2xl:inline-block ${
                  anomaly === 'dust'
                    ? 'border-[#ff2a4b] bg-[#ff2a4b] font-semibold text-white shadow-[0_0_12px_#ff2a4b]'
                    : 'border-white/15 bg-white/5 text-white/80 hover:border-amber-400/50'
                }`}
              >
                {anomaly === 'dust'
                  ? t('🌪 Dust · Clear', '🌪 Arena · Quitar')
                  : t('🌪 Dust τ>2.5', '🌪 Arena τ>2.5')}
              </button>
              <button
                type="button"
                onClick={() => setSandboxOpen((v) => !v)}
                className={`rounded-full border px-2.5 py-1 font-medium tracking-wide transition ${
                  sandboxOpen
                    ? 'border-amber-400 bg-amber-400 font-semibold text-slate-950'
                    : 'border-white/15 bg-white/5 text-white/75 hover:border-white/35'
                }`}
              >
                {t('Events', 'Eventos')}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setVoiceCalloutsMuted((v) => !v)}
            title={t(
              'Toggle NASA-STD-3001 offline voice callouts',
              'Alternar avisos vocales offline NASA-STD-3001'
            )}
            className={`flex items-center gap-1 rounded-full border px-2 py-1 font-medium transition ${
              voiceCalloutsMuted
                ? 'border-white/15 bg-white/5 text-white/45 hover:text-white/75'
                : 'border-[#38e8ff]/40 bg-[#38e8ff]/10 text-[#38e8ff] hover:bg-[#38e8ff]/20'
            }`}
          >
            {voiceCalloutsMuted ? (
              <VolumeX className="h-3 w-3" />
            ) : (
              <Volume2 className="h-3 w-3" />
            )}
            <span className="hidden 2xl:inline">
              {voiceCalloutsMuted ? t('Muted', 'Silencio') : t('Audio', 'Voz')}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setTelemetryDrawerOpen((v) => !v)}
            className="flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 font-medium text-white/85 transition hover:border-[#38e8ff]/50"
          >
            <Cpu className="h-3 w-3 text-[#38e8ff]" />
            <span className="hidden xl:inline">{t('Telemetry', 'Telemetría')}</span>
          </button>
          <div
            role="group"
            aria-label={t('Language switch', 'Selector de idioma')}
            title={t('Switch language (English / Español)', 'Cambiar idioma (English / Español)')}
            className="flex items-center rounded-full border border-white/15 bg-white/[0.04] p-0.5 font-mono text-[10px]"
          >
            <button
              type="button"
              onClick={() => setLang('en')}
              aria-pressed={lang === 'en'}
              className={`rounded-full px-2.5 py-0.5 font-semibold transition ${
                lang === 'en'
                  ? 'bg-[#38e8ff] text-slate-950 shadow-[0_0_10px_rgba(56,232,255,0.35)]'
                  : 'text-white/65 hover:text-white'
              }`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setLang('es')}
              aria-pressed={lang === 'es'}
              className={`rounded-full px-2.5 py-0.5 font-semibold transition ${
                lang === 'es'
                  ? 'bg-[#38e8ff] text-slate-950 shadow-[0_0_10px_rgba(56,232,255,0.35)]'
                  : 'text-white/65 hover:text-white'
              }`}
            >
              ES
            </button>
          </div>
        </div>
      </header>

      {/* Contenido Principal Full-Bleed */}
      <main className="relative flex min-h-0 flex-1 overflow-hidden">
        {phase === 'pre-eva' && (
          <div
            onMouseMove={(e) => {
              const nx = (e.clientX / window.innerWidth - 0.5) * 2;
              const ny = (e.clientY / window.innerHeight - 0.5) * 2;
              setPovOffset({ x: nx, y: ny });
            }}
            onMouseLeave={() => setPovOffset({ x: 0, y: 0 })}
            className={`relative flex h-full w-full flex-col items-center justify-center gap-2 overflow-hidden bg-[#06090f] py-2 pl-3 pr-3 sm:py-3 md:pl-[204px] ${
              habitatSection === 'pre-eva' && preEvaPlannerOpen && !preEvaCleanVisor
                ? 'md:pr-[278px]'
                : 'md:pr-5'
            }`}
          >
            <MartianHabitatBackdrop sceneIdx={habitatSceneIdx} povOffset={povOffset} />

            {!preEvaCleanVisor && (
              <div className="relative z-20 flex w-full justify-center">
                <HabitatSectionsDock
                  activeSection={habitatSection}
                  onSelectSection={handleSelectHabitatSection}
                  musculoskeletalPct={musculoskeletal.indexPct}
                  autonomyDays={supplies.earthSupplyDaysRemaining + supplies.isruAutonomyGainDays}
                  emotionalIntegrityPct={emotional.integrityPct}
                />
              </div>
            )}

            <SpacecraftConsoleFrame
              variant="holo-table"
              povOffset={povOffset}
              elevateModal={
                habitatSection === 'pre-eva' &&
                preEvaModal !== 'none' &&
                preEvaModal !== 'poi-detail'
              }
              wrapperClassName="w-[min(100%,960px)] h-[min(75vh,585px)]"
            >
              {habitatSection === 'pre-eva' && (
                <HabitatViewport3D
                  grid={grid}
                  pois={pois}
                  activeLayer={activeLayer}
                  onChangeLayer={setActiveLayer}
                  spePreview={spePreview}
                  plannedRoute={plannedRoute}
                  abortedRoute={spePreview ? nominalPlannedRoute : null}
                  selectedNode={selectedNode}
                  selectedPoiId={selectedPoiId}
                  rover={rover}
                  astronautPos={astronautPos}
                  activeZoneId={activeZoneId}
                  onChangeZoneId={handleChangeZoneId}
                  donkiStatus={donkiStatus}
                  plannerOpen={preEvaPlannerOpen}
                  activeModal={preEvaModal}
                  onChangeModal={setPreEvaModal}
                  detailedMarkers={preEvaDetailedMarkers}
                  cleanVisor={preEvaCleanVisor}
                  cartoStyle={preEvaCartoStyle}
                  onChangeCartoStyle={setPreEvaCartoStyle}
                  trueScale1to1={preEvaTrueScale1to1}
                  onChangeTrueScale1to1={setPreEvaTrueScale1to1}
                  flyoverActive={flyoverActive}
                  onToggleFlyover={() => setFlyoverActive((v) => !v)}
                  onApplyWorldviewSol={handleApplyWorldviewSol}
                  hideWatermark
                  onSelectNode={(n) => setSelectedNode(n)}
                  onSelectPoi={(poi) => {
                    setSelectedPoiId(poi.id);
                    setSelectedNode(findNearestNode(grid, poi.x, poi.y));
                  }}
                />
              )}

              {habitatSection === 'physical' && (
                <HabitatPhysicalConsole
                  activeDivision={physicalDivision}
                  onChangeDivision={setPhysicalDivision}
                  musculoskeletal={musculoskeletal}
                  astronautMassKg={astronautMassKg}
                  hudMode={hudMode}
                  onUpdateMusculoskeletal={setMusculoskeletal}
                  supplies={supplies}
                  onUpdateSupplies={setSupplies}
                  samplesCollectedKg={sampleMassKg}
                  samplesCachedKg={cachedMassKg}
                  cacheNode={cacheNode}
                  capturedAnomalies={capturedAnomalies}
                />
              )}

              {habitatSection === 'emotional' && (
                <HabitatEmotionalConsole
                  emotional={emotional}
                  hudMode={hudMode}
                  onUpdateEmotional={setEmotional}
                />
              )}
            </SpacecraftConsoleFrame>

            {habitatSection === 'pre-eva' && (
              <PreEvaPlannerPanel
                pois={pois}
                selectedPoiId={selectedPoiId}
                onSelectPoiId={(id) => {
                  setSelectedPoiId(id);
                  const poi = pois.find((p) => p.id === id);
                  if (poi) setSelectedNode(findNearestNode(grid, poi.x, poi.y));
                }}
                activeLayer={activeLayer}
                onChangeLayer={setActiveLayer}
                spePreview={spePreview}
                onToggleSpePreview={() => {
                  setSpePreview((prev) => {
                    const next = !prev;
                    setAnomaly(next ? 'spe' : 'none');
                    return next;
                  });
                }}
                astronautMassKg={astronautMassKg}
                onChangeAstronautMassKg={setAstronautMassKg}
                alaraBudgetMicroSv={alaraBudgetMicroSv}
                onChangeAlaraBudget={setAlaraBudgetMicroSv}
                selectedNode={selectedNode}
                plannedRoute={plannedRoute}
                activeZoneId={activeZoneId}
                plannerOpen={preEvaPlannerOpen}
                onTogglePlannerOpen={() => setPreEvaPlannerOpen((prev) => !prev)}
                activeModal={preEvaModal}
                onChangeModal={setPreEvaModal}
                detailedMarkers={preEvaDetailedMarkers}
                onToggleDetailedMarkers={() => setPreEvaDetailedMarkers((prev) => !prev)}
                cleanVisor={preEvaCleanVisor}
                onToggleCleanVisor={() => setPreEvaCleanVisor((prev) => !prev)}
                flyoverActive={flyoverActive}
                onToggleFlyover={() => setFlyoverActive((v) => !v)}
                customPoiIds={customPoiIds}
                onAddCustomPoi={handleAddCustomPoi}
                onRemoveCustomPoi={handleRemoveCustomPoi}
                circuitPlan={circuitPlan}
                circuitModeEnabled={circuitModeEnabled}
                onToggleCircuitMode={handleToggleCircuitMode}
                onExportGeoJson={handleExportGeoJson}
                onLaunchEva={handleLaunchEva}
              />
            )}

            {!preEvaCleanVisor && (
              <div className="pointer-events-none absolute bottom-3 left-3.5 z-20 w-[182px] rounded-2xl border border-white/10 bg-slate-950/32 px-3 py-2 font-sans backdrop-blur-md shadow-[0_12px_32px_rgba(0,0,0,0.22)]">
                <div className="flex items-center justify-between gap-1.5 border-b border-white/10 pb-1 text-[9.5px] font-semibold tracking-wide text-slate-200/85">
                  <span className="truncate">A.R.E.S HUD - Arcadia</span>
                  <span className="shrink-0 font-mono text-[8px] text-slate-300/65">
                    {habitatSection === 'pre-eva' ? (preEvaTrueScale1to1 ? '1x' : '3x') : 'Base'}
                  </span>
                </div>
                <div className="mt-1 text-[9.5px] leading-tight font-medium text-slate-200/85">
                  {t('Simulated Module Interior', 'Interior del módulo simulado')}
                </div>
              </div>
            )}
          </div>
        )}

        {phase === 'eva' && (
          <div className="relative h-full w-full overflow-hidden bg-[#04070d]">
            <HelmetHudViewport
              grid={grid}
              pois={pois}
              astronautPos={astronautPos}
              headingRad={headingRad}
              pitchRad={pitchRad}
              onChangeLook={(h, p) => {
                setHeadingRad(normalizeAngle(h));
                setPitchRad(p);
              }}
              activeRoute={activeRoute}
              crossedOutRoute={crossedOutRoute}
              returnStatusColor={safetyOutput?.returnStatusColor ?? 'cyan'}
              contourLinesEnabled={contourLinesEnabled}
              dustTau={dustTau}
              speActive={speActive}
              marsTime={marsTime}
              sosActive={sosActive}
              tunnelVisionMode={(safetyOutput?.tunnelVisionMode ?? false) || sosActive}
              subgridCheck={subgridCheck}
              rover={rover}
              ridingRover={ridingRover}
              buddyPos={buddyPos}
              cacheNode={cacheNode}
              repeaters={repeaters}
              breadcrumbs={breadcrumbs}
              evaEgressActive={evaEgressActive}
              evaEgressRunId={evaEgressRunId}
              onEgressComplete={() => setEvaEgressActive(false)}
              onSkipEgress={() => setEvaEgressActive(false)}
              onHeadMotionFreeze={setHeadMotionFreeze}
              onPerfSample={(f, ms) => {
                setFps(f);
                setFrameRenderMs(ms);
              }}
            />

            <div
              className={`pointer-events-none absolute inset-0 z-20 ${
                evaEgressActive ? 'animate-eva-hud-wake' : ''
              }`}
            >
              <HudOverlay
                safety={safetyOutput}
                heartbeatTick={heartbeatTick}
                astronautPos={astronautPos}
                headingRad={headingRad}
                buddy={buddyTelemetry}
                rover={rover}
                ridingRover={ridingRover}
                canBoardRover={canBoardRover}
                speedMs={currentSpeedMs}
                onToggleRideRover={handleToggleRideRover}
                pois={pois}
                cacheNode={cacheNode}
                sampleMassKg={sampleMassKg}
                onDropSamples={handleDropSamples}
                activeRoute={activeRoute}
                crossedOutRoute={crossedOutRoute}
                subgridCheck={subgridCheck}
                dustTau={dustTau}
                onChangeDustTau={(tau) => {
                  if (anomaly === 'dust') setAnomaly('none');
                  setCustomDustTau(tau);
                }}
                marsTime={marsTime}
                marsTimeRate={marsTimeRate}
                onChangeMarsLmstHours={(hrs) => setMarsLmstHours(wrapMarsHours24(hrs))}
                onChangeMarsLsDeg={(ls) => setMarsSolarLonLsDeg(wrapDeg360(ls))}
                onChangeMarsTimeRate={setMarsTimeRate}
                onSelectMarsLightPreset={handleSelectMarsLightPreset}
                onSelectMarsSeasonPreset={handleSelectMarsSeasonPreset}
                suitPintKpa={suitPintKpa}
                onChangeSuitPintKpa={setSuitPintKpa}
                stiffnessKThetaNmRad={stiffnessKThetaNmRad}
                onChangeStiffnessKThetaNmRad={setStiffnessKThetaNmRad}
                speActive={speActive}
                sosActive={sosActive}
                contourLinesEnabled={contourLinesEnabled}
                onToggleContours={() => setContourLinesEnabled((v) => !v)}
                wazeSuggestion={wazeSuggestion}
                onAcceptWaze={handleAcceptWaze}
                onRejectWaze={handleRejectWaze}
                dwellProgress={multimodal.dwellProgress}
                onStartDwellSos={multimodal.startHeadGazeDwell}
                onCancelDwellSos={multimodal.cancelHeadGazeDwell}
                onOpenCuffChecklist={() => setCuffOpen(true)}
                voiceActive={multimodal.voiceActive}
                voiceSupported={multimodal.voiceSupported}
                onToggleVoice={multimodal.toggleVoice}
                lastVoiceCommand={multimodal.lastVoiceCommand}
                simPlaying={simPlaying}
                onToggleAutoWalk={() => setSimPlaying((v) => !v)}
                reachedPlannedPoi={reachedPlannedPoi}
                nearbySamplePoi={nearbySamplePoi}
                onCollectSample={() => handleCollectNearbySample(false)}
                evaEgressActive={evaEgressActive}
                canEnterAirlock={canEnterAirlock}
                onEnterAirlock={() => {
                  setEvaEgressActive(false);
                  setPhase('post-eva');
                }}
                onTriggerAnomaly={handleTriggerAnomaly}
                breadcrumbs={breadcrumbs}
                activeZoneId={activeZoneId}
                repeaters={repeaters}
                onDeployRepeater={handleDeployRepeater}
                onSwitchPlssBackup={handleSwitchPlssBackup}
                headMotionFreeze={headMotionFreeze}
                hudMode={hudMode}
                onToggleHudMode={() =>
                  setHudMode((m) => (m === 'technical' ? 'intuitive' : 'technical'))
                }
                musculoskeletalPct={musculoskeletal.indexPct}
              />
            </div>

            {evaFinishPromptOpen && (
              <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-label={t('Finalize EVA stage?', '¿Finalizamos la etapa EVA?')}
                  className="w-full max-w-md rounded-3xl border border-emerald-300/45 bg-slate-950/88 p-5 text-white shadow-[0_24px_70px_rgba(0,0,0,0.72),0_0_32px_rgba(52,211,153,0.18)] backdrop-blur-2xl"
                >
                  <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.14em] text-emerald-300">
                    <DoorOpen className="h-3.5 w-3.5" />
                    <span>
                      {t(
                        'ARES BASE · MARTIAN MODULE CONTACT',
                        'BASE ARES · CONTACTO CON MÓDULO MARCIANO'
                      )}
                    </span>
                  </div>

                  <h2 className="mt-2 text-lg font-semibold tracking-tight text-white">
                    {t('Finalize EVA stage?', '¿Finalizamos la etapa EVA?')}
                  </h2>
                  <p className="mt-1.5 text-xs leading-relaxed text-white/75">
                    {t(
                      'Physical contact detected with the Ares Arcadia Martian Module. Confirm airlock entry to close EVA telemetry and review the Post-EVA mission report.',
                      'Detectamos contacto físico con el Módulo Marciano Ares Arcadia. Confirmá el ingreso por esclusa para cerrar la etapa EVA y ver el informe Post-EVA.'
                    )}
                  </p>

                  <div className="mt-3.5 grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-[10px]">
                    <div>
                      <div className="text-white/45">{t('Distance', 'Distancia')}</div>
                      <div className="mt-0.5 font-semibold text-white">
                        {Math.round(distanceWalkedM)} m
                      </div>
                    </div>
                    <div>
                      <div className="text-white/45">{t('Samples', 'Muestras')}</div>
                      <div className="mt-0.5 font-semibold text-cyan-200">
                        {sampleMassKg.toFixed(2)} kg
                      </div>
                    </div>
                    <div>
                      <div className="text-white/45">{t('ALARA Dose', 'Dosis ALARA')}</div>
                      <div className="mt-0.5 font-semibold text-amber-200">
                        {(safetyOutput?.accumulatedDoseMicroSv ?? 0).toFixed(2)} µSv
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={handleDismissFinishEva}
                      className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-medium text-white/80 transition hover:bg-white/12 hover:text-white"
                    >
                      {t('Continue EVA [Esc]', 'Seguir en EVA [Esc]')}
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmFinishEva}
                      autoFocus
                      className="flex items-center gap-2 rounded-xl border border-emerald-300/60 bg-gradient-to-r from-emerald-400/30 to-cyan-400/25 px-4 py-2 text-xs font-semibold text-emerald-100 shadow-[0_0_20px_rgba(52,211,153,0.22)] transition hover:from-emerald-400/45 hover:to-cyan-400/40"
                    >
                      <span>{t('Confirm & Finish', 'Confirmar y finalizar')}</span>
                      <kbd className="flex items-center gap-1 rounded border border-emerald-200/40 bg-black/35 px-1.5 py-0.5 font-mono text-[10px] text-emerald-200">
                        <CornerDownLeft className="h-3 w-3" />
                        Enter
                      </kbd>
                    </button>
                  </div>
                </div>
              </div>
            )}

            <CuffChecklistModal
              open={cuffOpen}
              onClose={() => setCuffOpen(false)}
              cuffHoldProgress={multimodal.cuffHoldProgress}
              onStartCuffHold={multimodal.startCuffSosHold}
              onCancelCuffHold={multimodal.cancelCuffSosHold}
              onVoiceSimulatedCommand={(cmd) => multimodal.processTranscript(cmd)}
            />

            <JudgeSandboxPanel
              open={sandboxOpen}
              onClose={() => setSandboxOpen(false)}
              simPlaying={simPlaying}
              onTogglePlay={() => setSimPlaying((v) => !v)}
              simSpeed={simSpeed}
              onChangeSpeed={setSimSpeed}
              simElapsedSec={simElapsedSec}
              anomaly={anomaly}
              onTriggerAnomaly={handleTriggerAnomaly}
              marsTime={marsTime}
              marsTimeRate={marsTimeRate}
              onChangeMarsTimeRate={setMarsTimeRate}
              onSelectMarsLightPreset={handleSelectMarsLightPreset}
              onSelectMarsSeasonPreset={handleSelectMarsSeasonPreset}
              onStartDemo30s={handleStartDemo30s}
              demo30sActive={demo30sActive}
              onResetEva={() => resetEvaSession(targetPoiId)}
              onArriveAirlock={() => {
                setEvaEgressActive(false);
                setPhase('post-eva');
              }}
              activeRoute={activeRoute}
              fps={fps}
              frameRenderMs={frameRenderMs}
              targetPoiId={targetPoiId}
              pois={pois}
              onChangeTargetPoiId={(id) => {
                setTargetPoiId(id);
                pushLog(
                  'info',
                  t(`New EVA destination locked: ${id}.`, `Nuevo destino EVA fijado: ${id}.`)
                );
              }}
              onCollectNearbySample={() => handleCollectNearbySample(true)}
            />
          </div>
        )}

        {phase === 'post-eva' && (
          <div className="h-full w-full overflow-hidden">
            <PostEvaModal
              report={postEvaReport}
              sceneIdx={habitatSceneIdx}
              onChangeSceneIdx={setHabitatSceneIdx}
              onExportGeoJson={handleExportGeoJson}
              onRestartMission={() => {
                setPhase('pre-eva');
              }}
            />
          </div>
        )}

        {/* Barra de Estado Holográfica Sin Marcos (No Man's Sky / Halo) persistente en las 3 etapas */}
        {!(phase === 'pre-eva' && preEvaCleanVisor) && !(phase === 'eva' && evaEgressActive) && (
          <HolographicStatusBar
            phase={phase}
            hudMode={hudMode}
            onToggleHudMode={() =>
              setHudMode((m) => (m === 'technical' ? 'intuitive' : 'technical'))
            }
            safety={safetyOutput}
            heartRateBpm={safetyOutput?.heartRateBpm ?? (phase === 'eva' ? 88 : 72)}
            musculoskeletal={musculoskeletal}
            supplies={supplies}
            emotional={emotional}
            alaraBudgetMicroSv={alaraBudgetMicroSv}
            speActive={speActive}
            sosActive={sosActive}
            plssBackupActive={plssBackupSwitched}
            tunnelVision={(safetyOutput?.tunnelVisionMode ?? false) || sosActive}
            headMotionFreeze={headMotionFreeze}
            onJumpToHabitatSection={(sec) => {
              handleSelectHabitatSection(sec);
              if (phase !== 'pre-eva') {
                setEvaEgressActive(false);
                setPhase('pre-eva');
              }
            }}
            onSwitchPlssBackup={handleSwitchPlssBackup}
          />
        )}

        {/* Configurador Pre-Salida (< 5 s) entre Pre-EVA y animación de esclusa */}
        <PreEgressPreferencesModal
          open={preEgressModalOpen}
          hudMode={hudMode}
          onChangeHudMode={setHudMode}
          voiceMuted={voiceCalloutsMuted}
          onToggleVoiceMuted={() => setVoiceCalloutsMuted((v) => !v)}
          plannedPoiLabel={
            pois.find((p) => p.id === selectedPoiId)
              ? getPoiCopy(pois.find((p) => p.id === selectedPoiId)!, lang).compactPreEva
              : selectedPoiId
          }
          onCancel={() => setPreEgressModalOpen(false)}
          onConfirmEgress={handleConfirmEgressFromPrefs}
        />

        <AdvancedTelemetryDrawer
          open={telemetryDrawerOpen}
          onClose={() => setTelemetryDrawerOpen(false)}
          safety={safetyOutput}
          currentNode={currentNode}
          subgridCheck={subgridCheck}
          astronautMassKg={astronautMassKg}
          sampleMassKg={sampleMassKg}
          alaraBudgetMicroSv={alaraBudgetMicroSv}
          fps={fps}
          frameRenderMs={frameRenderMs}
          logs={logs}
        />

        <SoftwareOnboardingModal
          open={tutorialOpen}
          onDismiss={handleDismissTutorial}
          onSyncStage={handleSyncTutorialStage}
        />

        <StealthControlsModal
          open={controlsOpen}
          onClose={() => setControlsOpen(false)}
        />
      </main>
    </div>
  );
}
