import { MISSION_CONFIG } from '../config/missionConfig';
import type { AppLanguage } from '../i18n/I18nContext';
import type { GridNode, SubgridHazardCheck } from '../types/mission';

function hash2d(ix: number, iy: number): number {
  const n = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

/**
 * Nivel 2: Sub-Grilla Micro Cinemática (Ventana rodante de 1 m x 1 m en radio de 50 m).
 * Simula fusión LIDAR multi-eco (último eco) + radar milimétrico 77 GHz frente al DTM de HiRISE
 * para activar el Halo de Incertidumbre (Confidence Halo) en ámbar punteado.
 */
export function evaluateMicroSubgrid(
  x: number,
  y: number,
  node: GridNode,
  dustTau: number,
  lang: AppLanguage = 'en',
  craterTargets: Array<{ x: number; y: number; radiusM?: number }> = [{ x: -420, y: 780, radiusM: 190 }]
): SubgridHazardCheck {
  const cellX = Math.floor(x / 10);
  const cellY = Math.floor(y / 10);
  const microBlocks: SubgridHazardCheck['microBlocks'] = [];

  // Generar obstáculos sub-métricos deterministas en radio de 50 m
  for (let dx = -4; dx <= 4; dx++) {
    for (let dy = -4; dy <= 4; dy++) {
      const h = hash2d(cellX + dx, cellY + dy);
      const densityThreshold = node.unit === 'Aa2' || node.unit === 'Aa3' ? 0.84 : 0.91;
      if (h > densityThreshold) {
        const bx = (cellX + dx) * 10 + (h * 7) - 3.5 - x;
        const by = (cellY + dy) * 10 + (((h * 17) % 1) * 7) - 3.5 - y;
        if (Math.hypot(bx, by) <= 48 && Math.hypot(bx, by) >= 3) {
          microBlocks.push({
            dx: Number(bx.toFixed(1)),
            dy: Number(by.toFixed(1)),
            radiusM: Number((0.45 + (h - densityThreshold) * 6).toFixed(2)),
            heightM: Number((0.35 + ((h * 13) % 1) * 0.9).toFixed(2)),
          });
        }
      }
    }
  }

  const lowCohesionRegolith = node.thermalInertiaNorm < 0.62;
  const nearCraterFracture = craterTargets.some(
    (c) => Math.hypot(x - c.x, y - c.y) < (c.radiusM ?? 190)
  );
  const mmWaveCrackDetected =
    (node.slopeDeg > 10.5 && hash2d(Math.round(x / 18), Math.round(y / 18)) > 0.72) ||
    Boolean(node.cosparRestricted) ||
    nearCraterFracture;
  const hasLocalDiscrepancy =
    mmWaveCrackDetected ||
    dustTau > MISSION_CONFIG.thresholds.dustOpacityCriticalTau ||
    node.roughnessNorm > 0.56;

  const confidenceHaloActive = lowCohesionRegolith || hasLocalDiscrepancy;

  const isEn = lang === 'en';
  let reason = isEn
    ? 'Consolidated substrate verified by LIDAR + 77 GHz mmWave'
    : 'Sustrato consolidado verificado por LIDAR + mmWave 77 GHz';
  if (dustTau > MISSION_CONFIG.thresholds.dustOpacityCriticalTau) {
    reason = isEn
      ? 'Dust storm (τ > 2.5): last-return LIDAR + 77 GHz radar active (no optical ground lock)'
      : 'Tormenta de polvo (τ > 2,5): LIDAR último eco + radar 77 GHz activos (suelo sin confirmación óptica)';
  } else if (mmWaveCrackDetected) {
    reason = isEn
      ? '77 GHz mmWave radar detects sub-metric fracture unresolved by HiRISE DTM'
      : 'Radar mmWave 77 GHz detecta grieta sub-métrica no resuelta en DTM HiRISE';
  } else if (lowCohesionRegolith) {
    reason = isEn
      ? 'Low THEMIS thermal inertia: loose fine dust / reduced traction'
      : 'Baja inercia térmica THEMIS: polvo fino suelto / tracción reducida';
  }

  return {
    hasLocalDiscrepancy,
    confidenceHaloActive,
    mmWaveCrackDetected,
    lowCohesionRegolith,
    reason,
    microBlocks: microBlocks.slice(0, 12),
  };
}
