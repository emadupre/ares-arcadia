import React, { useState } from 'react';
import {
  Activity,
  BatteryCharging,
  Dumbbell,
  Droplets,
  Flame,
  HeartPulse,
  Radiation,
  ShieldAlert,
  Utensils,
  Wind,
  X,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import type {
  EmotionalHealthState,
  FoodInventoryState,
  HabitatJumpTarget,
  HudLanguageMode,
  MissionPhase,
  MusculoskeletalState,
  SafetyWorkerTickOutput,
} from '../../types/mission';
import { getEmotionalStatusMeta } from '../shared/emotionalStatus';

type HoloMetricId = 'o2' | 'bat' | 'pulse' | 'musc' | 'effort' | 'rad' | 'res' | 'emot';

interface HolographicStatusBarProps {
  phase: MissionPhase;
  hudMode: HudLanguageMode;
  onToggleHudMode?: () => void;
  safety: SafetyWorkerTickOutput | null;
  heartRateBpm?: number;
  musculoskeletal: MusculoskeletalState;
  supplies: FoodInventoryState;
  emotional: EmotionalHealthState;
  alaraBudgetMicroSv: number;
  speActive: boolean;
  sosActive: boolean;
  plssBackupActive?: boolean;
  tunnelVision?: boolean;
  headMotionFreeze?: boolean;
  onJumpToHabitatSection?: (section: HabitatJumpTarget) => void;
  onSwitchPlssBackup?: () => void;
}

/**
 * Floating frameless holographic status bar inspired by No Man's Sky & Halo.
 * Anchored left-middle across Pre-EVA, EVA, and Post-EVA with zero opaque backdrop
 * so telemetry reads directly against the Martian horizon or habitat viewport.
 */
export const HolographicStatusBar: React.FC<HolographicStatusBarProps> = ({
  phase,
  hudMode,
  onToggleHudMode,
  safety,
  heartRateBpm: heartRateProp,
  musculoskeletal,
  supplies,
  emotional,
  alaraBudgetMicroSv,
  speActive,
  sosActive,
  plssBackupActive = false,
  tunnelVision = false,
  headMotionFreeze = false,
  onJumpToHabitatSection,
  onSwitchPlssBackup,
}) => {
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState<HoloMetricId | null>(null);
  const isIntuitive = hudMode === 'intuitive';

  if (tunnelVision) return null;

  const o2Pct = Math.max(0, Math.min(100, safety?.o2Percent ?? 98));
  const batPct = Math.max(0, Math.min(100, safety?.batteryPercent ?? 96));
  const hrBpm = Math.round(heartRateProp ?? safety?.heartRateBpm ?? (phase === 'eva' ? 88 : 72));
  const hrPct = Math.max(16, Math.min(100, Math.round(((hrBpm - 45) / 125) * 100)));
  const muscPct = Math.max(0, Math.min(100, musculoskeletal.indexPct));
  const watts = Math.round(safety?.metabolicWatts ?? (phase === 'eva' ? 333 : 118));
  const co2MmHg = safety?.co2MmHg ?? 1.9;
  const hypercapnia = Boolean(safety?.hypercapniaAlert);
  const doseRate = safety?.instantDoseRateMicroSvH ?? 27.5;
  const doseTotal = safety?.accumulatedDoseMicroSv ?? 1.4;
  const radSafetyPct = Math.max(
    4,
    Math.min(100, Math.round(100 - (doseTotal / Math.max(1, alaraBudgetMicroSv)) * 100))
  );
  const totalAutonomyDays = Math.round(
    supplies.earthSupplyDaysRemaining + supplies.isruAutonomyGainDays
  );
  const resourcePct = Math.max(
    12,
    Math.min(100, Math.round((totalAutonomyDays / 120) * 100))
  );

  const stageTag =
    phase === 'pre-eva'
      ? 'PRE-EVA'
      : phase === 'eva'
        ? 'EVA'
        : t('EVALUATION · POST-EVA', 'EVALUACIÓN · POST-EVA');

  const items: Array<{
    id: HoloMetricId;
    icon: React.ComponentType<{ className?: string }>;
    pct: number;
    tone: 'cyan' | 'emerald' | 'amber' | 'rose';
    techLabel: string;
    techValue: string;
    intuitiveLabel: string;
    intuitiveValue: string;
    barColor: string;
    glowColor: string;
  }> = [
    {
      id: 'o2',
      icon: Wind,
      pct: o2Pct,
      tone: o2Pct < 30 ? 'rose' : o2Pct < 55 ? 'amber' : 'cyan',
      techLabel: t('O₂ PLSS', 'O₂'),
      techValue: `${o2Pct.toFixed(0)}% · ${(safety?.o2RemainingMin ?? 185).toFixed(0)}m`,
      intuitiveLabel: t('Oxygen', 'Oxígeno'),
      intuitiveValue: `${o2Pct.toFixed(0)}%`,
      barColor: o2Pct < 30 ? '#ff3b5c' : o2Pct < 55 ? '#fbbf24' : '#38e8ff',
      glowColor: o2Pct < 30 ? 'rgba(255,59,92,0.85)' : 'rgba(56,232,255,0.75)',
    },
    {
      id: 'bat',
      icon: BatteryCharging,
      pct: batPct,
      tone: batPct < 25 ? 'rose' : batPct < 50 ? 'amber' : 'emerald',
      techLabel: t('Battery', 'Batería'),
      techValue: `${batPct.toFixed(0)}% · ${(safety?.batteryRemainingMin ?? 220).toFixed(0)}m`,
      intuitiveLabel: t('Power', 'Energía'),
      intuitiveValue: `${batPct.toFixed(0)}%`,
      barColor: batPct < 25 ? '#ff3b5c' : batPct < 50 ? '#fbbf24' : '#34d399',
      glowColor: 'rgba(52,211,153,0.75)',
    },
    {
      id: 'pulse',
      icon: HeartPulse,
      pct: hrPct,
      tone: hrBpm > 140 || sosActive ? 'rose' : hrBpm >= 120 ? 'amber' : 'emerald',
      techLabel: t('Heart Rate', 'Pulso'),
      techValue: `${hrBpm} BPM`,
      intuitiveLabel: t('Pulse', 'Pulso'),
      intuitiveValue:
        hrBpm > 140
          ? `${hrBpm} · ${t('Alert', 'Alto')}`
          : hrBpm >= 120
            ? `${hrBpm} · ${t('High', 'Fuerte')}`
            : `${hrBpm} BPM`,
      barColor: hrBpm > 140 || sosActive ? '#ff3b5c' : hrBpm >= 120 ? '#fbbf24' : '#fb7185',
      glowColor:
        hrBpm > 140 || sosActive ? 'rgba(255,59,92,0.88)' : 'rgba(251,113,133,0.78)',
    },
    {
      id: 'musc',
      icon: Dumbbell,
      pct: muscPct,
      tone: muscPct < 65 ? 'rose' : muscPct < 80 ? 'amber' : 'emerald',
      techLabel: t('Bone / Muscle', 'Óseo-Musc'),
      techValue: `${muscPct.toFixed(0)}% · ${Math.round(musculoskeletal.dailyExerciseMin)}/120m`,
      intuitiveLabel: t('Fitness', 'Físico'),
      intuitiveValue: `${muscPct.toFixed(0)}%`,
      barColor: muscPct < 65 ? '#ff3b5c' : muscPct < 80 ? '#fbbf24' : '#6ee7b7',
      glowColor: 'rgba(110,231,183,0.8)',
    },
    {
      id: 'effort',
      icon: hypercapnia ? ShieldAlert : Flame,
      pct: Math.max(15, Math.min(100, Math.round((watts / 650) * 100))),
      tone: hypercapnia ? 'rose' : watts > 480 ? 'amber' : 'cyan',
      techLabel: hypercapnia ? 'CO₂ ALERT' : t('Work · CO₂', 'Metab · CO₂'),
      techValue: `${watts}W · ${co2MmHg.toFixed(1)}mmHg`,
      intuitiveLabel: hypercapnia ? t('Air Alert', 'Aire / CO₂') : t('Effort', 'Esfuerzo'),
      intuitiveValue: hypercapnia
        ? t('Change Filter', 'Cambiar Filtro')
        : watts > 460
          ? t('High', 'Alto')
          : phase === 'eva'
            ? t('Normal', 'Normal')
            : t('Rest', 'En Base'),
      barColor: hypercapnia ? '#ff3b5c' : watts > 480 ? '#fbbf24' : '#7dd3fc',
      glowColor: hypercapnia ? 'rgba(255,59,92,0.9)' : 'rgba(125,211,252,0.75)',
    },
    {
      id: 'rad',
      icon: Radiation,
      pct: radSafetyPct,
      tone: speActive ? 'rose' : doseTotal > alaraBudgetMicroSv * 0.7 ? 'amber' : 'cyan',
      techLabel: speActive ? 'RAD SPE' : t('Radiation', 'Radiación'),
      techValue: `${doseRate.toFixed(1)} µSv/h`,
      intuitiveLabel: t('Radiation', 'Radiación'),
      intuitiveValue: speActive ? t('Storm!', '¡Tormenta!') : t('Safe', 'Segura'),
      barColor: speActive ? '#ff3b5c' : '#38e8ff',
      glowColor: speActive ? 'rgba(255,59,92,0.88)' : 'rgba(56,232,255,0.72)',
    },
    {
      id: 'res',
      icon: phase === 'eva' ? Activity : Utensils,
      pct: resourcePct,
      tone: totalAutonomyDays < 75 ? 'amber' : 'cyan',
      techLabel: t('Supplies · H₂O', 'Víveres · H₂O'),
      techValue: `${supplies.potableWaterLiters.toFixed(0)}L · ${totalAutonomyDays}d`,
      intuitiveLabel: t('Supplies', 'Víveres'),
      intuitiveValue: `${totalAutonomyDays}d`,
      barColor: totalAutonomyDays < 75 ? '#fbbf24' : '#67e8f9',
      glowColor: 'rgba(103,232,249,0.72)',
    },
    (() => {
      const emoPct = Math.max(0, Math.min(100, Math.round(emotional.integrityPct)));
      const emoMeta = getEmotionalStatusMeta(emoPct);
      return {
        id: 'emot' as const,
        icon: emoMeta.icon,
        pct: emoPct,
        tone: emoMeta.tone,
        techLabel: t('Psy Integrity', 'Integridad'),
        techValue: `${emoPct}% · ${t('Str', 'Est')} ${emotional.isolationStressPct}%`,
        intuitiveLabel: t('Mood', 'Ánimo'),
        intuitiveValue:
          emoMeta.stateKey === 'good'
            ? t('Good', 'Bien')
            : emoMeta.stateKey === 'tense'
              ? t('Tense', 'Tenso')
              : t('Sad', 'Triste'),
        barColor: emoMeta.barColor,
        glowColor: emoMeta.glowColor,
      };
    })(),
  ];

  const toneText = (tone: 'cyan' | 'emerald' | 'amber' | 'rose') => {
    if (tone === 'rose') return 'text-rose-200 nms-holo-crit';
    if (tone === 'amber') return 'text-amber-200 nms-holo-warn';
    if (tone === 'emerald') return 'text-emerald-200 nms-holo-text';
    return 'text-cyan-100 nms-holo-text';
  };

  const selectedItem = items.find((i) => i.id === selectedId) ?? null;

  return (
    <div
      data-tour="status-bar"
      className={`pointer-events-auto fixed left-3.5 top-1/2 z-30 -translate-y-1/2 select-none transition-opacity duration-150 ${
        headMotionFreeze ? 'opacity-25' : 'opacity-100'
      }`}
    >
      {/* Pure Frameless Holographic Projection (zero contrasting box/card) */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 text-[8.5px] font-mono uppercase tracking-[0.22em] text-cyan-200/85 nms-holo-text">
          <span
            className={`h-1.5 w-1.5 rotate-45 ${
              sosActive ? 'bg-rose-400 animate-ping' : 'bg-cyan-300 shadow-[0_0_8px_#38e8ff]'
            }`}
          />
          <span>{stageTag}</span>
        </div>

        <div className="flex flex-col gap-1">
          {items.map((item) => {
            const Icon = item.icon;
            const isSelected = selectedId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId((prev) => (prev === item.id ? null : item.id))}
                title={
                  isIntuitive
                    ? `${item.intuitiveLabel}: ${item.intuitiveValue}`
                    : `${item.techLabel}: ${item.techValue}`
                }
                className="group flex flex-col items-start text-left transition-transform hover:translate-x-1 focus:outline-none"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-5 w-5 items-center justify-center ${
                      item.tone === 'rose'
                        ? 'text-rose-300'
                        : item.tone === 'amber'
                          ? 'text-amber-300'
                          : item.tone === 'emerald'
                            ? 'text-emerald-300'
                            : 'text-cyan-300'
                    }`}
                    style={{ filter: `drop-shadow(0 0 6px ${item.glowColor})` }}
                  >
                    <Icon className={isIntuitive ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
                  </span>
                  <div className="flex flex-col leading-none">
                    <span
                      className={`text-[9px] uppercase tracking-[0.14em] ${
                        isSelected ? 'text-white' : 'text-white/75 group-hover:text-white'
                      } nms-holo-text`}
                    >
                      {isIntuitive ? item.intuitiveLabel : item.techLabel}
                    </span>
                    <span
                      className={`mt-0.5 font-mono font-semibold ${
                        isIntuitive ? 'text-[12px]' : 'text-[10.5px]'
                      } ${toneText(item.tone)}`}
                    >
                      {isIntuitive ? item.intuitiveValue : item.techValue}
                    </span>
                  </div>
                </div>

                {/* Hairline laser bar floating directly in space (no container box) */}
                <div className="mt-0.5 ml-7 h-[2.5px] w-28 overflow-visible bg-white/15">
                  <div
                    className="h-full transition-all duration-300"
                    style={{
                      width: `${Math.max(4, Math.min(100, item.pct))}%`,
                      backgroundColor: item.barColor,
                      boxShadow: `0 0 8px ${item.glowColor}`,
                    }}
                  />
                </div>
              </button>
            );
          })}
        </div>

        {/* Subtle interactive mode switch */}
        {onToggleHudMode && (
          <button
            type="button"
            onClick={onToggleHudMode}
            className="mt-0.5 flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-[0.14em] text-cyan-200/80 nms-holo-text hover:text-white"
          >
            <span className="h-1 w-3 bg-cyan-300 shadow-[0_0_6px_#38e8ff]" />
            <span>
              {isIntuitive ? t('Intuitive ⇄', 'Intuitivo ⇄') : t('Technical ⇄', 'Técnico ⇄')}
            </span>
          </button>
        )}
      </div>

      {/* Inline floating holographic detail popover when user taps a metric */}
      {selectedItem && (
        <div className="pointer-events-auto absolute left-44 top-1/2 -translate-y-1/2 w-52 pl-3">
          <div className="border-l-2 border-cyan-300/80 pl-3 text-[10.5px] text-white nms-holo-text">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-cyan-200 uppercase tracking-wider">
                {isIntuitive ? selectedItem.intuitiveLabel : selectedItem.techLabel}
              </span>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="text-white/60 hover:text-white"
                aria-label={t('Close detail', 'Cerrar detalle')}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-1 text-[10px] leading-snug text-white/90">
              {selectedItem.id === 'musc' && (
                <>
                  <div>
                    {Math.round(musculoskeletal.dailyExerciseMin)}/120 min (2h/d)
                  </div>
                  <div className="text-emerald-200/90">
                    ARED {musculoskeletal.aredVacuumLoadKg}kg · Vol. {musculoskeletal.flywheelInertiaKgCm2} · {musculoskeletal.treadmillHarnessPctBw}% BW
                  </div>
                  {onJumpToHabitatSection && (
                    <button
                      type="button"
                      onClick={() => {
                        onJumpToHabitatSection('gym');
                        setSelectedId(null);
                      }}
                      className="mt-1 inline-flex items-center gap-1 font-mono text-[9.5px] font-bold text-emerald-300 underline hover:text-emerald-100"
                    >
                      <Dumbbell className="h-3 w-3" />
                      {t('Open Gym →', 'Ir al Gimnasio →')}
                    </button>
                  )}
                </>
              )}

              {selectedItem.id === 'res' && (
                <>
                  <div>
                    {t(
                      `Earth <3m: ${supplies.earthSupplyDaysRemaining}d · ISRU: +${supplies.isruAutonomyGainDays}d`,
                      `Tierra <3m: ${supplies.earthSupplyDaysRemaining}d · ISRU: +${supplies.isruAutonomyGainDays}d`
                    )}
                  </div>
                  <div className="text-cyan-200/90">
                    <Droplets className="mr-1 inline h-3 w-3" />
                    {supplies.potableWaterLiters.toFixed(1)}L · {supplies.hydroponicGreensKg.toFixed(1)}kg
                  </div>
                  {onJumpToHabitatSection && (
                    <button
                      type="button"
                      onClick={() => {
                        onJumpToHabitatSection('galley');
                        setSelectedId(null);
                      }}
                      className="mt-1 inline-flex items-center gap-1 font-mono text-[9.5px] font-bold text-cyan-300 underline hover:text-cyan-100"
                    >
                      <Utensils className="h-3 w-3" />
                      {t('Open Food & Samples →', 'Ir a Comida y Muestras →')}
                    </button>
                  )}
                </>
              )}

              {(selectedItem.id === 'o2' || selectedItem.id === 'effort') && (
                <>
                  <div>
                    ΔP {(safety?.suitDeltaPKpa ?? 29.0).toFixed(1)} kPa · {plssBackupActive ? t('Backup LiOH ON', 'LiOH Respaldo ON') : t('Primary Loop', 'Circuito Primario')}
                  </div>
                  {onSwitchPlssBackup && phase === 'eva' && !plssBackupActive && (
                    <button
                      type="button"
                      onClick={() => {
                        onSwitchPlssBackup();
                        setSelectedId(null);
                      }}
                      className="mt-1 font-mono text-[9.5px] font-bold text-amber-300 underline hover:text-amber-100"
                    >
                      {t('Backup PLSS [L] →', 'PLSS Respaldo [L] →')}
                    </button>
                  )}
                </>
              )}

              {selectedItem.id === 'bat' && (
                <div>
                  {t('Battery & suit heaters OK.', 'Batería y calefacción OK.')}
                </div>
              )}

              {selectedItem.id === 'pulse' && (
                <div>
                  {hrBpm} BPM · {t('Tunnel vision threshold >140 BPM', 'Umbral visión de túnel >140 BPM')}
                </div>
              )}

              {selectedItem.id === 'rad' && (
                <div>
                  {doseTotal.toFixed(1)} / {alaraBudgetMicroSv} µSv {t('budget', 'margen')}
                </div>
              )}

              {selectedItem.id === 'emot' && (() => {
                const emoMeta = getEmotionalStatusMeta(emotional.integrityPct);
                const EmoFace = emoMeta.icon;
                return (
                  <>
                    <div>
                      {t('Circadian:', 'Circadiano:')} {emotional.circadianSyncPct}% · {t('Stress:', 'Estrés:')} {emotional.isolationStressPct}%
                    </div>
                    <div className="text-white/75">
                      {emotional.mindfulnessMinToday} min · {emotional.messagesSentCount} {t('Earth msgs', 'msgs Tierra')}
                    </div>
                    {onJumpToHabitatSection && (
                      <button
                        type="button"
                        onClick={() => {
                          onJumpToHabitatSection('emotional');
                          setSelectedId(null);
                        }}
                        className="mt-1 inline-flex items-center gap-1 font-mono text-[9.5px] font-bold text-emerald-300 underline hover:text-emerald-100"
                      >
                        <EmoFace className="h-3 w-3" />
                        {t('Open Emotional →', 'Ir a Emocional →')}
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
