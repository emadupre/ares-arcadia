import { MISSION_CONFIG } from '../config/missionConfig';

/**
 * Calcula la tasa de dosis equivalente instantánea R(h, SVF) en μSv/h
 * calibrada con Curiosity RAD para Arcadia Planitia (h0 = -3000 m, H_atm = 11100 m).
 */
export function computeInstantDoseRateMicroSvH(
  elevationM: number,
  svf: number,
  speActive: boolean,
  speIntensityMultiplier = 1.0
): number {
  const { rGcr0MicroSvPerHour, rAlbedoMicroSvPerHour, nominalSpeMicroSvPerHour, stormSpeMicroSvPerHour } =
    MISSION_CONFIG.radiation;
  const { radiationDatumMeters, atmosphericScaleHeightMeters } = MISSION_CONFIG.site;

  const clampedSvf = Math.max(0.1, Math.min(1.0, svf));
  const rSpe = speActive ? stormSpeMicroSvPerHour * speIntensityMultiplier : nominalSpeMicroSvPerHour;
  const primaryFlux = rGcr0MicroSvPerHour * (0.65 + 0.35 * clampedSvf) + rSpe * clampedSvf;
  const atmAttenuation = Math.exp((elevationM - radiationDatumMeters) / atmosphericScaleHeightMeters);

  return primaryFlux * atmAttenuation + rAlbedoMicroSvPerHour;
}

export function computeAlaraStatus(accumulatedMicroSv: number, budgetMicroSv: number) {
  const pct = Math.min(200, (accumulatedMicroSv / Math.max(1, budgetMicroSv)) * 100);
  const remainingMicroSv = Math.max(0, budgetMicroSv - accumulatedMicroSv);
  return {
    pct,
    remainingMicroSv,
    status: pct >= 90 ? ('critical' as const) : pct >= 70 ? ('warn' as const) : ('nominal' as const),
  };
}
