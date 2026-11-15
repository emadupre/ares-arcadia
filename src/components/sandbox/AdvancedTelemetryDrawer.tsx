import React from 'react';
import { Cpu, X } from 'lucide-react';
import { MISSION_CONFIG } from '../../config/missionConfig';
import { computeArcadiaWeight } from '../../engine/bioenergetics';
import { useI18n } from '../../i18n/I18nContext';
import type {
  GridNode,
  MissionLogEntry,
  SafetyWorkerTickOutput,
  SubgridHazardCheck,
} from '../../types/mission';

interface AdvancedTelemetryDrawerProps {
  open: boolean;
  onClose: () => void;
  safety: SafetyWorkerTickOutput | null;
  currentNode: GridNode | null;
  subgridCheck: SubgridHazardCheck;
  astronautMassKg: number;
  sampleMassKg: number;
  alaraBudgetMicroSv: number;
  fps: number;
  frameRenderMs: number;
  logs: MissionLogEntry[];
}

export const AdvancedTelemetryDrawer: React.FC<AdvancedTelemetryDrawerProps> = ({
  open,
  onClose,
  safety,
  currentNode,
  subgridCheck,
  astronautMassKg,
  sampleMassKg,
  alaraBudgetMicroSv,
  fps,
  frameRenderMs,
  logs,
}) => {
  const { t } = useI18n();
  if (!open) return null;

  const totalMassKg = astronautMassKg + MISSION_CONFIG.suit.memuPlssMassKg + sampleMassKg;
  const totalWeight = computeArcadiaWeight(totalMassKg);

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-[#38e8ff]/40 bg-[#04070d]/95 p-4 text-xs text-[#f4efe6] shadow-2xl backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-[#38e8ff]/20 pb-3">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-[#38e8ff]" />
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#38e8ff]">
              {t('Full Physics Audit', 'Auditoría Física Completa')}
            </div>
            <h3 className="text-sm font-bold text-[#f4efe6]">
              {t('Advanced Telemetry (Judge View)', 'Telemetría Avanzada (Vista Juez)')}
            </h3>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="nms-chamfer-sm border border-white/20 p-1.5 text-[#f4efe6]/70 hover:border-[#38e8ff] hover:text-[#f4efe6]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex-1 space-y-3 overflow-y-auto pr-1 font-mono text-[11px]">
        <div className="nms-chamfer-sm border border-[#ffae24]/30 bg-white/5 p-3">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#ffae24]">
            {t('RAD/MSL Dosimetry & ALARA Budget', 'Dosimetría RAD/MSL & Presupuesto ALARA')}
          </div>
          <div className="grid grid-cols-2 gap-1">
            <div>{t('Rate R(h, SVF):', 'Tasa R(h, SVF):')} <span className="text-[#f4efe6]">{safety?.instantDoseRateMicroSvH ?? '--'} μSv/h</span></div>
            <div>{t('Local SVF:', 'SVF Local:')} <span className="text-[#f4efe6]">{currentNode?.svf ?? '--'}</span></div>
            <div>{t('Accum. Dose:', 'Dosis Acum.:')} <span className="text-[#ffae24]">{safety?.accumulatedDoseMicroSv ?? 0} μSv</span></div>
            <div>ALARA ({alaraBudgetMicroSv} μSv): <span className="text-[#f4efe6]">{safety?.alaraBudgetPct ?? 0}%</span></div>
          </div>
        </div>

        <div className="nms-chamfer-sm border border-[#38e8ff]/30 bg-white/5 p-3">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#38e8ff]">
            {t('0.38g Biomechanics (Pandolf-Santee + mEMU)', 'Biomecánica 0,38g (Pandolf-Santee + mEMU)')}
          </div>
          <div className="grid grid-cols-2 gap-1">
            <div>{t('Total Mass:', 'Masa Conj.:')} <span className="text-[#f4efe6]">{totalMassKg.toFixed(1)} kg</span></div>
            <div>{t('Arcadia Weight:', 'Peso Arcadia:')} <span className="text-[#f4efe6]">{totalWeight.weightN.toFixed(1)} N</span></div>
            <div>{t('Apparent Load:', 'Carga Aparente:')} <span className="text-[#f4efe6]">{totalWeight.apparentEarthKgf.toFixed(1)} kgf</span></div>
            <div>{t('Metabolic Power:', 'Potencia Metab.:')} <span className="text-[#38e8ff]">{safety?.metabolicWatts ?? '--'} W</span></div>
            <div>{t('Joint Torque:', 'Par Articular:')} <span className="text-[#f4efe6]">{safety?.jointTorqueNm ?? '--'} N·m</span></div>
            <div>{t('CO₂ Capnography:', 'Capnografía CO₂:')} <span className={safety?.hypercapniaAlert ? 'text-[#ff2a4b]' : 'text-[#38e8ff]'}>{safety?.co2MmHg ?? '--'} mmHg</span></div>
            <div>{t('Cryo Heaters:', 'Calefact. Juntas:')} <span className="text-[#ffae24]">{safety?.cryoHeaterWatts ?? '--'} W</span></div>
            <div>{t('Photodiode HUD:', 'Luminancia HUD:')} <span className="text-[#38e8ff]">{safety?.hudLuminanceCdM2 ?? '--'} cd/m²</span></div>
          </div>
        </div>

        <div className="nms-chamfer-sm border border-white/15 bg-white/5 p-3">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#f4efe6]">
            {t('Safety-Critical Worker & 1m×1m Sub-Grid', 'Worker Safety-Critical & Sub-Grilla 1m×1m')}
          </div>
          <div className="grid grid-cols-2 gap-1">
            <div>{t('WebGL Render:', 'Render WebGL:')} <span className="text-[#38e8ff]">{fps} FPS ({frameRenderMs} ms)</span></div>
            <div>{t('Worker Compute:', 'Cómputo Worker:')} <span className="text-[#38e8ff]">{safety?.workerComputeMs ?? '--'} ms</span></div>
            <div>A* Macro (2500): <span className="text-[#38e8ff]">{safety?.activeReturnRoute?.convergenceMs ?? '--'} ms</span></div>
            <div>{t('EKF Error:', 'Error EKF:')} <span className="text-[#38e8ff]">±{safety?.positioningErrorM ?? '--'} m</span></div>
            <div>{t('Pos. Mode:', 'Modo Posic.:')} <span className="text-[#f4efe6]">{safety?.positioningMode ?? '--'}</span></div>
            <div>mmWave 77GHz: <span className={subgridCheck.confidenceHaloActive ? 'text-[#ffae24]' : 'text-[#38e8ff]'}>{subgridCheck.confidenceHaloActive ? t('DISCREPANCY', 'DISCREPANCIA') : 'NOMINAL'}</span></div>
          </div>
        </div>

        <div className="nms-chamfer-sm border border-[#38e8ff]/25 bg-white/5 p-3">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#38e8ff]">
            {t('NASA / USGS Data Provenance & Simulation Integrity', 'Procedencia NASA / USGS e Integridad Física')}
          </div>
          <div className="space-y-1 text-[10px] text-[#f4efe6]/80">
            <div>
              <span className="text-[#38e8ff]">•</span>{' '}
              {t('Orbital Cache:', 'Caché Orbital:')}{' '}
              <span className="text-white">/nasa-layers/manifest.json</span> (MRO CTX LOD11 · HRSC+MOLA WMTS z8 · Viking z7)
            </div>
            <div>
              <span className="text-[#38e8ff]">•</span> USGS ArcGIS:{' '}
              <span className="text-white">I-1802 (1798 Aa1, 666 Aa5, 2638 Aa2)</span> · Tanaka SIM 3292 (1255 Av, 1286 lHl)
            </div>
            <div>
              <span className="text-[#38e8ff]">•</span>{' '}
              {t('Constants:', 'Constantes:')}{' '}
              g={MISSION_CONFIG.physics.gravityMarsArcadia} m/s² · H_atm={(MISSION_CONFIG.site.atmosphericScaleHeightMeters / 1000).toFixed(1)} km · Datum {MISSION_CONFIG.site.centerLatDeg.toFixed(4)}°N, {MISSION_CONFIG.site.centerLonTrekDeg.toFixed(4)}° ({MISSION_CONFIG.site.centerLonEastDeg.toFixed(4)}°E)
            </div>
            <div className="text-[#ffae24]">
              {t(
                'Scope: Static terrain & geology ingested from NASA/USGS; PLSS vitals, SPE events & voice ASR are deterministic hardware-in-loop simulations.',
                'Alcance: Terreno y geología ingesta NASA/USGS real; biométrica PLSS, eventos SPE y ASR son simulaciones deterministas.'
              )}
            </div>
          </div>
        </div>

        <div className="nms-chamfer-sm border border-white/15 bg-white/5 p-3">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#f4efe6]/80">
            {t('Chronological EVA Event Log', 'Registro Cronológico de Eventos EVA')}
          </div>
          <div className="max-h-48 space-y-1 overflow-y-auto text-[10px]">
            {logs.length === 0 ? (
              <div className="text-[#f4efe6]/50">{t('No events logged yet.', 'Sin eventos registrados aún.')}</div>
            ) : (
              [...logs].reverse().map((entry, idx) => (
                <div
                  key={idx}
                  className={
                    entry.category === 'critical'
                      ? 'text-[#ff2a4b]'
                      : entry.category === 'warn'
                        ? 'text-[#ffae24]'
                        : entry.category === 'science'
                          ? 'text-[#38e8ff]'
                          : 'text-[#f4efe6]/80'
                  }
                >
                  [{entry.tSec.toFixed(0)}s] {entry.message}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
