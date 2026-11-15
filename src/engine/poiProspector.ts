import type { WazeSuggestion } from '../types/mission';

const ANOMALY_CATALOG: Array<Omit<WazeSuggestion, 'distanceM'>> = [
  {
    id: 'AI-WZN-01',
    title: 'Muestra basáltica Aa5-Aa2 no planificada',
    mineralSignature: 'Piroxeno / Olivino basáltico (CRISM)',
    x: -290,
    y: 260,
    o2CostMin: 4,
    sampleMassKg: 0.85,
    confidencePct: 94,
  },
  {
    id: 'AI-WZN-02',
    title: 'Afloramiento de sales hidratadas',
    mineralSignature: 'Sulfatos hidratados + firma dieléctrica ε′=3,1',
    x: 210,
    y: 440,
    o2CostMin: 5,
    sampleMassKg: 0.75,
    confidencePct: 89,
  },
  {
    id: 'AI-WZN-03',
    title: 'Filosilicatos en escarpe Aa4',
    mineralSignature: 'Esmectitas Fe/Mg + lente hielo profundo',
    x: 590,
    y: -250,
    o2CostMin: 6,
    sampleMassKg: 0.9,
    confidencePct: 91,
  },
  {
    id: 'AI-WZN-04',
    title: 'Nódulo vesicular rico en volátiles',
    mineralSignature: 'Anomalía H₂ GRS + firma espectral nueva',
    x: -540,
    y: 340,
    o2CostMin: 4,
    sampleMassKg: 0.65,
    confidencePct: 87,
  },
];

/**
 * Motor determinista de sugerencias tipo Waze (inspirado en módulo Rust de prospección de POIs).
 * Solo sugiere desvíos si los márgenes de O2 y dosis ALARA son seguros.
 */
export function findContextualWazeSuggestion(
  x: number,
  y: number,
  o2MarginMin: number,
  currentSampleKg: number,
  maxSampleKg: number,
  dismissedIds: Set<string>,
  emergencyActive: boolean
): WazeSuggestion | null {
  if (emergencyActive || o2MarginMin < 14 || currentSampleKg >= maxSampleKg - 0.5) {
    return null;
  }

  for (const item of ANOMALY_CATALOG) {
    if (dismissedIds.has(item.id)) continue;
    const dist = Math.hypot(item.x - x, item.y - y);
    if (dist <= 340 && dist >= 18 && currentSampleKg + item.sampleMassKg <= maxSampleKg) {
      return {
        ...item,
        distanceM: Math.round(dist),
      };
    }
  }
  return null;
}

export function getAllCatalogAnomalies(): Array<Omit<WazeSuggestion, 'distanceM'>> {
  return ANOMALY_CATALOG;
}
