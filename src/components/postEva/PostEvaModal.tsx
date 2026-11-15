import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Database,
  Download,
  Lock,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Unlock,
} from 'lucide-react';
import type { PostEvaReport } from '../../types/mission';
import {
  HABITAT_SCENES,
  MartianHabitatBackdrop,
} from '../habitat/MartianHabitatBackdrop';
import { SpacecraftConsoleFrame } from '../habitat/SpacecraftConsoleFrame';
import { useI18n } from '../../i18n/I18nContext';
import { getWazeTitle, HABITAT_SCENE_LABELS, lonDir } from '../../i18n/catalog';

interface PostEvaModalProps {
  report: PostEvaReport;
  onRestartMission: () => void;
  onExportGeoJson?: () => void;
  sceneIdx?: number;
  onChangeSceneIdx?: (idx: number) => void;
}

export const PostEvaModal: React.FC<PostEvaModalProps> = ({
  report,
  onRestartMission,
  onExportGeoJson,
  sceneIdx: externalSceneIdx,
  onChangeSceneIdx,
}) => {
  const { lang, t } = useI18n();
  const [airlockRunning, setAirlockRunning] = useState(false);
  const [airlockStep, setAirlockStep] = useState(0); // 0=idle, 1=dust, 2=seals, 3=repressurize, 4=done
  const [stepProgress, setStepProgress] = useState(0);
  const [localSceneIdx, setLocalSceneIdx] = useState(0);
  const [povOffset, setPovOffset] = useState({ x: 0, y: 0 });

  const sceneIdx = externalSceneIdx ?? localSceneIdx;
  const setSceneIdx = onChangeSceneIdx ?? setLocalSceneIdx;

  const dustCleaned = airlockStep >= 2;
  const sealsVerified = airlockStep >= 3;
  const repressurized = airlockStep >= 4;
  const helmetUnlockAuthorized = airlockStep >= 4;

  // Cycle smoothly across habitat scenes only when used standalone
  useEffect(() => {
    if (externalSceneIdx !== undefined) return;
    const id = window.setInterval(() => {
      setLocalSceneIdx((prev) => (prev + 1) % HABITAT_SCENES.length);
    }, 5500);
    return () => window.clearInterval(id);
  }, [externalSceneIdx]);

  // Automatic pressurized airlock sequence
  useEffect(() => {
    if (!airlockRunning || airlockStep >= 4) return;
    const stepDurationMs =
      airlockStep === 1 && report.dustStormEncountered ? 1800 : 1100;
    const start = performance.now();

    const timer = window.setInterval(() => {
      const elapsed = performance.now() - start;
      const pct = Math.min(100, (elapsed / stepDurationMs) * 100);
      setStepProgress(pct);
      if (elapsed >= stepDurationMs) {
        window.clearInterval(timer);
        if (airlockStep < 3) {
          setAirlockStep((s) => s + 1);
          setStepProgress(0);
        } else {
          setAirlockStep(4);
          setAirlockRunning(false);
          setStepProgress(100);
        }
      }
    }, 50);

    return () => window.clearInterval(timer);
  }, [airlockRunning, airlockStep, report.dustStormEncountered]);

  const startAirlockCycle = () => {
    setAirlockStep(1);
    setStepProgress(0);
    setAirlockRunning(true);
  };

  const handleDownloadJson = () => {
    const payload = {
      ...report,
      airlockVerified: helmetUnlockAuthorized,
      datasetSynced: helmetUnlockAuthorized,
      exportedAtIso: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ares-arcadia-post-eva-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const steps = [
    {
      num: '01',
      title: t('EDS Dust Purge (ClO₄⁻)', 'Barrido Polvo EDS (ClO₄⁻)'),
      detail: t(`${report.airlockDustRemovedPct}% purged`, `${report.airlockDustRemovedPct}% removido`),
      done: dustCleaned,
      active: airlockRunning && airlockStep === 1,
    },
    {
      num: '02',
      title: t('Seal & ΔP Check', 'Test Sellos y ΔP'),
      detail: t('ΔP OK · Zero particulate', 'ΔP OK · Cero partículas'),
      done: sealsVerified,
      active: airlockRunning && airlockStep === 2,
    },
    {
      num: '03',
      title: t('Pressure (0.61 → 101.3 kPa)', 'Presión (0.61 → 101.3 kPa)'),
      detail: `${report.repressurizedKpa} kPa`,
      done: repressurized,
      active: airlockRunning && airlockStep === 3,
    },
  ];

  const distDeltaM = report.distanceWalkedM - report.plannedDistanceM;

  return (
    <div
      onMouseMove={(e) => {
        const nx = (e.clientX / window.innerWidth - 0.5) * 2;
        const ny = (e.clientY / window.innerHeight - 0.5) * 2;
        setPovOffset({ x: nx, y: ny });
      }}
      onMouseLeave={() => setPovOffset({ x: 0, y: 0 })}
      className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#06090f] p-3 sm:p-5 lg:p-6 md:pl-[184px]"
    >
      <MartianHabitatBackdrop sceneIdx={sceneIdx} povOffset={povOffset} />

      <div className="relative z-10 flex max-h-full w-full flex-col items-center justify-center gap-3">
        {/* Top high-contrast caption + team patch & NASA Space Apps Challenge logo */}
        <div className="pointer-events-none flex flex-wrap items-center justify-center gap-4 rounded-full border border-white/20 bg-slate-950/85 px-4 sm:px-5 py-1.5 backdrop-blur-md shadow-[0_8px_28px_rgba(0,0,0,0.85)]">
          <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full ring-1 ring-white/30">
            <img
              src="/assets/habitat/ares-arcadia-patch.jpg"
              alt={t('Ares Arcadia Team Patch', 'Logo Equipo Ares Arcadia')}
              className="h-full w-full object-cover"
            />
          </div>
          <p className="text-center font-sans text-[11px] sm:text-[12.5px] font-semibold tracking-[0.04em] text-white antialiased [text-shadow:0_1px_4px_rgba(0,0,0,0.95)]">
            {t(
              'A.R.E.S HUD SYSTEM Simulated in an AI Experimental Environment',
              'SISTEMA A.R.E.S HUD Simulado en un entorno experimental por IA'
            )}
          </p>
          <img
            src="/assets/logos/nasa-space-apps-challenge.png"
            alt="NASA Space Apps Challenge Logo"
            className="h-7 w-auto max-w-[140px] object-contain"
          />
        </div>

        <SpacecraftConsoleFrame
          variant="wall-tv"
          povOffset={povOffset}
          wrapperClassName="w-[min(90vw,860px)]"
          screenClassName="justify-between gap-3 overflow-y-auto p-3.5 sm:p-4 text-xs antialiased"
        >
            {/* Calm High-Definition Header */}
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-2.5 rounded-[16px] border border-white/16 bg-white/[0.07] px-4 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
              <div>
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-cyan-200">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300 shadow-[0_0_8px_#38e8ff]" />
                  <span>{t('Evaluation · Post-EVA', 'Evaluación · Post-EVA')}</span>
                </div>
                <h2 className="mt-0.5 text-lg sm:text-xl font-semibold tracking-tight text-white leading-snug">
                  {t('Post-EVA Audit', 'Auditoría Post-EVA')}
                </h2>
                <p className="text-[11px] font-mono text-slate-300">
                  47.55°N, -163.17°{lonDir(lang)} · Aa1·Aa2·Aa5
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {/* Habitat camera tour switcher pills */}
                <div className="flex items-center gap-0.5 rounded-full border border-white/18 bg-black/40 p-0.5">
                  {HABITAT_SCENES.map((s, idx) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSceneIdx(idx)}
                      className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-medium transition ${
                        idx === sceneIdx
                          ? 'bg-white/24 text-white shadow-sm'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {HABITAT_SCENE_LABELS[lang][idx] ?? s.label}
                    </button>
                  ))}
                </div>

                <div
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition ${
                    helmetUnlockAuthorized
                      ? 'border-emerald-300/60 bg-emerald-400/20 text-emerald-100'
                      : 'border-amber-200/50 bg-amber-300/18 text-amber-100'
                  }`}
                >
                  {helmetUnlockAuthorized ? (
                    <Unlock className="h-3.5 w-3.5" />
                  ) : (
                    <Lock className="h-3.5 w-3.5" />
                  )}
                  <span>
                    {helmetUnlockAuthorized
                      ? t('Unlocked · Synced', 'Habilitado')
                      : airlockRunning
                        ? t('Pressurizing...', 'Presurizando...')
                        : t('Standby', 'En espera')}
                  </span>
                </div>
              </div>
            </div>

            {/* Two Sharp High-Contrast Columns */}
            <div className="relative z-10 grid flex-1 gap-3 lg:grid-cols-12">
              {/* Column 1: Post-EVA Verification (6 cols) */}
              <section className="flex flex-col justify-between rounded-[18px] border border-white/16 bg-white/[0.06] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] lg:col-span-6">
                <div>
                  <div className="mb-2.5 flex items-center justify-between border-b border-white/15 pb-1.5">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-white">
                      <ShieldCheck className="h-4 w-4 text-cyan-300" />
                      {t('Post-EVA Check', 'Control Post-EVA')}
                    </span>
                    <span className="rounded-full bg-white/12 px-2.5 py-0.5 font-mono text-[10.5px] text-slate-100">
                      {repressurized ? '101.3 kPa' : '0.61 kPa'}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {steps.map((s) => (
                      <div
                        key={s.num}
                        className={`rounded-xl border p-2.5 transition-all ${
                          s.done
                            ? 'border-cyan-200/60 bg-cyan-400/18'
                            : s.active
                              ? 'border-amber-200/65 bg-amber-300/18'
                              : 'border-white/14 bg-white/[0.06]'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <span
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-semibold ${
                              s.done
                                ? 'bg-cyan-300 text-slate-950'
                                : s.active
                                  ? 'bg-amber-300 text-slate-950'
                                  : 'border border-white/30 bg-white/10 text-white'
                            }`}
                          >
                            {s.done ? <CheckCircle2 className="h-3.5 w-3.5" /> : s.num}
                          </span>
                          <div className="flex-1">
                            <div className="text-xs font-semibold text-white">{s.title}</div>
                            <div className="mt-0.5 text-[11px] leading-snug text-slate-200">
                              {s.detail}
                            </div>
                            {s.active && (
                              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
                                <div
                                  className="h-full rounded-full bg-amber-300 transition-all"
                                  style={{ width: `${Math.round(stepProgress)}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  data-tour="post-eva-verify"
                  disabled={airlockRunning || helmetUnlockAuthorized}
                  onClick={startAirlockCycle}
                  className={`mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold transition ${
                    helmetUnlockAuthorized
                      ? 'border border-emerald-300/60 bg-emerald-400/22 text-emerald-100'
                      : airlockRunning
                        ? 'border border-amber-300/60 bg-amber-300/22 text-amber-100'
                        : 'bg-white text-slate-950 shadow-[0_6px_20px_rgba(255,255,255,0.22)] hover:bg-slate-100'
                  }`}
                >
                  {helmetUnlockAuthorized ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" />{' '}
                      {t('Verified · Habitat Open', 'Verificado · Hábitat OK')}
                    </>
                  ) : airlockRunning ? (
                    <>{t('Verifying...', 'Verificando...')}</>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5 fill-current" />{' '}
                      {t('Start Verification', 'Iniciar Verificación')}
                    </>
                  )}
                </button>
              </section>

              {/* Column 2: Mission Reading & Audit (6 cols) */}
              <section className="flex flex-col justify-between rounded-[18px] border border-white/16 bg-white/[0.06] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] lg:col-span-6">
                <div>
                  <div className="mb-2.5 flex items-center justify-between border-b border-white/15 pb-1.5">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-white">
                      <Database className="h-4 w-4 text-amber-200" />
                      {t('Pre-EVA vs EVA', 'Plan vs EVA')}
                    </span>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[10.5px] font-medium ${
                        report.reachedPlannedPoi
                          ? 'border-emerald-300/60 bg-emerald-400/20 text-emerald-100'
                          : 'border-amber-200/55 bg-amber-300/20 text-amber-100'
                      }`}
                    >
                      {report.reachedPlannedPoi
                        ? t('Objective Met', 'Objetivo Cumplido')
                        : t('Early Return', 'Retorno Anticipado')}
                    </span>
                  </div>

                  <div className="mb-2 rounded-xl border border-white/14 bg-white/[0.06] px-3 py-2">
                    <div className="text-[10.5px] text-slate-300">
                      {t('Planned Destination', 'Destino Planificado')}
                    </div>
                    <div className="mt-0.5 text-[13px] font-semibold text-white">
                      {report.plannedPoiId} · {report.plannedPoiName}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-white/14 bg-white/[0.06] p-2.5">
                      <div className="text-[10.5px] text-slate-300">
                        {t('Actual / Plan Distance', 'Distancia Real / Plan')}
                      </div>
                      <div className="mt-0.5 font-mono text-[13px] font-semibold text-white">
                        {report.distanceWalkedM} m{' '}
                        <span className="text-[10px] font-normal text-slate-300">
                          ({distDeltaM >= 0 ? `+${distDeltaM}` : distDeltaM} m vs{' '}
                          {report.plannedDistanceM} m)
                        </span>
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/14 bg-white/[0.06] p-2.5">
                      <div className="text-[10.5px] text-slate-300">
                        {t('Actual Dose / ALARA', 'Dosis Real / ALARA')}
                      </div>
                      <div className="mt-0.5 font-mono text-[13px] font-semibold text-amber-200">
                        {report.totalDoseMicroSv} μSv{' '}
                        <span className="text-[10px] font-normal text-slate-300">
                          ({t('max', 'máx')} {report.alaraBudgetMicroSv})
                        </span>
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/14 bg-white/[0.06] p-2.5">
                      <div className="text-[10.5px] text-slate-300">
                        {t('Samples Collected', 'Muestras Recolectadas')}
                      </div>
                      <div className="mt-0.5 font-mono text-[13px] font-semibold text-cyan-200">
                        {report.samplesCollectedKg.toFixed(2)} kg / 7.00 kg
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/14 bg-white/[0.06] p-2.5">
                      <div className="text-[10.5px] text-slate-300">
                        {t('Cached Deposit', 'Depósito en Caché')}
                      </div>
                      <div className="mt-0.5 font-mono text-[13px] font-semibold text-white">
                        {report.samplesCachedKg.toFixed(2)} kg
                      </div>
                    </div>
                  </div>

                  <div className="mt-2.5 flex flex-wrap gap-1.5 text-[10.5px]">
                    <span
                      className={`rounded-full border px-2.5 py-0.5 font-medium ${
                        report.speEncountered
                          ? 'border-amber-200/60 bg-amber-300/22 text-amber-100'
                          : 'border-white/18 bg-white/8 text-slate-200'
                      }`}
                    >
                      {t('SPE Solar Storm', 'Tormenta Solar SPE')}:{' '}
                      {report.speEncountered ? t('Mitigated', 'Mitigada') : 'Nominal'}
                    </span>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 font-medium ${
                        report.dustStormEncountered
                          ? 'border-cyan-200/60 bg-cyan-300/22 text-cyan-100'
                          : 'border-white/18 bg-white/8 text-slate-200'
                      }`}
                    >
                      {t('Dust τ > 2.5', 'Polvo τ > 2.5')}:{' '}
                      {report.dustStormEncountered
                        ? t('Logged', 'Registrado')
                        : t('No event', 'Sin evento')}
                    </span>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 font-medium ${
                        report.sosTriggered
                          ? 'border-rose-300/65 bg-rose-400/25 text-rose-100'
                          : 'border-white/18 bg-white/8 text-slate-200'
                      }`}
                    >
                      {t('Vital SOS Alert', 'Alerta SOS Vital')}:{' '}
                      {report.sosTriggered
                        ? t('Triggered', 'Activada')
                        : t('Nominal', 'Sin incidentes')}
                    </span>
                    <span className="rounded-full border border-violet-300/45 bg-violet-400/15 px-2.5 py-0.5 font-medium text-violet-100">
                      {t('Repeaters', 'Repetidores')}: {report.repeatersDeployedCount ?? 0}
                    </span>
                    <span className="rounded-full border border-emerald-300/45 bg-emerald-400/15 px-2.5 py-0.5 font-medium text-emerald-100">
                      {t('PLSS Scrubber', 'Depurador PLSS')}:{' '}
                      {report.plssBackupSwitched
                        ? t('CU-06 Backup LiOH', 'Respaldo LiOH CU-06')
                        : t('Primary', 'Primario')}
                    </span>
                    <span className="rounded-full border border-cyan-300/40 bg-cyan-400/12 px-2.5 py-0.5 font-medium text-cyan-100">
                      NASA Trek · USGS · M2020 · GIBS
                    </span>
                    <span className="rounded-full border border-emerald-300/45 bg-emerald-400/15 px-2.5 py-0.5 font-medium text-emerald-100">
                      {t('Bone & Muscle', 'Estado Óseo-Muscular')}:{' '}
                      {(report.musculoskeletalIndexPct ?? 84).toFixed(0)}%
                    </span>
                    <span className="rounded-full border border-cyan-300/45 bg-cyan-400/15 px-2.5 py-0.5 font-medium text-cyan-100">
                      {t('Emotional Integrity', 'Integridad Emocional')}:{' '}
                      {(report.emotionalIntegrityPct ?? 78).toFixed(0)}%
                    </span>
                    <span className="rounded-full border border-amber-300/40 bg-amber-400/12 px-2.5 py-0.5 font-medium text-amber-100">
                      {t('ISRU Food', 'Víveres ISRU')}:{' '}
                      {Math.round(
                        (report.earthSupplyDaysRemaining ?? 78) +
                          (report.isruAutonomyGainDays ?? 14)
                      )}
                      d
                    </span>
                  </div>

                  <div className="mt-2.5">
                    <div className="mb-1 flex items-center gap-1 text-[11px] font-medium text-cyan-200">
                      <Sparkles className="h-3.5 w-3.5" />{' '}
                      {t('Anomalies & Findings', 'Anomalías y Hallazgos')} (
                      {report.anomaliesCaptured.length})
                    </div>
                    {report.anomaliesCaptured.length === 0 ? (
                      <div className="rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2 text-[11px] text-slate-200">
                        {t(
                          'No secondary anomalies captured on this EVA.',
                          'Sin anomalías secundarias capturadas en esta salida.'
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {report.anomaliesCaptured.map((a) => (
                          <div
                            key={a.id}
                            className="flex items-center justify-between rounded-lg border border-cyan-200/35 bg-cyan-300/14 px-3 py-1.5 text-[11px]"
                          >
                            <span className="font-medium text-white">
                              {getWazeTitle(a, lang)}
                            </span>
                            <span className="font-mono text-cyan-200">+{a.sampleMassKg} kg</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-2.5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadJson}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/24 bg-white/12 px-2.5 py-2.5 text-[11px] font-medium text-white transition hover:bg-white/22"
                  >
                    <Download className="h-3.5 w-3.5" />{' '}
                    {t('Export JSON Log', 'Exportar Bitácora JSON')}
                  </button>
                  {onExportGeoJson && (
                    <button
                      type="button"
                      onClick={onExportGeoJson}
                      title={t(
                        'Export IAU 2000 Mars GeoJSON (route, POIs & samples)',
                        'Exportar GeoJSON Marte IAU 2000 (ruta, POIs y muestras)'
                      )}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-cyan-300/35 bg-cyan-400/12 px-2.5 py-2.5 text-[11px] font-medium text-cyan-100 transition hover:bg-cyan-400/22"
                    >
                      <Download className="h-3.5 w-3.5 text-cyan-300" />{' '}
                      {t('Export GeoJSON', 'Exportar GeoJSON')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onRestartMission}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-cyan-300 px-2.5 py-2.5 text-[11.5px] font-semibold text-slate-950 shadow-[0_6px_18px_rgba(56,232,255,0.28)] transition hover:bg-cyan-200"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />{' '}
                    {t('Plan New EVA', 'Planificar Nueva EVA')}
                  </button>
                </div>
              </section>
            </div>
        </SpacecraftConsoleFrame>
      </div>
    </div>
  );
};
