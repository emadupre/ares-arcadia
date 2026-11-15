import React from 'react';
import {
  Activity,
  Compass,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Sun,
  Wind,
  X,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import type {
  AnomalyTrigger,
  MarsEphemerisState,
  MarsSeasonId,
  PoiStation,
  RouteMetrics,
} from '../../types/mission';

interface JudgeSandboxPanelProps {
  open: boolean;
  onClose: () => void;
  simPlaying: boolean;
  onTogglePlay: () => void;
  simSpeed: number;
  onChangeSpeed: (s: number) => void;
  simElapsedSec: number;
  anomaly: AnomalyTrigger;
  onTriggerAnomaly: (trigger: AnomalyTrigger) => void;
  onStartDemo30s: () => void;
  demo30sActive: boolean;
  onResetEva: () => void;
  onArriveAirlock: () => void;
  activeRoute: RouteMetrics | null;
  fps: number;
  frameRenderMs: number;
  targetPoiId: string;
  pois?: PoiStation[];
  onChangeTargetPoiId: (id: string) => void;
  onCollectNearbySample: () => void;
  marsTime?: MarsEphemerisState;
  marsTimeRate?: number;
  onChangeMarsTimeRate?: (rate: number) => void;
  onSelectMarsLightPreset?: (preset: 'dawn' | 'safe-sun' | 'sunset' | 'night') => void;
  onSelectMarsSeasonPreset?: (season: MarsSeasonId) => void;
}

export const JudgeSandboxPanel: React.FC<JudgeSandboxPanelProps> = ({
  open,
  onClose,
  simPlaying,
  onTogglePlay,
  simSpeed,
  onChangeSpeed,
  simElapsedSec,
  anomaly,
  onTriggerAnomaly,
  onStartDemo30s,
  demo30sActive,
  onResetEva,
  onArriveAirlock,
  activeRoute,
  fps,
  frameRenderMs,
  targetPoiId,
  pois = [],
  onChangeTargetPoiId,
  onCollectNearbySample,
  marsTime,
  marsTimeRate = 12,
  onChangeMarsTimeRate,
  onSelectMarsLightPreset,
  onSelectMarsSeasonPreset,
}) => {
  const { t } = useI18n();
  if (!open) return null;

  return (
    <aside className="nms-chamfer absolute right-4 top-16 z-30 flex max-h-[calc(100%-88px)] w-[340px] flex-col gap-2.5 overflow-y-auto border border-[#38e8ff]/40 bg-[#050a12]/90 p-3 text-xs backdrop-blur-md shadow-2xl">
      <div className="flex items-center justify-between border-b border-[#38e8ff]/20 pb-2">
        <div>
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#38e8ff]">
            {t('SIM // JUDGE SANDBOX', 'SIM // SANDBOX JURADO')}
          </div>
          <div className="font-mono text-[10px] text-[#f4efe6]/60">
            {fps} FPS · {frameRenderMs} ms · t={Math.floor(simElapsedSec)} s
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="nms-chamfer-sm border border-white/15 p-1 text-[#f4efe6]/70 hover:border-[#38e8ff] hover:text-[#f4efe6]"
          aria-label={t('Close Sandbox', 'Cerrar Sandbox')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Control de Marcha y Destino */}
      <section className="space-y-2 border-b border-white/10 pb-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onTogglePlay}
            className="nms-chamfer-sm flex items-center gap-1 bg-[#38e8ff] px-3 py-1 font-mono text-[11px] font-bold text-[#04070d] hover:bg-[#7ef3ff]"
          >
            {simPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {simPlaying ? t('PAUSE', 'PAUSAR') : 'AUTO-EVA'}
          </button>

          {[1, 3, 6].map((spd) => (
            <button
              key={spd}
              type="button"
              onClick={() => onChangeSpeed(spd)}
              className={`nms-chamfer-sm border px-2 py-1 font-mono text-[10px] font-bold ${
                simSpeed === spd
                  ? 'border-[#38e8ff] bg-[#38e8ff]/20 text-[#38e8ff]'
                  : 'border-white/15 bg-white/5 text-[#f4efe6]/65'
              }`}
            >
              {spd}×
            </button>
          ))}

          <button
            type="button"
            onClick={onResetEva}
            className="nms-chamfer-sm ml-auto border border-white/15 bg-white/5 p-1.5 text-[#f4efe6]/75 hover:border-[#38e8ff]"
            title={t('Reset EVA from Ares Base', 'Reiniciar EVA desde Base Ares')}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <Compass className="h-3.5 w-3.5 text-[#38e8ff]" />
          <select
            value={targetPoiId}
            onChange={(e) => onChangeTargetPoiId(e.target.value)}
            className="flex-1 border border-white/15 bg-[#04070d] px-2 py-1 font-mono text-[10px] text-[#f4efe6]"
          >
            <option value="POI-02">
              {t('POI-02 · Exposed Ice Crater (-420,+780)', 'POI-02 · Cráter con Hielo (-420,+780)')}
            </option>
            <option value="POI-03">
              {t('POI-03 · Aa1–Aa5–Aa2 Contact (+640,+220)', 'POI-03 · Contacto Aa1–Aa5–Aa2 (+640,+220)')}
            </option>
            <option value="POI-04">
              {t('POI-04 · Volcanic Cone Aa2 (+1180,-540)', 'POI-04 · Cono Volcánico Aa2 (+1180,-540)')}
            </option>
            <option value="POI-05">
              {t('POI-05 · Shelter Scarp (-860,-620)', 'POI-05 · Escarpe Refugio (-860,-620)')}
            </option>
            <option value="POI-01">
              {t('POI-01 · Ares Base (0,0)', 'POI-01 · Base Ares (0,0)')}
            </option>
            {pois
              .filter(
                (p) =>
                  !['POI-01', 'POI-02', 'POI-03', 'POI-04', 'POI-05'].includes(p.id)
              )
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id} · {p.name} ({p.x},{p.y})
                </option>
              ))}
          </select>
          <button
            type="button"
            onClick={onCollectNearbySample}
            className="nms-chamfer-sm border border-[#38e8ff]/40 bg-[#38e8ff]/15 px-2 py-1 font-mono text-[10px] font-bold text-[#38e8ff] hover:bg-[#38e8ff]/25"
          >
            +0.85kg
          </button>
        </div>
      </section>

      {/* Disparadores de Anomalías */}
      <section className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-wider text-[#ffae24]">
            <Activity className="h-3 w-3" /> {t('Anomaly Injection', 'Inyección de Anomalías')}
          </span>
          <button
            type="button"
            onClick={onStartDemo30s}
            className={`nms-chamfer-sm flex items-center gap-1 border px-2 py-0.5 font-mono text-[10px] font-bold ${
              demo30sActive
                ? 'border-[#38e8ff] bg-[#38e8ff] text-[#04070d] animate-pulse'
                : 'border-[#ffae24]/50 bg-[#ffae24]/15 text-[#ffae24]'
            }`}
          >
            <Sparkles className="h-3 w-3" /> Demo 30s
          </button>
        </div>

        <button
          type="button"
          onClick={() => onTriggerAnomaly(anomaly === 'sos' ? 'none' : 'sos')}
          className={`nms-chamfer-sm flex w-full items-center justify-between border px-2.5 py-2 text-left font-bold transition ${
            anomaly === 'sos'
              ? 'border-[#ff2a4b] bg-[#ff2a4b]/30 text-[#f4efe6]'
              : 'border-[#ff2a4b]/45 bg-[#ff2a4b]/10 text-[#ff2a4b] hover:bg-[#ff2a4b]/20'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <ShieldAlert className="h-4 w-4" /> {t('1. VITAL SOS ALERT', '1. ALERTA SOS VITAL')}
          </span>
          <span className="font-mono text-[9px]">
            {anomaly === 'sos' ? t('ACTIVE · CLEAR', 'ACTIVO · QUITAR') : 'O₂ / ΔP / BPM'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onTriggerAnomaly(anomaly === 'spe' ? 'none' : 'spe')}
          className={`nms-chamfer-sm flex w-full items-center justify-between border px-2.5 py-1.5 text-left transition ${
            anomaly === 'spe'
              ? 'border-[#ff2a4b] bg-[#ff2a4b]/25 font-bold text-[#ff8fa3]'
              : 'border-white/15 bg-white/5 text-[#f4efe6]/80 hover:border-[#ffae24]/50'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Sun className="h-3.5 w-3.5 text-[#ffae24]" /> {t('2. Solar Storm (SPE)', '2. Tormenta Solar (SPE)')}
          </span>
          <span className="font-mono text-[9px] text-[#ffae24]">
            {anomaly === 'spe' ? `ALARA → ${activeRoute?.targetId ?? 'POI-05'}` : 'w_r ×10 · POI-05'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onTriggerAnomaly(anomaly === 'dust' ? 'none' : 'dust')}
          className={`nms-chamfer-sm flex w-full items-center justify-between border px-2.5 py-1.5 text-left transition ${
            anomaly === 'dust'
              ? 'border-[#ff2a4b] bg-[#ff2a4b]/25 font-bold text-[#ff8fa3]'
              : 'border-white/15 bg-white/5 text-[#f4efe6]/80 hover:border-[#38e8ff]/50'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Wind className="h-3.5 w-3.5 text-[#38e8ff]" /> {t('3. Dust Storm (τ>2.5)', '3. Tormenta de Polvo (τ>2.5)')}
          </span>
          <span className="font-mono text-[9px] text-[#38e8ff]">
            {anomaly === 'dust' ? 'SOS → POI-01' : 'mmWave · SOS'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onTriggerAnomaly(anomaly === 'hypercapnia' ? 'none' : 'hypercapnia')}
          className={`nms-chamfer-sm flex w-full items-center justify-between border px-2.5 py-1.5 text-left text-[11px] transition ${
            anomaly === 'hypercapnia'
              ? 'border-[#ff2a4b] bg-[#ff2a4b]/25 text-[#f4efe6]'
              : 'border-white/10 bg-white/5 text-[#f4efe6]/70'
          }`}
        >
          <span>{t('+ Silent Hypercapnia (CO₂)', '+ Hipercapnia Silenciosa (CO₂)')}</span>
          <span className="font-mono text-[9px]">
            {anomaly === 'hypercapnia' ? t('ACTIVE', 'ACTIVO') : t('PASSIVE', 'PASIVA')}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onTriggerAnomaly(anomaly === 'roverFault' ? 'none' : 'roverFault')}
          className={`nms-chamfer-sm flex w-full items-center justify-between border px-2.5 py-1.5 text-left text-[11px] transition ${
            anomaly === 'roverFault'
              ? 'border-violet-400 bg-violet-500/25 font-bold text-violet-100'
              : 'border-white/10 bg-white/5 text-[#f4efe6]/70 hover:border-violet-300/45'
          }`}
        >
          <span>{t('+ Rover Comms Fault (RF Failover)', '+ Falla Enlace Rover (Failover RF)')}</span>
          <span className="font-mono text-[9px] text-violet-300">
            {anomaly === 'roverFault' ? t('ACTIVE · HAB/REP', 'ACTIVO · HAB/REP') : 'CU-07'}
          </span>
        </button>
      </section>

      {marsTime && (
        <section className="space-y-1.5 border-t border-white/10 pt-2">
          <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-amber-200/80">
            <span>{t('Arcadia Light & Seasons', 'Ciclo Solar y Estaciones')}</span>
            <span>
              Sol {Math.floor(marsTime.solNumber)} · {marsTime.ltstLabel}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {(
              [
                { id: 'dawn', en: 'Dawn', es: 'Aman.' },
                { id: 'safe-sun', en: 'Safe Sun', es: 'Sol Seg.' },
                { id: 'sunset', en: 'Sunset', es: 'Atard.' },
                { id: 'night', en: 'Night', es: 'Noche' },
              ] as const
            ).map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelectMarsLightPreset?.(preset.id)}
                className={`nms-chamfer-sm border py-1 text-[10px] font-medium transition ${
                  marsTime.lightPhase === preset.id
                    ? 'border-cyan-300 bg-cyan-400/20 text-cyan-100'
                    : 'border-white/10 bg-white/5 text-[#f4efe6]/75 hover:border-cyan-300/40'
                }`}
              >
                {t(preset.en, preset.es)}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-1">
            {(
              [
                { id: 'spring', en: 'Spring', es: 'Prim.' },
                { id: 'summer', en: 'Summer', es: 'Verano' },
                { id: 'autumn', en: 'Autumn', es: 'Otoño' },
                { id: 'winter', en: 'Winter', es: 'Invier.' },
              ] as const
            ).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelectMarsSeasonPreset?.(s.id)}
                className={`nms-chamfer-sm border py-1 text-[10px] transition ${
                  marsTime.seasonId === s.id
                    ? 'border-amber-300 bg-amber-400/20 font-semibold text-amber-100'
                    : 'border-white/10 bg-white/5 text-[#f4efe6]/70 hover:border-amber-300/40'
                }`}
              >
                {t(s.en, s.es)}
              </button>
            ))}
          </div>
          {onChangeMarsTimeRate && (
            <div className="flex items-center justify-between gap-1 text-[9.5px] text-[#f4efe6]/65">
              <span>
                {marsTime.ambientTempC.toFixed(0)}°C ·{' '}
                {marsTime.safeSunActive
                  ? t('Safe Sun', 'Sol Seguro')
                  : `${marsTime.safeSunWindowMarsHours.toFixed(1)}h`}
              </span>
              <div className="flex gap-1">
                {[0, 12, 600].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => onChangeMarsTimeRate(r)}
                    className={`rounded border px-1.5 py-0.5 font-mono text-[9px] ${
                      marsTimeRate === r
                        ? 'border-cyan-300 bg-cyan-400/25 text-cyan-100'
                        : 'border-white/10 bg-white/5 text-white/60'
                    }`}
                  >
                    {r === 0 ? '0×' : `${r}×`}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {activeRoute && (
        <div className="grid grid-cols-2 gap-1 border-t border-white/10 pt-2 font-mono text-[10px] text-[#f4efe6]/75">
          <div>A*: <strong className="text-[#38e8ff]">{activeRoute.convergenceMs} ms</strong></div>
          <div>Dist: <strong className="text-[#f4efe6]">{activeRoute.distanceMeters} m</strong></div>
          <div>Rad: <strong className="text-[#38e8ff]">-{activeRoute.radiationReductionPct}%</strong></div>
          <div>Metab: <strong className="text-[#38e8ff]">-{activeRoute.metabolicSavingPct}%</strong></div>
        </div>
      )}

      <button
        type="button"
        onClick={onArriveAirlock}
        className="nms-chamfer-btn mt-1 w-full border border-[#38e8ff]/60 bg-[#38e8ff]/15 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#38e8ff] hover:bg-[#38e8ff] hover:text-[#04070d]"
      >
        {t('Go to Post-EVA Airlock →', 'Ir a Esclusa Post-EVA →')}
      </button>
    </aside>
  );
};
