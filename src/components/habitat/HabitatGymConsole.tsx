import React, { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Disc,
  Dumbbell,
  Footprints,
  Gauge,
  HeartPulse,
  Sparkles,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import type { HudLanguageMode, MusculoskeletalState } from '../../types/mission';

interface HabitatGymConsoleProps {
  musculoskeletal: MusculoskeletalState;
  astronautMassKg: number;
  hudMode: HudLanguageMode;
  embedded?: boolean;
  onUpdateMusculoskeletal: (updater: (prev: MusculoskeletalState) => MusculoskeletalState) => void;
}

type AredExerciseId = 'squat' | 'deadlift' | 'press';

const ARED_LOAD_LIMITS: Record<AredExerciseId, { minKg: number; maxKg: number }> = {
  squat: { minKg: 10, maxKg: 85 },
  deadlift: { minKg: 15, maxKg: 90 },
  press: { minKg: 10, maxKg: 45 },
};

/**
 * Sección 3 del Módulo Marciano: Gimnasio e Interfaz de Recomposición Óseo-Muscular.
 * Implementa las 3 máquinas integradas para contrarrestar la micro/baja gravedad (0.38g):
 * 1) Pistones de vacío (ARED, carga astronauta 10–90 kg), 2) Volante de inercia excéntrico (Flywheel), y
 * 3) Cinta de correr con arnés elástico (70%–80% peso terrestre).
 */
export const HabitatGymConsole: React.FC<HabitatGymConsoleProps> = ({
  musculoskeletal,
  astronautMassKg,
  hudMode,
  embedded = false,
  onUpdateMusculoskeletal,
}) => {
  const { t } = useI18n();
  const isIntuitive = hudMode === 'intuitive';

  const [aredExercise, setAredExercise] = useState<AredExerciseId>('squat');
  const [activePulse, setActivePulse] = useState<'ared' | 'flywheel' | 'treadmill' | null>(null);
  const aredLimits = ARED_LOAD_LIMITS[aredExercise];
  const clampedAredLoadKg = Math.min(
    aredLimits.maxKg,
    Math.max(aredLimits.minKg, musculoskeletal.aredVacuumLoadKg)
  );

  const handleSelectAredExercise = (ex: AredExerciseId) => {
    setAredExercise(ex);
    const nextLimits = ARED_LOAD_LIMITS[ex];
    if (
      musculoskeletal.aredVacuumLoadKg < nextLimits.minKg ||
      musculoskeletal.aredVacuumLoadKg > nextLimits.maxKg
    ) {
      onUpdateMusculoskeletal((prev) => ({
        ...prev,
        aredVacuumLoadKg: Math.min(nextLimits.maxKg, Math.max(nextLimits.minKg, prev.aredVacuumLoadKg)),
      }));
    }
  };

  const triggerPulse = (machine: 'ared' | 'flywheel' | 'treadmill') => {
    setActivePulse(machine);
    window.setTimeout(() => setActivePulse((cur) => (cur === machine ? null : cur)), 850);
  };

  const dailyPct = Math.min(100, Math.round((musculoskeletal.dailyExerciseMin / 120) * 100));
  const earthForceN = (astronautMassKg * 9.81 * (musculoskeletal.treadmillHarnessPctBw / 100)).toFixed(0);
  const marsUnaidedN = (astronautMassKg * 3.72243).toFixed(0);

  const handleRunAredSet = () => {
    triggerPulse('ared');
    onUpdateMusculoskeletal((prev) => ({
      ...prev,
      indexPct: Math.min(100, Number((prev.indexPct + 4.2).toFixed(1))),
      dailyExerciseMin: Math.min(240, prev.dailyExerciseMin + 20),
      aredRepsLogged: prev.aredRepsLogged + 12,
      lastStimulusLabel:
        aredExercise === 'squat'
          ? t('ARED Vacuum Squat (12 reps)', 'Sentadilla Pistón Vacío ARED (12 reps)')
          : aredExercise === 'deadlift'
            ? t('ARED Vacuum Deadlift (12 reps)', 'Peso Muerto ARED (12 reps)')
            : t('ARED Constant-Force Press (12 reps)', 'Press Pistón Vacío ARED (12 reps)'),
    }));
  };

  const handleRunFlywheelSet = () => {
    triggerPulse('flywheel');
    const kjGain = Number((musculoskeletal.flywheelInertiaKgCm2 * 0.14).toFixed(1));
    onUpdateMusculoskeletal((prev) => ({
      ...prev,
      indexPct: Math.min(100, Number((prev.indexPct + 5.0).toFixed(1))),
      dailyExerciseMin: Math.min(240, prev.dailyExerciseMin + 15),
      flywheelEccentricWorkKj: Number((prev.flywheelEccentricWorkKj + kjGain).toFixed(1)),
      lastStimulusLabel: t(
        `Flywheel Eccentric Braking (+${kjGain} kJ)`,
        `Frenado Excéntrico Volante (+${kjGain} kJ)`
      ),
    }));
  };

  const handleRunTreadmill = () => {
    triggerPulse('treadmill');
    onUpdateMusculoskeletal((prev) => ({
      ...prev,
      indexPct: Math.min(100, Number((prev.indexPct + 4.6).toFixed(1))),
      dailyExerciseMin: Math.min(240, prev.dailyExerciseMin + 25),
      treadmillImpactKm: Number((prev.treadmillImpactKm + 2.4).toFixed(1)),
      lastStimulusLabel: t(
        `Harness Stride (${prev.treadmillHarnessPctBw}% Earth BW -> Femur/Tibia)`,
        `Zancada Arnés (${prev.treadmillHarnessPctBw}% Peso Tierra -> Fémur/Tibia)`
      ),
    }));
  };

  return (
    <div className={`flex h-full w-full flex-col justify-between overflow-y-auto bg-slate-950/55 text-white ${embedded ? 'p-3' : 'p-4'}`}>
      {/* Header & Daily 2h Protocol Monitor */}
      {!embedded && (
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-2.5">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-white">
            <Dumbbell className="h-4 w-4 text-emerald-300" />
            <span>{t('Base Gym · 0.38g', 'Gimnasio Base · 0,38g')}</span>
          </h2>
          <p className="text-[11px] text-white/60">
            {t('Daily goal: 120 min (2h min)', 'Protocolo: 2h mín./día')}
          </p>
        </div>

        {/* Live Base Astronaut Biometric Monitor */}
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-300/35 bg-emerald-500/10 px-3.5 py-2">
          <div>
            <div className="text-[9.5px] uppercase tracking-wider text-emerald-200/80">
              {isIntuitive ? t('Fitness', 'Físico') : t('Bone / Muscle', 'Óseo-Muscular')}
            </div>
            <div className="font-mono text-xl font-bold text-emerald-300">
              {musculoskeletal.indexPct.toFixed(1)}%
            </div>
          </div>
          <div className="h-9 w-px bg-white/15" />
          <div>
            <div className="flex items-center gap-1.5 text-[9.5px] uppercase tracking-wider text-cyan-200/80">
              <HeartPulse className="h-3 w-3 text-cyan-300" />
              <span>{t('Daily Goal', 'Meta 2h/d')}</span>
            </div>
            <div className="font-mono text-xs font-semibold text-white">
              {musculoskeletal.dailyExerciseMin} / 120m ({dailyPct}%)
            </div>
            <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-white/15">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  dailyPct >= 100 ? 'bg-emerald-400' : 'bg-cyan-300'
                }`}
                style={{ width: `${dailyPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Compact single-line biometric bar when embedded inside Physical Section */}
      {embedded && (
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-2 text-[11px]">
          <div className="flex items-center gap-3">
            <span className="font-medium text-white/75">
              {isIntuitive ? t('Fitness', 'Físico') : t('Bone / Muscle', 'Óseo-Muscular')}:
              <strong className="ml-1.5 font-mono text-emerald-300">{musculoskeletal.indexPct.toFixed(1)}%</strong>
            </span>
            <span className="text-white/25">|</span>
            <span className="font-mono text-white/80">
              {musculoskeletal.dailyExerciseMin}/120 min ({dailyPct}%)
            </span>
          </div>
          <div className="h-1.5 w-32 overflow-hidden rounded-full bg-white/12">
            <div
              className={`h-full transition-all duration-300 ${dailyPct >= 100 ? 'bg-emerald-400' : 'bg-cyan-300'}`}
              style={{ width: `${dailyPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Interactive 3 Countermeasure Machines inside Martian Habitat */}
      <div className="my-2 grid flex-1 grid-cols-1 gap-2.5 md:grid-cols-3">
        {/* MACHINE 1: Pistones de Vacío (ARED) */}
        <section
          className={`flex flex-col justify-between rounded-2xl border p-2.5 transition-all ${
            activePulse === 'ared'
              ? 'border-cyan-300 bg-cyan-400/18 shadow-[0_0_25px_rgba(56,232,255,0.28)]'
              : 'border-white/14 bg-white/[0.04]'
          }`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-400/15 px-2.5 py-0.5 font-mono text-[9.5px] font-semibold text-cyan-200">
                <Gauge className="h-3 w-3" /> ARED
              </span>
              <span className="font-mono text-[10px] text-white/60">
                {musculoskeletal.aredRepsLogged} reps
              </span>
            </div>
            <h3 className="mt-2 text-xs font-semibold text-white">
              {t('1. Vacuum Pistons', '1. Pistones de Vacío')}
            </h3>
            <p className="mt-0.5 text-[10px] text-white/60">
              {t('Constant load at 0.38g', 'Carga constante sin gravedad')}
            </p>

            {/* Interactive SVG Schematic of Vacuum Cylinder */}
            <div className="my-2 flex items-center justify-between rounded-xl border border-white/10 bg-black/35 px-3 py-2">
              <svg viewBox="0 0 120 42" className="h-9 w-24 shrink-0">
                <rect x="6" y="12" width="38" height="18" rx="3" fill="rgba(56,232,255,0.16)" stroke="#38e8ff" strokeWidth="1.4" />
                <line
                  x1={activePulse === 'ared' ? 28 : 44}
                  y1="21"
                  x2="108"
                  y2="21"
                  stroke="#f4efe6"
                  strokeWidth="2.5"
                  className="transition-all duration-300"
                />
                <circle cx="108" cy="21" r="6" fill="none" stroke="#ffae24" strokeWidth="2" />
                <text x="25" y="24" textAnchor="middle" fill="#38e8ff" fontSize="8" fontFamily="monospace">
                  VAC
                </text>
              </svg>
              <div className="text-right font-mono">
                <div className="whitespace-nowrap text-[9px] text-white/55">{t('Load', 'Carga')}</div>
                <div className="whitespace-nowrap text-sm font-bold text-cyan-300">
                  {clampedAredLoadKg} kg
                </div>
                <div className="whitespace-nowrap text-[8px] text-white/45">
                  {aredLimits.minKg}–{aredLimits.maxKg} kg
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <input
                type="range"
                min={aredLimits.minKg}
                max={aredLimits.maxKg}
                step={5}
                value={clampedAredLoadKg}
                onChange={(e) => {
                  const val = Math.min(aredLimits.maxKg, Math.max(aredLimits.minKg, Number(e.target.value)));
                  onUpdateMusculoskeletal((prev) => ({ ...prev, aredVacuumLoadKg: val }));
                }}
                aria-label={t('ARED vacuum load in kilograms', 'Carga ARED en kilogramos')}
                className="h-1.5 w-full accent-cyan-300"
              />
              <div className="grid grid-cols-3 gap-1 pt-0.5 text-[9.5px]">
                {(['squat', 'deadlift', 'press'] as const).map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => handleSelectAredExercise(ex)}
                    className={`rounded-lg border py-1 font-medium transition ${
                      aredExercise === ex
                        ? 'border-cyan-300 bg-cyan-400/20 text-cyan-100'
                        : 'border-white/10 bg-white/5 text-white/65 hover:text-white'
                    }`}
                  >
                    {ex === 'squat'
                      ? t('Squat', 'Sentadilla')
                      : ex === 'deadlift'
                        ? t('Deadlift', 'Peso Muerto')
                        : 'Press'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRunAredSet}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-cyan-300/90 py-2 text-[11px] font-semibold text-slate-950 transition hover:bg-cyan-200"
          >
            <Dumbbell className="h-3.5 w-3.5" />
            <span>{t('Run Set (+20m · +4.2%)', 'Serie ARED (+20m · +4,2%)')}</span>
          </button>
        </section>

        {/* MACHINE 2: Volantes de Inercia (Flywheel) */}
        <section
          className={`flex flex-col justify-between rounded-2xl border p-2.5 transition-all ${
            activePulse === 'flywheel'
              ? 'border-amber-300 bg-amber-400/18 shadow-[0_0_25px_rgba(251,191,36,0.28)]'
              : 'border-white/14 bg-white/[0.04]'
          }`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-2.5 py-0.5 font-mono text-[9.5px] font-semibold text-amber-200">
                <Disc className={`h-3 w-3 ${activePulse === 'flywheel' ? 'animate-spin' : ''}`} />{' '}
                FLYWHEEL
              </span>
              <span className="font-mono text-[10px] text-white/60">
                {musculoskeletal.flywheelEccentricWorkKj.toFixed(1)} kJ
              </span>
            </div>
            <h3 className="mt-2 text-xs font-semibold text-white">
              {t('2. Flywheel Disk', '2. Volante de Inercia')}
            </h3>
            <p className="mt-0.5 text-[10px] text-white/60">
              {t('Eccentric bone & muscle braking', 'Frenado excéntrico máximo')}
            </p>

            {/* Spinning Flywheel Visualization */}
            <div className="my-2 flex items-center justify-between rounded-xl border border-white/10 bg-black/35 px-3 py-2">
              <svg
                viewBox="0 0 60 44"
                className={`h-9 w-14 shrink-0 ${activePulse === 'flywheel' ? 'animate-spin' : ''}`}
              >
                <circle cx="30" cy="22" r="16" fill="rgba(251,191,36,0.14)" stroke="#ffae24" strokeWidth="2.2" />
                <circle cx="30" cy="22" r="5" fill="#ffae24" />
                <line x1="30" y1="6" x2="30" y2="38" stroke="#fde68a" strokeWidth="1.2" />
                <line x1="14" y1="22" x2="46" y2="22" stroke="#fde68a" strokeWidth="1.2" />
              </svg>
              <div className="text-right font-mono">
                <div className="text-[9px] text-white/55">{t('Peak', 'Frenado')}</div>
                <div className="text-sm font-bold text-amber-300">
                  +{Math.round(musculoskeletal.flywheelInertiaKgCm2 * 2.6)} Nm
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-[10px] text-white/65">{t('Inertia', 'Inercia')}</div>
              <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                {[25, 50, 75].map((inertia) => (
                  <button
                    key={inertia}
                    type="button"
                    onClick={() =>
                      onUpdateMusculoskeletal((prev) => ({
                        ...prev,
                        flywheelInertiaKgCm2: inertia,
                      }))
                    }
                    className={`rounded-lg border py-1.5 font-mono transition ${
                      musculoskeletal.flywheelInertiaKgCm2 === inertia
                        ? 'border-amber-300 bg-amber-400/20 text-amber-100'
                        : 'border-white/10 bg-white/5 text-white/65 hover:text-white'
                    }`}
                  >
                    {inertia}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRunFlywheelSet}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-amber-300/95 py-2 text-[11px] font-semibold text-slate-950 transition hover:bg-amber-200"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>{t('Brake Disk (+15m · +5.0%)', 'Serie Volante (+15m · +5,0%)')}</span>
          </button>
        </section>

        {/* MACHINE 3: Arneses con Bandas Elásticas en Cinta de Correr (70%-80% Peso Terrestre) */}
        <section
          className={`flex flex-col justify-between rounded-2xl border p-2.5 transition-all ${
            activePulse === 'treadmill'
              ? 'border-emerald-300 bg-emerald-400/18 shadow-[0_0_25px_rgba(52,211,153,0.28)]'
              : 'border-white/14 bg-white/[0.04]'
          }`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-2.5 py-0.5 font-mono text-[9.5px] font-semibold text-emerald-200">
                <Footprints className="h-3 w-3" /> 70–80% BW
              </span>
              <span className="font-mono text-[10px] text-white/60">
                {musculoskeletal.treadmillImpactKm.toFixed(1)} km
              </span>
            </div>
            <h3 className="mt-2 text-xs font-semibold text-white">
              {t('3. Harness Treadmill', '3. Cinta con Arnés Elástico')}
            </h3>
            <p className="mt-0.5 text-[10px] text-white/60">
              {t('Femur & tibia bone impact', 'Impacto fémur y tibia')}
            </p>

            {/* Impact Downforce Readout */}
            <div className="my-2 flex items-center justify-between rounded-xl border border-white/10 bg-black/35 px-3 py-2 font-mono">
              <div>
                <div className="text-[9px] text-white/55">0.38g</div>
                <div className="text-xs text-white/65">{marsUnaidedN} N</div>
              </div>
              <Activity className="h-4 w-4 text-emerald-300" />
              <div className="text-right">
                <div className="text-[9px] text-emerald-200">{t('Harness', 'Arnés')}</div>
                <div className="text-sm font-bold text-emerald-300">{earthForceN} N</div>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px] text-white/75">
                <span>{t('Tension (70–80%)', 'Tensión (70–80%)')}</span>
                <span className="font-mono text-emerald-300">
                  {musculoskeletal.treadmillHarnessPctBw}%
                </span>
              </div>
              <input
                type="range"
                min={70}
                max={80}
                step={1}
                value={musculoskeletal.treadmillHarnessPctBw}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  onUpdateMusculoskeletal((prev) => ({ ...prev, treadmillHarnessPctBw: val }));
                }}
                className="h-1.5 w-full accent-emerald-300"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleRunTreadmill}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-300/95 py-2 text-[11px] font-semibold text-slate-950 transition hover:bg-emerald-200"
          >
            <Footprints className="h-3.5 w-3.5" />
            <span>{t('Run Harness (+25m · +4.6%)', 'Correr Arnés (+25m · +4,6%)')}</span>
          </button>
        </section>
      </div>

      {/* Footer Status */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/35 px-3 py-1.5 text-[10.5px]">
        <div className="flex items-center gap-2 text-emerald-200">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
          <strong className="text-white">{musculoskeletal.lastStimulusLabel}</strong>
        </div>
        <span className="font-mono text-[10px] text-cyan-200/80">
          {dailyPct >= 100
            ? t('2h Goal Done', 'Meta 2h OK')
            : t(`${120 - Math.min(120, musculoskeletal.dailyExerciseMin)}m left`, `-${120 - Math.min(120, musculoskeletal.dailyExerciseMin)}m`)}
        </span>
      </div>
    </div>
  );
};
