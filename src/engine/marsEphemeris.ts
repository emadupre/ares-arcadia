import type { MarsEphemerisState, MarsLightPhaseId, MarsSeasonId } from '../types/mission';

/**
 * NASA Mars24 / Arcadia Planitia Solar Ephemeris & Timekeeping Engine.
 *
 * Strictly Martian planetary constants (NO Earth clocks, Earth months, or Earth day lengths):
 * - 1 Mars Sol = 88,775.244 SI seconds (24 h 39 m 35.244 s)
 * - Divided into 24 Mars-hours of 60 Mars-minutes (1 Mars-s = 1.02749125 SI s)
 * - Martian Tropical Year = 668.5991 Mars sols (Keplerian seasons Ls 0°–360°)
 * - Axial obliquity ε = 25.1919°, orbital eccentricity e = 0.09340, perihelion Ls_p = 250.99°
 */
export const MARS_SOL_SI_SECONDS = 88775.244;
export const MARS_HOUR_SI_SECONDS = MARS_SOL_SI_SECONDS / 24;
export const MARS_MINUTE_SI_SECONDS = MARS_SOL_SI_SECONDS / 1440;
export const MARS_SECOND_SI_RATIO = MARS_SOL_SI_SECONDS / 86400; // 1.02749125
export const MARS_TROPICAL_YEAR_SOLS = 668.5991;
export const MARS_OBLIQUITY_DEG = 25.1919;
export const MARS_ECCENTRICITY = 0.0934;
export const MARS_PERIHELION_LS_DEG = 250.99;
export const MARS_SEMI_MAJOR_AU = 1.523679;
export const SOLAR_CONSTANT_1AU_WM2 = 1361;

/**
 * Arcadia Planitia Safe Sun threshold: above 12° solar elevation ensures sufficient photogrammetry
 * contrast, solar array flux, reduced blind cliff shadows, and warmer regolith thermal balance
 * while shortening clearly in Northern Winter (max noon ~17.3° at 47.55° N -> ~4.2 Mars-h window).
 */
export const SAFE_SUN_MIN_ELEVATION_DEG = 12.0;

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export function wrapDeg360(deg: number): number {
  const m = deg % 360;
  return m < 0 ? m + 360 : m;
}

export function wrapDeg180(deg: number): number {
  const w = wrapDeg360(deg);
  return w > 180 ? w - 360 : w;
}

export function wrapMarsHours24(hours: number): number {
  const m = hours % 24;
  return m < 0 ? m + 24 : m;
}

export function formatMarsHoursHHMM(hours: number): string {
  const wrapped = wrapMarsHours24(hours);
  const totalMin = Math.floor(wrapped * 60 + 1e-6);
  const hh = Math.floor(totalMin / 60) % 24;
  const mm = totalMin % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Exact Keplerian conversion from aerocentric solar longitude Ls to mean anomaly M (deg).
 */
function meanAnomalyFromLsDeg(lsDeg: number): number {
  const nuRad = wrapDeg180(lsDeg - MARS_PERIHELION_LS_DEG) * DEG2RAD;
  const eccentricFactor = Math.sqrt((1 - MARS_ECCENTRICITY) / (1 + MARS_ECCENTRICITY));
  const eccentricAnomalyRad = 2 * Math.atan2(eccentricFactor * Math.sin(nuRad / 2), Math.cos(nuRad / 2));
  const meanAnomalyRad = eccentricAnomalyRad - MARS_ECCENTRICITY * Math.sin(eccentricAnomalyRad);
  return wrapDeg360(meanAnomalyRad * RAD2DEG);
}

const MEAN_ANOMALY_AT_VERNAL_EQUINOX_DEG = meanAnomalyFromLsDeg(0);

export function getMarsSeasonFromLs(lsDeg: number): {
  seasonId: MarsSeasonId;
  seasonProgressPct: number;
} {
  const ls = wrapDeg360(lsDeg);
  if (ls < 90) return { seasonId: 'spring', seasonProgressPct: (ls / 90) * 100 };
  if (ls < 180) return { seasonId: 'summer', seasonProgressPct: ((ls - 90) / 90) * 100 };
  if (ls < 270) return { seasonId: 'autumn', seasonProgressPct: ((ls - 180) / 90) * 100 };
  return { seasonId: 'winter', seasonProgressPct: ((ls - 270) / 90) * 100 };
}

/**
 * Solves local true solar time bounds [noon - halfSpan, noon + halfSpan] where sin(alt) >= sin(thresholdDeg).
 */
function computeSolarCrossingWindowHours(
  latDeg: number,
  declDeg: number,
  thresholdDeg: number
): { startHours: number | null; endHours: number | null; durationHours: number } {
  const latRad = latDeg * DEG2RAD;
  const declRad = declDeg * DEG2RAD;
  const thrRad = thresholdDeg * DEG2RAD;
  const cosDenom = Math.cos(latRad) * Math.cos(declRad);

  if (Math.abs(cosDenom) < 1e-6) {
    const alwaysAbove = Math.sin(latRad) * Math.sin(declRad) >= Math.sin(thrRad);
    return alwaysAbove
      ? { startHours: 0, endHours: 24, durationHours: 24 }
      : { startHours: null, endHours: null, durationHours: 0 };
  }

  const cosH = (Math.sin(thrRad) - Math.sin(latRad) * Math.sin(declRad)) / cosDenom;
  if (cosH >= 1) return { startHours: null, endHours: null, durationHours: 0 };
  if (cosH <= -1) return { startHours: 0, endHours: 24, durationHours: 24 };

  const halfSpanHours = (Math.acos(cosH) * RAD2DEG) / 15;
  return {
    startHours: 12 - halfSpanHours,
    endHours: 12 + halfSpanHours,
    durationHours: halfSpanHours * 2,
  };
}

export interface MarsEphemerisInput {
  latDeg: number;
  lonEastDeg: number;
  solarLongitudeLsDeg: number;
  lmstMarsHours: number;
  solNumber: number;
  dustTau: number;
  speActive: boolean;
}

/**
 * Computes complete Arcadia Planitia solar ephemeris, Safe Sun EVA operational window,
 * atmospheric scattering weight (NASA blue/cyan sunset aureole), thermal profile (MCD-calibrated),
 * and suit LED headlamp automation.
 */
export function computeArcadiaSolarEphemeris(input: MarsEphemerisInput): MarsEphemerisState {
  const lsDeg = wrapDeg360(input.solarLongitudeLsDeg);
  const lsRad = lsDeg * DEG2RAD;
  const latRad = input.latDeg * DEG2RAD;
  const obliqRad = MARS_OBLIQUITY_DEG * DEG2RAD;

  // Keplerian seasonal progress & Mars tropical orbit Sol #
  const meanAnomalyDeg = meanAnomalyFromLsDeg(lsDeg);
  const orbitDegFromEquinox = wrapDeg360(meanAnomalyDeg - MEAN_ANOMALY_AT_VERNAL_EQUINOX_DEG);
  const marsYearFraction = orbitDegFromEquinox / 360;
  const orbitSol = marsYearFraction * MARS_TROPICAL_YEAR_SOLS;

  const { seasonId, seasonProgressPct } = getMarsSeasonFromLs(lsDeg);

  // Orbital radius r(Ls) in AU & Top-of-Atmosphere irradiance (W/m²)
  const trueAnomalyRad = (lsDeg - MARS_PERIHELION_LS_DEG) * DEG2RAD;
  const heliocentricAu =
    (MARS_SEMI_MAJOR_AU * (1 - MARS_ECCENTRICITY * MARS_ECCENTRICITY)) /
    (1 + MARS_ECCENTRICITY * Math.cos(trueAnomalyRad));
  const solarFluxToaWm2 = SOLAR_CONSTANT_1AU_WM2 / (heliocentricAu * heliocentricAu);

  // Equation of Time (FMS right ascension minus True Sun right ascension) -> LTST
  const meanSunLonDeg = wrapDeg360(meanAnomalyDeg + MARS_PERIHELION_LS_DEG);
  const sunRaDeg = wrapDeg360(
    Math.atan2(Math.cos(obliqRad) * Math.sin(lsRad), Math.cos(lsRad)) * RAD2DEG
  );
  const eotDeg = wrapDeg180(meanSunLonDeg - sunRaDeg);
  const equationOfTimeMarsMin = eotDeg * 4; // 360° / 1440 Mars-min -> 1° = 4 Mars-min

  const lmstMarsHours = wrapMarsHours24(input.lmstMarsHours);
  const mtcMarsHours = wrapMarsHours24(lmstMarsHours - input.lonEastDeg / 15);
  const ltstMarsHours = wrapMarsHours24(lmstMarsHours + equationOfTimeMarsMin / 60);

  // Solar declination δ and local hour angle H
  const sinDecl = Math.sin(obliqRad) * Math.sin(lsRad);
  const declRad = Math.asin(Math.max(-1, Math.min(1, sinDecl)));
  const solarDeclinationDeg = declRad * RAD2DEG;
  const hourAngleRad = (ltstMarsHours - 12) * 15 * DEG2RAD;

  // Solar altitude & azimuth (clockwise from North: 0=N, 90=E, 180=S, 270=W)
  const sinAlt =
    Math.sin(latRad) * Math.sin(declRad) +
    Math.cos(latRad) * Math.cos(declRad) * Math.cos(hourAngleRad);
  const altRad = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const solarElevationDeg = altRad * RAD2DEG;
  const cosAlt = Math.max(1e-5, Math.cos(altRad));

  const sinAz = (-Math.cos(declRad) * Math.sin(hourAngleRad)) / cosAlt;
  const cosAz = (Math.sin(declRad) - Math.sin(latRad) * sinAlt) / (Math.cos(latRad) * cosAlt);
  const solarAzimuthDeg = wrapDeg360(Math.atan2(sinAz, cosAz) * RAD2DEG);

  // Peak noon solar altitude at latDeg for this season
  const noonMaxElevationDeg = Math.max(-90, 90 - Math.abs(input.latDeg - solarDeclinationDeg));

  // Daylight duration (refraction-adjusted horizon ~ -0.45°) & Safe Sun corridor (alt >= 12°)
  const daylight = computeSolarCrossingWindowHours(input.latDeg, solarDeclinationDeg, -0.45);
  const safeWindow = computeSolarCrossingWindowHours(
    input.latDeg,
    solarDeclinationDeg,
    SAFE_SUN_MIN_ELEVATION_DEG
  );

  const safeSunWindowLabel =
    safeWindow.startHours !== null && safeWindow.endHours !== null
      ? `${formatMarsHoursHHMM(safeWindow.startHours)} – ${formatMarsHoursHHMM(safeWindow.endHours)} LTST`
      : '00:00 – 00:00 LTST';

  const stormLocked = input.speActive || input.dustTau > 2.5;
  const safeSunActive = !stormLocked && solarElevationDeg >= SAFE_SUN_MIN_ELEVATION_DEG;

  let lightPhase: MarsLightPhaseId;
  if (solarElevationDeg < -10) {
    lightPhase = 'night';
  } else if (solarElevationDeg < -0.5) {
    lightPhase = 'twilight';
  } else if (solarElevationDeg < SAFE_SUN_MIN_ELEVATION_DEG) {
    lightPhase = ltstMarsHours < 12 ? 'dawn' : 'sunset';
  } else if (solarElevationDeg < 18 && noonMaxElevationDeg >= 24) {
    lightPhase = safeSunActive ? 'safe-sun' : 'day-low';
  } else {
    lightPhase = safeSunActive ? 'safe-sun' : 'day-low';
  }

  // Surface Irradiance (W/m²) including Mars CO2 dust attenuation + atmospheric diffuse scattering
  const tau = Math.max(0.15, Math.min(3.5, input.dustTau));
  let surfaceIrradianceWm2 = 0;
  if (solarElevationDeg > -4) {
    const effAltDeg = Math.max(0.5, solarElevationDeg);
    const effSin = Math.sin(effAltDeg * DEG2RAD);
    const airmass = 1 / (effSin + 0.15 * Math.pow(effAltDeg + 3.885, -1.253));
    const twilightScale =
      solarElevationDeg < 0 ? Math.max(0, 1 + solarElevationDeg / 4) * 0.08 : 1;
    const directTrans = Math.exp(-Math.min(18, tau * airmass));
    const diffuseFrac = 0.06 + 0.24 * Math.min(1, tau / 1.5) * (0.35 + 0.65 * effSin);
    surfaceIrradianceWm2 =
      solarFluxToaWm2 * (directTrans * Math.max(0, sinAlt) + diffuseFrac) * twilightScale;
  }

  // MCD / Viking-2 (47.9° N) calibrated surface temperature (°C)
  // Accounts for heliocentric distance, seasonal declination asymmetry, 14:30 LTST thermal lag,
  // and dust IR greenhouse trapping (lowers afternoon peak, slightly warms cryogenic night floor).
  const helioScale = Math.sqrt(MARS_SEMI_MAJOR_AU / heliocentricAu); // ~0.95 aphelion .. ~1.05 perihelion
  const seasonWarmNorm = solarDeclinationDeg / MARS_OBLIQUITY_DEG; // -1 (Winter) .. +1 (Summer)
  const lagPhaseRad = ((ltstMarsHours - 14.5) / 24) * Math.PI * 2;
  const diurnalWave = Math.cos(lagPhaseRad); // +1 at 14:30 LTST, -1 at 02:30 LTST
  const dustNorm = Math.min(1, Math.max(0, (tau - 0.3) / 2.2));
  const dailyMeanC = (-75.5 + seasonWarmNorm * 18.5) * (2 - helioScale);
  const diurnalHalfAmpC = (32.5 + seasonWarmNorm * 4.5) * (1 - dustNorm * 0.36);
  const ambientTempC = Number(
    Math.max(
      -128,
      Math.min(-12, dailyMeanC + diurnalWave * diurnalHalfAmpC + dustNorm * 4.5)
    ).toFixed(1)
  );

  // Seasonal & cryogenic H2O/CO2 surface frost cue (strongest in cold Winter Ls 240°-330° / dawn hollows)
  const coldFactor = Math.max(0, Math.min(1, (-ambientTempC - 86) / 34));
  const winterCurve = Math.max(0, -Math.sin((lsDeg - 15) * DEG2RAD));
  const frostCover01 = Number(
    Math.min(1, Math.max(0, coldFactor * 0.62 + winterCurve * 0.48 - dustNorm * 0.35)).toFixed(2)
  );

  // NASA Curiosity/Perseverance Mie blue-cyan solar halo peaks sharply near dawn/sunset (-4°..+14°)
  const horizonBand = Math.exp(-Math.pow((solarElevationDeg - 3.0) / 7.5, 2));
  const duskMask = solarElevationDeg > -8.5 && solarElevationDeg < 18.5 ? 1 : 0;
  const blueSunsetFactor01 = Number(
    (horizonBand * duskMask * (1 - dustNorm * 0.45)).toFixed(3)
  );

  // Spacesuit LED Helmet Headlamp & Rover beams ramp up smoothly at low sun/night/whiteout
  const darkWeight = Math.max(0, Math.min(1, (10 - solarElevationDeg) / 14));
  const stormWeight = Math.max(0, Math.min(1, (tau - 1.8) / 1.1));
  const headlampFactor01 = Number(Math.max(darkWeight, stormWeight * 0.85).toFixed(3));

  return {
    latDeg: input.latDeg,
    lonEastDeg: input.lonEastDeg,
    solNumber: Number(input.solNumber.toFixed(2)),
    orbitSol: Number(orbitSol.toFixed(1)),
    marsYearFraction: Number(marsYearFraction.toFixed(4)),
    solarLongitudeLsDeg: Number(lsDeg.toFixed(1)),
    seasonId,
    seasonProgressPct: Number(seasonProgressPct.toFixed(1)),
    mtcMarsHours,
    lmstMarsHours,
    ltstMarsHours,
    ltstLabel: formatMarsHoursHHMM(ltstMarsHours),
    mtcLabel: formatMarsHoursHHMM(mtcMarsHours),
    equationOfTimeMarsMin: Number(equationOfTimeMarsMin.toFixed(1)),
    solarDeclinationDeg: Number(solarDeclinationDeg.toFixed(2)),
    solarElevationDeg: Number(solarElevationDeg.toFixed(1)),
    solarAzimuthDeg: Number(solarAzimuthDeg.toFixed(1)),
    noonMaxElevationDeg: Number(noonMaxElevationDeg.toFixed(1)),
    daylightMarsHours: Number(daylight.durationHours.toFixed(1)),
    nightMarsHours: Number(Math.max(0, 24 - daylight.durationHours).toFixed(1)),
    sunriseLtstHours: daylight.startHours,
    sunsetLtstHours: daylight.endHours,
    safeSunStartLtstHours: safeWindow.startHours,
    safeSunEndLtstHours: safeWindow.endHours,
    safeSunWindowMarsHours: Number(safeWindow.durationHours.toFixed(1)),
    safeSunWindowLabel,
    safeSunActive,
    lightPhase,
    heliocentricAu: Number(heliocentricAu.toFixed(4)),
    solarFluxToaWm2: Math.round(solarFluxToaWm2),
    surfaceIrradianceWm2: Math.round(surfaceIrradianceWm2),
    ambientTempC,
    frostCover01,
    blueSunsetFactor01,
    headlampFactor01,
  };
}
