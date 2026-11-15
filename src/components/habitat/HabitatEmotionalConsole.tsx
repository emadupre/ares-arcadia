import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Music,
  Pause,
  Play,
  Radio,
  Send,
  Sprout,
  Sun,
  Users,
  Volume2,
  Wind,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import type { EmotionalHealthState, HudLanguageMode } from '../../types/mission';
import {
  AMBIENT_SOUNDSCAPE_TRACKS,
  ambientSoundscapeEngine,
  type AmbientSoundscapeId,
} from '../../utils/ambientSoundscape';
import { getEmotionalStatusMeta } from '../shared/emotionalStatus';

interface HabitatEmotionalConsoleProps {
  emotional: EmotionalHealthState;
  hudMode: HudLanguageMode;
  onUpdateEmotional: (updater: (prev: EmotionalHealthState) => EmotionalHealthState) => void;
}

const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

interface PublicDomainVista {
  id: string;
  src: string;
  titleEn: string;
  titleEs: string;
  credit: string;
}

const PUBLIC_DOMAIN_VISTAS: readonly PublicDomainVista[] = [
  {
    id: 'nasa-terra-earth',
    src: '/nasa-layers/worldview/gibs_terra_wus_z6_r24_c10.jpg',
    titleEn: 'Earth Home View (Terra Satellite)',
    titleEs: 'Vista de la Tierra (Satélite Terra)',
    credit: 'NASA EOSDIS · Public Domain',
  },
  {
    id: 'nasa-perseverance-horizon',
    src: '/nasa-layers/perseverance/perseverance_mcz.jpg',
    titleEn: 'Martian Horizon · Mastcam-Z',
    titleEs: 'Horizonte Marciano · Mastcam-Z',
    credit: 'NASA/JPL-Caltech · Public Domain',
  },
  {
    id: 'ares-hydroponics',
    src: '/assets/habitat/habitat-hydroponics.jpg',
    titleEn: 'Habitat Bio-Greenhouse',
    titleEs: 'Invernadero Biológico del Módulo',
    credit: 'ARES Experimental · CC0',
  },
  {
    id: 'ares-lounge',
    src: '/assets/habitat/habitat-lounge.jpg',
    titleEn: 'Crew Observation Lounge',
    titleEs: 'Mirador Lounge de Descanso',
    credit: 'ARES Experimental · CC0',
  },
];

type BreathPhaseId = 'inhale' | 'hold' | 'exhale';

function getBreathStep(tickSec: number): {
  phase: BreathPhaseId;
  remainingSec: number;
  scale: number;
} {
  const s = tickSec % 19; // 4s inhale + 7s hold + 8s exhale
  if (s < 4) {
    return {
      phase: 'inhale',
      remainingSec: 4 - s,
      scale: 0.72 + ((s + 1) / 4) * 0.28,
    };
  }
  if (s < 11) {
    return {
      phase: 'hold',
      remainingSec: 11 - s,
      scale: 1.0,
    };
  }
  return {
    phase: 'exhale',
    remainingSec: 19 - s,
    scale: 1.0 - ((s - 10) / 8) * 0.28,
  };
}

/**
 * Sección 03 del Módulo Marciano (Pre-EVA): Salud Emocional e Integridad Psicosocial.
 * Reúne 6 actividades interactivas sin copyright (música/sonidos ambientales CC0 de Tierra
 * y perfil acústico público de Marte, respiración 4-7-8, vistas NASA de dominio público,
 * espectro circadiano, bitácora familiar y cuidado bio-hidropónico).
 */
export const HabitatEmotionalConsole: React.FC<HabitatEmotionalConsoleProps> = ({
  emotional,
  hudMode,
  onUpdateEmotional,
}) => {
  const { t } = useI18n();
  const isIntuitive = hudMode === 'intuitive';
  const [activeAction, setActiveAction] = useState<string | null>(null);

  // 1. Copyright-Free Audio & Music State (Earth + Mars)
  const [selectedTrackId, setSelectedTrackId] =
    useState<AmbientSoundscapeId>('earth-orbital-piano');
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioVolume, setAudioVolume] = useState(0.65);

  // 2. Interactive Guided 4-7-8 Breathing Timer
  const [breathRunning, setBreathRunning] = useState(false);
  const [breathTickSec, setBreathTickSec] = useState(0);

  // 3. NASA Public-Domain Visual Window Index
  const [vistaIdx, setVistaIdx] = useState(0);

  // 5. Journal / Async Earth Message State
  const [journalDraft, setJournalDraft] = useState('');

  const meta = getEmotionalStatusMeta(emotional.integrityPct);
  const FaceIcon = meta.icon;

  const pulseAction = (id: string) => {
    setActiveAction(id);
    window.setTimeout(() => setActiveAction((cur) => (cur === id ? null : cur)), 850);
  };

  const applyImprovement = (
    actionId: string,
    deltaIntegrity: number,
    deltaStress: number,
    extra: Partial<EmotionalHealthState>,
    label: string
  ) => {
    pulseAction(actionId);
    onUpdateEmotional((prev) => ({
      ...prev,
      ...extra,
      integrityPct: clamp(Math.round(prev.integrityPct + deltaIntegrity), 12, 100),
      isolationStressPct: clamp(Math.round(prev.isolationStressPct + deltaStress), 4, 95),
      lastActivityLabel: label,
    }));
  };

  // Cleanup Web Audio on section exit / unmount
  useEffect(() => {
    return () => {
      ambientSoundscapeEngine.stop();
    };
  }, []);

  // Gentle passive therapeutic credit every 10 s while listening to Earth/Mars ambient tracks
  useEffect(() => {
    if (!audioPlaying) return;
    const track =
      AMBIENT_SOUNDSCAPE_TRACKS.find((tr) => tr.id === selectedTrackId) ??
      AMBIENT_SOUNDSCAPE_TRACKS[0];
    const timer = window.setInterval(() => {
      onUpdateEmotional((prev) => ({
        ...prev,
        integrityPct: clamp(Math.round(prev.integrityPct + 3), 12, 100),
        isolationStressPct: clamp(Math.round(prev.isolationStressPct - 4), 4, 95),
        mindfulnessMinToday: Math.min(120, prev.mindfulnessMinToday + 2),
        lastActivityLabel: t(
          `Audio therapy: ${track.titleEn} (no copyright)`,
          `Audio terapia: ${track.titleEs} (sin copyright)`
        ),
      }));
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [audioPlaying, selectedTrackId, onUpdateEmotional, t]);

  // 4-7-8 breathing real-time timer loop
  useEffect(() => {
    if (!breathRunning) return;
    const timer = window.setInterval(() => {
      setBreathTickSec((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [breathRunning]);

  // Reward emotional integrity automatically upon completing each 19s 4-7-8 breathing cycle
  useEffect(() => {
    if (!breathRunning || breathTickSec === 0 || breathTickSec % 19 !== 0) return;
    pulseAction('breath');
    onUpdateEmotional((prev) => ({
      ...prev,
      mindfulnessMinToday: Math.min(120, prev.mindfulnessMinToday + 10),
      integrityPct: clamp(Math.round(prev.integrityPct + 9), 12, 100),
      isolationStressPct: clamp(Math.round(prev.isolationStressPct - 10), 4, 95),
      lastActivityLabel: t(
        '4-7-8 breathing cycle completed (+10m)',
        'Ciclo 4-7-8 completado (+10m)'
      ),
    }));
  }, [breathRunning, breathTickSec, onUpdateEmotional, t]);

  const activeTrack =
    AMBIENT_SOUNDSCAPE_TRACKS.find((tr) => tr.id === selectedTrackId) ??
    AMBIENT_SOUNDSCAPE_TRACKS[0];
  const activeVista = PUBLIC_DOMAIN_VISTAS[vistaIdx] ?? PUBLIC_DOMAIN_VISTAS[0];
  const breathStep = getBreathStep(breathTickSec);

  const handleTogglePlayTrack = () => {
    if (audioPlaying) {
      ambientSoundscapeEngine.stop();
      setAudioPlaying(false);
    } else {
      ambientSoundscapeEngine.start(selectedTrackId, audioVolume);
      setAudioPlaying(true);
    }
  };

  const handleSelectTrack = (id: AmbientSoundscapeId) => {
    setSelectedTrackId(id);
    if (audioPlaying) {
      ambientSoundscapeEngine.start(id, audioVolume);
    }
  };

  const handleCompleteAudioSession = () => {
    if (!audioPlaying) {
      ambientSoundscapeEngine.start(selectedTrackId, audioVolume);
      setAudioPlaying(true);
    }
    applyImprovement(
      'audio',
      10,
      -12,
      { mindfulnessMinToday: Math.min(120, emotional.mindfulnessMinToday + 10) },
      t(
        `${activeTrack.titleEn} session (+10% Integrity)`,
        `Sesión ${activeTrack.titleEs} (+10% Integridad)`
      )
    );
  };

  const handleBreathCompleteManual = () => {
    applyImprovement(
      'breath',
      9,
      -10,
      { mindfulnessMinToday: Math.min(120, emotional.mindfulnessMinToday + 10) },
      t('4-7-8 autonomic breathing (+10m)', 'Respiración 4-7-8 guiada (+10m)')
    );
  };

  const handleContemplateVista = () => {
    applyImprovement(
      'vista',
      6,
      -6,
      { mindfulnessMinToday: Math.min(120, emotional.mindfulnessMinToday + 5) },
      t(`Mindful view: ${activeVista.titleEn}`, `Contemplación: ${activeVista.titleEs}`)
    );
  };

  const handleLightingMode = (mode: EmotionalHealthState['lightingMode']) => {
    const syncDelta = mode === 'sol-morning' ? 9 : mode === 'nominal' ? 6 : 7;
    const integrityDelta = mode === 'sol-morning' ? 6 : mode === 'nominal' ? 5 : 6;
    const label =
      mode === 'sol-morning'
        ? t('480nm Sol-Morning circadian boost', 'Luz 480nm Sol-Mañana activa')
        : mode === 'nominal'
          ? t('Nominal habitat spectrum', 'Espectro nominal de hábitat')
          : t('Warm amber melatonin wind-down', 'Ámbar vespertino para descanso');
    pulseAction('light');
    onUpdateEmotional((prev) => ({
      ...prev,
      lightingMode: mode,
      circadianSyncPct: clamp(prev.circadianSyncPct + syncDelta, 20, 100),
      integrityPct: clamp(prev.integrityPct + integrityDelta, 12, 100),
      isolationStressPct: clamp(prev.isolationStressPct - 5, 4, 95),
      lastActivityLabel: label,
    }));
  };

  const handleFamilyComms = () => {
    const snippet = journalDraft.trim();
    applyImprovement(
      'family',
      8,
      -8,
      { messagesSentCount: emotional.messagesSentCount + 1 },
      snippet
        ? t(`Earth log sent: "${snippet}"`, `Nota a Tierra enviada: "${snippet}"`)
        : t('Async Earth family video sent', 'Cápsula familiar enviada a Tierra')
    );
    setJournalDraft('');
  };

  const handleBioCrewCheck = () => {
    applyImprovement(
      'crew',
      7,
      -7,
      {
        hydroponicCareSessions: emotional.hydroponicCareSessions + 1,
        crewSocialCheckDone: true,
      },
      t('Hydroponic tending + EV-2 check OK', 'Cuidado bio + chequeo EV-2 OK')
    );
  };

  const handleStressDrill = () => {
    pulseAction('stress');
    onUpdateEmotional((prev) => ({
      ...prev,
      integrityPct: clamp(prev.integrityPct - 24, 12, 100),
      isolationStressPct: clamp(prev.isolationStressPct + 22, 4, 95),
      circadianSyncPct: clamp(prev.circadianSyncPct - 10, 20, 100),
      lastActivityLabel: t('Isolation stress drill triggered', 'Simulacro de estrés por aislamiento'),
    }));
  };

  const statusText =
    meta.stateKey === 'good'
      ? t('Stable', 'Estable')
      : meta.stateKey === 'tense'
        ? t('Stressed', 'Tenso')
        : t('Low · Care Needed', 'Bajo · Requiere Atención');

  return (
    <div className="flex h-full w-full flex-col justify-between overflow-y-auto bg-slate-950/60 p-3 text-white">
      {/* Header & Direct Emotional Telemetry */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-1.5">
        <div className="flex items-center gap-2.5">
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl border ${meta.badgeClass}`}>
            <FaceIcon className={`h-5 w-5 ${meta.iconColorClass}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-white">
                {t('Emotional Integrity · Wellness Suite', 'Integridad Emocional · Bienestar Sin Copyright')}
              </h2>
              {audioPlaying && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/50 bg-emerald-400/15 px-2 py-0.5 text-[9px] font-medium text-emerald-200">
                  <Volume2 className="h-2.5 w-2.5 animate-pulse" />
                  {t(activeTrack.titleEn, activeTrack.titleEs)}
                </span>
              )}
            </div>
            <p className="text-[10.5px] text-white/60">
              {t('Earth delay:', 'Latencia Tierra:')} {emotional.familyCommsDelayMin} min ·{' '}
              <span className={meta.iconColorClass}>{statusText}</span> ·{' '}
              <span className="text-cyan-200/80">
                {emotional.mindfulnessMinToday}m {t('wellness', 'bienestar')}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-white/12 bg-black/35 px-3 py-1.5 font-mono">
          <div>
            <div className="text-[8.5px] uppercase tracking-wider text-white/55">
              {isIntuitive ? t('Mood', 'Ánimo') : t('Integrity', 'Integridad')}
            </div>
            <div className={`text-base font-bold tabular-nums ${meta.iconColorClass}`}>
              {emotional.integrityPct}%
            </div>
          </div>
          <div className="h-6 w-px bg-white/12" />
          <div>
            <div className="text-[8.5px] uppercase tracking-wider text-white/55">
              {t('Stress', 'Estrés')}
            </div>
            <div className="text-xs font-semibold tabular-nums text-white/90">
              {emotional.isolationStressPct}%
            </div>
          </div>
          <div className="h-6 w-px bg-white/12" />
          <div>
            <div className="text-[8.5px] uppercase tracking-wider text-white/55">
              {t('Circadian', 'Circadiano')}
            </div>
            <div className="text-xs font-semibold tabular-nums text-cyan-200">
              {emotional.circadianSyncPct}%
            </div>
          </div>
        </div>
      </div>

      {/* 6 Copyright-Free Psychological & Acoustic Wellness Activities */}
      <div className="my-1.5 grid flex-1 grid-cols-1 gap-1.5 sm:grid-cols-2 md:grid-cols-3">
        {/* 1. Copyright-Free Earth Music & Earth/Mars Ambient Soundscapes */}
        <section
          className={`flex flex-col justify-between rounded-xl border p-2 transition ${
            activeAction === 'audio' || audioPlaying
              ? 'border-cyan-300/70 bg-cyan-400/10'
              : 'border-white/12 bg-white/[0.03]'
          }`}
        >
          <div>
            <div className="flex items-center justify-between gap-1">
              <span className="flex items-center gap-1 text-[11px] font-semibold text-white">
                <Music className="h-3 w-3 text-cyan-300" />
                {t('Earth / Mars Audio', 'Música y Ambiente')}
              </span>
              <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[8px] text-cyan-200">
                CC0 · {t('No ©', 'Sin ©')}
              </span>
            </div>

            <div className="mt-1 grid grid-cols-2 gap-1">
              {AMBIENT_SOUNDSCAPE_TRACKS.map((track) => {
                const selected = selectedTrackId === track.id;
                return (
                  <button
                    key={track.id}
                    type="button"
                    onClick={() => handleSelectTrack(track.id)}
                    className={`rounded-lg border px-1.5 py-0.5 text-left text-[9px] leading-tight transition ${
                      selected
                        ? 'border-cyan-300/80 bg-cyan-400/20 text-white'
                        : 'border-white/10 bg-black/25 text-white/65 hover:text-white'
                    }`}
                  >
                    <div className="truncate font-semibold">{t(track.titleEn, track.titleEs)}</div>
                    <div className="truncate font-mono text-[7.5px] text-white/50">
                      {track.origin === 'earth' ? t('Earth', 'Tierra') : t('Mars', 'Marte')} ·{' '}
                      {track.kind === 'music' ? t('Music', 'Música') : t('Ambient', 'Amb.')}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-1 flex items-center gap-1.5 text-[8.5px] text-white/60">
              <Volume2 className="h-3 w-3 shrink-0 text-cyan-300" />
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={audioVolume}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setAudioVolume(v);
                  ambientSoundscapeEngine.setVolume(v);
                }}
                aria-label={t('Ambient audio volume', 'Volumen audio ambiental')}
                className="w-full accent-cyan-300"
              />
              <span className="font-mono text-[8px]">{Math.round(audioVolume * 100)}%</span>
            </div>
          </div>

          <div className="mt-1 flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleTogglePlayTrack}
              className={`flex items-center justify-center gap-1 rounded-lg border px-2 py-1 text-[9.5px] font-semibold transition ${
                audioPlaying
                  ? 'border-emerald-300/70 bg-emerald-400/25 text-emerald-100'
                  : 'border-white/15 bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {audioPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              <span>{audioPlaying ? t('Pause', 'Pausa') : t('Listen', 'Oír')}</span>
            </button>
            <button
              type="button"
              onClick={handleCompleteAudioSession}
              className="flex-1 rounded-lg bg-cyan-300/90 py-1 text-[9.5px] font-semibold text-slate-950 transition hover:bg-cyan-200"
            >
              {t('Log Audio (+10%)', 'Sesión Audio (+10%)')}
            </button>
          </div>
        </section>

        {/* 2. Interactive Guided 4-7-8 Autonomic Breathing */}
        <section
          className={`flex flex-col justify-between rounded-xl border p-2 transition ${
            activeAction === 'breath' || breathRunning
              ? 'border-emerald-300/70 bg-emerald-400/10'
              : 'border-white/12 bg-white/[0.03]'
          }`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-white">
                <Wind className="h-3.5 w-3.5 text-emerald-300" />
                {t('Guided 4-7-8 Calm', 'Respiración 4-7-8')}
              </span>
              <span className="font-mono text-[9.5px] text-emerald-200">
                {emotional.mindfulnessMinToday}m
              </span>
            </div>

            <div className="mt-1.5 flex items-center gap-2.5 rounded-lg border border-white/10 bg-black/30 px-2.5 py-2">
              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center">
                <div
                  className="h-9 w-9 rounded-full border border-emerald-300/70 bg-emerald-400/20 shadow-[0_0_16px_rgba(52,211,153,0.3)] transition-transform duration-700"
                  style={{
                    transform: `scale(${breathRunning ? breathStep.scale.toFixed(2) : '0.84'})`,
                  }}
                />
                <span className="absolute font-mono text-[10px] font-bold text-white">
                  {breathRunning ? `${breathStep.remainingSec}s` : '4-7-8'}
                </span>
              </div>
              <div className="min-w-0 text-[10px]">
                <div className="font-semibold text-emerald-200">
                  {breathRunning
                    ? breathStep.phase === 'inhale'
                      ? t('Inhale Slowly (4s)', 'Inhalá lento (4s)')
                      : breathStep.phase === 'hold'
                        ? t('Hold Breath (7s)', 'Mantené (7s)')
                        : t('Exhale Softly (8s)', 'Exhalá suave (8s)')
                    : t('Vagal Reset Visualizer', 'Guía Visual Vagotónica')}
                </div>
                <p className="text-[9px] text-white/55">
                  {t(
                    'Real-time autonomic breath pacer.',
                    'Reduce frecuencia cardíaca y estrés.'
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-1 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setBreathRunning((r) => !r)}
              className={`rounded-lg border px-2 py-1 text-[9.5px] font-semibold transition ${
                breathRunning
                  ? 'border-emerald-300 bg-emerald-400/25 text-emerald-100'
                  : 'border-white/15 bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {breathRunning ? t('Stop', 'Parar') : t('Start Guide', 'Iniciar')}
            </button>
            <button
              type="button"
              onClick={handleBreathCompleteManual}
              className="flex-1 rounded-lg bg-emerald-300/90 py-1 text-[9.5px] font-semibold text-slate-950 transition hover:bg-emerald-200"
            >
              {t('Complete (+9%)', 'Aplicar (+9%)')}
            </button>
          </div>
        </section>

        {/* 3. NASA Public-Domain Visual Mindfulness Gallery */}
        <section
          className={`flex flex-col justify-between rounded-xl border p-2 transition ${
            activeAction === 'vista' ? 'border-sky-300 bg-sky-400/12' : 'border-white/12 bg-white/[0.03]'
          }`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-[11px] font-semibold text-white">
                <ImageIcon className="h-3 w-3 text-sky-300" />
                {t('Public Domain Window', 'Paisajes Sin Copyright')}
              </span>
              <span className="font-mono text-[8px] text-white/55">
                {vistaIdx + 1}/{PUBLIC_DOMAIN_VISTAS.length}
              </span>
            </div>

            <div className="relative mt-1 h-14 w-full overflow-hidden rounded-lg border border-white/12 bg-black/40">
              <img
                src={activeVista.src}
                alt={t(activeVista.titleEn, activeVista.titleEs)}
                className="h-full w-full object-cover opacity-90"
              />
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/90 via-black/55 to-transparent px-1.5 py-0.5 text-[8.5px]">
                <div className="truncate font-medium text-white">
                  {t(activeVista.titleEn, activeVista.titleEs)}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={t('Previous public-domain vista', 'Vista anterior')}
                    onClick={() =>
                      setVistaIdx((i) => (i - 1 + PUBLIC_DOMAIN_VISTAS.length) % PUBLIC_DOMAIN_VISTAS.length)
                    }
                    className="rounded bg-black/55 p-0.5 text-white/80 hover:text-white"
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    aria-label={t('Next public-domain vista', 'Siguiente vista')}
                    onClick={() => setVistaIdx((i) => (i + 1) % PUBLIC_DOMAIN_VISTAS.length)}
                    className="rounded bg-black/55 p-0.5 text-white/80 hover:text-white"
                  >
                    <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-0.5 truncate font-mono text-[8px] text-white/50">
              {activeVista.credit}
            </div>
          </div>

          <button
            type="button"
            onClick={handleContemplateVista}
            className="mt-1 w-full rounded-lg border border-sky-300/45 bg-sky-400/15 py-1 text-[9.5px] font-semibold text-sky-100 transition hover:bg-sky-400/25"
          >
            {t('Mindful Break (+6%)', 'Contemplar Vista (+6%)')}
          </button>
        </section>

        {/* 4. Circadian Light Therapy (24h 39m Mars Sol) */}
        <section
          className={`flex flex-col justify-between rounded-xl border p-2 transition ${
            activeAction === 'light' ? 'border-amber-300 bg-amber-400/12' : 'border-white/12 bg-white/[0.03]'
          }`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-[11px] font-semibold text-white">
                <Sun className="h-3 w-3 text-amber-300" />
                {t('Circadian Light', 'Luz Circadiana')}
              </span>
              <span className="font-mono text-[9px] text-amber-200">
                {emotional.circadianSyncPct}% sync
              </span>
            </div>
            <p className="mt-1 text-[9.5px] leading-snug text-white/65">
              {t(
                'Calibrate LED spectrum to Arcadia 24h 39m solar cycle.',
                'Sincroniza espectro LED al sol marciano de 24h 39m.'
              )}
            </p>
            <div
              className={`mt-1.5 h-1.5 w-full rounded-full transition-all ${
                emotional.lightingMode === 'sol-morning'
                  ? 'bg-gradient-to-r from-sky-400 via-cyan-300 to-blue-400'
                  : emotional.lightingMode === 'nominal'
                    ? 'bg-gradient-to-r from-slate-200 via-white to-cyan-100'
                    : 'bg-gradient-to-r from-amber-500 via-orange-400 to-rose-400'
              }`}
            />
          </div>

          <div className="mt-1.5 grid grid-cols-3 gap-1 text-[9px]">
            {(
              [
                { id: 'sol-morning', label: t('480nm Sol', 'Sol 480nm') },
                { id: 'nominal', label: t('Nominal', 'Nominal') },
                { id: 'amber-dusk', label: t('Amber Dusk', 'Ámbar Ocaso') },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleLightingMode(opt.id)}
                className={`rounded-lg border py-1 font-medium transition ${
                  emotional.lightingMode === opt.id
                    ? 'border-amber-300 bg-amber-400/20 text-amber-100'
                    : 'border-white/12 bg-white/5 text-white/70 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        {/* 5. Personal Gratitude Log & Async Earth Family Link */}
        <section
          className={`flex flex-col justify-between rounded-xl border p-2 transition ${
            activeAction === 'family' ? 'border-cyan-300 bg-cyan-400/12' : 'border-white/12 bg-white/[0.03]'
          }`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-[11px] font-semibold text-white">
                <Radio className="h-3 w-3 text-cyan-300" />
                {t('Journal & Earth Link', 'Bitácora y Enlace Tierra')}
              </span>
              <span className="font-mono text-[9px] text-white/60">
                {emotional.messagesSentCount} {t('sent', 'env.')}
              </span>
            </div>

            <div className="mt-1 flex flex-wrap gap-1">
              {[
                t('Clear horizon', 'Horizonte sereno'),
                t('Team in sync', 'Equipo en calma'),
                t('Greeting Earth', 'Saludo a casa'),
              ].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setJournalDraft(chip)}
                  className="rounded-full border border-white/12 bg-white/5 px-1.5 py-0.5 text-[8px] text-white/70 hover:border-cyan-300/50 hover:text-white"
                >
                  + {chip}
                </button>
              ))}
            </div>

            <input
              type="text"
              value={journalDraft}
              onChange={(e) => setJournalDraft(e.target.value)}
              placeholder={t('Quick reflection / message...', 'Pensamiento o mensaje breve...')}
              className="mt-1 w-full rounded-lg border border-white/12 bg-black/35 px-2 py-0.5 text-[9.5px] text-white placeholder:text-white/35 focus:border-cyan-300/60 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={handleFamilyComms}
            className="mt-1 flex w-full items-center justify-center gap-1 rounded-lg bg-cyan-300/90 py-1 text-[9.5px] font-semibold text-slate-950 transition hover:bg-cyan-200"
          >
            <Send className="h-3 w-3" />
            {t('Send Earth Log (+8%)', 'Enviar Cápsula (+8%)')}
          </button>
        </section>

        {/* 6. Bio-Greenhouse Care & EV-2 Peer Check-in */}
        <section
          className={`flex flex-col justify-between rounded-xl border p-2 transition ${
            activeAction === 'crew' ? 'border-emerald-300 bg-emerald-400/12' : 'border-white/12 bg-white/[0.03]'
          }`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-[11px] font-semibold text-white">
                <Sprout className="h-3 w-3 text-emerald-300" />
                {t('Bio Care & EV-2 Sync', 'Bio-Huerto y EV-2')}
              </span>
              <span className="font-mono text-[9px] text-emerald-200">
                <Users className="mr-0.5 inline h-2.5 w-2.5" />
                {emotional.crewSocialCheckDone ? 'EV-2 OK' : t('Pending', 'Pendiente')}
              </span>
            </div>
            <p className="mt-1 text-[9.5px] leading-snug text-white/65">
              {t(
                'Tactile Earth plants tending & crewmate psychosocial check.',
                'Contacto terapéutico con plantas terrestres y charla con EV-2.'
              )}
            </p>
            <div className="mt-1 flex items-center justify-between rounded-lg border border-white/10 bg-black/30 px-2 py-1 font-mono text-[9px] text-white/75">
              <span>{t('Greenhouse sessions:', 'Sesiones bio:')}</span>
              <span className="font-semibold text-emerald-300">
                {emotional.hydroponicCareSessions}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleBioCrewCheck}
            className="mt-1 w-full rounded-lg border border-emerald-300/45 bg-emerald-400/15 py-1 text-[9.5px] font-semibold text-emerald-100 transition hover:bg-emerald-400/25"
          >
            {t('Tend Bio + Sync EV-2 (+7%)', 'Cuidar Bio + EV-2 (+7%)')}
          </button>
        </section>
      </div>

      {/* Footer Status & Stress Test Drill */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/35 px-3 py-1 text-[9.5px]">
        <div className="flex items-center gap-2 text-white/85">
          <FaceIcon className={`h-3.5 w-3.5 shrink-0 ${meta.iconColorClass}`} />
          <span>{emotional.lastActivityLabel}</span>
        </div>
        <button
          type="button"
          onClick={handleStressDrill}
          className="inline-flex items-center gap-1 rounded-lg border border-amber-300/35 bg-amber-400/10 px-2.5 py-0.5 font-mono text-[9.5px] text-amber-200 transition hover:bg-amber-400/20"
        >
          <AlertTriangle className="h-3 w-3" />
          {t('Stress Drill (-24%)', 'Simular Estrés (-24%)')}
        </button>
      </div>
    </div>
  );
};
