import { MISSION_CONFIG } from '../config/missionConfig';

export interface MetabolicInput {
  astronautMassKg: number;
  sampleMassKg: number;
  speedMs: number;
  slopeDeg: number; // positivo = ascenso, negativo = descenso
  thermalInertiaNorm: number; // [0..1] THEMIS: menor => polvo suelto => mayor factor de tracción eta
  fatigueFactor?: number; // >= 1.0 acumulado de los últimos 30 min
  stiffnessKThetaNmRad?: number; // rigidez articular rotacional del traje mEMU (Nm/rad)
  suitDeltaPKpa?: number; // presión diferencial interna del traje (nominal 29.6 kPa)
}

/**
 * Peso real en Arcadia Planitia (P = m * g_Arcadia) y carga aparente terrestre (kgf).
 */
export function computeArcadiaWeight(massKg: number) {
  const weightN = massKg * MISSION_CONFIG.physics.gravityMarsArcadia;
  const apparentEarthKgf = massKg * MISSION_CONFIG.physics.gravityRatio;
  return { weightN, apparentEarthKgf };
}

/**
 * Ecuación bioenergética de Pandolf-Santee modificada para gravedad parcial (0,38g en Arcadia Planitia),
 * separando masa inercial horizontal (v²) del peso gravitacional parcial (postura y pendiente)
 * e incorporando rigidez articular del traje presurizado (k_theta, ΔP) y tracción de regolito (eta).
 */
export function computePandolfSanteeMarsWatts(input: MetabolicInput): number {
  const suitMassKg = MISSION_CONFIG.suit.memuPlssMassKg;
  const clampedSampleKg = Math.min(
    input.sampleMassKg,
    Math.max(0, MISSION_CONFIG.suit.maxTotalMassKg - input.astronautMassKg - suitMassKg)
  );
  const loadMassKg = suitMassKg + clampedSampleKg;
  const inertialMassKg = Math.max(40, input.astronautMassKg + loadMassKg);
  const gRatio = MISSION_CONFIG.physics.gravityRatio; // 0.379582

  // Peso efectivo en 0.38g para carga estática y trabajo vertical gravitatorio
  const effectiveBodyKg = input.astronautMassKg * gRatio;
  const effectiveLoadKg = loadMassKg * gRatio;
  const W = Math.max(15, effectiveBodyKg);
  const L = Math.max(0, effectiveLoadKg);

  // Coeficiente de tracción del regolito (eta): sustrato consolidado ~1.1, polvo suelto ~1.65
  const etaRegolith = 1.08 + (1 - Math.max(0.1, Math.min(1, input.thermalInertiaNorm))) * 0.65;

  const v = Math.max(0, Math.min(2.2, input.speedMs));
  const rawGradePct = Math.tan((input.slopeDeg * Math.PI) / 180) * 100;
  const effectiveGradePct =
    rawGradePct >= 0
      ? rawGradePct
      : rawGradePct > -6
        ? rawGradePct * 0.35
        : Math.abs(rawGradePct) * 0.45;

  // Postura estática a 0.38g: relación entre carga gravitatoria efectiva (L_eff = loadMassKg * gRatio)
  // y masa musculoesquelética del astronauta (M_body), escalada por el peso marciano total (W + L)
  const basalWatts = 1.25 * input.astronautMassKg;
  const effectiveLoadRatio = L / Math.max(40, input.astronautMassKg);
  const loadPostureWatts = 2.0 * (W + L) * Math.pow(effectiveLoadRatio, 2);
  const restingWatts = basalWatts + loadPostureWatts;

  // Energía cinética horizontal escala con masa inercial total (no reducida por 0.38g);
  // trabajo vertical contra pendiente escala con peso gravitatorio marciano (W + L)
  const kineticStrideWatts = etaRegolith * inertialMassKg * 0.44 * v * v;
  const slopeWorkScale = 0.72;
  const gradeClimbWatts = etaRegolith * (W + L) * (0.35 * slopeWorkScale * v * effectiveGradePct);
  const locomotionWatts = kineticStrideWatts + gradeClimbWatts;

  // Trabajo mecánico contra el par de rigidez articular del traje mEMU presurizado (k_theta, ΔP)
  const kThetaRatio =
    (input.stiffnessKThetaNmRad ?? MISSION_CONFIG.suit.stiffnessKThetaNmRad) /
    MISSION_CONFIG.suit.stiffnessKThetaNmRad;
  const pressureRatio =
    (input.suitDeltaPKpa ?? MISSION_CONFIG.suit.nominalPressureKpa) /
    MISSION_CONFIG.suit.nominalPressureKpa;
  const deltaEJointWatts =
    v > 0.05 ? 42 * kThetaRatio * pressureRatio * v * (1 + Math.abs(input.slopeDeg) / 18) : 0;

  // Separación estricta: computePandolfSanteeMarsWatts devuelve únicamente potencia metabólica humana (W_met),
  // sin mezclar vatios eléctricos PLSS/UWB (que drenan exclusivamente la batería Li-Ion en safetyCritical.worker.ts).
  const fatigue = Math.max(1.0, input.fatigueFactor ?? 1.0);
  const totalWatts = Math.max(
    120,
    (restingWatts + locomotionWatts + deltaEJointWatts) * fatigue
  );
  return totalWatts;
}

/**
 * Demanda eléctrica de calefactores de juntas frente a clima criogénico marciano (MCD < -100 °C).
 */
export function computeCryoHeaterWatts(surfaceTempC: number): number {
  if (surfaceTempC >= -55) return 12;
  const severity = Math.min(1, (-55 - surfaceTempC) / 60);
  return 12 + severity * (MISSION_CONFIG.suit.cryoJointHeaterMaxWatts - 12);
}

/**
 * Convierte gasto metabólico humano instantáneo (W_met) en tasa de consumo de O2 (minutos equivalentes por minuto real).
 * A consumo metabólico nominal (~255 W en 0.38g), 1 min real consume 1.0 min de autonomía nominal; bajo esfuerzo/fuga escala proporcionalmente.
 */
export function computeO2BurnMultiplier(metabolicWatts: number, o2LeakRateFactor = 0): number {
  const nominalWatts = 255;
  return Math.max(0.55, metabolicWatts / nominalWatts) + o2LeakRateFactor;
}

export function computeJointTorqueNm(
  slopeDeg: number,
  speedMs: number,
  totalMassKg: number,
  stiffnessKThetaNmRad: number = MISSION_CONFIG.suit.stiffnessKThetaNmRad,
  suitDeltaPKpa: number = MISSION_CONFIG.suit.nominalPressureKpa
): number {
  const gMars = MISSION_CONFIG.physics.gravityMarsArcadia;
  const effectiveForceN = totalMassKg * gMars;
  const leverArmM = 0.42;
  const kThetaRatio = stiffnessKThetaNmRad / MISSION_CONFIG.suit.stiffnessKThetaNmRad;
  const pRatio = suitDeltaPKpa / MISSION_CONFIG.suit.nominalPressureKpa;
  const dynamicFactor =
    (0.14 + (speedMs / 1.5) * 0.12 + (Math.abs(slopeDeg) / 20) * 0.18) * kThetaRatio * pRatio;
  return effectiveForceN * leverArmM * dynamicFactor;
}

export function computeSuitForceReadout(astronautMassKg: number, sampleMassKg: number) {
  const totalMassKg = astronautMassKg + MISSION_CONFIG.suit.memuPlssMassKg + sampleMassKg;
  const gMars = MISSION_CONFIG.physics.gravityMarsArcadia;
  return {
    totalMassKg,
    marsGravityMs2: gMars,
    apparentMarsWeightN: Number((totalMassKg * gMars).toFixed(1)),
    apparentMarsKgf: Number(((totalMassKg * gMars) / MISSION_CONFIG.physics.gravityEarth).toFixed(1)),
  };
}
