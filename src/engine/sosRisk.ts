import { MISSION_CONFIG } from '../config/missionConfig';
import type { AnomalyTrigger, SafetyWorkerTickOutput } from '../types/mission';

export interface SosRiskInput {
  anomaly: AnomalyTrigger;
  dustTau: number;
  suitPintKpa: number;
  safetyOutput: SafetyWorkerTickOutput | null;
}

export interface SosRiskStatus {
  speActive: boolean;
  dustCritical: boolean;
  hypercapniaActive: boolean;
  suitDepressurized: boolean;
  telemetryRiskActive: boolean;
  sosActive: boolean;
}

/**
 * Evaluates whether any environmental, suit, or physiological risk factor
 * requires activating the SOS Alert system and redirecting back to POI-01.
 */
export function evaluateSosRisk(input: SosRiskInput): SosRiskStatus {
  const { anomaly, dustTau, suitPintKpa, safetyOutput } = input;
  const speActive = anomaly === 'spe';
  const dustCritical =
    anomaly === 'dust' || dustTau > MISSION_CONFIG.thresholds.dustOpacityCriticalTau;
  const hypercapniaActive =
    anomaly === 'hypercapnia' || Boolean(safetyOutput?.hypercapniaAlert);
  const suitDepressurized =
    suitPintKpa - MISSION_CONFIG.site.surfacePressureKpa < 25.5;
  const telemetryRiskActive =
    Boolean(safetyOutput?.tunnelVisionMode) ||
    safetyOutput?.returnStatusColor === 'red' ||
    Boolean(safetyOutput && safetyOutput.alaraBudgetPct >= 100) ||
    suitDepressurized;

  const sosActive =
    anomaly === 'sos' ||
    speActive ||
    dustCritical ||
    hypercapniaActive ||
    telemetryRiskActive;

  return {
    speActive,
    dustCritical,
    hypercapniaActive,
    suitDepressurized,
    telemetryRiskActive,
    sosActive,
  };
}
