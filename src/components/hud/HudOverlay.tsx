import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Clock,
  Compass,
  DoorOpen,
  Dumbbell,
  Layers,
  Map as MapIcon,
  Mic,
  MicOff,
  Moon,
  Mountain,
  Navigation,
  Pickaxe,
  Radio,
  RotateCcw,
  ShieldAlert,
  Snowflake,
  Sparkles,
  Sun,
  Sunrise,
  Sunset,
  Volume2,
  VolumeX,
  Wind,
  X,
} from 'lucide-react';
import { MISSION_CONFIG } from '../../config/missionConfig';
import { computeArcadiaWeight, computeJointTorqueNm } from '../../engine/bioenergetics';
import { computeInstantDoseRateMicroSvH } from '../../engine/radiation';
import {
  ARCADIA_ZONES,
  STUDY_AREA_VISUAL_REFERENCES,
  type ArcadiaZoneId,
  type ArcadiaZoneSpec,
} from '../../services/nasaApiService';
import type {
  AnomalyTrigger,
  BuddyTelemetry,
  DeployableRepeater,
  HudLanguageMode,
  MarsEphemerisState,
  MarsSeasonId,
  PoiStation,
  RouteMetrics,
  RoutePoint,
  RoverTelemetry,
  SafetyWorkerTickOutput,
  SubgridHazardCheck,
  WazeSuggestion,
} from '../../types/mission';
import { useI18n, type AppLanguage } from '../../i18n/I18nContext';
import { getPoiCopy, getStudyRefCopy, getWazeTitle, lonDir } from '../../i18n/catalog';

interface HudOverlayProps {
  safety: SafetyWorkerTickOutput | null;
  heartbeatTick: number;
  astronautPos: { x: number; y: number };
  headingRad: number;
  buddy: BuddyTelemetry;
  rover: RoverTelemetry;
  ridingRover?: boolean;
  canBoardRover?: boolean;
  speedMs?: number;
  onToggleRideRover?: () => void;
  pois: PoiStation[];
  cacheNode: PoiStation | null;
  sampleMassKg: number;
  onDropSamples: () => void;
  activeRoute: RouteMetrics | null;
  crossedOutRoute?: RouteMetrics | null;
  subgridCheck: SubgridHazardCheck;
  dustTau: number;
  onChangeDustTau?: (tau: number) => void;
  suitPintKpa?: number;
  onChangeSuitPintKpa?: (kpa: number) => void;
  stiffnessKThetaNmRad?: number;
  onChangeStiffnessKThetaNmRad?: (k: number) => void;
  speActive: boolean;
  sosActive: boolean;
  contourLinesEnabled: boolean;
  onToggleContours: () => void;
  wazeSuggestion: WazeSuggestion | null;
  onAcceptWaze: () => void;
  onRejectWaze: () => void;
  dwellProgress: number;
  onStartDwellSos: () => void;
  onCancelDwellSos: () => void;
  onOpenCuffChecklist: () => void;
  voiceActive: boolean;
  voiceSupported: boolean;
  onToggleVoice: () => void;
  lastVoiceCommand: string | null;
  simPlaying: boolean;
  onToggleAutoWalk: () => void;
  reachedPlannedPoi: boolean;
  nearbySamplePoi: PoiStation | null;
  onCollectSample: () => void;
  evaEgressActive?: boolean;
  canEnterAirlock: boolean;
  onEnterAirlock: () => void;
  onTriggerAnomaly?: (anomaly: AnomalyTrigger) => void;
  breadcrumbs?: RoutePoint[];
  activeZoneId?: ArcadiaZoneId;
  repeaters?: DeployableRepeater[];
  onDeployRepeater?: () => void;
  onSwitchPlssBackup?: () => void;
  headMotionFreeze?: boolean;
  hudMode?: HudLanguageMode;
  onToggleHudMode?: () => void;
  musculoskeletalPct?: number;
  marsTime?: MarsEphemerisState;
  marsTimeRate?: number;
  onChangeMarsLmstHours?: (hours: number) => void;
  onChangeMarsLsDeg?: (lsDeg: number) => void;
  onChangeMarsTimeRate?: (rate: number) => void;
  onSelectMarsLightPreset?: (preset: 'dawn' | 'safe-sun' | 'sunset' | 'night') => void;
  onSelectMarsSeasonPreset?: (season: MarsSeasonId) => void;
}

type ForearmTabId = 'nav' | 'suit' | 'maps' | 'weather';

function normalizeAngleDeg(deg: number): number {
  let d = deg % 360;
  if (d < 0) d += 360;
  return d;
}

function shortestAngleDiffDeg(targetDeg: number, currentDeg: number): number {
  let diff = ((targetDeg - currentDeg + 540) % 360) - 180;
  if (diff < -180) diff += 360;
  return diff;
}

function getShortPoiTitle(id: string, fallback: string, lang: AppLanguage): string {
  return getPoiCopy({ id, name: fallback } as PoiStation, lang).hudShort;
}

export const HudOverlay: React.FC<HudOverlayProps> = ({
  safety,
  heartbeatTick,
  astronautPos,
  headingRad,
  buddy,
  rover,
  ridingRover = false,
  canBoardRover = false,
  speedMs = 0,
  onToggleRideRover,
  pois,
  sampleMassKg,
  onDropSamples,
  activeRoute,
  dustTau,
  onChangeDustTau,
  suitPintKpa: suitPintKpaProp,
  onChangeSuitPintKpa,
  stiffnessKThetaNmRad: stiffnessProp,
  onChangeStiffnessKThetaNmRad,
  speActive,
  sosActive,
  contourLinesEnabled,
  onToggleContours,
  wazeSuggestion,
  onAcceptWaze,
  onRejectWaze,
  dwellProgress,
  onStartDwellSos,
  onCancelDwellSos,
  onOpenCuffChecklist,
  voiceActive,
  voiceSupported,
  onToggleVoice,
  lastVoiceCommand,
  simPlaying,
  onToggleAutoWalk,
  nearbySamplePoi,
  onCollectSample,
  evaEgressActive = false,
  canEnterAirlock,
  onEnterAirlock,
  onTriggerAnomaly,
  breadcrumbs = [],
  activeZoneId = 'zona-1-marstrek',
  repeaters = [],
  onDeployRepeater,
  onSwitchPlssBackup,
  headMotionFreeze = false,
  hudMode = 'technical',
  onToggleHudMode,
  musculoskeletalPct = 84,
  marsTime,
  marsTimeRate = 12,
  onChangeMarsLmstHours,
  onChangeMarsLsDeg,
  onChangeMarsTimeRate,
  onSelectMarsLightPreset,
  onSelectMarsSeasonPreset,
}) => {
  const { lang, t } = useI18n();
  const isIntuitive = hudMode === 'intuitive';
  // Diegetic First-Person Forearm AR State (active by default upon EVA exit; toggle via [Tab] or [B])
  const [forearmRaised, setForearmRaised] = useState(true);
  const [pickupToast, setPickupToast] = useState<{ id: number; text: string; isFull: boolean } | null>(
    null
  );
  const prevEgressRef = useRef<boolean>(evaEgressActive);
  const [activeTab, setActiveTab] = useState<ForearmTabId>('nav');
  const forearmAtlasRefs = useMemo(
    () => STUDY_AREA_VISUAL_REFERENCES.filter((r) => r.id !== 'ref-curiosity-sharp'),
    []
  );
  const [expandedAtlasModal, setExpandedAtlasModal] = useState(false);
  const [selectedRefId, setSelectedRefId] = useState<string>(
    () =>
      STUDY_AREA_VISUAL_REFERENCES.find((r) => r.id !== 'ref-curiosity-sharp')?.id ??
      STUDY_AREA_VISUAL_REFERENCES[0].id
  );

  // Interactive suit parameters inside Forearm AR Biometrics tab
  const [localSuitPintKpa, setLocalSuitPintKpa] = useState<number>(
    MISSION_CONFIG.suit.nominalPressureKpa
  );
  const suitPintKpa = suitPintKpaProp ?? localSuitPintKpa;
  const setSuitPintKpa = onChangeSuitPintKpa ?? setLocalSuitPintKpa;
  const [localStiffnessKTheta, setLocalStiffnessKTheta] = useState<number>(
    MISSION_CONFIG.suit.stiffnessKThetaNmRad
  );
  const stiffnessKTheta = stiffnessProp ?? localStiffnessKTheta;
  const setStiffnessKTheta = onChangeStiffnessKThetaNmRad ?? setLocalStiffnessKTheta;
  const [watchdogStale, setWatchdogStale] = useState(false);
  const watchdogPulseTimerRef = useRef<number | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);

  useEffect(() => {
    if (heartbeatTick <= 0) return;
    setWatchdogStale(false);
    if (watchdogPulseTimerRef.current !== null) {
      window.clearTimeout(watchdogPulseTimerRef.current);
    }
    watchdogPulseTimerRef.current = window.setTimeout(() => {
      setWatchdogStale(true);
    }, 2600);
    return () => {
      if (watchdogPulseTimerRef.current !== null) {
        window.clearTimeout(watchdogPulseTimerRef.current);
      }
    };
  }, [heartbeatTick]);

  const activeZone: ArcadiaZoneSpec =
    ARCADIA_ZONES.find((z) => z.id === activeZoneId) ?? ARCADIA_ZONES[0];

  // Keep Forearm AR active automatically when finishing Martian module egress into EVA
  useEffect(() => {
    if (prevEgressRef.current && !evaEgressActive) {
      setForearmRaised(true);
    }
    prevEgressRef.current = evaEgressActive;
  }, [evaEgressActive]);

  // Brief visor confirmation badge on surface/outcrop sample pickup
  useEffect(() => {
    let timer: number | null = null;
    const onPickup = (ev: Event) => {
      const d = (
        ev as CustomEvent<{
          deltaKg?: number;
          nextMassKg?: number;
          source?: string;
          full?: boolean;
        }>
      ).detail;
      if (!d) return;
      const text = d.full
        ? t('Sample limit 7.00 kg reached', 'Tope 7,00 kg alcanzado')
        : `+${(d.deltaKg ?? 0).toFixed(2)} kg · ${d.source ?? 'Arcadia'}`;
      setPickupToast({ id: Date.now(), text, isFull: Boolean(d.full) });
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => setPickupToast(null), 1900);
    };
    window.addEventListener('ares-sample-pickup', onPickup);
    return () => {
      window.removeEventListener('ares-sample-pickup', onPickup);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [t]);

  // Broadcast forearm raise state to HelmetHudViewport so the 3D spacesuit arm animates in sync
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('ares-forearm-state', { detail: { raised: forearmRaised } })
    );
  }, [forearmRaised]);

  // Keyboard shortcuts: [Tab] or [B] raises/lowers the astronaut's forearm AR HUD; [E] collects ground/POI sample; [1–4] select tab
  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      const tag = (ev.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      const key = ev.key.toLowerCase();

      if (key === 'tab' || key === 'b') {
        ev.preventDefault();
        setForearmRaised((prev) => !prev);
      } else if (key === 'e' || ev.code === 'KeyE') {
        if (!ev.repeat && !evaEgressActive) {
          onCollectSample();
        }
      } else if (key === '1') {
        setForearmRaised(true);
        setActiveTab('nav');
      } else if (key === '2') {
        setForearmRaised(true);
        setActiveTab('suit');
      } else if (key === '3') {
        setForearmRaised(true);
        setActiveTab('maps');
      } else if (key === '4') {
        setForearmRaised(true);
        setActiveTab('weather');
      } else if (key === 'escape') {
        if (expandedAtlasModal) {
          setExpandedAtlasModal(false);
        } else {
          setForearmRaised(false);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCollectSample, expandedAtlasModal, evaEgressActive]);

  const isEmergency = sosActive;
  const isSpe = speActive;
  const tunnelVision = (safety?.tunnelVisionMode ?? false) || sosActive;
  const hudAdaptiveGain = safety?.hudAdaptiveGain ?? 1.0;
  const roverCommsOffline = Boolean(safety?.roverCommsOffline);
  const plssBackupActive = Boolean(safety?.plssBackupActive);
  const headingDeg = normalizeAngleDeg((headingRad * 180) / Math.PI);
  const dirs = lang === 'en' ? ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] : ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  const cardinalDir = dirs[Math.round(headingDeg / 45) % 8];

  const deltaPKpa = Math.max(0, suitPintKpa - MISSION_CONFIG.site.surfacePressureKpa);
  const totalSuitMassKg =
    MISSION_CONFIG.suit.defaultAstronautMassKg +
    MISSION_CONFIG.suit.memuPlssMassKg +
    sampleMassKg;
  const tauTotalNm =
    safety?.jointTorqueNm ??
    computeJointTorqueNm(2.0, 1.5, totalSuitMassKg, stiffnessKTheta, deltaPKpa);
  const metabolicWatts = Math.round(safety?.metabolicWatts ?? 185);
  const sampleWeight = computeArcadiaWeight(sampleMassKg);

  const distanceToRoverM = Math.max(
    1.5,
    Math.hypot(rover.x - astronautPos.x, rover.y - astronautPos.y)
  );

  const curLat = activeZone.centerLatDeg + astronautPos.y / 59158.0;
  const curLon = activeZone.centerLonWestDeg + astronautPos.x / 39928.0;

  const turnbackMinTotal = safety?.turnbackTimeMin ?? 48.3;
  const tbMins = Math.max(0, Math.floor(turnbackMinTotal));
  const tbSecs = Math.max(0, Math.floor((turnbackMinTotal - tbMins) * 60));
  const turnbackStr = `${String(tbMins).padStart(2, '0')}:${String(tbSecs).padStart(2, '0')}`;

  const doseRate =
    safety?.instantDoseRateMicroSvH ??
    computeInstantDoseRateMicroSvH(
      MISSION_CONFIG.site.baseElevationMeters,
      isSpe ? 0.92 : 0.96,
      isSpe
    );

  const marsSeasonLabels: Record<MarsSeasonId, { en: string; es: string; sols: number }> = {
    spring: { en: 'Spring', es: 'Primavera', sols: 193 },
    summer: { en: 'Summer', es: 'Verano', sols: 178 },
    autumn: { en: 'Autumn', es: 'Otoño', sols: 143 },
    winter: { en: 'Winter', es: 'Invierno', sols: 154 },
  };
  const activeSeasonMeta = marsTime
    ? marsSeasonLabels[marsTime.seasonId]
    : marsSeasonLabels.summer;
  const marsPhaseLabel = (() => {
    if (!marsTime) return t('Safe Sun', 'Sol Seguro');
    switch (marsTime.lightPhase) {
      case 'safe-sun':
        return t('Safe Sun', 'Sol Seguro');
      case 'dawn':
        return t('Dawn', 'Amanecer');
      case 'sunset':
        return t('Blue Sunset', 'Atardecer Azul');
      case 'twilight':
        return t('Twilight', 'Crepúsculo');
      case 'night':
        return t('Night', 'Noche');
      default:
        return t('Low Sun', 'Sol Bajo');
    }
  })();
  const dustCritical = dustTau > MISSION_CONFIG.thresholds.dustOpacityCriticalTau;

  const maxSampleKg = MISSION_CONFIG.suit.maxSampleMassKg;
  const samplePct = Math.min(100, (sampleMassKg / maxSampleKg) * 100);
  const sampleMarsWeightN = sampleWeight.weightN;

  const targetPoi = useMemo(() => {
    if (!activeRoute) return pois.find((p) => p.id === 'POI-02') ?? pois[0] ?? null;
    if (activeRoute.targetId === 'ROVER') {
      return {
        id: 'ROVER',
        name:
          lang === 'en'
            ? 'UWB Escort Rover - Perseverance'
            : 'Rover Escolta UWB - Perseverance',
        x: rover.x,
        y: rover.y,
      } as PoiStation;
    }
    if (activeRoute.targetId === 'EV2') {
      return {
        id: 'EV2',
        name: lang === 'en' ? 'EV2 Wingman' : 'Compañero EV2',
        x: buddy.x,
        y: buddy.y,
      } as PoiStation;
    }
    return pois.find((p) => p.id === activeRoute.targetId) ?? pois[0] ?? null;
  }, [pois, activeRoute, rover.x, rover.y, buddy.x, buddy.y, lang]);

  // No Man's Sky style Top Compass Arc Markers (decluttered under Tunnel Vision)
  const { visibleCompassMarkers, offscreenTargetDiff } = useMemo(() => {
    const rawItems = pois.map((p) => {
      const dx = p.x - astronautPos.x;
      const dy = p.y - astronautPos.y;
      const distM = Math.hypot(dx, dy);
      const brg = normalizeAngleDeg((Math.atan2(dx, dy) * 180) / Math.PI);
      const diff = shortestAngleDiffDeg(brg, headingDeg);
      const isActiveTarget = activeRoute?.targetId === p.id;
      return {
        id: p.id,
        shortLabel: getShortPoiTitle(p.id, p.name, lang),
        distM,
        diff,
        color:
          isActiveTarget && isEmergency
            ? '#ff2a4b'
            : p.kind === 'shelter'
              ? '#fbbf24'
              : isActiveTarget
                ? '#38e8ff'
                : 'rgba(226,232,240,0.75)',
        isActiveTarget,
      };
    });

    if (
      activeRoute &&
      (activeRoute.targetId === 'ROVER' || activeRoute.targetId === 'EV2') &&
      targetPoi
    ) {
      const dx = targetPoi.x - astronautPos.x;
      const dy = targetPoi.y - astronautPos.y;
      const brg = normalizeAngleDeg((Math.atan2(dx, dy) * 180) / Math.PI);
      rawItems.push({
        id: targetPoi.id,
        shortLabel: targetPoi.name,
        distM: Math.hypot(dx, dy),
        diff: shortestAngleDiffDeg(brg, headingDeg),
        color: isEmergency ? '#ff2a4b' : '#38e8ff',
        isActiveTarget: true,
      });
    }

    const fovHalfDeg = 55;
    const activeTargetItem = rawItems.find((i) => i.isActiveTarget);
    const offscreenDiff =
      activeTargetItem && Math.abs(activeTargetItem.diff) > fovHalfDeg
        ? activeTargetItem.diff
        : null;

    const inFov = rawItems
      .filter((item) => Math.abs(item.diff) <= fovHalfDeg && (!tunnelVision || item.isActiveTarget))
      .sort((a, b) => a.diff - b.diff);

    return {
      visibleCompassMarkers: inFov.map((item) => ({
        ...item,
        pct: ((item.diff + fovHalfDeg) / (fovHalfDeg * 2)) * 100,
      })),
      offscreenTargetDiff: offscreenDiff,
    };
  }, [pois, astronautPos, headingDeg, activeRoute, isEmergency, tunnelVision, targetPoi, lang]);

  // Heading-up 2D Mini Radar inside Forearm AR Navigation tab
  const radarData = useMemo(() => {
    const rangeM = 1150;
    const cosH = Math.cos(headingRad);
    const sinH = Math.sin(headingRad);

    const toRadarXY = (wx: number, wy: number) => {
      const dx = wx - astronautPos.x;
      const dy = wy - astronautPos.y;
      const rx = dx * cosH - dy * sinH;
      const ry = dx * sinH + dy * cosH;
      const normX = Math.max(-1.05, Math.min(1.05, rx / rangeM));
      const normY = Math.max(-1.05, Math.min(1.05, ry / rangeM));
      return {
        svgX: 54 + normX * 42,
        svgY: 54 - normY * 42,
      };
    };

    const activePolyline = activeRoute
      ? activeRoute.points
          .map((wp) => {
            const p = toRadarXY(wp.x, wp.y);
            return `${p.svgX.toFixed(1)},${p.svgY.toFixed(1)}`;
          })
          .join(' ')
      : '';

    const radarPois = pois.map((p) => {
      const pt = toRadarXY(p.x, p.y);
      return {
        id: p.id,
        svgX: pt.svgX,
        svgY: pt.svgY,
        isShelter: p.kind === 'shelter',
        isTarget: activeRoute?.targetId === p.id,
      };
    });

    const breadcrumbStep = Math.max(1, Math.floor(breadcrumbs.length / 28));
    const breadcrumbPolyline =
      breadcrumbs.length >= 2
        ? breadcrumbs
            .filter((_, idx) => idx % breadcrumbStep === 0 || idx === breadcrumbs.length - 1)
            .map((wp) => {
              const pt = toRadarXY(wp.x, wp.y);
              return `${pt.svgX.toFixed(1)},${pt.svgY.toFixed(1)}`;
            })
            .join(' ')
        : '';

    return { activePolyline, radarPois, breadcrumbPolyline };
  }, [astronautPos, headingRad, activeRoute, pois, breadcrumbs]);

  const activeVisualRef =
    forearmAtlasRefs.find((r) => r.id === selectedRefId) ?? forearmAtlasRefs[0];
  const activeVisualRefCopy = getStudyRefCopy(activeVisualRef, lang);

  // Exaggerated slightly yet UX-balanced peripheral weather opacity (central 68% clear)
  const peripheralDustOpacity = Math.min(0.36, Math.max(0, (dustTau - 0.3) * 0.145));
  const refugeAnchor = targetPoi ?? { id: 'POI-01', name: 'Módulo Marciano Ares', x: 0, y: 0 };
  const orbitalReturnDistM =
    activeRoute && !activeRoute.blocked
      ? Math.round(activeRoute.distanceMeters)
      : Math.round(
          Math.hypot(refugeAnchor.x - astronautPos.x, refugeAnchor.y - astronautPos.y)
        );
  const orbitalReturnBearingDeg = Math.round(
    normalizeAngleDeg(
      (Math.atan2(refugeAnchor.x - astronautPos.x, refugeAnchor.y - astronautPos.y) * 180) /
        Math.PI
    )
  );
  const refugeLabel =
    refugeAnchor.id === 'ROVER'
      ? t(
          'Escort Rover - Perseverance (UWB Shelter Relay)',
          'Rover Escolta - Perseverance (Relé Refugio UWB)'
        )
      : refugeAnchor.id === 'EV2'
        ? t('EV2 Wingman', 'Compañero EV2')
        : refugeAnchor.id === 'POI-05'
          ? t('Shelter Scarp (POI-05)', 'Escarpe Refugio (POI-05)')
          : refugeAnchor.id === 'POI-04'
            ? t('Volcanic Cone Shelter (POI-04)', 'Abrigo Cono Volcánico (POI-04)')
            : t('Martian Module (POI-01)', 'Módulo Marciano (POI-01)');

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between overflow-hidden select-none font-sans"
      style={{
        filter: `brightness(${Math.min(1.24, Math.max(0.92, hudAdaptiveGain)).toFixed(2)})`,
      }}
    >
      {/* 1. PERIPHERAL VISOR WEATHER & RADIATION EFFECTS */}
      <div
        className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-500"
        style={{
          background: `radial-gradient(ellipse 72% 66% at 50% 50%, transparent 66%, rgba(196, 108, 52, ${peripheralDustOpacity.toFixed(
            3
          )}) 89%, rgba(12, 18, 28, ${tunnelVision ? '0.78' : '0.58'}) 100%)`,
        }}
      />

      {/* Enhanced solar storm SPE upper-rim ionization glow */}
      {isSpe && (
        <div
          className="pointer-events-none absolute inset-0 z-0 animate-pulse"
          style={{
            background:
              'radial-gradient(ellipse 76% 70% at 50% 50%, transparent 70%, rgba(217, 70, 239, 0.14) 88%, rgba(251, 191, 36, 0.24) 100%)',
          }}
        />
      )}

      {/* SOS VITAL HELMET VISOR FRAME TRAIL (High-visibility red blinking helmet contour + perimeter hex cells keeping center clear) */}
      {isEmergency && (
        <div className="pointer-events-none absolute inset-0 z-0 animate-sos-helmet-pastel">
          <svg
            viewBox="0 0 1000 600"
            preserveAspectRatio="none"
            className="h-full w-full"
          >
            <defs>
              <linearGradient id="sosHelmetGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#ff4764" stopOpacity="0.98" />
                <stop offset="50%" stopColor="#ff1f42" stopOpacity="0.92" />
                <stop offset="100%" stopColor="#ff5e78" stopOpacity="0.98" />
              </linearGradient>
              <radialGradient id="sosEdgeWash" cx="50%" cy="50%" r="54%">
                <stop offset="76%" stopColor="#ff2447" stopOpacity="0" />
                <stop offset="91%" stopColor="#ff2447" stopOpacity="0.24" />
                <stop offset="100%" stopColor="#ff173a" stopOpacity="0.52" />
              </radialGradient>
              {/* Máscara estricta: centro 100% despejado para visión frontal sin obstáculos; hexagonales solo en el borde del casco */}
              <radialGradient id="sosHexRimFade" cx="50%" cy="50%" r="55%">
                <stop offset="77%" stopColor="#000000" stopOpacity="1" />
                <stop offset="87%" stopColor="#666666" stopOpacity="1" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="1" />
              </radialGradient>
              <mask id="sosHexRimMask">
                <rect width="1000" height="600" fill="url(#sosHexRimFade)" />
              </mask>
              <pattern
                id="sosHexPattern"
                width="54"
                height="31.177"
                patternUnits="userSpaceOnUse"
              >
                <polygon
                  points="9,0 27,0 36,15.588 27,31.177 9,31.177 0,15.588"
                  fill="rgba(255, 36, 71, 0.14)"
                  stroke="#ff3b5c"
                  strokeOpacity="0.68"
                  strokeWidth="1.25"
                />
                <line
                  x1="36"
                  y1="15.588"
                  x2="54"
                  y2="15.588"
                  stroke="#ff5e78"
                  strokeOpacity="0.58"
                  strokeWidth="1.2"
                />
              </pattern>
            </defs>

            {/* Suave viñeta roja periférica sin ensuciar el campo visual central */}
            <rect width="1000" height="600" fill="url(#sosEdgeWash)" />

            {/* Malla hexagonal sutil enmascarada estrictamente en los bordes/esquinas del casco */}
            <rect
              width="1000"
              height="600"
              fill="url(#sosHexPattern)"
              mask="url(#sosHexRimMask)"
              opacity="0.88"
            />

            {/* Contorno externo esculpido del sello del casco */}
            <path
              d="M 110,16 L 890,16 C 958,16 986,62 986,135 L 986,435 C 986,522 935,582 835,582 L 645,582 C 612,582 595,556 500,556 C 405,556 388,582 355,582 L 165,582 C 65,582 14,522 14,435 L 14,135 C 14,62 42,16 110,16 Z"
              fill="none"
              stroke="url(#sosHelmetGrad)"
              strokeWidth="7.5"
              strokeLinecap="round"
            />

            {/* Estela luminosa animada recorriendo el aro interno del visor */}
            <path
              d="M 124,28 L 876,28 C 938,28 970,70 970,140 L 970,425 C 970,506 922,566 828,566 L 642,566 C 608,566 592,542 500,542 C 408,542 392,566 358,566 L 172,566 C 78,566 30,506 30,425 L 30,140 C 30,70 62,28 124,28 Z"
              fill="none"
              stroke="#ff8da0"
              strokeOpacity="0.82"
              strokeWidth="2.8"
              strokeDasharray="36 24"
              className="animate-sos-trail-dash"
            />
          </svg>
        </div>
      )}

      {/* 2. TOP SPATIAL AR LAYER: COMPACT PULSE / LINK CAPSULE (LEFT) + NO MAN'S SKY COMPASS ARC (CENTER) */}
      <div className="relative z-10 flex w-full items-start justify-between gap-2 px-4 pt-3.5">
        {/* Top-Left: Mars Sol / Arcadia LTST Clock, Season & Safe Sun Window + Watchdog & HUD Switch */}
        <div
          data-tour="eva-sol-bar"
          className="pointer-events-auto flex shrink-0 flex-nowrap items-center gap-1.5 whitespace-nowrap rounded-full border border-white/12 bg-slate-950/35 px-2.5 py-1 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.25)]"
        >
          {marsTime && (
            <>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('weather');
                  setForearmRaised(true);
                }}
                title={t(
                  `Arcadia Planitia Local True Solar Time (${marsTime.safeSunWindowLabel} Safe Sun) · Click to adjust Mars Solar Cycle & Seasons`,
                  `Hora Solar Verdadera Arcadia Planitia (${marsTime.safeSunWindowLabel} Sol Seguro) · Clic para ajustar Ciclo Solar y Estaciones`
                )}
                className="flex shrink-0 flex-nowrap items-center gap-1.5 whitespace-nowrap text-[10px] text-white/90 transition hover:text-cyan-200"
              >
                {marsTime.lightPhase === 'night' || marsTime.lightPhase === 'twilight' ? (
                  <Moon className="h-3.5 w-3.5 shrink-0 text-indigo-300" />
                ) : marsTime.lightPhase === 'sunset' ? (
                  <Sunset className="h-3.5 w-3.5 shrink-0 text-sky-300" />
                ) : marsTime.lightPhase === 'dawn' ? (
                  <Sunrise className="h-3.5 w-3.5 shrink-0 text-amber-300" />
                ) : marsTime.seasonId === 'winter' ? (
                  <Snowflake className="h-3.5 w-3.5 shrink-0 text-cyan-200" />
                ) : (
                  <Sun className="h-3.5 w-3.5 shrink-0 text-amber-300" />
                )}
                <span className="shrink-0 whitespace-nowrap font-mono font-semibold text-white">
                  Sol {Math.floor(marsTime.solNumber)}
                </span>
                <span className="shrink-0 whitespace-nowrap font-mono text-cyan-200">
                  {marsTime.ltstLabel}
                  {!isIntuitive && ' LTST'}
                </span>
                <span className="hidden 2xl:inline shrink-0 whitespace-nowrap text-white/60">
                  · {t(activeSeasonMeta.en, activeSeasonMeta.es)}
                </span>
                {!isIntuitive && (
                  <span className="hidden xl:inline shrink-0 whitespace-nowrap font-mono text-white/60">
                    · Ls {Math.round(marsTime.solarLongitudeLsDeg)}°
                  </span>
                )}
              </button>
              <span className="shrink-0 text-white/15">·</span>
            </>
          )}
          <span
            className={`shrink-0 whitespace-nowrap text-[10px] ${
              isIntuitive ? 'font-medium' : 'font-mono'
            } ${
              isSpe || dustCritical
                ? 'font-semibold text-amber-300'
                : marsTime?.safeSunActive
                  ? 'font-semibold text-emerald-300'
                  : marsTime?.lightPhase === 'sunset'
                    ? 'font-semibold text-sky-300'
                    : 'text-indigo-200'
            }`}
          >
            {isSpe
              ? t('☀ SPE Alert', '☀ Alerta SPE')
              : dustCritical
                ? t('🌪 Whiteout', '🌪 Tormenta')
                : marsTime?.safeSunActive
                  ? `☀ ${t('Safe Sun', 'Sol Seguro')}`
                  : marsPhaseLabel}
            {!isIntuitive && (
              <span className="hidden xl:inline"> · {doseRate.toFixed(1)} µSv/h</span>
            )}
          </span>
          <span className="shrink-0 text-white/15">·</span>
          <span
            title={
              watchdogStale
                ? t('Safety Worker heartbeat stale (>2.6s)', 'Latido del Worker retrasado (>2.6s)')
                : t('Independent Safety Worker 1 Hz Watchdog active', 'Watchdog independiente Safety Worker 1 Hz activo')
            }
            className={`flex shrink-0 flex-nowrap items-center gap-1 whitespace-nowrap font-mono text-[9.5px] ${
              heartbeatTick === 0
                ? 'text-slate-400'
                : watchdogStale
                  ? 'font-semibold text-rose-300'
                  : 'text-emerald-300/90'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                heartbeatTick === 0
                  ? 'bg-slate-400'
                  : watchdogStale
                    ? 'bg-rose-400 animate-ping'
                    : 'bg-emerald-400 shadow-[0_0_6px_#34d399]'
              }`}
            />
            {isIntuitive
              ? watchdogStale
                ? t('Check', 'Revisar')
                : t('OK', 'OK')
              : heartbeatTick === 0
                ? 'WD'
                : watchdogStale
                  ? 'WD STALE'
                  : 'WD 1Hz'}
          </span>
          {onToggleHudMode && (
            <>
              <span className="text-white/15">·</span>
              <button
                type="button"
                onClick={onToggleHudMode}
                title={t(
                  'Switch HUD Language (Technical vs Intuitive)',
                  'Cambiar Lenguaje del HUD (Técnico vs Intuitivo)'
                )}
                className={`rounded-full border px-2 py-0.5 font-mono text-[9px] font-semibold transition ${
                  isIntuitive
                    ? 'border-emerald-300/50 bg-emerald-400/20 text-emerald-200 hover:bg-emerald-400/30'
                    : 'border-cyan-300/45 bg-cyan-400/15 text-cyan-200 hover:bg-cyan-400/25'
                }`}
              >
                {isIntuitive ? 'INT' : 'TEC'}
              </button>
            </>
          )}
          {roverCommsOffline && (
            <>
              <span className="text-white/15">·</span>
              <span className="rounded-full bg-rose-500/25 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-rose-200">
                {isIntuitive ? t('NO SIGNAL', 'SIN SEÑAL') : t('ROVER RF LOSS', 'ROVER SIN RF')}
              </span>
            </>
          )}
          {plssBackupActive && (
            <>
              <span className="text-white/15">·</span>
              <span className="rounded-full bg-emerald-500/25 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-emerald-200">
                {isIntuitive ? t('RESERVE AIR', 'AIRE RESERVA') : t('PLSS BAK', 'PLSS SEC')}
              </span>
            </>
          )}
        </div>

        {/* Top-Center: No Man's Sky + Meta AR Waveguide Compass Ribbon */}
        <div className="flex flex-col items-center">
          <div className="relative flex h-9 w-64 items-center justify-center overflow-hidden rounded-full border border-white/12 bg-slate-950/30 px-3 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.22)] md:w-72 xl:w-88">
            <div className="absolute top-0.5 left-1/2 -translate-x-1/2 text-[8px] text-cyan-300/80">
              ▼
            </div>

            {offscreenTargetDiff !== null && activeRoute && (
              <div
                className={`absolute top-1/2 -translate-y-1/2 z-10 rounded-full border px-2 py-0.5 text-[9px] font-medium ${
                  isEmergency
                    ? 'border-[#ff2a4b]/75 bg-rose-950/85 text-rose-100 shadow-[0_0_12px_rgba(255,42,75,0.45)]'
                    : 'border-cyan-300/40 bg-cyan-950/70 text-cyan-200'
                } ${offscreenTargetDiff < 0 ? 'left-2' : 'right-2'}`}
              >
                {offscreenTargetDiff < 0 ? t('◀ Target', '◀ Objetivo') : t('Target ▶', 'Objetivo ▶')}
              </div>
            )}

            {visibleCompassMarkers.map((m) => (
              <div
                key={m.id}
                className="absolute -translate-x-1/2 flex items-center gap-1 transition-all duration-75"
                style={{ left: `${m.pct}%`, top: '11px' }}
              >
                <span
                  className="inline-block h-2 w-2 rotate-45 border"
                  style={{
                    borderColor: m.color,
                    backgroundColor: m.isActiveTarget
                      ? isEmergency
                        ? '#ff2a4b'
                        : '#38e8ff'
                      : 'transparent',
                  }}
                />
                {m.isActiveTarget && (
                  <span
                    className={`text-[9px] font-medium whitespace-nowrap ${
                      isEmergency ? 'text-rose-200 font-semibold' : 'text-cyan-200'
                    }`}
                  >
                    {m.shortLabel}
                  </span>
                )}
              </div>
            ))}

            <div className="mt-3.5 flex items-center gap-2 text-[10px] text-white/75">
              <span
                className={`font-mono font-semibold ${
                  isEmergency ? 'text-rose-300' : 'text-cyan-300'
                }`}
              >
                {String(Math.round(headingDeg)).padStart(3, '0')}° {cardinalDir}
              </span>
              <span className="text-white/20">·</span>
              <span className={ridingRover ? 'font-mono font-semibold text-emerald-300' : isEmergency ? 'font-medium text-amber-200' : 'text-white/65'}>
                {ridingRover
                  ? `Rover - Perseverance ${speedMs.toFixed(1)} m/s`
                  : isEmergency
                    ? t(
                        `Rover - Perseverance → Base (${distanceToRoverM.toFixed(0)} m)`,
                        `Rover - Perseverance → Base (${distanceToRoverM.toFixed(0)} m)`
                      )
                    : `Rover - Perseverance ${distanceToRoverM.toFixed(0)} m`}
              </span>
            </div>
          </div>

          {/* 1-Line Active Target & ~1.0 m Collimated Pulse Status Pill */}
          {activeRoute && targetPoi && (
            <div
              className={`mt-1.5 flex items-center gap-2 rounded-full border px-3.5 py-0.5 text-[10px] backdrop-blur-xl transition-all ${
                isEmergency
                  ? 'border-[#ff3b5c]/80 bg-rose-950/75 text-rose-50 shadow-[0_0_18px_rgba(255,42,75,0.38)]'
                  : isSpe
                    ? 'border-amber-400/50 bg-amber-950/55 text-amber-100'
                    : 'border-cyan-300/25 bg-slate-950/30 text-cyan-100'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full animate-ping ${
                  isEmergency ? 'bg-[#ff2a4b]' : 'bg-cyan-300'
                }`}
              />
              <span className="font-medium text-white/95">
                {refugeAnchor.id === 'ROVER' || refugeAnchor.id === 'EV2'
                  ? refugeAnchor.name
                  : getShortPoiTitle(targetPoi.id, targetPoi.name, lang)}
              </span>
              <span className="text-white/25">·</span>
              <span
                className={`font-mono ${
                  activeRoute.blocked
                    ? 'font-bold text-rose-300'
                    : isEmergency
                      ? 'font-bold text-amber-300'
                      : 'text-cyan-300'
                }`}
              >
                {activeRoute.blocked
                  ? t('BLOCKED >18°', 'BLOQUEADA >18°')
                  : `${activeRoute.distanceMeters.toFixed(0)} m`}
              </span>
              <span className="text-white/25">·</span>
              <span className={isEmergency ? 'font-medium text-rose-200' : 'text-cyan-200/75'}>
                {activeRoute.blocked
                  ? t('Blocked Slope', 'Pendiente Bloqueada')
                  : isIntuitive
                    ? isEmergency
                      ? t('Follow red line → Base', 'Sigue guía roja → Refugio')
                      : t('Follow cyan guide', 'Sigue guía celeste')
                    : isEmergency
                      ? t('SOS · 1.0m step', 'SOS · Paso 1m')
                      : t('1.0m guide step', 'Guía 1m')}
              </span>
            </div>
          )}

          {/* Orbital Return Guidance Banner during ALERTA SOS VITAL */}
          {isEmergency && (
            <div className="pointer-events-auto mt-1.5 flex flex-wrap items-center justify-center gap-2 rounded-full border border-[#ff3b5c]/85 bg-rose-950/88 px-4 py-1 text-[10px] font-medium text-rose-50 backdrop-blur-xl shadow-[0_0_24px_rgba(255,42,75,0.48)]">
              <Radio className="h-3.5 w-3.5 text-[#ff4d6d] animate-pulse" />
              <span>
                {isIntuitive
                  ? isSpe
                    ? t('⚠ SOLAR STORM · RETURN', '⚠ TORMENTA SOLAR · VOLVER')
                    : t('⚠ EMERGENCY · RETURN', '⚠ EMERGENCIA · VOLVER')
                  : isSpe
                    ? t('SOS VITAL (SPE)', 'SOS VITAL (SPE)')
                    : dustTau > 2.5
                      ? t('SOS VITAL (DUST τ>2.5)', 'SOS VITAL (POLVO τ>2.5)')
                      : t('SOS VITAL', 'SOS VITAL')}{' '}
                · {refugeLabel}: <strong className="font-mono text-white">{orbitalReturnDistM}m</strong> ·{' '}
                <strong className="font-mono text-amber-300">{orbitalReturnBearingDeg}°</strong>
                {!ridingRover && (
                  <>
                    {' '}·{' '}
                    <span className="text-cyan-200">
                      {t('Rover escort → Base', 'Rover escoltando → Base')}
                    </span>
                  </>
                )}
              </span>
              {onTriggerAnomaly && (
                <button
                  type="button"
                  onClick={() => onTriggerAnomaly('none')}
                  className="ml-1 rounded-full border border-white/30 bg-white/15 px-2.5 py-0.5 text-[9.5px] font-semibold text-white transition hover:bg-white/30"
                >
                  {t('✕ Clear SOS', '✕ Desactivar SOS')}
                </button>
              )}
            </div>
          )}

          {/* Clean 1-line Weather / SPE Banner only when active */}
          {isSpe && !isEmergency && (
            <div className="mt-1.5 flex items-center gap-2 rounded-full border border-amber-400/60 bg-amber-950/65 px-3.5 py-1 text-[10px] text-amber-100 backdrop-blur-xl">
              <ShieldAlert className="h-3.5 w-3.5 text-amber-300" />
              <span>
                {t(
                  `SPE Solar Storm · ALARA diversion to ${refugeLabel} (${orbitalReturnDistM} m)`,
                  `Tormenta Solar SPE · Desvío ALARA a ${refugeLabel} (${orbitalReturnDistM} m)`
                )}
              </span>
            </div>
          )}
        </div>

        {/* Top-Right: Contextual Action Prompts (Rover / Sample / Airlock / Waze) */}
        <div
          className={`flex min-w-[140px] flex-col items-end gap-2 transition-opacity duration-150 ${
            headMotionFreeze ? 'opacity-30' : 'opacity-100'
          }`}
        >
          {onSwitchPlssBackup &&
            !plssBackupActive &&
            (Boolean(safety?.hypercapniaAlert) || (safety?.co2MmHg ?? 2.2) >= MISSION_CONFIG.thresholds.co2WarningMmHg) && (
              <button
                type="button"
                onClick={onSwitchPlssBackup}
                className="pointer-events-auto flex items-center gap-2 rounded-full border border-amber-300/80 bg-amber-950/80 px-3.5 py-1.5 text-[11px] font-semibold text-amber-100 backdrop-blur-xl shadow-[0_0_20px_rgba(251,191,36,0.35)] hover:bg-amber-900/90"
              >
                <ShieldAlert className="h-3.5 w-3.5 text-amber-300" />
                <span>
                  {t('Switch PLSS Backup Loop [L]', 'Conmutar PLSS Respaldo [L]')}
                </span>
              </button>
            )}

          {onDeployRepeater &&
            repeaters.length < 3 &&
            (roverCommsOffline || (safety?.rfSignalDbm ?? -55) < -78) && (
              <button
                type="button"
                onClick={onDeployRepeater}
                className="pointer-events-auto flex items-center gap-2 rounded-full border border-violet-300/70 bg-violet-950/75 px-3.5 py-1.5 text-[11px] font-medium text-violet-100 backdrop-blur-xl shadow-[0_0_16px_rgba(167,139,250,0.28)] hover:bg-violet-900/80"
              >
                <Radio className="h-3.5 w-3.5 text-violet-300" />
                <span>
                  {t(
                    `Deploy Micro-Repeater [U] (${repeaters.length}/3)`,
                    `Desplegar Repetidor [U] (${repeaters.length}/3)`
                  )}
                </span>
              </button>
            )}

          {onToggleRideRover && (
            <button
              type="button"
              onClick={onToggleRideRover}
              className={`pointer-events-auto flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[11px] font-medium backdrop-blur-xl transition ${
                ridingRover
                  ? 'border-emerald-300/65 bg-emerald-950/65 text-emerald-100 shadow-[0_0_18px_rgba(52,211,153,0.28)] hover:bg-emerald-900/75'
                  : isEmergency
                    ? 'border-amber-300/65 bg-amber-950/60 text-amber-100 shadow-[0_0_16px_rgba(251,191,36,0.25)] hover:bg-amber-900/70'
                    : 'border-sky-300/45 bg-slate-950/50 text-sky-100 hover:bg-sky-950/60'
              }`}
            >
              <Navigation className="h-3.5 w-3.5 text-current" />
              <span>
                {ridingRover
                  ? t(
                      `Exit Rover - Perseverance [R] · ${speedMs.toFixed(1)} m/s`,
                      `Bajar del Rover - Perseverance [R] · ${speedMs.toFixed(1)} m/s`
                    )
                  : canBoardRover
                    ? isEmergency
                      ? t(
                          'Board SOS Escort Rover - Perseverance [R]',
                          'Subir al Rover Escolta - Perseverance [R]'
                        )
                      : t(
                          'Board Rover - Perseverance [R] · 3.5×',
                          'Subirse al Rover - Perseverance [R] · 3,5×'
                        )
                    : t(
                        `Call Rover - Perseverance [R] (${distanceToRoverM.toFixed(0)} m)`,
                        `Llamar Rover - Perseverance [R] (${distanceToRoverM.toFixed(0)} m)`
                      )}
              </span>
            </button>
          )}

          {!evaEgressActive && !isEmergency && !tunnelVision && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={onCollectSample}
                className="pointer-events-auto flex items-center gap-2 rounded-full border border-cyan-300/45 bg-slate-950/55 px-3.5 py-1.5 text-[11px] font-medium text-cyan-200 backdrop-blur-xl transition hover:border-cyan-200/75 hover:bg-cyan-950/65"
              >
                <Pickaxe className="h-3.5 w-3.5 text-cyan-300" />
                <span>
                  {nearbySamplePoi?.id === 'POI-CACHE'
                    ? t('Recover POI-CACHE [E]', 'Recuperar POI-CACHE [E]')
                    : nearbySamplePoi
                      ? t('Collect outcrop sample [E]', 'Recolectar afloramiento [E]')
                      : t('Collect floor sample [E]', 'Tomar muestra suelo [E]')}
                </span>
              </button>
              {pickupToast && (
                <div
                  key={pickupToast.id}
                  className={`rounded-full border px-3 py-1.5 font-mono text-[10.5px] font-semibold backdrop-blur-xl shadow-lg ${
                    pickupToast.isFull
                      ? 'border-amber-300/60 bg-amber-950/75 text-amber-100'
                      : 'border-emerald-300/65 bg-emerald-950/75 text-emerald-100'
                  }`}
                >
                  {pickupToast.text}
                </div>
              )}
            </div>
          )}

          {canEnterAirlock && (
            <button
              type="button"
              onClick={onEnterAirlock}
              className="pointer-events-auto flex items-center gap-2 rounded-full border border-emerald-400/60 bg-emerald-950/65 px-4 py-1.5 text-[11px] font-medium text-emerald-200 backdrop-blur-xl hover:bg-emerald-900/75"
            >
              <DoorOpen className="h-3.5 w-3.5 text-emerald-300" />
              <span>{t('Enter Airlock [G]', 'Entrar a Esclusa [G]')}</span>
            </button>
          )}

          {wazeSuggestion && !isEmergency && !isSpe && !tunnelVision && (
            <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-white/15 bg-slate-950/45 px-3 py-1.5 text-[10px] text-white/90 backdrop-blur-xl">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              <span>
                {t('Finding', 'Hallazgo')}: {getWazeTitle(wazeSuggestion, lang)}
              </span>
              <button
                type="button"
                onClick={onAcceptWaze}
                className="rounded-full bg-cyan-400/25 px-2 py-0.5 text-[9px] font-semibold text-cyan-200 hover:bg-cyan-400/40"
              >
                {t('Go', 'Ir')}
              </button>
              <button
                type="button"
                onClick={onRejectWaze}
                className="text-white/50 hover:text-white"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 3. BOTTOM SPATIAL ROW: LEFT WATERMARK AI CARD + RIGHT DIEGETIC FOREARM AR HUD */}
      <div className="relative z-10 flex w-full items-end justify-between px-6 pb-5">
        {/* Bottom-Left: Translucent Watermark Card matching Post-EVA legend */}
        <div
          className={`pointer-events-none w-[372px] rounded-3xl border border-white/10 bg-slate-950/24 px-4 py-2.5 backdrop-blur-md shadow-[0_12px_32px_rgba(0,0,0,0.22)] transition-opacity duration-150 ${
            headMotionFreeze ? 'opacity-25' : 'opacity-100'
          }`}
        >
          <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-1">
            <span className="truncate text-[10.5px] font-semibold tracking-wide text-slate-200/75">
              {t('A.R.E.S HUD SYSTEM - Ares Arcadia Team', 'SISTEMA A.R.E.S HUD - Ares Arcadia Team')}
            </span>
            <span className="shrink-0 font-mono text-[9px] text-slate-300/60">Arcadia · EVA</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-slate-200/80">
            <span className="font-medium">
              {t(
                'Simulated in an AI Experimental Environment',
                'Simulado en un entorno experimental por IA'
              )}
            </span>
            <span className="shrink-0 font-mono text-[9px] text-cyan-200/70">
              {isIntuitive ? t('Clear View', 'Visión Clara') : t('Focus ~2.0 m', 'Foco ~2,0 m')}
            </span>
          </div>
        </div>

        {/* Bottom-Right: Animated First-Person Right Forearm & Floating Meta-AR Waveguide Projection */}
        <div className="relative flex flex-col items-end">
          <div
            className={`pointer-events-auto origin-bottom-right transition-all duration-500 ease-out ${
              forearmRaised
                ? 'translate-y-0 translate-x-0 scale-100 opacity-100'
                : 'translate-y-24 translate-x-10 scale-90 opacity-0 pointer-events-none'
            }`}
            style={{
              transform: forearmRaised
                ? 'perspective(1100px) rotateX(5deg) rotateY(-8deg)'
                : 'perspective(1100px) rotateX(24deg) rotateY(-18deg) translateY(90px)',
            }}
          >
            {/* Floating Spatial AR Glass Card (Meta Orion Waveguide style) */}
            <div
              data-tour={forearmRaised ? 'eva-forearm-target' : undefined}
              className="w-[360px] sm:w-[400px] max-h-[calc(100vh-140px)] overflow-y-auto rounded-3xl border border-white/18 bg-slate-950/48 p-4 text-white/95 backdrop-blur-2xl shadow-[0_20px_60px_rgba(0,0,0,0.55),0_0_28px_rgba(56,232,255,0.14)]"
            >
              {/* Header & Spatial Pill Tabs */}
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_8px_#38e8ff]" />
                  <span className="text-[11px] font-semibold tracking-wide text-white/90">
                    {t('AR Forearm · mEMU', 'Antebrazo AR · mEMU')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setForearmRaised(false)}
                  className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] text-white/65 hover:bg-white/15 hover:text-white"
                >
                  {t('Lower arm [Tab]', 'Bajar brazo [Tab]')}
                </button>
              </div>

              {/* 4 Clean AR Glass Tabs */}
              <div className="mt-2.5 grid grid-cols-4 gap-1.5 rounded-2xl bg-black/25 p-1">
                {[
                  { id: 'nav' as ForearmTabId, label: t('Navigation', 'Navegación'), icon: Compass },
                  { id: 'suit' as ForearmTabId, label: t('Biometrics', 'Biometría'), icon: Activity },
                  { id: 'maps' as ForearmTabId, label: t('Maps', 'Mapas'), icon: MapIcon },
                  { id: 'weather' as ForearmTabId, label: t('Weather', 'Clima'), icon: Wind },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center justify-center gap-1.5 rounded-xl py-1.5 text-[10px] font-medium transition-all ${
                        active
                          ? 'bg-cyan-400/25 text-cyan-200 border border-cyan-300/40 shadow-[0_0_12px_rgba(56,232,255,0.2)]'
                          : 'text-white/60 hover:text-white/90'
                      }`}
                    >
                      <Icon className="h-3 w-3" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* TAB 1: NAVEGACIÓN, RADAR Y MUESTRAS */}
              {activeTab === 'nav' && (
                <div className="mt-3 space-y-3">
                  <div className="flex items-center gap-3.5">
                    {/* Clean Circular AR Radar */}
                    <div className="relative h-24 w-24 flex-shrink-0 rounded-full border border-cyan-300/30 bg-slate-950/60">
                      <svg viewBox="0 0 108 108" className="h-full w-full">
                        <circle
                          cx="54"
                          cy="54"
                          r="40"
                          fill="none"
                          stroke="rgba(255,255,255,0.12)"
                          strokeWidth="1"
                        />
                        <circle
                          cx="54"
                          cy="54"
                          r="20"
                          fill="none"
                          stroke="rgba(255,255,255,0.08)"
                          strokeWidth="1"
                        />
                        <path
                          d="M 54,54 L 34,16 A 42,42 0 0,1 74,16 Z"
                          fill="rgba(56,232,255,0.12)"
                        />
                        {radarData.breadcrumbPolyline && (
                          <polyline
                            points={radarData.breadcrumbPolyline}
                            fill="none"
                            stroke="#fbbf24"
                            strokeOpacity="0.6"
                            strokeWidth="1.2"
                            strokeDasharray="1.5 2"
                          />
                        )}
                        {radarData.activePolyline && (
                          <>
                            {isEmergency && (
                              <polyline
                                points={radarData.activePolyline}
                                fill="none"
                                stroke="rgba(255, 20, 72, 0.42)"
                                strokeWidth="5"
                              />
                            )}
                            <polyline
                              points={radarData.activePolyline}
                              fill="none"
                              stroke={isEmergency ? '#ff1f4b' : '#38e8ff'}
                              strokeWidth={isEmergency ? '2.5' : '2'}
                              strokeDasharray={isEmergency ? '4 2' : '3 2'}
                            />
                          </>
                        )}
                        {radarData.radarPois.map((p) => (
                          <circle
                            key={p.id}
                            cx={p.svgX}
                            cy={p.svgY}
                            r={p.isTarget ? 3.8 : 2.3}
                            fill={
                              p.isTarget && isEmergency
                                ? '#ff2a4b'
                                : p.isShelter
                                  ? '#fbbf24'
                                  : p.isTarget
                                    ? '#38e8ff'
                                    : '#34d399'
                            }
                          />
                        ))}
                        <polygon points="54,48 58,58 50,58" fill="#ffffff" />
                      </svg>
                    </div>

                    <div className="flex-1 space-y-2 text-[11px]">
                      <div className="flex items-center justify-between">
                        <span className="text-white/65">
                          {isIntuitive ? t('Collected Samples', 'Muestras recogidas') : t('Samples (0.38g)', 'Muestras (0.38g)')}
                        </span>
                        <span className="font-mono font-medium text-cyan-200">
                          {sampleMassKg.toFixed(2)} / {maxSampleKg.toFixed(1)} kg
                          {!isIntuitive && ` (${sampleMarsWeightN.toFixed(1)} N)`}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full bg-gradient-to-r from-cyan-400 to-emerald-300"
                          style={{ width: `${samplePct}%` }}
                        />
                      </div>

                      <div className="flex gap-1.5 pt-0.5">
                        <button
                          type="button"
                          onClick={onCollectSample}
                          className="flex-1 rounded-xl border border-cyan-300/35 bg-cyan-400/15 py-1.5 text-[10px] font-medium text-cyan-200 hover:bg-cyan-400/25"
                        >
                          {t('+ Sample [E]', '+ Muestra [E]')}
                        </button>
                        <button
                          type="button"
                          onClick={onDropSamples}
                          title={t(
                            'Transfer samples to Rover - Perseverance',
                            'Transferir muestras al Rover - Perseverance'
                          )}
                          className="rounded-xl border border-white/12 bg-white/5 px-2.5 py-1.5 text-[10px] text-white/75 hover:bg-white/15"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={onToggleAutoWalk}
                          className={`rounded-xl border px-2.5 py-1.5 text-[10px] font-medium ${
                            simPlaying
                              ? 'border-cyan-300 bg-cyan-300 text-slate-950'
                              : 'border-white/12 bg-white/5 text-white/80'
                          }`}
                        >
                          {simPlaying ? 'Auto: ON' : 'Auto EVA'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Escort Rover & Fresnel UWB Relay Status */}
                  <div className="space-y-1.5 rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-[10px]">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2 text-white/80">
                        <Radio className={`h-3.5 w-3.5 shrink-0 ${roverCommsOffline ? 'text-rose-400' : 'text-cyan-300'}`} />
                        <span className="truncate">
                          {isIntuitive
                            ? roverCommsOffline
                              ? t('Signal Lost — Drop Relay', 'Sin señal — Dejar repetidor')
                              : (safety?.rfSignalDbm ?? rover.uwbSignalDbm) > -75
                                ? t('Signal Strong · Base Link', 'Señal Fuerte · Enlace Base')
                                : t('Signal Fair · Rover Link', 'Señal Media · Enlace Rover')
                            : `${safety?.activeLinkSource ?? 'HAB_UHF'} · ${(safety?.rfSignalDbm ?? rover.uwbSignalDbm).toFixed(0)} dBm`}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAudioEnabled((a) => !a)}
                        className="shrink-0 text-cyan-300 hover:text-white"
                      >
                        {audioEnabled ? (
                          <Volume2 className="h-3.5 w-3.5" />
                        ) : (
                          <VolumeX className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[9px] text-white/65">
                      <span>
                        {isIntuitive ? (
                          (safety?.fresnelClearanceRatio ?? 1.0) >= 0.75
                            ? t('Clear radio path', 'Señal libre')
                            : t('Terrain blocking radio', 'Señal obstruida')
                        ) : (
                          <>
                            Fresnel{' '}
                            <strong className="font-mono text-cyan-200">
                              {(safety?.fresnelClearanceRatio ?? 1.0).toFixed(2)}
                            </strong>{' '}
                            ·{' '}
                            <strong className="font-mono text-amber-200">
                              {(safety?.diffractionLossDb ?? 0).toFixed(1)} dB
                            </strong>
                            {activeRoute?.dStarReplanMs !== undefined && (
                              <> · D* {activeRoute.dStarReplanMs.toFixed(1)}ms</>
                            )}
                          </>
                        )}
                      </span>
                      {onDeployRepeater && (
                        <button
                          type="button"
                          onClick={onDeployRepeater}
                          disabled={repeaters.length >= 3}
                          className={`rounded-full border px-2 py-0.5 font-mono text-[9px] font-semibold transition ${
                            repeaters.length >= 3
                              ? 'border-white/10 text-white/35'
                              : 'border-violet-300/50 bg-violet-500/20 text-violet-200 hover:bg-violet-500/35'
                          }`}
                        >
                          {isIntuitive ? `+Relay [U] ${repeaters.length}/3` : `+REP [U] ${repeaters.length}/3`}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: BIOMETRÍA Y TRAJE PLSS */}
              {activeTab === 'suit' && (
                <div className="mt-3 space-y-2.5 text-[11px]">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-2xl border border-white/10 bg-black/25 p-2.5">
                      <div className="text-[9px] text-white/55">
                        {isIntuitive ? t('Physical Effort', 'Esfuerzo Físico') : t('Metabolic Rate', 'Gasto Metabólico')}
                      </div>
                      <div className="mt-0.5 font-mono text-sm font-semibold text-cyan-300">
                        {isIntuitive
                          ? metabolicWatts > 340
                            ? t('High', 'Alto')
                            : metabolicWatts > 220
                              ? t('Moderate', 'Medio')
                              : t('Light', 'Suave')
                          : `${metabolicWatts} W`}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/25 p-2.5">
                      <div className="text-[9px] text-white/55">
                        {isIntuitive ? t('Joint Load', 'Carga Articular') : t('Joint Torque', 'Torque Articular')}
                      </div>
                      <div className="mt-0.5 font-mono text-sm font-semibold text-white">
                        {isIntuitive
                          ? tauTotalNm > 18
                            ? t('Heavy', 'Fuerte')
                            : t('Normal', 'Normal')
                          : `${tauTotalNm.toFixed(1)} Nm`}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/25 p-2.5">
                      <div className="text-[9px] text-white/55">
                        {isIntuitive ? t('Return Time', 'Tiempo Regreso') : t('Turnback Limit', 'Retorno Límite')}
                      </div>
                      <div className="mt-0.5 font-mono text-sm font-semibold text-emerald-300">
                        {turnbackStr}
                      </div>
                    </div>
                  </div>

                  {/* Estado Óseo-Muscular integrado en Visor AR */}
                  <div className="flex items-center justify-between rounded-2xl border border-emerald-400/25 bg-emerald-950/25 px-2.5 py-1.5 text-[10px]">
                    <span className="flex items-center gap-1.5 text-emerald-100/90">
                      <Dumbbell className="h-3.5 w-3.5 text-emerald-300" />
                      {isIntuitive ? t('Fitness', 'Físico') : t('Bone / Muscle', 'Óseo-Muscular')}
                    </span>
                    <span className="font-mono font-semibold text-emerald-300">
                      {Math.round(musculoskeletalPct)}%
                    </span>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/25 p-2.5 space-y-2">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-white/70">
                        {isIntuitive
                          ? t('Suit Air', 'Aire Traje')
                          : `${t('Suit ΔP', 'Presión')} ${deltaPKpa.toFixed(1)} kPa`}
                      </span>
                      <span className="font-mono text-cyan-300">
                        {isIntuitive
                          ? suitPintKpa >= 28
                            ? t('OK', 'Óptima')
                            : t('Low', 'Baja')
                          : `${suitPintKpa.toFixed(1)} kPa`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={25}
                      max={40}
                      step={0.2}
                      value={suitPintKpa}
                      onChange={(e) => setSuitPintKpa(parseFloat(e.target.value))}
                      className="h-1 w-full accent-cyan-300"
                    />
                    <div className="flex justify-between text-[10px]">
                      <span className="text-white/70">
                        {isIntuitive ? t('Suit Flexibility', 'Flexibilidad del Traje') : t('Joint Stiffness', 'Rigidez Articular')}
                      </span>
                      <span className="font-mono text-cyan-300">
                        {isIntuitive
                          ? stiffnessKTheta <= 14
                            ? t('Flexible', 'Suave')
                            : t('Firm', 'Firme')
                          : `${stiffnessKTheta.toFixed(1)} Nm/rad`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={30}
                      step={0.5}
                      value={stiffnessKTheta}
                      onChange={(e) => setStiffnessKTheta(parseFloat(e.target.value))}
                      className="h-1 w-full accent-cyan-300"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-white/10 bg-black/20 px-2.5 py-1.5 text-[9.5px] text-white/75">
                    <div className="flex items-center justify-between">
                      <span className="text-white/55">{isIntuitive ? t('Suit Heating', 'Calefacción') : t('Cryo Heaters', 'Calefact. Juntas')}</span>
                      <span className="font-mono text-amber-300">
                        {isIntuitive ? t('Active', 'Activa') : `${(safety?.cryoHeaterWatts ?? 14.2).toFixed(1)} W`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-white/55">{isIntuitive ? t('Visor Brightness', 'Brillo Visor') : t('HUD Photodiode', 'Fotodiodo HUD')}</span>
                      <span className="font-mono text-cyan-200">
                        {isIntuitive
                          ? `${Math.round(hudAdaptiveGain * 100)}%`
                          : `${safety?.hudLuminanceCdM2 ?? 1580} cd/m² (${hudAdaptiveGain.toFixed(2)}×)`}
                      </span>
                    </div>
                    <div className="col-span-2 flex items-center justify-between border-t border-white/10 pt-1">
                      <span className="text-white/60">
                        {isIntuitive ? (
                          <>
                            {t('Clean Air', 'Aire Limpio')}: <strong className="font-mono text-white">{(safety?.co2MmHg ?? 2.1) < 4.5 ? t('Pure', 'Puro') : t('Filter Warning', 'Cambiar Filtro')}</strong>{' '}
                            · {plssBackupActive ? t('Reserve Tank ON', 'Tanque Reserva ON') : t('Main Filter', 'Filtro Principal')}
                          </>
                        ) : (
                          <>
                            CO₂: <strong className="font-mono text-white">{(safety?.co2MmHg ?? 2.1).toFixed(1)} mmHg</strong>{' '}
                            · {plssBackupActive ? t('Backup LiOH ON', 'LiOH Respaldo ON') : t('Primary LiOH', 'LiOH Primario')}
                          </>
                        )}
                      </span>
                      {onSwitchPlssBackup && !plssBackupActive && (
                        <button
                          type="button"
                          onClick={onSwitchPlssBackup}
                          className="rounded-full border border-amber-300/45 bg-amber-500/20 px-2 py-0.5 font-mono text-[8.5px] font-semibold text-amber-200 hover:bg-amber-500/35"
                        >
                          {isIntuitive ? t('Use Reserve [L]', 'Usar Reserva [L]') : t('Backup PLSS [L]', 'PLSS Respaldo [L]')}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-white/65 px-1">
                    <span>
                      {t('EV2 Wingman', 'Compañero EV2')}: {buddy.distanceMeters} m ·{' '}
                      {buddy.heartRateBpm} BPM
                    </span>
                    <button
                      type="button"
                      onClick={onOpenCuffChecklist}
                      className="text-cyan-300 hover:underline"
                    >
                      {t('View checklist →', 'Ver protocolo →')}
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 3: CARTOGRAFÍA Y CAPAS AR */}
              {activeTab === 'maps' && (
                <div className="mt-3 space-y-2.5 text-[11px]">
                  <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/25 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Mountain className="h-4 w-4 text-cyan-300" />
                      <div>
                        <div className="flex items-center gap-1.5 font-medium text-white/90">
                          <span>{t('Topographic References', 'Referencias Topográficas')}</span>
                          <kbd className="rounded bg-white/12 px-1.5 py-0.5 font-mono text-[9px] text-cyan-200">
                            C
                          </kbd>
                        </div>
                        <div className="text-[9px] text-white/55">
                          {t(
                            'Default OFF · Press [C] to toggle in EVA',
                            'Apagadas por defecto · Tecla [C] en EVA'
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onToggleContours}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-medium transition ${
                        contourLinesEnabled
                          ? 'bg-cyan-300 text-slate-950'
                          : 'border border-white/15 bg-white/5 text-white/75 hover:border-cyan-300/40 hover:text-white'
                      }`}
                    >
                      <span>{contourLinesEnabled ? t('On', 'Activas') : t('Off', 'Apagadas')}</span>
                    </button>
                  </div>

                  <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/25 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-amber-300" />
                      <div>
                        <div className="font-medium text-white/90">
                          {t('USGS / ESA Cartographic Atlas', 'Atlas Cartográfico USGS / ESA')}
                        </div>
                        <div className="text-[9px] text-white/55">
                          {curLat.toFixed(4)}°N, {curLon.toFixed(4)}°{lonDir(lang)}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpandedAtlasModal(true)}
                      className="rounded-full border border-cyan-300/40 bg-cyan-400/15 px-3 py-1 text-[10px] font-medium text-cyan-200 hover:bg-cyan-400/25"
                    >
                      {t('Open Atlas', 'Abrir Atlas')}
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 4: CLIMA DINÁMICO Y CONTINGENCIAS */}
              {activeTab === 'weather' && (
                <div className="mt-3 space-y-2.5 text-[11px]">
                  {marsTime && (
                    <div className="space-y-2 rounded-2xl border border-amber-300/20 bg-black/30 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-100">
                          <Clock className="h-3.5 w-3.5 text-cyan-300" />
                          <span>
                            {isIntuitive
                              ? t('Arcadia Light Cycle', 'Ciclo de Luz Arcadia')
                              : t('Mars24 Ephemeris · Arcadia', 'Efemérides Mars24 · Arcadia')}
                          </span>
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[9.5px] font-semibold ${
                            marsTime.safeSunActive
                              ? 'border border-emerald-400/50 bg-emerald-500/20 text-emerald-200'
                              : marsTime.lightPhase === 'sunset' || marsTime.lightPhase === 'dawn'
                                ? 'border border-sky-400/50 bg-sky-500/20 text-sky-200'
                                : 'border border-indigo-400/40 bg-indigo-500/20 text-indigo-200'
                          }`}
                        >
                          {marsTime.safeSunActive
                            ? t('☀ SAFE SUN ACTIVE', '☀ SOL SEGURO ACTIVO')
                            : `${marsPhaseLabel.toUpperCase()}`}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                        <div className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-1.5">
                          <div className="text-[9px] text-white/50">
                            {t('Arcadia Sol Time', 'Horario Solar Arcadia')}
                          </div>
                          <div className="font-mono font-semibold text-cyan-200">
                            Sol {Math.floor(marsTime.solNumber)} · {marsTime.ltstLabel} LTST
                          </div>
                          <div className="font-mono text-[9px] text-white/50">
                            MTC {marsTime.mtcLabel} · 24h39m35s SI/sol
                          </div>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-1.5">
                          <div className="text-[9px] text-white/50">
                            {isIntuitive
                              ? t('Safe Sun Window', 'Ventana Sol Seguro')
                              : t('Safe Sun (Alt ≥ 12°)', 'Sol Seguro (Alt ≥ 12°)')}
                          </div>
                          <div className="font-mono font-semibold text-emerald-200">
                            {marsTime.safeSunWindowLabel}
                          </div>
                          <div className="font-mono text-[9px] text-white/50">
                            {marsTime.safeSunWindowMarsHours.toFixed(1)} Mars-h ·{' '}
                            {marsTime.daylightMarsHours.toFixed(1)}h {t('day', 'día')}
                          </div>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-1.5">
                          <div className="text-[9px] text-white/50">
                            {t('Sun Alt / Azimuth', 'Altitud / Azimut Solar')}
                          </div>
                          <div className="font-mono font-semibold text-amber-200">
                            {marsTime.solarElevationDeg >= 0 ? '+' : ''}
                            {marsTime.solarElevationDeg.toFixed(1)}° · Az{' '}
                            {Math.round(marsTime.solarAzimuthDeg)}°
                          </div>
                          <div className="font-mono text-[9px] text-white/50">
                            {t('Max Noon', 'Cenit')}: {marsTime.noonMaxElevationDeg.toFixed(1)}°
                          </div>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-1.5">
                          <div className="text-[9px] text-white/50">
                            {t('MCD Temp & Flux', 'Temp MCD y Flujo')}
                          </div>
                          <div
                            className={`font-mono font-semibold ${
                              marsTime.ambientTempC <= -90 ? 'text-sky-200' : 'text-white'
                            }`}
                          >
                            {marsTime.ambientTempC.toFixed(1)} °C · {marsTime.surfaceIrradianceWm2}{' '}
                            W/m²
                          </div>
                          <div className="font-mono text-[9px] text-white/50">
                            {t('Frost', 'Escarcha')}: {Math.round(marsTime.frostCover01 * 100)}% ·{' '}
                            {marsTime.heliocentricAu.toFixed(3)} AU
                          </div>
                        </div>
                      </div>

                      {/* Light Cycle Instant Presets */}
                      <div>
                        <div className="mb-1 flex items-center justify-between text-[9.5px] text-white/60">
                          <span>{t('Diurnal Light Phase', 'Fase Lumínica del Sol')}</span>
                          <span className="font-mono text-white/75">
                            {marsTime.lmstMarsHours.toFixed(2)} Mars-h
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-1">
                          {(
                            [
                              { id: 'dawn', en: 'Dawn', es: 'Amanec.', icon: Sunrise },
                              { id: 'safe-sun', en: 'Safe Sun', es: 'Sol Seg.', icon: Sun },
                              { id: 'sunset', en: 'Sunset', es: 'Atard.', icon: Sunset },
                              { id: 'night', en: 'Night', es: 'Noche', icon: Moon },
                            ] as const
                          ).map((preset) => {
                            const Icon = preset.icon;
                            const isCurrent =
                              (preset.id === 'safe-sun' && marsTime.lightPhase === 'safe-sun') ||
                              marsTime.lightPhase === preset.id;
                            return (
                              <button
                                key={preset.id}
                                type="button"
                                onClick={() => onSelectMarsLightPreset?.(preset.id)}
                                className={`flex items-center justify-center gap-1 rounded-xl border py-1 text-[9.5px] font-medium transition ${
                                  isCurrent
                                    ? 'border-cyan-300/60 bg-cyan-400/20 text-cyan-100'
                                    : 'border-white/10 bg-white/[0.04] text-white/75 hover:border-cyan-300/40 hover:text-white'
                                }`}
                              >
                                <Icon className="h-3 w-3 shrink-0" />
                                <span className="truncate">{t(preset.en, preset.es)}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Sol Clock Scrub & Martian Rotation Rate */}
                      <div className="space-y-1">
                        <input
                          type="range"
                          min={0}
                          max={23.95}
                          step={0.05}
                          value={marsTime.lmstMarsHours}
                          onChange={(e) => onChangeMarsLmstHours?.(parseFloat(e.target.value))}
                          aria-label={t('Arcadia Sol Time Slider', 'Control Horario del Sol Marciano')}
                          className="w-full accent-cyan-400"
                        />
                        <div className="flex items-center justify-between gap-1 text-[9.5px]">
                          <span className="text-white/55">{t('Sol Cycle Speed:', 'Velocidad Sol:')}</span>
                          <div className="flex items-center gap-1">
                            {[0, 1, 12, 60, 600].map((rate) => (
                              <button
                                key={rate}
                                type="button"
                                onClick={() => onChangeMarsTimeRate?.(rate)}
                                className={`rounded-lg border px-1.5 py-0.5 font-mono text-[9px] transition ${
                                  marsTimeRate === rate
                                    ? 'border-cyan-300/60 bg-cyan-400/25 text-cyan-100'
                                    : 'border-white/10 bg-white/5 text-white/60 hover:text-white'
                                }`}
                              >
                                {rate === 0 ? t('Hold', 'Pausa') : `${rate}×`}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Complete Martian Year Seasons (Spring, Summer, Autumn, Winter · 668.6 Sols) */}
                      <div className="border-t border-white/10 pt-2">
                        <div className="mb-1 flex items-center justify-between text-[9.5px] text-white/65">
                          <span>
                            {t('Martian Seasons (668.6 sols/yr)', 'Estaciones de Marte (668,6 soles)')}
                          </span>
                          <span className="font-mono text-amber-200">
                            Ls {marsTime.solarLongitudeLsDeg.toFixed(0)}° · Sol{' '}
                            {marsTime.orbitSol.toFixed(0)}/669
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-1">
                          {(
                            [
                              { id: 'spring', en: 'Spring', es: 'Primav.', sols: '193s' },
                              { id: 'summer', en: 'Summer', es: 'Verano', sols: '178s' },
                              { id: 'autumn', en: 'Autumn', es: 'Otoño', sols: '143s' },
                              { id: 'winter', en: 'Winter', es: 'Invierno', sols: '154s' },
                            ] as const
                          ).map((season) => {
                            const active = marsTime.seasonId === season.id;
                            return (
                              <button
                                key={season.id}
                                type="button"
                                onClick={() => onSelectMarsSeasonPreset?.(season.id)}
                                className={`flex flex-col items-center rounded-xl border py-1 text-[9px] transition ${
                                  active
                                    ? 'border-amber-300/65 bg-amber-400/20 text-amber-100'
                                    : 'border-white/10 bg-white/[0.04] text-white/70 hover:border-amber-300/40 hover:text-white'
                                }`}
                              >
                                <span className="font-semibold">{t(season.en, season.es)}</span>
                                <span className="font-mono text-[8px] text-white/50">
                                  {season.sols}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={359}
                          step={1}
                          value={marsTime.solarLongitudeLsDeg}
                          onChange={(e) => onChangeMarsLsDeg?.(parseFloat(e.target.value))}
                          aria-label={t('Solar Longitude Ls Slider', 'Longitud Solar Ls')}
                          className="mt-1.5 w-full accent-amber-400"
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onTriggerAnomaly && onTriggerAnomaly(isSpe ? 'none' : 'spe')}
                      className={`flex items-center justify-center gap-1.5 rounded-2xl border py-2 text-[10px] font-medium transition ${
                        isSpe
                          ? 'border-amber-300 bg-amber-400/25 text-amber-100'
                          : 'border-white/12 bg-black/25 text-white/80 hover:border-amber-300/50'
                      }`}
                    >
                      <Sun className="h-3.5 w-3.5 text-amber-300" />
                      <span>
                        {isSpe
                          ? isIntuitive
                            ? t('Storm Active', 'Tormenta Activa')
                            : t('SPE Active', 'SPE Activa')
                          : t('Solar Storm', 'Tormenta Solar')}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        onTriggerAnomaly && onTriggerAnomaly(isEmergency ? 'none' : 'sos')
                      }
                      className={`flex items-center justify-center gap-1.5 rounded-2xl border py-2 text-[10px] font-medium transition ${
                        isEmergency
                          ? 'border-rose-400 bg-rose-500/30 text-rose-100'
                          : 'border-white/12 bg-black/25 text-white/80 hover:border-rose-400/50'
                      }`}
                    >
                      <ShieldAlert className="h-3.5 w-3.5 text-rose-400" />
                      <span>
                        {isEmergency
                          ? t('Deactivate SOS', 'Desactivar SOS')
                          : t('SOS Beacon', 'Baliza SOS')}
                      </span>
                    </button>
                  </div>

                  {onChangeDustTau && (
                    <div className="rounded-2xl border border-white/10 bg-black/25 p-2.5 space-y-1.5">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-white/70">
                          {isIntuitive
                            ? t('Dust / Sand Density', 'Densidad de Polvo / Arena')
                            : t('Dust / Storm Opacity (τ)', 'Opacidad de Polvo / Tormenta (τ)')}
                        </span>
                        <span className="font-mono text-amber-300">
                          {isIntuitive
                            ? dustTau > 2.2
                              ? t('Dense', 'Densa')
                              : dustTau > 1.2
                                ? t('Medium', 'Media')
                                : t('Clear', 'Despejada')
                            : dustTau.toFixed(2)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.2}
                        max={2.8}
                        step={0.1}
                        value={dustTau}
                        onChange={(e) => onChangeDustTau(parseFloat(e.target.value))}
                        className="h-1 w-full accent-amber-300"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Visual Spacesuit Forearm Wrist Connector below the right-side AR projection */}
            <div className="mr-8 mt-1.5 flex items-center justify-end gap-2">
              <span className="font-mono text-[9px] text-cyan-300/70">
                {t('OPTICAL PROJECTOR mEMU', 'PROYECTOR ÓPTICO mEMU')}
              </span>
              <div className="h-2.5 w-28 rounded-full border border-cyan-300/40 bg-gradient-to-r from-slate-800 via-cyan-950 to-slate-800 shadow-[0_0_18px_rgba(56,232,255,0.45)]" />
            </div>
          </div>

          {/* Subtle Trigger Hint + Multimodal Dwell SOS / Demo Voice ASR when Forearm is Lowered */}
          {!forearmRaised && (
            <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-1.5">
              {lastVoiceCommand && (
                <span className="rounded-full border border-cyan-300/35 bg-slate-950/60 px-2.5 py-1 font-mono text-[9.5px] text-cyan-200 backdrop-blur-md">
                  ASR: {lastVoiceCommand}
                </span>
              )}
              <button
                type="button"
                onClick={onToggleVoice}
                disabled={!voiceSupported}
                title={
                  voiceSupported
                    ? t('Toggle Web Speech Demo ASR ("return", "sample")', 'Alternar ASR Demo Web Speech ("regresar", "muestra")')
                    : t('Web Speech ASR unavailable in this browser (use Cuff Checklist quick commands)', 'Web Speech ASR no disponible en este navegador (usa comandos rápidos en Protocolo)')
                }
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] backdrop-blur-md transition ${
                  voiceActive
                    ? 'border-emerald-300/70 bg-emerald-500/20 text-emerald-100'
                    : voiceSupported
                      ? 'border-white/12 bg-slate-950/35 text-white/70 hover:border-cyan-300/40 hover:text-white'
                      : 'border-white/8 bg-slate-950/20 text-white/35 cursor-not-allowed'
                }`}
              >
                {voiceActive ? (
                  <Mic className="h-3 w-3 text-emerald-300 animate-pulse" />
                ) : (
                  <MicOff className="h-3 w-3" />
                )}
                <span>{t('Voice ASR', 'Voz ASR')}</span>
              </button>

              {isEmergency ? (
                <button
                  type="button"
                  onClick={() => onTriggerAnomaly?.('none')}
                  title={t('Deactivate vital SOS alert and restore nominal telemetry', 'Desactivar alerta SOS vital y restaurar telemetría nominal')}
                  className="flex items-center gap-1.5 rounded-full border border-[#ff3b5c] bg-[#ff2a4b]/90 px-3 py-1.5 text-[10px] font-semibold text-white backdrop-blur-md shadow-[0_0_16px_rgba(255,42,75,0.45)] transition hover:bg-rose-500"
                >
                  <ShieldAlert className="h-3 w-3 text-white" />
                  <span>{t('✕ Clear SOS', '✕ Desactivar SOS')}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onPointerDown={onStartDwellSos}
                  onPointerUp={onCancelDwellSos}
                  onPointerLeave={onCancelDwellSos}
                  onPointerCancel={onCancelDwellSos}
                  title={t('Hold 2s for Head-Gaze Dwell SOS', 'Mantener 2s para SOS por Fijación Visual')}
                  className="relative overflow-hidden flex items-center gap-1.5 rounded-full border border-rose-400/35 bg-slate-950/40 px-3 py-1.5 text-[10px] text-rose-200 backdrop-blur-md transition hover:border-rose-400/70"
                >
                  <span
                    className="pointer-events-none absolute inset-y-0 left-0 bg-rose-500/35 transition-[width] duration-75"
                    style={{ width: `${Math.min(100, dwellProgress * 100)}%` }}
                  />
                  <ShieldAlert className="relative h-3 w-3 text-rose-400" />
                  <span className="relative">
                    {dwellProgress > 0.02
                      ? `${Math.round(dwellProgress * 100)}% SOS`
                      : t('Hold SOS (2s)', 'SOS 2s')}
                  </span>
                </button>
              )}

              <button
                type="button"
                data-tour="eva-forearm-target"
                onClick={() => setForearmRaised(true)}
                className="flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/30 px-3.5 py-1.5 text-[10px] text-white/65 backdrop-blur-md transition hover:border-cyan-300/40 hover:bg-slate-950/55 hover:text-white"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
                <span>{t('Raise AR Forearm', 'Levantar Antebrazo AR')}</span>
                <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[9px] text-cyan-200">
                  Tab
                </kbd>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* EXPANDED ATLAS MODAL (ONLY WHEN EXPLICITLY OPENED FROM FOREARM AR MAPS TAB) */}
      {expandedAtlasModal && (
        <div
          onClick={() => setExpandedAtlasModal(false)}
          className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-black/55 p-4 backdrop-blur-md"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-3xl border border-white/15 bg-slate-950/85 p-5 text-xs text-white backdrop-blur-2xl shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <div className="text-sm font-semibold text-white">
                  {t('Official Cartography · Arcadia Planitia', 'Cartografía Oficial · Arcadia Planitia')}
                </div>
                <div className="text-[10px] text-cyan-300">
                  {curLat.toFixed(4)}° N, {curLon.toFixed(4)}° {lonDir(lang)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExpandedAtlasModal(false)}
                className="rounded-full border border-white/15 p-1.5 text-white/70 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2">
              {forearmAtlasRefs.map((refItem) => {
                const active = refItem.id === activeVisualRef.id;
                const refCopy = getStudyRefCopy(refItem, lang);
                return (
                  <button
                    key={refItem.id}
                    type="button"
                    onClick={() => setSelectedRefId(refItem.id)}
                    className={`overflow-hidden rounded-2xl border p-1.5 text-left transition ${
                      active
                        ? 'border-cyan-300 bg-cyan-400/15 text-white'
                        : 'border-white/10 bg-white/5 text-white/65'
                    }`}
                  >
                    <img
                      src={refItem.imageUrl}
                      alt={refCopy.title}
                      className="h-14 w-full rounded-xl object-cover"
                    />
                    <div className="mt-1 truncate text-[9px] font-medium">{refCopy.title}</div>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-black/50">
              <img
                src={activeVisualRef.imageUrl}
                alt={activeVisualRefCopy.title}
                className="max-h-[260px] w-full object-contain"
              />
            </div>
            <div className="mt-2 text-[11px] text-white/80">
              <strong className="text-cyan-300">{activeVisualRefCopy.title}:</strong>{' '}
              {activeVisualRefCopy.description}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
