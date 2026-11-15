import { describe, expect, it } from 'vitest';
import { MISSION_CONFIG } from '../src/config/missionConfig';
import {
  computeArcadiaSolarEphemeris,
  formatMarsHoursHHMM,
  MARS_HOUR_SI_SECONDS,
  MARS_SOL_SI_SECONDS,
  MARS_TROPICAL_YEAR_SOLS,
  SAFE_SUN_MIN_ELEVATION_DEG,
} from '../src/engine/marsEphemeris';

describe('NASA Arcadia Planitia Mars Ephemeris & Seasons Engine', () => {
  it('uses exact Martian Sol timekeeping (24h 39m 35.244s SI, 668.6 sols/yr) with zero Earth day compression', () => {
    expect(MARS_SOL_SI_SECONDS).toBeCloseTo(88775.244, 3);
    expect(MARS_HOUR_SI_SECONDS).toBeCloseTo(3698.9685, 3);
    expect(MARS_TROPICAL_YEAR_SOLS).toBeCloseTo(668.5991, 3);
    expect(formatMarsHoursHHMM(11.5)).toBe('11:30');
    expect(formatMarsHoursHHMM(24.25)).toBe('00:15');
  });

  it('produces Keplerian seasonal duration asymmetry across Spring, Summer, Autumn, Winter (Ls 0..360)', () => {
    const spring = computeArcadiaSolarEphemeris({
      latDeg: MISSION_CONFIG.site.centerLatDeg,
      lonEastDeg: MISSION_CONFIG.site.centerLonEastDeg,
      solarLongitudeLsDeg: 45,
      lmstMarsHours: 12,
      solNumber: 100,
      dustTau: 0.45,
      speActive: false,
    });
    const summer = computeArcadiaSolarEphemeris({
      latDeg: MISSION_CONFIG.site.centerLatDeg,
      lonEastDeg: MISSION_CONFIG.site.centerLonEastDeg,
      solarLongitudeLsDeg: 95,
      lmstMarsHours: 12,
      solNumber: 205,
      dustTau: 0.45,
      speActive: false,
    });
    const autumn = computeArcadiaSolarEphemeris({
      latDeg: MISSION_CONFIG.site.centerLatDeg,
      lonEastDeg: MISSION_CONFIG.site.centerLonEastDeg,
      solarLongitudeLsDeg: 250,
      lmstMarsHours: 12,
      solNumber: 480,
      dustTau: 0.65,
      speActive: false,
    });
    const winter = computeArcadiaSolarEphemeris({
      latDeg: MISSION_CONFIG.site.centerLatDeg,
      lonEastDeg: MISSION_CONFIG.site.centerLonEastDeg,
      solarLongitudeLsDeg: 275,
      lmstMarsHours: 12,
      solNumber: 530,
      dustTau: 0.45,
      speActive: false,
    });

    expect(spring.seasonId).toBe('spring');
    expect(summer.seasonId).toBe('summer');
    expect(autumn.seasonId).toBe('autumn');
    expect(winter.seasonId).toBe('winter');

    // Summer solstice has longest daylight (~16 Mars-h) and brightest peak altitude (~67°) vs Winter solstice (~8 Mars-h, ~17°)
    expect(summer.daylightMarsHours).toBeGreaterThan(15.2);
    expect(winter.daylightMarsHours).toBeLessThan(8.6);
    expect(summer.safeSunWindowMarsHours).toBeGreaterThan(12.0);
    expect(winter.safeSunWindowMarsHours).toBeGreaterThan(3.5);
    expect(winter.safeSunWindowMarsHours).toBeLessThan(5.0);
    expect(summer.noonMaxElevationDeg).toBeGreaterThan(64);
    expect(winter.noonMaxElevationDeg).toBeLessThan(19);

    // Perihelion (Ls ~251) produces much higher top-of-atmosphere solar flux (~715 W/m²) than near aphelion
    expect(autumn.heliocentricAu).toBeLessThan(1.4);
    expect(autumn.solarFluxToaWm2).toBeGreaterThan(690);
    expect(summer.solarFluxToaWm2).toBeLessThan(540);
  });

  it('tracks Dawn, Safe Sun, Blue Sunset, and Cryogenic Night accurately for Arcadia Planitia', () => {
    const safeNoon = computeArcadiaSolarEphemeris({
      latDeg: 47.5502,
      lonEastDeg: 196.8256,
      solarLongitudeLsDeg: 95,
      lmstMarsHours: 12.0,
      solNumber: 198,
      dustTau: 0.55,
      speActive: false,
    });
    expect(safeNoon.safeSunActive).toBe(true);
    expect(safeNoon.lightPhase).toBe('safe-sun');
    expect(safeNoon.solarElevationDeg).toBeGreaterThanOrEqual(SAFE_SUN_MIN_ELEVATION_DEG);
    expect(safeNoon.headlampFactor01).toBe(0);

    // Near sunset (~19:40 LTST in Summer) triggers NASA blue/cyan solar aureole & leaves Safe Sun
    const sunset = computeArcadiaSolarEphemeris({
      latDeg: 47.5502,
      lonEastDeg: 196.8256,
      solarLongitudeLsDeg: 95,
      lmstMarsHours: 19.65,
      solNumber: 198,
      dustTau: 0.55,
      speActive: false,
    });
    expect(sunset.safeSunActive).toBe(false);
    expect(sunset.blueSunsetFactor01).toBeGreaterThan(0.5);
    expect(['sunset', 'twilight']).toContain(sunset.lightPhase);

    // Night triggers cryogenic cold floor, frost buildup, 0 W/m² irradiance, and full suit LED headlamp
    const midnightWinter = computeArcadiaSolarEphemeris({
      latDeg: 47.5502,
      lonEastDeg: 196.8256,
      solarLongitudeLsDeg: 275,
      lmstMarsHours: 0.0,
      solNumber: 525,
      dustTau: 0.45,
      speActive: false,
    });
    expect(midnightWinter.lightPhase).toBe('night');
    expect(midnightWinter.safeSunActive).toBe(false);
    expect(midnightWinter.surfaceIrradianceWm2).toBe(0);
    expect(midnightWinter.ambientTempC).toBeLessThan(-100);
    expect(midnightWinter.frostCover01).toBeGreaterThan(0.6);
    expect(midnightWinter.headlampFactor01).toBe(1);

    // SPE solar storm immediately overrides Safe Sun even at solar noon
    const speNoon = computeArcadiaSolarEphemeris({
      latDeg: 47.5502,
      lonEastDeg: 196.8256,
      solarLongitudeLsDeg: 95,
      lmstMarsHours: 12.0,
      solNumber: 198,
      dustTau: 0.55,
      speActive: true,
    });
    expect(speNoon.safeSunActive).toBe(false);
  });
});
