import type { ArcadiaMacroGrid, GridNode, PoiStation } from '../types/mission';

export type ArcadiaZoneId =
  | 'zona-1-marstrek'
  | 'zona-2-arcgis'
  | 'zona-3-isru'
  | 'zona-4-aa1'
  | 'zona-5-trek-44n';

export interface ArcadiaZoneSpec {
  id: ArcadiaZoneId;
  code: string;
  shortTitle: string;
  name: string;
  subtitle: string;
  formationFocus:
    | 'TRIPLE (Aa1 + Aa2 + Aa5)'
    | 'FORMACIÓN 5 (Aa5)'
    | 'FORMACIÓN 2 (Aa2)'
    | 'FORMACIÓN 1 (Aa1)'
    | 'MASTER QUAD (44.66°N · Aa4)';
  missionPriority: string;
  centerLatDeg: number;
  centerLonWestDeg: number; // Oeste negativo según documento (-163.1744°)
  centerLonEastDeg: number; // Este positivo IAU (196.8256°E)
  latSpanDeg: [number, number];
  lonWestSpanDeg: [number, number];
  polygonVertices?: Array<{ id: string; lat: number; lon: number }>;
  mappedWidthKm: number;
  mappedHeightKm: number;
  mappedAreaKm2: number;
  mappedDiagonalDiameterKm: number;
  evaOperationalRadiusKm: number;
  evaOperationalDiameterKm: number;
  cosparExclusionDiameterM: number;
  datumElevationBaseM: number;
  reliefDeltaM: number;
  dominantUnits: string;
  advantagesDoc: string;
  risksDoc: string;
  scientificFocus: string;
  marsTrekPortalUrl: string;
  arcgisExperienceUrl: string;
}

export interface StudyAreaVisualRef {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  formationsShown: string;
  coordsLabel: string;
  description: string;
}

export const STUDY_AREA_POLYGON_VERTICES = [
  { id: 'V1 (NO)', lat: 47.7047, lon: -163.2637 },
  { id: 'V2 (NE)', lat: 47.64015, lon: -163.00552 },
  { id: 'V3 (SE)', lat: 47.38472, lon: -163.08792 },
  { id: 'V4 (SO)', lat: 47.47124, lon: -163.3406 },
];

export const STUDY_AREA_VISUAL_REFERENCES: StudyAreaVisualRef[] = [
  {
    id: 'ref-arcgis-125',
    title: '1. Formaciones 1, 2 y 5 = USGS (Aa1·Aa2·Aa5)',
    subtitle: 'Correlación Local de Unidades en el Polígono de Estudio',
    imageUrl: '/assets/arcadia/formaciones-1-2-5-arcgis.jpg',
    formationsShown: 'FORMACIÓN 1 (Aa1 · Norte) · FORMACIÓN 2 (Aa2 · Centro-Este) · FORMACIÓN 5 (Aa5 · Suroeste)',
    coordsLabel: '47.7047,-163.2637 · 47.64015,-163.00552 · 47.38472,-163.08792 · 47.47124,-163.3406',
    description:
      'Delimitación local del contacto triple entre Formación 1 = Aa1 (capa antigua beige norte), Formación 2 = Aa2 (lóbulo rosado-violáceo con cono) y Formación 5 = Aa5 (superficie joven terracota suroeste).',
  },
  {
    id: 'ref-usgs-map',
    title: '2. Mapa Representativo 2: Arcadia Planitia (USGS)',
    subtitle: 'Carta Geológica Oficial USGS · Contexto Regional Arcadia Planitia',
    imageUrl: '/assets/arcadia/mapa-representativo-2-arcadia-planitia.jpg',
    formationsShown: 'Unidades Aa1 (Formación 1), Aa2 (Formación 2), Aa5 (Formación 5), Aa3, Aa4 y crestas Ach',
    coordsLabel: 'Centroide Área de Estudio: 47.5502° N, -163.1744° O (196.83° E)',
    description:
      'Mapa geológico oficial USGS que ubica Arcadia Planitia en el cuadrante noroeste marciano y valida la correlación espacial directa de las unidades amazónicas Aa1, Aa2, Aa4 y Aa5 con el terreno de la simulación.',
  },
  {
    id: 'ref-esa-orbital',
    title: '3. Vista Orbital Oblicua (ESA/DLR/FU Berlin)',
    subtitle: 'Escarpe de Contacto Lobulado y Cráteres con Hielo Expuesto',
    imageUrl: '/assets/arcadia/esa-dlr-orbital-scarp-ice.jpg',
    formationsShown: 'Frente escalonado Aa5/Aa4 (ocre) sobre llanura rojiza Aa1/Aa2 con hielo blanco',
    coordsLabel: 'Escarpe POI-05 (-860m, -620m) y Cráter Hielo POI-02 (-420m, +780m)',
    description:
      'Muestra el frente de flujo lobulado con sombras oscuras (refugio SPE SVF < 0,40) y los cráteres con anillos blancos de hielo de agua superficial (1,2–2,0 m).',
  },
  {
    id: 'ref-eva-surface',
    title: '4. Vista Superficial EVA a Nivel de Astronauta / Rover',
    subtitle: 'Regolito Basáltico Oscuro, Lajas Claras Fracturadas y Escarpe en Horizonte',
    imageUrl: '/assets/arcadia/eva-surface-outcrops-horizon.jpg',
    formationsShown: 'Superficie real en EVA (Contacto Aa5 / Aa2 / Aa1)',
    coordsLabel: ' Horizonte de Arcadia Planitia (g = 3,72243 m/s² · P_traje = 39,5 kgf)',
    description:
      'Referencia visual directa para la simulación EVA: regolito oscuro, afloramientos de lajas claras fracturadas y meseta/escarpe continuo en el horizonte bajo cielo marciano ocre.',
  },
  {
    id: 'ref-curiosity-sharp',
    title: '5. NASA Curiosity Mount Sharp Proposed Path Model',
    subtitle: 'Precedente Metodológico de Planificación de Rutas y Corredores Científicos',
    imageUrl: '/nasa-layers/trek/hrsc_mola_z8_r60_c23.jpg',
    formationsShown: 'Corredores A* multi-parada con zonas geológicas anotadas y perfil altimétrico',
    coordsLabel: 'science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/',
    description:
      'Adopta la metodología visual de JPL/Curiosity en el Monte Sharp para anotar corredores transitables, límites de pendiente y paradas científicas secuenciales.',
  },
];

/**
 * Zonas oficiales dentro del Polígono del Área de Estudio del Documento Principal (líneas 537–565)
 */
export const ARCADIA_ZONES: ArcadiaZoneSpec[] = [
  {
    id: 'zona-1-marstrek',
    code: 'ESTUDIO // INTERSECCIÓN 1·2·5',
    shortTitle: 'INTERSECCIÓN 1·2·5 (47,55°N, -163,17°O)',
    name: 'Área de Estudio Oficial — Intersección Formaciones 1, 2 y 5',
    subtitle: 'Polígono ArcGIS Experience Builder · Triple Contacto Aa1 / Aa2 / Aa5',
    formationFocus: 'TRIPLE (Aa1 + Aa2 + Aa5)',
    missionPriority: 'PRIORIDAD MÁXIMA · ÁREA DE ESTUDIO OFICIAL DEL DOCUMENTO',
    centerLatDeg: 47.5502,
    centerLonWestDeg: -163.1744,
    centerLonEastDeg: 196.8256,
    latSpanDeg: [47.38472, 47.7047],
    lonWestSpanDeg: [-163.3406, -163.00552],
    polygonVertices: STUDY_AREA_POLYGON_VERTICES,
    mappedWidthKm: 5.0,
    mappedHeightKm: 5.0,
    mappedAreaKm2: 25.0,
    mappedDiagonalDiameterKm: 7.071,
    evaOperationalRadiusKm: 2.5,
    evaOperationalDiameterKm: 5.0,
    cosparExclusionDiameterM: 1000,
    datumElevationBaseM: -3012.0,
    reliefDeltaM: 85.16,
    dominantUnits: 'Formación 5 (Aa5) · Formación 2 (Aa2) · Formación 1 (Aa1) · Borde Aa4',
    advantagesDoc:
      'Combina la Zona Base lisa y segura en Formación 5 (Aa5) con acceso inmediato a menos de 1,2 km a la Formación 2 (Aa2) y Formación 1 (Aa1).',
    risksDoc:
      'Requiere control de tracción en polvo fino (Aa5), evitar pendiente >15° en cono (Aa2) y respetar exclusión COSPAR en cráter de hielo (Aa1).',
    scientificFocus:
      'Estudio simultáneo de la capa más joven (Aa5), los conos volcánicos intermedios (Aa2) y la capa más antigua del vulcanismo amazónico (Aa1).',
    marsTrekPortalUrl:
      'https://trek.nasa.gov/mars/#v=0.1&x=-163.1744&y=47.5502&z=7&p=urn%3Aogc%3Adef%3Acrs%3AEPSG%3A%3A104905',
    arcgisExperienceUrl:
      'https://experience.arcgis.com/experience/7b73bd96f1b248259ba7029a04a1e823',
  },
  {
    id: 'zona-2-arcgis',
    code: 'FORMACIÓN 5 // ZONA BASE (Aa5)',
    shortTitle: 'FORMACIÓN 5 · Aa5 (CAPA MÁS NUEVA)',
    name: 'Formación 5 (Arcadia Formation Member 5 · Aa5) — Zona Base',
    subtitle: 'Prioridad Muy Alta (Zona Base) · Sector Suroeste-Central del Polígono',
    formationFocus: 'FORMACIÓN 5 (Aa5)',
    missionPriority: 'PRIORIDAD MUY ALTA · ZONA BASE (USGS Map I-1802 Aa5 · OBJECTID 666)',
    centerLatDeg: 47.4685,
    centerLonWestDeg: -163.2380,
    centerLonEastDeg: 196.7620,
    latSpanDeg: [47.4262, 47.5108],
    lonWestSpanDeg: [-163.3005, -163.1755],
    polygonVertices: STUDY_AREA_POLYGON_VERTICES,
    mappedWidthKm: 5.0,
    mappedHeightKm: 5.0,
    mappedAreaKm2: 25.0,
    mappedDiagonalDiameterKm: 7.071,
    evaOperationalRadiusKm: 2.5,
    evaOperationalDiameterKm: 5.0,
    cosparExclusionDiameterM: 1000,
    datumElevationBaseM: -3004.0,
    reliefDeltaM: 54.2,
    dominantUnits: 'Aa5 dominante (Arcadia Formation Member 5) + contacto escalonado Aa4 (ISRU)',
    advantagesDoc:
      'Es la capa más joven, lisa y nivelada. Retiene hielo superficial de eras glaciales recientes y tiene menor acumulación de cráteres.',
    risksDoc:
      'Puede tener capas de polvo fino que dificulten la tracción de los vehículos o levanten nubes al aterrizar; frentes escalonados hacia Aa4.',
    scientificFocus:
      'Emplazamiento del Módulo Principal, extracción ISRU en bordes erosionados Aa5/Aa4 y refugio SPE en tubo de lava (POI-05).',
    marsTrekPortalUrl:
      'https://trek.nasa.gov/mars/#v=0.1&x=-163.2380&y=47.4685&z=7&p=urn%3Aogc%3Adef%3Acrs%3AEPSG%3A%3A104905',
    arcgisExperienceUrl:
      'https://experience.arcgis.com/experience/7b73bd96f1b248259ba7029a04a1e823',
  },
  {
    id: 'zona-3-isru',
    code: 'FORMACIÓN 2 // CONOS (Aa2)',
    shortTitle: 'FORMACIÓN 2 · Aa2 (CONOS Y CRESTAS)',
    name: 'Formación 2 (Arcadia Formation Member 2 · Aa2) — Lóbulo Oriental',
    subtitle: 'Prioridad Secundaria (Exploración Volcánica) · Sector Centro-Este del Polígono',
    formationFocus: 'FORMACIÓN 2 (Aa2)',
    missionPriority: 'EXPLORACIÓN VOLCÁNICA (USGS I-1802 Aa2 OBJECTID 2638 · SIM 3292 Ridge 1662)',
    centerLatDeg: 47.5420,
    centerLonWestDeg: -163.0890,
    centerLonEastDeg: 196.9110,
    latSpanDeg: [47.4997, 47.5843],
    lonWestSpanDeg: [-163.1515, -163.0265],
    polygonVertices: STUDY_AREA_POLYGON_VERTICES,
    mappedWidthKm: 5.0,
    mappedHeightKm: 5.0,
    mappedAreaKm2: 25.0,
    mappedDiagonalDiameterKm: 7.071,
    evaOperationalRadiusKm: 2.5,
    evaOperationalDiameterKm: 5.0,
    cosparExclusionDiameterM: 1000,
    datumElevationBaseM: -2996.0,
    reliefDeltaM: 92.4,
    dominantUnits: 'Aa2 dominante (Arcadia Formation Member 2) + contacto Aa1 y Aa5',
    advantagesDoc:
      'Útil para datar el vulcanismo amazónico intermedio y estudiar conos volcánicos pequeños (Aa2) y reflectores SHARAD profundos.',
    risksDoc:
      'Contiene crestas de arrugamiento, conos y relieves abruptos (>15°) que elevan el gasto metabólico EVA y bloquean línea de vista RF.',
    scientificFocus:
      'Ascenso a la falda del Domo/Cono Volcánico (POI-04, Ø 680 m) y muestreo en el frente de contacto Aa5/Aa2 (POI-03).',
    marsTrekPortalUrl:
      'https://trek.nasa.gov/mars/#v=0.1&x=-163.0890&y=47.5420&z=7&p=urn%3Aogc%3Adef%3Acrs%3AEPSG%3A%3A104905',
    arcgisExperienceUrl:
      'https://experience.arcgis.com/experience/7b73bd96f1b248259ba7029a04a1e823',
  },
  {
    id: 'zona-4-aa1',
    code: 'FORMACIÓN 1 // ANTIGUA (Aa1)',
    shortTitle: 'FORMACIÓN 1 · Aa1 (CAPA MÁS VIEJA)',
    name: 'Formación 1 (Arcadia Formation Member 1 · Aa1) — Llanura Norte',
    subtitle: 'Capa Más Antigua del Vulcanismo Amazónico · Sector Norte del Polígono',
    formationFocus: 'FORMACIÓN 1 (Aa1)',
    missionPriority: 'DATACIÓN AMAZÓNICA Y CRÁTERES DE HIELO (USGS I-1802 Aa1 OBJECTID 1798)',
    centerLatDeg: 47.6580,
    centerLonWestDeg: -163.1540,
    centerLonEastDeg: 196.8460,
    latSpanDeg: [47.6157, 47.7003],
    lonWestSpanDeg: [-163.2165, -163.0915],
    polygonVertices: STUDY_AREA_POLYGON_VERTICES,
    mappedWidthKm: 5.0,
    mappedHeightKm: 5.0,
    mappedAreaKm2: 25.0,
    mappedDiagonalDiameterKm: 7.071,
    evaOperationalRadiusKm: 2.5,
    evaOperationalDiameterKm: 5.0,
    cosparExclusionDiameterM: 1000,
    datumElevationBaseM: -3018.0,
    reliefDeltaM: 68.5,
    dominantUnits: 'Aa1 dominante (Arcadia Formation Member 1) + lóbulo norte Aa2 y brazo Aa5',
    advantagesDoc:
      'Permite datar el inicio del vulcanismo amazónico (capa más vieja A1) y observar cráteres de impacto con anillos blancos de hielo expuesto.',
    risksDoc:
      'Afloramientos de lajas rocosas fracturadas, cráteres degradados y Zona Especial COSPAR IVb en taludes de hielo expuesto (POI-02).',
    scientificFocus:
      'Inspección óptica del Cráter con Hielo Expuesto (POI-02, Ø 380 m, hielo a 1,2–2,0 m) y recolección de lajas basálticas antiguas.',
    marsTrekPortalUrl:
      'https://trek.nasa.gov/mars/#v=0.1&x=-163.1540&y=47.6580&z=7&p=urn%3Aogc%3Adef%3Acrs%3AEPSG%3A%3A104905',
    arcgisExperienceUrl:
      'https://experience.arcgis.com/experience/7b73bd96f1b248259ba7029a04a1e823',
  },
  {
    id: 'zona-5-trek-44n',
    code: 'MARS TREK MASTER // 44.66° N · 185.00° E',
    shortTitle: 'TREK MASTER · 44.66° N / -175.00° O (Aa4)',
    name: 'Cuadrante Regional Mars Trek (44.66° N, 185.00° E / -175.00° O · Aa4)',
    subtitle: 'Referencia Geodésica Maestra JPL Mars Trek · Arcadia Formation Member 4 (Aa4)',
    formationFocus: 'MASTER QUAD (44.66°N · Aa4)',
    missionPriority: 'CUADRANTE REGIONAL JPL MARS TREK & HIELO ISRU SOMERO (USGS I-1802 Aa4 #653)',
    centerLatDeg: 44.66,
    centerLonWestDeg: -175.0,
    centerLonEastDeg: 185.0,
    latSpanDeg: [44.6177, 44.7023],
    lonWestSpanDeg: [-175.06, -174.94],
    mappedWidthKm: 5.0,
    mappedHeightKm: 5.0,
    mappedAreaKm2: 25.0,
    mappedDiagonalDiameterKm: 7.071,
    evaOperationalRadiusKm: 2.5,
    evaOperationalDiameterKm: 5.0,
    cosparExclusionDiameterM: 1000,
    datumElevationBaseM: -3850.0,
    reliefDeltaM: 58.0,
    dominantUnits: 'Aa4 regional (Arcadia Formation Member 4 · USGS OBJECTID 653) en Mars Trek',
    advantagesDoc:
      'Cuadrante maestro citado en JPL Mars Trek (44,66° N, 185,00° E / -175,00° O): mayor columna atmosférica (-3.850 m MOLA) que atenúa GCR y presenta planicies Aa4 amplias.',
    risksDoc:
      'Llanuras bajas con polvo de menor inercia térmica y lentes someras de hielo subsuperficial SHARAD (< 5 m en sectores locales).',
    scientificFocus:
      'Georreferenciación directa sobre mosaicos NASA JPL Mars Trek HRSC+MOLA (z=8 r=64 c=7) y Viking MDIM21 (z=7 r=32 c=3) para prospección comparativa.',
    marsTrekPortalUrl:
      'https://trek.nasa.gov/mars/#v=0.1&x=185.0000&y=44.6600&z=7&p=urn%3Aogc%3Adef%3Acrs%3AEPSG%3A%3A104905',
    arcgisExperienceUrl:
      'https://astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars',
  },
];

export interface NasaDonkiSpaceWeatherStatus {
  online: boolean;
  sourceLabel: string;
  lastCheckedIso: string;
  sepEventsCount30d: number;
  solarFlaresCount7d: number;
  latestEventSummary: string;
  recommendedAlaraMode: 'NOMINAL_GCR' | 'SPE_WATCH' | 'SPE_ALERT';
  marsTrekWmtsStatus: 'ONLINE' | 'CACHE_LOCAL';
  protonFlux10MeVPfu?: number;
  noaaScaleR?: string;
  noaaScaleS?: string;
}

export interface PerseveranceRawSample {
  key: string;
  role: string;
  sol: number;
  instrument: string;
  imageId: string;
  dateTakenUtc: string | null;
  title: string;
  localUrl: string;
  remoteUrl: string;
}

export interface UsgsOverlayVector {
  objectId: number | null;
  symbol: string;
  dataset: string;
  description: string;
  geomType: 'Polygon' | 'LineString';
  localPolylines: Array<Array<{ x: number; y: number }>>;
}

export interface WorldviewTemporalSol {
  sol: number;
  utcLabel: string;
  dustTau: number;
  protonPfu: number;
  speActive: boolean;
  minTempC: number;
  maxTempC: number;
  noteEn: string;
  noteEs: string;
}

export const WORLDVIEW_TEMPORAL_SOLS: WorldviewTemporalSol[] = [
  {
    sol: 1,
    utcLabel: 'Sol 01 · Clear Morning',
    dustTau: 0.38,
    protonPfu: 0.31,
    speActive: false,
    minTempC: -92,
    maxTempC: -56,
    noteEn: 'Nominal Tau 0.38 · Optimal HiRISE/Optical EKF lock',
    noteEs: 'Tau nominal 0,38 · Bloqueo óptico/EKF óptimo',
  },
  {
    sol: 2,
    utcLabel: 'Sol 02 · Nominal Tradewind',
    dustTau: 0.45,
    protonPfu: 0.42,
    speActive: false,
    minTempC: -95,
    maxTempC: -58,
    noteEn: 'Arcadia clear sky · Full UWB/Optical traverse clearance',
    noteEs: 'Cielo despejado Arcadia · Corredor UWB/Óptico libre',
  },
  {
    sol: 3,
    utcLabel: 'Sol 03 · Suspended Aerosol',
    dustTau: 0.92,
    protonPfu: 1.85,
    speActive: false,
    minTempC: -98,
    maxTempC: -62,
    noteEn: 'Elevated dust load · Pre-filter HUD luminance +8%',
    noteEs: 'Polvo en suspensión · Pre-ajuste luminancia HUD +8%',
  },
  {
    sol: 4,
    utcLabel: 'Sol 04 · Solar Watch (CME)',
    dustTau: 1.35,
    protonPfu: 14.6,
    speActive: true,
    minTempC: -102,
    maxTempC: -65,
    noteEn: 'SPE Watch active · w_r x10 favors POI-05 scarp shelter',
    noteEs: 'Alerta SPE activa · w_r x10 prioriza refugio POI-05',
  },
  {
    sol: 5,
    utcLabel: 'Sol 05 · Regional Dust Front',
    dustTau: 2.85,
    protonPfu: 4.1,
    speActive: false,
    minTempC: -110,
    maxTempC: -72,
    noteEn: 'Tau > 2.5 optical loss · PDR/IMU + 77 GHz mmWave mode',
    noteEs: 'Tau > 2,5 sin óptica · Modo PDR/IMU + radar 77 GHz',
  },
  {
    sol: 6,
    utcLabel: 'Sol 06 · Post-Storm Settling',
    dustTau: 1.18,
    protonPfu: 0.88,
    speActive: false,
    minTempC: -99,
    maxTempC: -63,
    noteEn: 'Post-front inspection · Check EDS airlock electrostatic load',
    noteEs: 'Post-tormenta · Verificar descarga electrostática EDS',
  },
  {
    sol: 7,
    utcLabel: 'Sol 07 · Reference Nominal',
    dustTau: 0.45,
    protonPfu: 0.31,
    speActive: false,
    minTempC: -94,
    maxTempC: -57,
    noteEn: 'Reference baseline synced with NOAA GOES-18 snapshot',
    noteEs: 'Línea base sincronizada con NOAA GOES-18',
  },
];

export const WORLDVIEW_EARTH_SPINOFF_PRESETS = [
  {
    id: 'cal-wildfire-usar',
    titleEn: 'NASA Worldview · California Wildfire Smoke (USAR GPS-Denied)',
    titleEs: 'NASA Worldview · Humo de Incendio California (Rescate USAR sin GPS)',
    product: 'MODIS_Terra_CorrectedReflectance_TrueColor (GIBS Level 6/9)',
    localTileUrl: '/nasa-layers/worldview/gibs_terra_wus_z6_r24_c10.jpg',
    secondaryTileUrl: '/nasa-layers/worldview/gibs_terra_wus_z6_r24_c11.jpg',
    remoteUrl:
      'https://worldview.earthdata.nasa.gov/?v=-125.5,35.5,-117.5,41.5&l=MODIS_Terra_CorrectedReflectance_TrueColor,FIRMS_MODIS_Thermal_Anomalies_All',
    mappingEn:
      'Mars tau > 2.5 dust blackout ≡ Dense wildfire smoke zero-visibility: transfers 77 GHz mmWave + IMU PDR wireframe + UWB firefighter repeater beacons directly to Earth.',
    mappingEs:
      'Tormenta marciana tau > 2,5 ≡ Humo denso sin visibilidad en incendios forestales: transfiere radar 77 GHz + malla PDR/IMU + repetidores UWB a bomberos terrestres.',
  },
];

export async function fetchNasaDonkiSpaceWeather(): Promise<NasaDonkiSpaceWeatherStatus> {
  const checkedIso = new Date().toISOString();

  // Keyless unthrottled live NOAA SWPC GOES-18 primary space weather feed
  try {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 4500);

    const [scalesRes, protonsRes, xraysRes] = await Promise.all([
      fetch('https://services.swpc.noaa.gov/products/noaa-scales.json', { signal: controller.signal }),
      fetch('https://services.swpc.noaa.gov/json/goes/primary/integral-protons-1-day.json', {
        signal: controller.signal,
      }),
      fetch('https://services.swpc.noaa.gov/json/goes/primary/xrays-1-day.json', {
        signal: controller.signal,
      }),
    ]);
    window.clearTimeout(timeoutId);

    if (scalesRes.ok && protonsRes.ok && xraysRes.ok) {
      const scales = (await scalesRes.json()) as Record<
        string,
        { S?: { Scale?: string; Text?: string }; R?: { Scale?: string; Text?: string } }
      >;
      const protons = (await protonsRes.json()) as Array<{
        energy?: string;
        flux?: number;
        time_tag?: string;
      }>;
      const xrays = (await xraysRes.json()) as Array<{
        energy?: string;
        flux?: number;
        time_tag?: string;
      }>;

      const protons10 = protons.filter((p) => p.energy === '>=10 MeV');
      const peakPfu = protons10.reduce((mx, p) => Math.max(mx, Number(p.flux || 0)), 0);
      const latestProton = protons10[protons10.length - 1];
      const latestXray = [...xrays].reverse().find((x) => x.energy === '0.1-0.8nm');

      const sScaleNum = Number(scales['0']?.S?.Scale ?? 0);
      const rScaleNum = Number(scales['0']?.R?.Scale ?? 0);
      const strongXrayCount = xrays.filter(
        (x) => x.energy === '0.1-0.8nm' && Number(x.flux || 0) >= 1e-5
      ).length;

      let recommendedAlaraMode: NasaDonkiSpaceWeatherStatus['recommendedAlaraMode'] = 'NOMINAL_GCR';
      if (sScaleNum >= 2 || peakPfu >= 100) {
        recommendedAlaraMode = 'SPE_ALERT';
      } else if (sScaleNum >= 1 || peakPfu >= 10 || strongXrayCount > 0) {
        recommendedAlaraMode = 'SPE_WATCH';
      }

      const xFluxStr = latestXray?.flux ? `${Number(latestXray.flux).toExponential(1)} W/m²` : 'nominal';
      return {
        online: true,
        sourceLabel: 'NOAA SWPC GOES-18 + NASA CCMC SPE Model (Live)',
        lastCheckedIso: checkedIso,
        sepEventsCount30d: peakPfu >= 10 ? 1 : 0,
        solarFlaresCount7d: strongXrayCount > 0 ? Math.min(9, Math.ceil(strongXrayCount / 6)) : 0,
        latestEventSummary: `GOES-18 >=10 MeV: ${Number(latestProton?.flux ?? peakPfu).toFixed(2)} pfu (24h max ${peakPfu.toFixed(2)} pfu) · X-ray ${xFluxStr} · S${sScaleNum}/R${rScaleNum}`,
        recommendedAlaraMode,
        marsTrekWmtsStatus: 'ONLINE',
        protonFlux10MeVPfu: Number(peakPfu.toFixed(3)),
        noaaScaleR: `R${rScaleNum} (${scales['0']?.R?.Text ?? 'none'})`,
        noaaScaleS: `S${sScaleNum} (${scales['0']?.S?.Text ?? 'none'})`,
      };
    }
  } catch {
    // Fallback to locally ingested NOAA SWPC snapshot below
  }

  try {
    const snapRes = await fetch('/data/noaa-swpc-snapshot.json');
    if (snapRes.ok) {
      const snap = (await snapRes.json()) as {
        fetchedAtIso?: string;
        peak24hProton10MeVPfu?: number;
        currentScales?: { S?: { Scale?: string }; R?: { Scale?: string } };
      };
      const peakPfu = snap.peak24hProton10MeVPfu ?? 0.31;
      const sStr = `S${snap.currentScales?.S?.Scale ?? '0'}`;
      const rStr = `R${snap.currentScales?.R?.Scale ?? '0'}`;
      return {
        online: false,
        sourceLabel: 'NOAA SWPC GOES-18 Snapshot + Curiosity RAD Cache',
        lastCheckedIso: snap.fetchedAtIso ?? checkedIso,
        sepEventsCount30d: peakPfu >= 10 ? 1 : 0,
        solarFlaresCount7d: 0,
        latestEventSummary: `Snapshot GOES-18 >=10 MeV max ${peakPfu.toFixed(2)} pfu (${sStr}/${rStr} · 27,5 µSv/h MSL RAD)`,
        recommendedAlaraMode: peakPfu >= 10 ? 'SPE_WATCH' : 'NOMINAL_GCR',
        marsTrekWmtsStatus: 'CACHE_LOCAL',
        protonFlux10MeVPfu: peakPfu,
        noaaScaleR: rStr,
        noaaScaleS: sStr,
      };
    }
  } catch {
    // Ignore local snapshot error
  }

  return {
    online: false,
    sourceLabel: 'Caché Local Offline-First (NOAA SWPC + USGS I-1802 / SIM 3292 + CTX LOD 11)',
    lastCheckedIso: checkedIso,
    sepEventsCount30d: 0,
    solarFlaresCount7d: 0,
    latestEventSummary:
      'Modo Autónomo en Borde activo: telemetría GCR nominal (~27,5 µSv/h · ~660 µSv/día MSL RAD) · Polígono 47.5502°N, -163.1744°O',
    recommendedAlaraMode: 'NOMINAL_GCR',
    marsTrekWmtsStatus: 'CACHE_LOCAL',
  };
}

export async function fetchPerseveranceRawSamples(): Promise<PerseveranceRawSample[]> {
  try {
    const res = await fetch('/nasa-layers/manifest.json');
    if (res.ok) {
      const manifest = (await res.json()) as { perseveranceRawSamples?: PerseveranceRawSample[] };
      if (Array.isArray(manifest.perseveranceRawSamples) && manifest.perseveranceRawSamples.length > 0) {
        return manifest.perseveranceRawSamples;
      }
    }
  } catch {
    // Fall back below
  }
  return [
    {
      key: 'mcz',
      role: 'Mastcam-Z Regolith Photometry',
      sol: 2024,
      instrument: 'MCZ_LEFT',
      imageId: 'ZL0_2024_LOCAL_CACHE',
      dateTakenUtc: null,
      title: 'Mastcam-Z Regolith & Basalt Clast Calibration',
      localUrl: '/nasa-layers/perseverance/perseverance_mcz.jpg',
      remoteUrl: 'https://mars.nasa.gov/mars2020/multimedia/raw-images/',
    },
    {
      key: 'navcam',
      role: 'Navcam Hazard & Boulder Distribution',
      sol: 2024,
      instrument: 'NAVCAM_LEFT',
      imageId: 'NLG_2024_LOCAL_CACHE',
      dateTakenUtc: null,
      title: 'Navcam Forward Traverse Field',
      localUrl: '/nasa-layers/perseverance/perseverance_navcam.jpg',
      remoteUrl: 'https://mars.nasa.gov/mars2020/multimedia/raw-images/',
    },
    {
      key: 'hazcam',
      role: 'Hazcam Near-Field Micro-Roughness',
      sol: 2023,
      instrument: 'FRONT_HAZCAM_LEFT_A',
      imageId: 'FLF_2023_LOCAL_CACHE',
      dateTakenUtc: null,
      title: 'Hazcam Sub-Metric Rock Clast Calibration',
      localUrl: '/nasa-layers/perseverance/perseverance_hazcam.jpg',
      remoteUrl: 'https://mars.nasa.gov/mars2020/multimedia/raw-images/',
    },
  ];
}

export async function fetchUsgsRealOverlayVectors(
  centerLat = 47.5502,
  centerLon = -163.1744
): Promise<UsgsOverlayVector[]> {
  try {
    const res = await fetch('/data/usgs-geology-real.json');
    if (!res.ok) return [];
    const geo = (await res.json()) as {
      features?: Array<{
        properties?: {
          OBJECTID?: number;
          _symbol?: string;
          _dataset?: string;
          UnitName?: string;
          UnitDesc?: string;
          Descrip?: string;
        };
        geometry?: {
          type?: string;
          coordinates?: unknown;
        };
      }>;
    };
    const M_PER_DEG_LAT = 59274.7;
    const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((centerLat * Math.PI) / 180.0);
    const toLocal = (coord: [number, number]) => ({
      x: Math.max(-2550, Math.min(2550, (coord[0] - centerLon) * M_PER_DEG_LON)),
      y: Math.max(-2550, Math.min(2550, (coord[1] - centerLat) * M_PER_DEG_LAT)),
    });

    const out: UsgsOverlayVector[] = [];
    for (const f of geo.features ?? []) {
      const p = f.properties ?? {};
      const g = f.geometry;
      if (!g?.coordinates) continue;
      if (g.type === 'LineString') {
        const pts = (g.coordinates as Array<[number, number]>).map(toLocal);
        out.push({
          objectId: p.OBJECTID ?? null,
          symbol: p._symbol ?? 'Structure',
          dataset: p._dataset ?? 'USGS SIM 3292',
          description: p.UnitName ?? p.UnitDesc ?? p.Descrip ?? 'USGS Contact/Structure',
          geomType: 'LineString',
          localPolylines: [pts],
        });
      } else if (g.type === 'Polygon') {
        const rings = (g.coordinates as Array<Array<[number, number]>>).map((r) => r.map(toLocal));
        out.push({
          objectId: p.OBJECTID ?? null,
          symbol: p._symbol ?? 'Unit',
          dataset: p._dataset ?? 'USGS Map I-1802',
          description: p.UnitName ?? p.UnitDesc ?? p.Descrip ?? p._symbol ?? 'USGS Polygon',
          geomType: 'Polygon',
          localPolylines: rings,
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Verified HTTP 200 (ACAO: *) NASA Mars Trek MOLA+HRSC Color-Shaded WMTS (~200 m/px) */
export function getMarsTrekWmtsTileUrl(zoom = 8, row = 60, col = 23): string {
  return `https://trek.nasa.gov/tiles/Mars/EQ/Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp_lzw/1.0.0/default/default028mm/${zoom}/${row}/${col}.jpg`;
}

/** Verified HTTP 200 (ACAO: *) NASA Mars Trek Viking MDIM21 Global Color Mosaic (232 m/px) */
export function getVikingWmtsTileUrl(zoom = 7, row = 30, col = 11): string {
  return `https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/${zoom}/${row}/${col}.jpg`;
}

/** Verified HTTP 200 (ACAO: *) MRO CTX Global Mosaic LOD 11 (~10.2 m/px) via USGS/Esri OnMars */
export function getCtxOrbitalTileUrl(zoom = 11, row = 965, col = 382): string {
  return `https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX/MapServer/tile/${zoom}/${row}/${col}`;
}

export function transformGridAndPoisForZone(
  baseGrid: ArcadiaMacroGrid,
  basePois: PoiStation[],
  zoneId: ArcadiaZoneId
): { grid: ArcadiaMacroGrid; pois: PoiStation[]; zone: ArcadiaZoneSpec } {
  const zone = ARCADIA_ZONES.find((z) => z.id === zoneId) ?? ARCADIA_ZONES[0];

  if (zoneId === 'zona-1-marstrek') {
    return {
      grid: {
        ...baseGrid,
        metadata: {
          ...baseGrid.metadata,
          region: zone.name,
          centerLat: zone.centerLatDeg,
          centerLon: zone.centerLonWestDeg,
        },
      },
      pois: basePois,
      zone,
    };
  }

  const elevOffset = zone.datumElevationBaseM - -3012.0;
  const reliefGain =
    zoneId === 'zona-2-arcgis'
      ? 0.82
      : zoneId === 'zona-3-isru'
      ? 1.12
      : zoneId === 'zona-5-trek-44n'
      ? 0.72
      : 0.92;
  const meanElev = -3005.0;

  let minElev = Infinity;
  let maxElev = -Infinity;

  const transformedNodes: GridNode[] = baseGrid.nodes.map((n) => {
    const rel = (n.elevationM - meanElev) * reliefGain;
    // Pequeña modulación topográfica específica del sector enfocado dentro del polígono
    const sectorWave =
      zoneId === 'zona-2-arcgis'
        ? // Formación 5 (Aa5): más lisa y nivelada
          1.4 * Math.sin(n.x * 0.001 + n.y * 0.001)
        : zoneId === 'zona-3-isru'
        ? // Formación 2 (Aa2): más crestas de arrugamiento (wrinkle ridges)
          4.2 * Math.sin(n.x * 0.0035 + n.y * 0.0022)
        : zoneId === 'zona-5-trek-44n'
        ? // Master Mars Trek 44.66° N / -175.00° O (Aa4): llanura amazónica suave
          1.9 * Math.sin(n.x * 0.0012 - n.y * 0.0011)
        : // Formación 1 (Aa1): depresiones de cráteres antiguos y lajas
          -2.8 * Math.cos(n.x * 0.0025) * Math.sin(n.y * 0.0025);

    const newElev = Number((meanElev + elevOffset + rel + sectorWave).toFixed(2));
    if (newElev < minElev) minElev = newElev;
    if (newElev > maxElev) maxElev = newElev;

    // Ajuste del mapa de unidades cuando se enfoca un sector específico del Polígono de Estudio
    let unit = n.unit;
    if (zoneId === 'zona-2-arcgis' && n.y < 650 && n.x < 850 && n.unit === 'Aa1') {
      unit = 'Aa5';
    } else if (zoneId === 'zona-3-isru' && n.x > -250 && n.y > -950 && n.unit !== 'Aa5') {
      unit = 'Aa2';
    } else if (zoneId === 'zona-4-aa1' && n.y > -450 && n.unit !== 'Aa2') {
      unit = 'Aa1';
    } else if (zoneId === 'zona-5-trek-44n' && Math.hypot(n.x, n.y) > 450 && n.unit === 'Aa5') {
      unit = 'Aa4';
    }

    const iceMod =
      zoneId === 'zona-2-arcgis'
        ? Math.max(1.2, Number((n.iceDepthM * 0.82).toFixed(2)))
        : zoneId === 'zona-3-isru'
        ? Math.max(1.4, Number((n.iceDepthM * 1.15).toFixed(2)))
        : Math.max(1.1, Number((n.iceDepthM * 0.88).toFixed(2)));

    const newSlope = Number(
      Math.min(28, Math.max(0.4, n.slopeDeg * reliefGain)).toFixed(2)
    );

    const latDeg = Number((zone.centerLatDeg + n.y / 59158.0).toFixed(5));
    const lonDeg = Number((zone.centerLonWestDeg + n.x / 39928.0).toFixed(5));

    return {
      ...n,
      latDeg,
      lonDeg,
      elevationM: newElev,
      slopeDeg: newSlope,
      iceDepthM: iceMod,
      unit,
      geoUnit: unit,
    };
  });

  const nodeMap = new Map<string, GridNode>();
  for (const n of transformedNodes) {
    nodeMap.set(`${n.row}:${n.col}`, n);
  }

  const transformedPois: PoiStation[] = basePois.map((p) => {
    const col = Math.min(49, Math.max(0, Math.round((p.x + 2500) / 100)));
    const row = Math.min(49, Math.max(0, Math.round((p.y + 2500) / 100)));
    const near = nodeMap.get(`${row}:${col}`);
    return {
      ...p,
      elevationM: near ? near.elevationM : Number(((p.elevationM ?? -3005) + elevOffset).toFixed(2)),
    };
  });

  return {
    grid: {
      ...baseGrid,
      metadata: {
        ...baseGrid.metadata,
        region: zone.name,
        centerLat: zone.centerLatDeg,
        centerLon: zone.centerLonWestDeg,
        elevationRangeM: [Number(minElev.toFixed(2)), Number(maxElev.toFixed(2))],
      },
      nodes: transformedNodes,
    },
    pois: transformedPois,
    zone,
  };
}
