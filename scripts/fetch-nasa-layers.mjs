import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const nasaDir = path.join(rootDir, 'public', 'nasa-layers');
const ctxDir = path.join(nasaDir, 'ctx');
const trekDir = path.join(nasaDir, 'trek');
const perseDir = path.join(nasaDir, 'perseverance');
const worldviewDir = path.join(nasaDir, 'worldview');
const dataDir = path.join(rootDir, 'public', 'data');

fs.mkdirSync(ctxDir, { recursive: true });
fs.mkdirSync(trekDir, { recursive: true });
fs.mkdirSync(perseDir, { recursive: true });
fs.mkdirSync(worldviewDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });

// Canonical Arcadia Planitia master study quadrant
const CENTER_LAT = 47.5502;
const CENTER_LON = -163.1744;
const CENTER_LON_EAST = 196.8256;
const MARS_RADIUS_M = 3396190.0;
const HALF_QUADRANT_M = 2500.0;

const M_PER_DEG_LAT = (Math.PI * MARS_RADIUS_M) / 180.0;
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((CENTER_LAT * Math.PI) / 180.0);
const dLat = HALF_QUADRANT_M / M_PER_DEG_LAT;
const dLon = HALF_QUADRANT_M / M_PER_DEG_LON;

const quadrantBbox = {
  minLon: Number((CENTER_LON - dLon).toFixed(6)),
  minLat: Number((CENTER_LAT - dLat).toFixed(6)),
  maxLon: Number((CENTER_LON + dLon).toFixed(6)),
  maxLat: Number((CENTER_LAT + dLat).toFixed(6)),
};

function ctxTileBounds(z, row, col) {
  const res = 0.3515625 / Math.pow(2, z);
  const tileDeg = res * 256;
  const minLon = -180 + col * tileDeg;
  const maxLon = minLon + tileDeg;
  const maxLat = 90 - row * tileDeg;
  const minLat = maxLat - tileDeg;
  return [
    Number(minLon.toFixed(6)),
    Number(minLat.toFixed(6)),
    Number(maxLon.toFixed(6)),
    Number(maxLat.toFixed(6)),
  ];
}

function trekEqTileBounds(mw, mh, row, col) {
  const degLon = 360.0 / mw;
  const degLat = 180.0 / mh;
  const minLon = -180 + col * degLon;
  const maxLon = minLon + degLon;
  const maxLat = 90 - row * degLat;
  const minLat = maxLat - degLat;
  return [
    Number(minLon.toFixed(6)),
    Number(minLat.toFixed(6)),
    Number(maxLon.toFixed(6)),
    Number(maxLat.toFixed(6)),
  ];
}

async function fetchBinary(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'AresArcadiaMVP/1.0' } });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return { buf, contentType: res.headers.get('content-type') || 'application/octet-stream' };
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'AresArcadiaMVP/1.0' } });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.json();
}

function clipCoordsToWindow(coords, win) {
  if (!Array.isArray(coords) || coords.length === 0) return coords;
  if (typeof coords[0] === 'number') {
    const [lon, lat] = coords;
    return [
      Number(Math.max(win.minLon, Math.min(win.maxLon, lon)).toFixed(5)),
      Number(Math.max(win.minLat, Math.min(win.maxLat, lat)).toFixed(5)),
    ];
  }
  return coords.map((c) => clipCoordsToWindow(c, win));
}

function simplifyRing(ring, maxPts = 120) {
  if (!Array.isArray(ring) || ring.length <= maxPts) return ring;
  const step = Math.ceil(ring.length / maxPts);
  const out = [];
  for (let i = 0; i < ring.length; i += step) {
    out.push(ring[i]);
  }
  const last = ring[ring.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

function normalizeGeometry(geom, win) {
  if (!geom) return null;
  if (geom.type === 'Polygon') {
    return {
      type: 'Polygon',
      coordinates: geom.coordinates.map((ring) =>
        simplifyRing(clipCoordsToWindow(ring, win))
      ),
    };
  }
  if (geom.type === 'MultiPolygon') {
    return {
      type: 'MultiPolygon',
      coordinates: geom.coordinates.map((poly) =>
        poly.map((ring) => simplifyRing(clipCoordsToWindow(ring, win)))
      ),
    };
  }
  if (geom.type === 'LineString' || geom.type === 'MultiLineString') {
    const coords =
      geom.type === 'LineString'
        ? simplifyRing(clipCoordsToWindow(geom.coordinates, win))
        : geom.coordinates.map((line) => simplifyRing(clipCoordsToWindow(line, win)));
    return { type: geom.type, coordinates: coords };
  }
  return { type: geom.type, coordinates: clipCoordsToWindow(geom.coordinates, win) };
}

async function main() {
  const manifest = {
    generatedAtIso: new Date().toISOString(),
    studySite: {
      name: 'Arcadia Planitia · Triple Contact Aa5 / Aa2 / Aa1',
      centerLatDeg: CENTER_LAT,
      centerLonWestDeg: CENTER_LON,
      centerLonEastDeg: CENTER_LON_EAST,
      quadrantSizeMeters: 5000,
      quadrantBboxDeg: quadrantBbox,
    },
    layers: {
      ctxLod10: {
        sourceUrlTemplate:
          'https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX/MapServer/tile/10/{row}/{col}',
        resolutionMetersPerPx: 20.4,
        tiles: [],
      },
      ctxLod11: {
        sourceUrlTemplate:
          'https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX/MapServer/tile/11/{row}/{col}',
        resolutionMetersPerPx: 10.2,
        tiles: [],
      },
      hrscMola: {
        sourceUrlTemplate:
          'https://trek.nasa.gov/tiles/Mars/EQ/Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp_lzw/1.0.0/default/default028mm/8/{row}/{col}.jpg',
        resolutionMetersPerPx: 200.0,
        tiles: [],
      },
      vikingMdim21: {
        sourceUrlTemplate:
          'https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/7/{row}/{col}.jpg',
        resolutionMetersPerPx: 232.0,
        tiles: [],
      },
    },
    masterTrekQuadrant: {
      name: 'Arcadia Planitia · Master JPL Mars Trek Regional Frame',
      centerLatDeg: 44.66,
      centerLonEastDeg: 185.0,
      centerLonWestDeg: -175.0,
      usgsRegionalUnits: [],
      tiles: [],
    },
    perseveranceRawSamples: [],
    worldviewEarthTiles: [],
    noaaSwpcSnapshotFile: '/data/noaa-swpc-snapshot.json',
    usgsFeaturesSummary: [],
  };

  // 1. Download MRO CTX LOD 10 base mosaic + LOD 11 high-res overlay (~10.2 m/px)
  const ctxRequests = [
    ...['482', '483'].flatMap((r) =>
      ['191', '192'].map((c) => ({ z: 10, r: Number(r), c: Number(c), key: 'ctxLod10' }))
    ),
    ...['965', '966'].flatMap((r) =>
      ['381', '382', '383', '384'].map((c) => ({ z: 11, r: Number(r), c: Number(c), key: 'ctxLod11' }))
    ),
  ];

  for (const item of ctxRequests) {
    const url = `https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX/MapServer/tile/${item.z}/${item.r}/${item.c}`;
    const filename = `ctx_z${item.z}_r${item.r}_c${item.c}.png`;
    try {
      const { buf } = await fetchBinary(url);
      fs.writeFileSync(path.join(ctxDir, filename), buf);
      manifest.layers[item.key].tiles.push({
        z: item.z,
        row: item.r,
        col: item.c,
        localUrl: `/nasa-layers/ctx/${filename}`,
        remoteUrl: url,
        bytes: buf.length,
        boundsDeg: ctxTileBounds(item.z, item.r, item.c),
      });
      console.log(`[CTX] Saved ${filename} (${buf.length} bytes)`);
    } catch (err) {
      console.warn(`[CTX] Skipped ${filename}: ${err.message}`);
    }
  }

  // 2. Download NASA Mars Trek HRSC + MOLA ClrShade (z=8, mw=512, mh=256)
  for (const col of [23, 24]) {
    const url = `https://trek.nasa.gov/tiles/Mars/EQ/Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp_lzw/1.0.0/default/default028mm/8/60/${col}.jpg`;
    const filename = `hrsc_mola_z8_r60_c${col}.jpg`;
    try {
      const { buf } = await fetchBinary(url);
      fs.writeFileSync(path.join(trekDir, filename), buf);
      manifest.layers.hrscMola.tiles.push({
        z: 8,
        row: 60,
        col,
        localUrl: `/nasa-layers/trek/${filename}`,
        remoteUrl: url,
        bytes: buf.length,
        boundsDeg: trekEqTileBounds(512, 256, 60, col),
      });
      console.log(`[TREK HRSC] Saved ${filename} (${buf.length} bytes)`);
    } catch (err) {
      console.warn(`[TREK HRSC] Skipped ${filename}: ${err.message}`);
    }
  }

  // 3. Download NASA Mars Trek Viking MDIM21 (z=7, mw=256, mh=128)
  for (const col of [11, 12]) {
    const url = `https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/7/30/${col}.jpg`;
    const filename = `viking_z7_r30_c${col}.jpg`;
    try {
      const { buf } = await fetchBinary(url);
      fs.writeFileSync(path.join(trekDir, filename), buf);
      manifest.layers.vikingMdim21.tiles.push({
        z: 7,
        row: 30,
        col,
        localUrl: `/nasa-layers/trek/${filename}`,
        remoteUrl: url,
        bytes: buf.length,
        boundsDeg: trekEqTileBounds(256, 128, 30, col),
      });
      console.log(`[TREK VIKING] Saved ${filename} (${buf.length} bytes)`);
    } catch (err) {
      console.warn(`[TREK VIKING] Skipped ${filename}: ${err.message}`);
    }
  }

  // 3b. Master JPL Mars Trek Regional Quadrant (44.66° N, 185.00° E / -175.00° W)
  const masterTileSpecs = [
    {
      layer: 'MRO CTX LOD 10 (~20.4 m/px)',
      filename: 'master_44N_175W_ctx_z10_r515_c56.png',
      dir: ctxDir,
      localUrl: '/nasa-layers/ctx/master_44N_175W_ctx_z10_r515_c56.png',
      url: 'https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX/MapServer/tile/10/515/56',
      boundsDeg: ctxTileBounds(10, 515, 56),
    },
    {
      layer: 'Mars Trek HRSC+MOLA ClrShade (200 m/px)',
      filename: 'master_44N_175W_hrsc_z8_r64_c7.jpg',
      dir: trekDir,
      localUrl: '/nasa-layers/trek/master_44N_175W_hrsc_z8_r64_c7.jpg',
      url: 'https://trek.nasa.gov/tiles/Mars/EQ/Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp_lzw/1.0.0/default/default028mm/8/64/7.jpg',
      boundsDeg: trekEqTileBounds(512, 256, 64, 7),
    },
    {
      layer: 'Mars Trek Viking MDIM21 (232 m/px)',
      filename: 'master_44N_175W_viking_z7_r32_c3.jpg',
      dir: trekDir,
      localUrl: '/nasa-layers/trek/master_44N_175W_viking_z7_r32_c3.jpg',
      url: 'https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/7/32/3.jpg',
      boundsDeg: trekEqTileBounds(256, 128, 32, 3),
    },
  ];
  for (const spec of masterTileSpecs) {
    try {
      const { buf } = await fetchBinary(spec.url);
      fs.writeFileSync(path.join(spec.dir, spec.filename), buf);
      manifest.masterTrekQuadrant.tiles.push({
        layer: spec.layer,
        localUrl: spec.localUrl,
        remoteUrl: spec.url,
        bytes: buf.length,
        boundsDeg: spec.boundsDeg,
      });
      console.log(`[MASTER 44.66N] Saved ${spec.filename} (${buf.length} bytes)`);
    } catch (err) {
      console.warn(`[MASTER 44.66N] Skipped ${spec.filename}: ${err.message}`);
    }
  }
  try {
    const masterUsgs = await fetchJson(
      'https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/IMAP_1802_ABC_Geologic_Units/FeatureServer/0/query?where=1%3D1&geometry=-175.5,44.2,-174.5,45.1&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=OBJECTID,UnitSymbol,UnitName&returnGeometry=false&f=geojson'
    );
    manifest.masterTrekQuadrant.usgsRegionalUnits = (masterUsgs.features || []).map((f) => f.properties);
    console.log('[MASTER 44.66N USGS]', manifest.masterTrekQuadrant.usgsRegionalUnits.length, 'units');
  } catch (err) {
    console.warn('[MASTER 44.66N USGS] Skipped:', err.message);
  }

  // 3c. Mars Perseverance Raw Images Gallery (NASA Mars 2020 Photometric Surface Calibrator)
  const perseQueries = [
    { key: 'mcz', search: 'MCZ_LEFT', filename: 'perseverance_mcz.jpg', role: 'Mastcam-Z Regolith Photometry' },
    { key: 'navcam', search: 'NAVCAM_LEFT', filename: 'perseverance_navcam.jpg', role: 'Navcam Hazard & Boulder Distribution' },
    { key: 'hazcam', search: 'FRONT_HAZCAM_LEFT_A', filename: 'perseverance_hazcam.jpg', role: 'Hazcam Near-Field Micro-Roughness' },
  ];
  for (const pq of perseQueries) {
    try {
      const feed = await fetchJson(
        `https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&ver=1.2&num=5&search=${pq.search}`
      );
      const item = (feed.images || []).find((im) => im.image_files?.medium);
      if (item) {
        const imgUrl = item.image_files.medium;
        const { buf } = await fetchBinary(imgUrl);
        fs.writeFileSync(path.join(perseDir, pq.filename), buf);
        manifest.perseveranceRawSamples.push({
          key: pq.key,
          role: pq.role,
          sol: item.sol,
          instrument: item.camera?.instrument || pq.search,
          imageId: item.imageid,
          dateTakenUtc: item.date_taken_utc || null,
          title: item.title || pq.role,
          localUrl: `/nasa-layers/perseverance/${pq.filename}`,
          remoteUrl: imgUrl,
          bytes: buf.length,
        });
        console.log(`[PERSEVERANCE ${pq.key}] Sol ${item.sol} saved (${buf.length} bytes)`);
      }
    } catch (err) {
      console.warn(`[PERSEVERANCE ${pq.key}] Skipped:`, err.message);
    }
  }

  // 3d. NASA Worldview GIBS Earth Spin-Off Reference Tiles (Wildfire Smoke / GPS-Denied USAR Calibration)
  const gibsSpecs = [
    {
      label: 'NASA GIBS MODIS Terra Western US (Fire/Smoke Analog West)',
      filename: 'gibs_terra_wus_z6_r24_c10.jpg',
      url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/2025-08-01/GoogleMapsCompatible_Level9/6/24/10.jpg',
    },
    {
      label: 'NASA GIBS MODIS Terra Western US (Fire/Smoke Analog East)',
      filename: 'gibs_terra_wus_z6_r24_c11.jpg',
      url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/2025-08-01/GoogleMapsCompatible_Level9/6/24/11.jpg',
    },
  ];
  for (const gs of gibsSpecs) {
    try {
      const { buf } = await fetchBinary(gs.url);
      fs.writeFileSync(path.join(worldviewDir, gs.filename), buf);
      manifest.worldviewEarthTiles.push({
        label: gs.label,
        localUrl: `/nasa-layers/worldview/${gs.filename}`,
        remoteUrl: gs.url,
        bytes: buf.length,
        product: 'MODIS_Terra_CorrectedReflectance_TrueColor',
      });
      console.log(`[WORLDVIEW GIBS] Saved ${gs.filename} (${buf.length} bytes)`);
    } catch (err) {
      console.warn(`[WORLDVIEW GIBS] Skipped ${gs.filename}:`, err.message);
    }
  }

  // 3e. NOAA SWPC / GOES-18 Space Weather Snapshot (Keyless, Zero DEMO_KEY 429 Risk)
  try {
    const [scales, protons, xrays] = await Promise.all([
      fetchJson('https://services.swpc.noaa.gov/products/noaa-scales.json'),
      fetchJson('https://services.swpc.noaa.gov/json/goes/primary/integral-protons-1-day.json'),
      fetchJson('https://services.swpc.noaa.gov/json/goes/primary/xrays-1-day.json'),
    ]);
    const latest10MeV = [...protons].reverse().find((p) => p.energy === '>=10 MeV') || protons[protons.length - 1] || null;
    const peak10MeV = protons
      .filter((p) => p.energy === '>=10 MeV')
      .reduce((mx, p) => Math.max(mx, Number(p.flux || 0)), 0);
    const latestXray = [...xrays].reverse().find((x) => x.energy === '0.1-0.8nm') || xrays[xrays.length - 1] || null;
    const swpcSnapshot = {
      fetchedAtIso: new Date().toISOString(),
      source: 'NOAA SWPC / GOES-18 Primary (Unthrottled Live Feed)',
      currentScales: scales['0'] || null,
      latestProton10MeV: latest10MeV,
      peak24hProton10MeVPfu: Number(peak10MeV.toFixed(4)),
      latestXrayLong: latestXray,
    };
    fs.writeFileSync(path.join(dataDir, 'noaa-swpc-snapshot.json'), JSON.stringify(swpcSnapshot, null, 2), 'utf-8');
    console.log('[NOAA SWPC] Snapshot saved | 10MeV pfu:', swpcSnapshot.peak24hProton10MeVPfu);
  } catch (err) {
    console.warn('[NOAA SWPC] Skipped:', err.message);
  }

  // 4. Download Real USGS Geologic Features (IMAP_1802 + SIM 3292 Tanaka 2014)
  const clipWindow = { minLon: -164.0, minLat: 46.8, maxLon: -162.3, maxLat: 48.2 };
  const usgsQueries = [
    {
      dataset: 'USGS Map I-1802-A/B/C (Arcadia Formation Members)',
      url: 'https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/IMAP_1802_ABC_Geologic_Units/FeatureServer/0/query?where=1%3D1&geometry=-163.5,47.0,-162.8,48.0&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=OBJECTID,UnitSymbol,UnitName,Descrip&returnGeometry=true&f=geojson',
    },
    {
      dataset: 'USGS SIM 3292 (Tanaka et al. 2014 Global Geology)',
      url: 'https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/Tanaka_et_al_2014_Mars_Global_Map_Features/FeatureServer/3/query?where=1%3D1&geometry=-163.5,47.0,-162.8,48.0&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=OBJECTID,Unit,UnitDesc,UnitGroup&returnGeometry=true&f=geojson',
    },
    {
      dataset: 'USGS SIM 3292 (Tanaka et al. 2014 Tectonic Structures)',
      url: 'https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/Tanaka_et_al_2014_Mars_Global_Map_Features/FeatureServer/2/query?where=1%3D1&geometry=-163.5,47.0,-162.8,48.0&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=true&f=geojson',
    },
    {
      dataset: 'USGS SIM 3292 (Tanaka et al. 2014 Geologic Contacts)',
      url: 'https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/Tanaka_et_al_2014_Mars_Global_Map_Features/FeatureServer/1/query?where=1%3D1&geometry=-163.5,47.0,-162.8,48.0&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=true&f=geojson',
    },
  ];

  const allFeatures = [];
  for (const q of usgsQueries) {
    try {
      const geo = await fetchJson(q.url);
      const features = Array.isArray(geo.features) ? geo.features : [];
      for (const f of features) {
        const props = f.properties || {};
        const symbol = props.UnitSymbol || props.Unit || props.TYPE || props.Type || 'Structure/Contact';
        const objectId = props.OBJECTID ?? null;
        manifest.usgsFeaturesSummary.push({
          dataset: q.dataset,
          objectId,
          symbol,
          description: props.UnitName || props.UnitDesc || props.Descrip || symbol,
        });
        allFeatures.push({
          type: 'Feature',
          properties: {
            ...props,
            _dataset: q.dataset,
            _symbol: symbol,
          },
          geometry: normalizeGeometry(f.geometry, clipWindow),
        });
      }
      console.log(`[USGS] ${q.dataset}: ${features.length} features`);
    } catch (err) {
      console.warn(`[USGS] Failed ${q.dataset}: ${err.message}`);
    }
  }

  fs.writeFileSync(
    path.join(dataDir, 'usgs-geology-real.json'),
    JSON.stringify(
      {
        type: 'FeatureCollection',
        generatedAtIso: manifest.generatedAtIso,
        studyCenter: { lat: CENTER_LAT, lon: CENTER_LON, lonEast: CENTER_LON_EAST },
        clipWindow,
        features: allFeatures,
      },
      null,
      2
    ),
    'utf-8'
  );

  fs.writeFileSync(
    path.join(nasaDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8'
  );

  console.log('[NASA INGEST] Complete -> public/nasa-layers/manifest.json & public/data/usgs-geology-real.json');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
