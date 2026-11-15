import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

async function main() {
  const grid = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'public/data/arcadia-grid-50x50.json'), 'utf-8')
  );
  const { pois } = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'public/data/pois.json'), 'utf-8')
  );

  const vite = await createServer({
    root: projectRoot,
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'silent',
  });

  try {
    const routing = await vite.ssrLoadModule('/src/engine/routing.ts');
    const bio = await vite.ssrLoadModule('/src/engine/bioenergetics.ts');
    const rad = await vite.ssrLoadModule('/src/engine/radiation.ts');
    const cfgMod = await vite.ssrLoadModule('/src/config/missionConfig.ts');

    const { MISSION_CONFIG } = cfgMod;
    const basePoi = pois.find((p) => p.id === 'POI-01');
    const p2 = pois.find((p) => p.id === 'POI-02');
    const p3 = pois.find((p) => p.id === 'POI-03');
    const p4 = pois.find((p) => p.id === 'POI-04');
    const p5 = pois.find((p) => p.id === 'POI-05');

    // JIT warmup
    routing.findDirectionalRoute(grid, basePoi, p2, {
      speActive: false,
      sosEmergency: false,
      astronautMassKg: MISSION_CONFIG.suit.defaultAstronautMassKg,
      sampleMassKg: 0,
      speedMs: 1.25,
      targetId: p2.id,
    });

    const fieldSwPos = { x: -520, y: -320 };
    const legs = [
      { name: 'Nominal -> POI-02 Rim (Standoff)', from: basePoi, to: p2, spe: false, sos: false },
      { name: 'Nominal -> POI-03 (Contact)', from: basePoi, to: p3, spe: false, sos: false },
      { name: 'Nominal -> POI-04 (Ridge)', from: basePoi, to: p4, spe: false, sos: false },
      { name: 'SPE Shelter SW -> POI-05 (Scarp)', from: fieldSwPos, to: p5, spe: true, sos: true },
      { name: 'SPE SOS -> POI-01 (Airlock)', from: fieldSwPos, to: basePoi, spe: true, sos: true },
    ];

    console.log('=== A.R.E.S HUD · Deterministic Engine Benchmark ===');
    console.log(
      `Site Datum: ${MISSION_CONFIG.site.centerLatDeg} N, ${MISSION_CONFIG.site.centerLonTrekDeg} E | Grid: ${grid.nodes.length} nodes (${grid.quadrantSizeMeters}x${grid.quadrantSizeMeters} m)`
    );
    console.log('');

    const results = [];
    for (const leg of legs) {
      const route = routing.findDirectionalRoute(grid, leg.from, leg.to, {
        speActive: leg.spe,
        sosEmergency: leg.sos,
        astronautMassKg: MISSION_CONFIG.suit.defaultAstronautMassKg,
        sampleMassKg: 2.0,
        speedMs: leg.sos ? 1.42 : 1.25,
        stiffnessKThetaNmRad: MISSION_CONFIG.suit.stiffnessKThetaNmRad,
        suitDeltaPKpa: MISSION_CONFIG.suit.nominalPressureKpa,
        targetId: leg.to.id,
      });
      results.push({ leg, route });
      console.log(
        `[${leg.name}] dist=${route.distanceMeters.toFixed(0)}m | time=${route.estimatedTimeMin}m | W=${route.metabolicCostWattsAvg}W (save ${route.metabolicSavingPct}%) | dose=${route.radiationDoseMicroSv.toFixed(2)}uSv (red ${route.radiationReductionPct}%) | A*=${route.convergenceMs.toFixed(2)}ms | status=${route.routeStatus}`
      );
    }

    const speShelter = results[3].route;
    const speBaseReturn = results[4].route;
    const exposedSpeRate = rad.computeInstantDoseRateMicroSvH(-3000, 0.977, true);
    const shelteredSpeRate = rad.computeInstantDoseRateMicroSvH(-3015, 0.483, true);
    const shelterRateSavingPct = ((1 - shelteredSpeRate / exposedSpeRate) * 100).toFixed(1);

    // Total 30-min storm horizon dose: transit dose + 0.5h shelter wait
    const p5Node = routing.findNearestNode(grid, p5.x, p5.y);
    const p1Node = routing.findNearestNode(grid, basePoi.x, basePoi.y);
    const shelterHours = 0.5;
    const p5Rate = rad.computeInstantDoseRateMicroSvH(p5Node.elevationM, p5Node.svf, true);
    const p1Rate = rad.computeInstantDoseRateMicroSvH(p1Node.elevationM, p1Node.svf, true) * 0.25; // Airlock storm shelter shielding ~75% attenuation
    const totalP5Dose = speShelter.radiationDoseMicroSv + p5Rate * shelterHours;
    const totalExposedDose = exposedSpeRate * shelterHours;
    const stormWaitSavingPct = ((1 - totalP5Dose / totalExposedDose) * 100).toFixed(1);

    const wFlat = bio.computePandolfSanteeMarsWatts({
      astronautMassKg: 75,
      sampleMassKg: 0,
      speedMs: 1.5,
      slopeDeg: 0,
      thermalInertiaNorm: 0.85,
      stiffnessKThetaNmRad: MISSION_CONFIG.suit.stiffnessKThetaNmRad,
      suitDeltaPKpa: MISSION_CONFIG.suit.nominalPressureKpa,
    });
    const wStiffUp = bio.computePandolfSanteeMarsWatts({
      astronautMassKg: 75,
      sampleMassKg: 6.5,
      speedMs: 1.5,
      slopeDeg: 11,
      thermalInertiaNorm: 0.35,
      stiffnessKThetaNmRad: 22.0,
      suitDeltaPKpa: 36.0,
    });

    console.log('');
    console.log(
      `SPE Shelter Shielding: exposed=${exposedSpeRate.toFixed(1)} uSv/h vs POI-05 canyon=${shelteredSpeRate.toFixed(1)} uSv/h (-${shelterRateSavingPct}%)`
    );
    console.log(
      `SPE SW Field 30m Horizon: POI-05 total=${totalP5Dose.toFixed(2)} uSv (-${stormWaitSavingPct}% vs staying exposed ${totalExposedDose.toFixed(2)} uSv) | POI-01 return transit=${speBaseReturn.radiationDoseMicroSv.toFixed(2)} uSv (airlock rate=${p1Rate.toFixed(1)} uSv/h)`
    );
    console.log(
      `0.38g Bioenergetics Range: flat=${wFlat.toFixed(1)} W vs loaded uphill/stiff=${wStiffUp.toFixed(1)} W`
    );

    const maxAStarMs = Math.max(...results.map((r) => r.route.convergenceMs));
    if (results.some((r) => r.route.blocked)) {
      throw new Error('Benchmark failed: unexpected blocked canonical route.');
    }
    if (maxAStarMs >= MISSION_CONFIG.thresholds.aStarTargetConvergenceMs) {
      throw new Error(
        `Benchmark warning/fail: max A* convergence ${maxAStarMs.toFixed(2)} ms >= ${MISSION_CONFIG.thresholds.aStarTargetConvergenceMs} ms budget.`
      );
    }
    console.log(`ALL BENCHMARK ASSERTIONS PASSED (max A* = ${maxAStarMs.toFixed(2)} ms).`);
  } finally {
    await vite.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
