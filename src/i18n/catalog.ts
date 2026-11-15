import type { ArcadiaZoneId, ArcadiaZoneSpec, NasaDonkiSpaceWeatherStatus, StudyAreaVisualRef } from '../services/nasaApiService';
import type { HabitatLayerId, NasaCartographicStyle, PoiStation, WazeSuggestion } from '../types/mission';
import type { AppLanguage } from './I18nContext';

export interface LocalizedPoiCopy {
  name: string;
  compactPreEva: string;
  viewport3d: string;
  hudShort: string;
  objective: string;
  iceDepthLabel: string;
  riskAndRestriction: string;
  featureDiameterLabel?: string;
}

const POI_LOCALIZED: Record<string, Record<AppLanguage, LocalizedPoiCopy>> = {
  'POI-01': {
    en: {
      name: 'Ares Arcadia Habitat Base (Formation 5 · Aa5)',
      compactPreEva: 'Habitat Base (Aa5)',
      viewport3d: 'Habitat Base (Aa5)',
      hudShort: 'Ares Habitat',
      iceDepthLabel: '> 25 m (Aa5 Base Zone without reactor thermal risk)',
      featureDiameterLabel: 'Dome Ø 50 m · COSPAR Perimeter Ø 1,000 m (R=500 m)',
      objective:
        'Sited on Formation 5 (Aa5 · Very High Priority - Base Zone): the youngest, smoothest, most level unit at the Arcadia Planitia intersection (47.5502°N, -163.1744°W). Dielectrophoretic EDS airlock and UHF relay node.',
      riskAndRestriction:
        'Nominal safe zone. COSPAR planetary protection perimeter R=500 m (Ø 1,000 m) with zero thermal aquifer discharge.',
    },
    es: {
      name: 'Base Hábitat Ares Arcadia (Formación 5 · Aa5)',
      compactPreEva: 'Base Hábitat (Aa5)',
      viewport3d: 'Base Hábitat (Aa5)',
      hudShort: 'Hábitat Ares',
      iceDepthLabel: '> 25 m (Zona Base Aa5 sin riesgo térmico reactor)',
      featureDiameterLabel: 'Ø Domo 50 m · Perímetro COSPAR Ø 1.000 m (R=500 m)',
      objective:
        'Emplazado en Formación 5 (Aa5 · Prioridad Muy Alta - Zona Base): la capa más joven, lisa y nivelada de la intersección en Arcadia Planitia (47.5502°N, -163.1744°O). Esclusa EDS dielectroforética y nodo UHF.',
      riskAndRestriction:
        'Zona nominal segura. Perímetro de protección planetaria COSPAR R=500 m (Ø 1.000 m) sin descarga térmica a acuíferos.',
    },
  },
  'POI-02': {
    en: {
      name: 'Exposed Ice Crater (Formation 1 · Aa1)',
      compactPreEva: 'Exposed Ice Crater (Aa1)',
      viewport3d: 'Ice Crater (Aa1)',
      hudShort: 'Ice Crater',
      iceDepthLabel: '1.2 to 2.0 m (white exposed water-ice ring on crater wall)',
      featureDiameterLabel: 'Crater Ø 380 m (Radius 190 m · Depth 24 m)',
      objective:
        'Astrobiological and optical prospection from the upper crater rim in Formation 1 (Aa1, visible with a white ice ring in ESA/DLR orbital imagery).',
      riskAndRestriction:
        'COSPAR Category IVb Special Region alert: direct entry into the exposed-ice crater floor is prohibited.',
    },
    es: {
      name: 'Cráter con Hielo Expuesto (Formación 1 · Aa1)',
      compactPreEva: 'Cráter Hielo Expuesto (Aa1)',
      viewport3d: 'Cráter Hielo (Aa1)',
      hudShort: 'Cráter Hielo',
      iceDepthLabel: '1,2 a 2,0 m (anillo de hielo blanco expuesto en talud)',
      featureDiameterLabel: 'Ø Cráter 380 m (Radio 190 m · Prof. 24 m)',
      objective:
        'Prospección astrobiológica y óptica desde el labio superior del cráter en Formación 1 (Aa1, visible con anillo de hielo blanco en la imagen orbital ESA/DLR).',
      riskAndRestriction:
        'Alerta de Zona Especial COSPAR Categoría IVb: prohibido el ingreso directo al fondo con hielo expuesto.',
    },
  },
  'POI-03': {
    en: {
      name: 'Formations 5, 2 & 1 Intersection (Aa5 / Aa2 / Aa1 Contact)',
      compactPreEva: 'Triple Intersection (Aa5·Aa2·Aa1)',
      viewport3d: 'Triple Contact 5·2·1',
      hudShort: 'Triple Contact',
      iceDepthLabel: '15 to 35 m (SHARAD subsurface reflector)',
      featureDiameterLabel: 'Triple intersection front 1,250 m (6.5 m scarp)',
      objective:
        'Exact ArcGIS polygon triple intersection between Formation 5 (Aa5), Formation 2 (Aa2), and Formation 1 (Aa1). Collection of basalt cores and bright fractured slabs (7.00 kg cap).',
      riskAndRestriction:
        'Moderate: slope approaching 9° and transition from fine dust (Aa5) to fractured bedrock slabs (Aa1/Aa2).',
    },
    es: {
      name: 'Intersección Formaciones 5, 2 y 1 (Contacto Aa5 / Aa2 / Aa1)',
      compactPreEva: 'Intersección Triple (Aa5·Aa2·Aa1)',
      viewport3d: 'Intersección 5·2·1',
      hudShort: 'Contacto Triple',
      iceDepthLabel: '15 a 35 m (reflector SHARAD)',
      featureDiameterLabel: 'Frente de intersección triple 1.250 m (Escarpado 6,5 m)',
      objective:
        'Punto exacto de la triple intersección del Polígono ArcGIS entre Formación 5 (Aa5), Formación 2 (Aa2) y Formación 1 (Aa1). Recolección de testigos basálticos y lajas claras (límite 7,00 kg).',
      riskAndRestriction:
        'Moderado: pendiente cercana a 9° y transición de polvo fino (Aa5) a lajas rocosas fracturadas (Aa1/Aa2).',
    },
  },
  'POI-04': {
    en: {
      name: 'Volcanic Dome / Cone (Formation 2 · Aa2)',
      compactPreEva: 'Volcanic Dome (Aa2)',
      viewport3d: 'Volcanic Cone (Aa2)',
      hudShort: 'Volcanic Dome',
      iceDepthLabel: 'No shallow ice (> 40 m)',
      featureDiameterLabel: 'Basal Ø 680 m · Summit Crater Ø 145 m (Elev. +44 m)',
      objective:
        'Basal flank ascent for stratigraphic prospection in Formation 2 (Aa2 · USGS I-1802 OBJECTID 2638 / SIM 3292 Ridge 1662): small volcanic cones and wrinkle ridges.',
      riskAndRestriction:
        'High metabolic cost: upper flank slopes > 15° penalized by Pandolf-Santee equation plus rear RF shadow.',
    },
    es: {
      name: 'Domo / Cono Volcánico (Formación 2 · Aa2)',
      compactPreEva: 'Domo Volcánico (Aa2)',
      viewport3d: 'Cono Volcánico (Aa2)',
      hudShort: 'Domo Volcánico',
      iceDepthLabel: 'Sin hielo somero (> 40 m)',
      featureDiameterLabel: 'Ø Basal 680 m · Cráter Cimero Ø 145 m (Alt. +44 m)',
      objective:
        'Ascenso a falda basal para prospección estratigráfica en Formación 2 (Aa2 · USGS I-1802 OBJECTID 2638 / Cresta SIM 3292 1662): conos volcánicos pequeños y crestas de arrugamiento.',
      riskAndRestriction:
        'Alto costo metabólico: pendiente > 15° en flanco superior penalizada por ecuación Pandolf-Santee y sombra RF trasera.',
    },
  },
  'POI-05': {
    en: {
      name: 'Lobate Scarp / Lava Tube (SPE Shelter · Formation 5 / Aa4)',
      compactPreEva: 'SPE Shelter Scarp (Aa5/Aa4)',
      viewport3d: 'SPE Shelter Scarp',
      hudShort: 'Shelter Scarp',
      iceDepthLabel: '18 to 60 m (eroded Aa4 ISRU scarp margin)',
      featureDiameterLabel: 'Scarp Arc 720 m · Shelter Cavity Ø 180 m (SVF 0.38)',
      objective:
        'Natural shelter via geometric horizon shielding (SVF = 0.38 < 0.40) along the stepped lobate front of Formation 5 (Aa5) over Aa4 (visible in ESA/DLR Images 1 & 3).',
      riskAndRestriction:
        'UHF line-of-sight shadow inside the depression (requires Relay Rover stationed on upper rim · Use Cases 1 & 7).',
    },
    es: {
      name: 'Escarpe Lobulado / Tubo de Lava (Refugio SPE · Formación 5 / Aa4)',
      compactPreEva: 'Escarpe Refugio SPE (Aa5/Aa4)',
      viewport3d: 'Escarpe Refugio SPE',
      hudShort: 'Escarpe Refugio',
      iceDepthLabel: '18 a 60 m (borde erosionado ISRU Aa4)',
      featureDiameterLabel: 'Arco Escarpe 720 m · Cavidad Refugio Ø 180 m (SVF 0,38)',
      objective:
        'Refugio natural por apantallamiento geométrico del horizonte (SVF = 0,38 < 0,40) en el frente lobulado escalonado de la Formación 5 (Aa5) sobre Aa4 (visible en Imagen 1 e Imagen 3 ESA/DLR).',
      riskAndRestriction:
        'Sombra de línea de vista UHF en el interior de la depresión (requiere Rover Relé en borde superior · Caso de Uso 1 y 7).',
    },
  },
};

export function getPoiCopy(poi: PoiStation, lang: AppLanguage): LocalizedPoiCopy {
  const entry = POI_LOCALIZED[poi.id]?.[lang];
  if (entry) return entry;
  const baseShort = poi.name.split('(')[0].trim();
  return {
    name: poi.name,
    compactPreEva: baseShort,
    viewport3d: baseShort,
    hudShort: baseShort,
    objective: poi.objective,
    iceDepthLabel: poi.iceDepthLabel,
    riskAndRestriction: poi.riskAndRestriction,
    featureDiameterLabel: poi.featureDiameterLabel,
  };
}

export interface LocalizedZoneCopy {
  code: string;
  shortTitle: string;
  name: string;
  subtitle: string;
  formationFocus: string;
  missionPriority: string;
  dominantUnits: string;
  advantagesDoc: string;
  risksDoc: string;
  scientificFocus: string;
}

const ZONE_LOCALIZED: Record<ArcadiaZoneId, Record<AppLanguage, LocalizedZoneCopy>> = {
  'zona-1-marstrek': {
    en: {
      code: 'STUDY // INTERSECTION 1·2·5',
      shortTitle: 'INTERSECTION 1·2·5 (47.55°N, -163.17°W)',
      name: 'Official Study Area — Formations 1, 2 & 5 Intersection',
      subtitle: 'ArcGIS Experience Builder Polygon · Triple Contact Aa1 / Aa2 / Aa5',
      formationFocus: 'TRIPLE (Aa1 + Aa2 + Aa5)',
      missionPriority: 'TOP PRIORITY · OFFICIAL STUDY AREA',
      dominantUnits: 'Formation 5 (Aa5) · Formation 2 (Aa2) · Formation 1 (Aa1) · Aa4 Margin',
      advantagesDoc:
        'Combines the smooth, safe Base Zone in Formation 5 (Aa5) with direct access under 1.2 km to Formation 2 (Aa2) and Formation 1 (Aa1).',
      risksDoc:
        'Requires fine-dust traction control (Aa5), avoiding slopes >15° on the volcanic cone (Aa2), and enforcing COSPAR exclusion on the exposed-ice crater (Aa1).',
      scientificFocus:
        'Simultaneous study of the youngest surface (Aa5), intermediate volcanic cones (Aa2), and the oldest Amazonian volcanism layer (Aa1).',
    },
    es: {
      code: 'ESTUDIO // INTERSECCIÓN 1·2·5',
      shortTitle: 'INTERSECCIÓN 1·2·5 (47,55°N, -163,17°O)',
      name: 'Área de Estudio Oficial — Intersección Formaciones 1, 2 y 5',
      subtitle: 'Polígono ArcGIS Experience Builder · Triple Contacto Aa1 / Aa2 / Aa5',
      formationFocus: 'TRIPLE (Aa1 + Aa2 + Aa5)',
      missionPriority: 'PRIORIDAD MÁXIMA · ÁREA DE ESTUDIO OFICIAL DEL DOCUMENTO',
      dominantUnits: 'Formación 5 (Aa5) · Formación 2 (Aa2) · Formación 1 (Aa1) · Borde Aa4',
      advantagesDoc:
        'Combina la Zona Base lisa y segura en Formación 5 (Aa5) con acceso inmediato a menos de 1,2 km a la Formación 2 (Aa2) y Formación 1 (Aa1).',
      risksDoc:
        'Requiere control de tracción en polvo fino (Aa5), evitar pendiente >15° en cono (Aa2) y respetar exclusión COSPAR en cráter de hielo (Aa1).',
      scientificFocus:
        'Estudio simultáneo de la capa más joven (Aa5), los conos volcánicos intermedios (Aa2) y la capa más antigua del vulcanismo amazónico (Aa1).',
    },
  },
  'zona-2-arcgis': {
    en: {
      code: 'FORMATION 5 // BASE ZONE (Aa5)',
      shortTitle: 'FORMATION 5 · Aa5 (YOUNGEST UNIT)',
      name: 'Formation 5 (Arcadia Formation Member 5 · Aa5) — Base Zone',
      subtitle: 'Very High Priority (Base Zone) · Southwest-Central Polygon Sector',
      formationFocus: 'FORMATION 5 (Aa5)',
      missionPriority: 'VERY HIGH PRIORITY · BASE ZONE (USGS I-1802 Aa5 · OBJECTID 666)',
      dominantUnits: 'Dominant Aa5 (Arcadia Formation Member 5) + stepped Aa4 contact (ISRU)',
      advantagesDoc:
        'Youngest, smoothest, most level stratigraphic member. Retains shallow glacial ice and shows minimal crater degradation.',
      risksDoc:
        'Fine dust mantling may reduce vehicle traction or kick up plumes on landing; stepped scarp drops toward Aa4.',
      scientificFocus:
        'Primary Habitat Module siting, ISRU ice prospection along eroded Aa5/Aa4 margins, and lava-tube SPE shelter (POI-05).',
    },
    es: {
      code: 'FORMACIÓN 5 // ZONA BASE (Aa5)',
      shortTitle: 'FORMACIÓN 5 · Aa5 (CAPA MÁS NUEVA)',
      name: 'Formación 5 (Arcadia Formation Member 5 · Aa5) — Zona Base',
      subtitle: 'Prioridad Muy Alta (Zona Base) · Sector Suroeste-Central del Polígono',
      formationFocus: 'FORMACIÓN 5 (Aa5)',
      missionPriority: 'PRIORIDAD MUY ALTA · ZONA BASE (USGS I-1802 Aa5 · OBJECTID 666)',
      dominantUnits: 'Aa5 dominante (Arcadia Formation Member 5) + contacto escalonado Aa4 (ISRU)',
      advantagesDoc:
        'Es la capa más joven, lisa y nivelada. Retiene hielo superficial de eras glaciales recientes y tiene menor acumulación de cráteres.',
      risksDoc:
        'Puede tener capas de polvo fino que dificulten la tracción de los vehículos o levanten nubes al aterrizar; frentes escalonados hacia Aa4.',
      scientificFocus:
        'Emplazamiento del Módulo Principal, extracción ISRU en bordes erosionados Aa5/Aa4 y refugio SPE en tubo de lava (POI-05).',
    },
  },
  'zona-3-isru': {
    en: {
      code: 'FORMATION 2 // CONES (Aa2)',
      shortTitle: 'FORMATION 2 · Aa2 (CONES & RIDGES)',
      name: 'Formation 2 (Arcadia Formation Member 2 · Aa2) — Eastern Lobe',
      subtitle: 'Secondary Priority (Volcanic Exploration) · East-Central Polygon Sector',
      formationFocus: 'FORMATION 2 (Aa2)',
      missionPriority: 'VOLCANIC EXPLORATION (USGS I-1802 Aa2 OBJECTID 2638 · SIM 3292 Ridge 1662)',
      dominantUnits: 'Dominant Aa2 (Arcadia Formation Member 2) + Aa1 & Aa5 contact',
      advantagesDoc:
        'Key for dating mid-Amazonian volcanism, studying small volcanic cones (Aa2), and probing deep SHARAD reflectors.',
      risksDoc:
        'Dense wrinkle ridges, cones, and steep relief (>15°) spike EVA metabolic expenditure and create RF line-of-sight shadows.',
      scientificFocus:
        'Basal ascent of the Volcanic Dome/Cone (POI-04, Ø 680 m) and contact sampling across Aa5/Aa2 (POI-03).',
    },
    es: {
      code: 'FORMACIÓN 2 // CONOS (Aa2)',
      shortTitle: 'FORMACIÓN 2 · Aa2 (CONOS Y CRESTAS)',
      name: 'Formación 2 (Arcadia Formation Member 2 · Aa2) — Lóbulo Oriental',
      subtitle: 'Prioridad Secundaria (Exploración Volcánica) · Sector Centro-Este del Polígono',
      formationFocus: 'FORMACIÓN 2 (Aa2)',
      missionPriority: 'EXPLORACIÓN VOLCÁNICA (USGS I-1802 Aa2 OBJECTID 2638 · Cresta SIM 3292 1662)',
      dominantUnits: 'Aa2 dominante (Arcadia Formation Member 2) + contacto Aa1 y Aa5',
      advantagesDoc:
        'Útil para datar el vulcanismo amazónico intermedio y estudiar conos volcánicos pequeños (Aa2) y reflectores SHARAD profundos.',
      risksDoc:
        'Contiene crestas de arrugamiento, conos y relieves abruptos (>15°) que elevan el gasto metabólico EVA y bloquean línea de vista RF.',
      scientificFocus:
        'Ascenso a la falda del Domo/Cono Volcánico (POI-04, Ø 680 m) y muestreo en el frente de contacto Aa5/Aa2 (POI-03).',
    },
  },
  'zona-4-aa1': {
    en: {
      code: 'FORMATION 1 // OLDEST (Aa1)',
      shortTitle: 'FORMATION 1 · Aa1 (OLDEST LAYER)',
      name: 'Formation 1 (Arcadia Formation Member 1 · Aa1) — Northern Plains',
      subtitle: 'Oldest Amazonian Volcanic Layer · Northern Polygon Sector',
      formationFocus: 'FORMATION 1 (Aa1)',
      missionPriority: 'AMAZONIAN DATING & ICE CRATERS (USGS I-1802 Aa1 OBJECTID 1798)',
      dominantUnits: 'Dominant Aa1 (Arcadia Formation Member 1) + northern Aa2 lobe & Aa5 arm',
      advantagesDoc:
        'Enables dating the onset of Amazonian volcanism (oldest layer A1) and observing impact craters with bright exposed-ice rings.',
      risksDoc:
        'Fractured bedrock slab outcrops (Image 4), degraded crater rims, and COSPAR IVb Special Region around shallow-ice slopes (POI-02).',
      scientificFocus:
        'Optical survey of Exposed Ice Crater (POI-02, Ø 380 m, ice at 1.2–2.0 m) and collection of ancient basalt slabs.',
    },
    es: {
      code: 'FORMACIÓN 1 // ANTIGUA (Aa1)',
      shortTitle: 'FORMACIÓN 1 · Aa1 (CAPA MÁS VIEJA)',
      name: 'Formación 1 (Arcadia Formation Member 1 · Aa1) — Llanura Norte',
      subtitle: 'Capa Más Antigua del Vulcanismo Amazónico · Sector Norte del Polígono',
      formationFocus: 'FORMACIÓN 1 (Aa1)',
      missionPriority: 'DATACIÓN AMAZÓNICA Y CRÁTERES DE HIELO (USGS I-1802 Aa1 OBJECTID 1798)',
      dominantUnits: 'Aa1 dominante (Arcadia Formation Member 1) + lóbulo norte Aa2 y brazo Aa5',
      advantagesDoc:
        'Permite datar el inicio del vulcanismo amazónico (capa más vieja A1) y observar cráteres de impacto con anillos blancos de hielo expuesto.',
      risksDoc:
        'Afloramientos de lajas rocosas fracturadas (Imagen 4), cráteres degradados y Zona Especial COSPAR IVb en taludes de hielo expuesto (POI-02).',
      scientificFocus:
        'Inspección óptica del Cráter con Hielo Expuesto (POI-02, Ø 380 m, hielo a 1,2–2,0 m) y recolección de lajas basálticas antiguas.',
    },
  },
  'zona-5-trek-44n': {
    en: {
      code: 'MARS TREK MASTER // 44.66° N · 185.00° E',
      shortTitle: 'TREK MASTER · 44.66° N / -175.00° W (Aa4)',
      name: 'Regional Mars Trek Quadrant (44.66° N, 185.00° E / -175.00° W · Aa4)',
      subtitle: 'Master JPL Mars Trek Geodetic Frame · Arcadia Formation Member 4 (Aa4)',
      formationFocus: 'MASTER QUAD (44.66°N · Aa4)',
      missionPriority: 'JPL MARS TREK MASTER FRAME & ISRU PLAINS (USGS I-1802 Aa4 OBJECTID 653)',
      dominantUnits: 'Regional Aa4 (Arcadia Formation Member 4 · USGS OBJECTID 653) on Mars Trek',
      advantagesDoc:
        'Matches master JPL Mars Trek coordinates (44.66° N, 185.00° E / -175.00° W): thicker atmospheric column (-3,850 m MOLA) lowers GCR exposure across smooth Aa4 plains.',
      risksDoc:
        'Low-elevation dust plains with lower thermal inertia and localized shallow SHARAD subsurface ice lenses (< 5 m).',
      scientificFocus:
        'Direct orbital alignment against Mars Trek HRSC+MOLA (z=8 r=64 c=7) and Viking MDIM21 (z=7 r=32 c=3) WMTS tiles.',
    },
    es: {
      code: 'MARS TREK MASTER // 44.66° N · 185.00° E',
      shortTitle: 'TREK MASTER · 44.66° N / -175.00° O (Aa4)',
      name: 'Cuadrante Regional Mars Trek (44.66° N, 185.00° E / -175.00° O · Aa4)',
      subtitle: 'Referencia Geodésica Maestra JPL Mars Trek · Arcadia Formation Member 4 (Aa4)',
      formationFocus: 'CUAD. MAESTRO (44.66°N · Aa4)',
      missionPriority: 'CUADRANTE REGIONAL JPL MARS TREK & HIELO ISRU (USGS I-1802 Aa4 #653)',
      dominantUnits: 'Aa4 regional (Arcadia Formation Member 4 · USGS OBJECTID 653) en Mars Trek',
      advantagesDoc:
        'Cuadrante maestro citado en JPL Mars Trek (44,66° N, 185,00° E / -175,00° O): mayor columna atmosférica (-3.850 m MOLA) que atenúa GCR sobre planicies Aa4.',
      risksDoc:
        'Llanuras bajas con polvo de menor inercia térmica y lentes someras de hielo subsuperficial SHARAD (< 5 m).',
      scientificFocus:
        'Georreferenciación directa sobre mosaicos NASA JPL Mars Trek HRSC+MOLA (z=8 r=64 c=7) y Viking MDIM21 (z=7 r=32 c=3).',
    },
  },
};

export function getZoneCopy(zone: ArcadiaZoneSpec, lang: AppLanguage): LocalizedZoneCopy {
  return ZONE_LOCALIZED[zone.id]?.[lang] ?? ZONE_LOCALIZED['zona-1-marstrek'][lang];
}

export interface LocalizedStudyRefCopy {
  title: string;
  subtitle: string;
  formationsShown: string;
  coordsLabel: string;
  description: string;
}

const STUDY_REF_LOCALIZED: Record<string, Record<AppLanguage, LocalizedStudyRefCopy>> = {
  'ref-arcgis-125': {
    en: {
      title: '1. Formations 1, 2 & 5 = USGS (Aa1·Aa2·Aa5)',
      subtitle: 'Local Unit Correlation across the Study Polygon',
      formationsShown: 'FORMATION 1 (Aa1 · North) · FORMATION 2 (Aa2 · East-Central) · FORMATION 5 (Aa5 · Southwest)',
      coordsLabel: '47.7047,-163.2637 · 47.64015,-163.00552 · 47.38472,-163.08792 · 47.47124,-163.3406',
      description:
        'Local delineation of the triple contact among Formation 1 = Aa1 (older beige northern plain), Formation 2 = Aa2 (pink-violet volcanic lobe & cone), and Formation 5 = Aa5 (young terracotta southwest base surface).',
    },
    es: {
      title: '1. Formaciones 1, 2 y 5 = USGS (Aa1·Aa2·Aa5)',
      subtitle: 'Correlación Local de Unidades en el Polígono de Estudio',
      formationsShown: 'FORMACIÓN 1 (Aa1 · Norte) · FORMACIÓN 2 (Aa2 · Centro-Este) · FORMACIÓN 5 (Aa5 · Suroeste)',
      coordsLabel: '47.7047,-163.2637 · 47.64015,-163.00552 · 47.38472,-163.08792 · 47.47124,-163.3406',
      description:
        'Delimitación local del contacto triple entre Formación 1 = Aa1 (capa antigua beige norte), Formación 2 = Aa2 (lóbulo rosado-violáceo con cono) y Formación 5 = Aa5 (superficie joven terracota suroeste).',
    },
  },
  'ref-usgs-map': {
    en: {
      title: '2. Representative Map 2: Arcadia Planitia (USGS)',
      subtitle: 'Official USGS Geologic Map · Regional Arcadia Planitia Context',
      formationsShown: 'Units Aa1 (Formation 1), Aa2 (Formation 2), Aa5 (Formation 5), Aa3, Aa4 & Ach ridges',
      coordsLabel: 'Study Area Centroid: 47.5502° N, -163.1744° W (196.83° E)',
      description:
        'Official USGS geologic map locating Arcadia Planitia in the Martian northwest quadrant and validating direct spatial alignment of Amazonian units Aa1, Aa2, Aa4, and Aa5 with the simulation terrain.',
    },
    es: {
      title: '2. Mapa Representativo 2: Arcadia Planitia (USGS)',
      subtitle: 'Carta Geológica Oficial USGS · Contexto Regional Arcadia Planitia',
      formationsShown: 'Unidades Aa1 (Formación 1), Aa2 (Formación 2), Aa5 (Formación 5), Aa3, Aa4 y crestas Ach',
      coordsLabel: 'Centroide Área de Estudio: 47.5502° N, -163.1744° O (196.83° E)',
      description:
        'Mapa geológico oficial USGS que ubica Arcadia Planitia en el cuadrante noroeste marciano y valida la correlación espacial directa de las unidades amazónicas Aa1, Aa2, Aa4 y Aa5 con el terreno de la simulación.',
    },
  },
  'ref-esa-orbital': {
    en: {
      title: '3. Oblique Orbital View (ESA/DLR/FU Berlin)',
      subtitle: 'Lobate Contact Scarp & Exposed-Ice Craters',
      formationsShown: 'Stepped Aa5/Aa4 front (ochre) over reddish Aa1/Aa2 plain with white ice',
      coordsLabel: 'Scarp POI-05 (-860m, -620m) & Ice Crater POI-02 (-420m, +780m)',
      description:
        'Shows the dark-shadowed lobate flow scarp (SPE shelter SVF < 0.40) and impact craters with bright rings of shallow water ice (1.2–2.0 m depth).',
    },
    es: {
      title: '3. Vista Orbital Oblicua (ESA/DLR/FU Berlin)',
      subtitle: 'Escarpe de Contacto Lobulado y Cráteres con Hielo Expuesto',
      formationsShown: 'Frente escalonado Aa5/Aa4 (ocre) sobre llanura rojiza Aa1/Aa2 con hielo blanco',
      coordsLabel: 'Escarpe POI-05 (-860m, -620m) y Cráter Hielo POI-02 (-420m, +780m)',
      description:
        'Muestra el frente de flujo lobulado con sombras oscuras (refugio SPE SVF < 0,40) y los cráteres con anillos blancos de hielo de agua superficial (1,2–2,0 m).',
    },
  },
  'ref-eva-surface': {
    en: {
      title: '4. Astronaut / Rover Surface EVA View',
      subtitle: 'Dark Basaltic Regolith, Fractured Pale Slabs & Horizon Scarp',
      formationsShown: 'Real EVA surface (Aa5 / Aa2 / Aa1 Contact)',
      coordsLabel: 'Arcadia Planitia Horizon (g = 3.72243 m/s² · Suit Weight = 39.5 kgf)',
      description:
        'Direct visual reference for the EVA viewport: dark basaltic regolith, fractured pale slab outcrops, and continuous mesa/scarp along the ochre Martian sky horizon.',
    },
    es: {
      title: '4. Vista Superficial EVA a Nivel de Astronauta / Rover',
      subtitle: 'Regolito Basáltico Oscuro, Lajas Claras Fracturadas y Escarpe en Horizonte',
      formationsShown: 'Superficie real en EVA (Contacto Aa5 / Aa2 / Aa1)',
      coordsLabel: 'Horizonte de Arcadia Planitia (g = 3,72243 m/s² · P_traje = 39,5 kgf)',
      description:
        'Referencia visual directa para la simulación EVA: regolito oscuro, afloramientos de lajas claras fracturadas y meseta/escarpe continuo en el horizonte bajo cielo marciano ocre.',
    },
  },
  'ref-curiosity-sharp': {
    en: {
      title: '5. NASA Curiosity Mount Sharp Proposed Path',
      subtitle: 'Route Planning & Science Traverse Corridor Methodology',
      formationsShown: 'Multi-stop A* traverse corridors, slope limits & science stops',
      coordsLabel: 'science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/',
      description:
        'Applies JPL Curiosity Mount Sharp visual traverse methodology: annotated geological zones, slope safety gates, elevation profile strip, and interactive 3D route flyover.',
    },
    es: {
      title: '5. Ruta Propuesta Curiosity (Monte Sharp · NASA)',
      subtitle: 'Precedente Metodológico de Corredores Seguros y Puntos Científicos',
      formationsShown: 'Corredores A* multi-parada, cotas de pendiente y zonas científicas',
      coordsLabel: 'science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/',
      description:
        'Adopta el modelo visual de JPL Curiosity en el Monte Sharp: corredor anotado por unidades geológicas, perfil altimétrico de ruta y sobrevuelo 3D interactivo.',
    },
  },
};

export function getStudyRefCopy(refItem: StudyAreaVisualRef, lang: AppLanguage): LocalizedStudyRefCopy {
  return STUDY_REF_LOCALIZED[refItem.id]?.[lang] ?? {
    title: refItem.title,
    subtitle: refItem.subtitle,
    formationsShown: refItem.formationsShown,
    coordsLabel: refItem.coordsLabel,
    description: refItem.description,
  };
}

export const GIS_LAYERS_BY_LANG: Record<
  AppLanguage,
  Array<{ id: HabitatLayerId; label: string; desc: string }>
> = {
  en: [
    { id: 'geology', label: 'USGS Units (Aa1–Aa5)', desc: 'Formation 1, 2, 4 & 5 boundaries' },
    { id: 'slope', label: 'MOLA/HiRISE Slopes', desc: 'Pandolf-Santee >15° threshold in red' },
    { id: 'cospar', label: 'COSPAR IVb Exclusion', desc: 'Exposed-ice crater keep-out zone' },
    { id: 'radiation', label: 'RAD / SVF Radiation', desc: 'Geometric canyon & tube shielding' },
    { id: 'ice', label: 'SHARAD / GRS Ice', desc: 'Subsurface water-ice depth (m)' },
    { id: 'rfLos', label: 'UHF/UWB Line of Sight', desc: 'RF shadow zones for Relay Rover' },
  ],
  es: [
    { id: 'geology', label: 'Unidades USGS (Aa1–Aa5)', desc: 'Límites de Formaciones 1, 2, 4 y 5' },
    { id: 'slope', label: 'Pendientes MOLA/HiRISE', desc: 'Umbral Pandolf-Santee >15° en rojo' },
    { id: 'cospar', label: 'Exclusión COSPAR IVb', desc: 'Cráter hielo expuesto prohibido' },
    { id: 'radiation', label: 'Radiación RAD / SVF', desc: 'Cañones/tubos con blindaje geométrico' },
    { id: 'ice', label: 'Hielo SHARAD / GRS', desc: 'Profundidad de hielo subsuperficial (m)' },
    { id: 'rfLos', label: 'Línea de Vista UHF/UWB', desc: 'Zonas de sombra RF para Rover Relé' },
  ],
};

export const CARTO_STYLE_BY_LANG: Record<AppLanguage, Record<NasaCartographicStyle, string>> = {
  en: {
    'usgs-sim3292': 'USGS Aa1·Aa2·Aa5',
    'ctx-orbital': 'MRO CTX + HRSC REAL',
    'hirise-regolith': 'ORBITAL ESA/HiRISE',
    'mola-hypsometric': 'MOLA HYPSOMETRIC',
  },
  es: {
    'usgs-sim3292': 'USGS Aa1·Aa2·Aa5',
    'ctx-orbital': 'ORBITAL CTX + HRSC REAL',
    'hirise-regolith': 'ORBITAL ESA/HiRISE',
    'mola-hypsometric': 'MOLA HIPSOMÉTRICO',
  },
};

export const CARTO_BIB_BY_LANG: Record<AppLanguage, Record<NasaCartographicStyle, string>> = {
  en: {
    'usgs-sim3292': 'Tanaka et al. (2014), USGS SIM 3292 · I-1802',
    'ctx-orbital': 'MRO CTX LOD 11 (~10.2 m/px) + HRSC/MOLA WMTS',
    'hirise-regolith': 'McEwen et al. (2007), MRO HiRISE / ESA HRSC',
    'mola-hypsometric': 'Smith et al. (2001), MOLA MEGDR / Mars Trek',
  },
  es: {
    'usgs-sim3292': 'Tanaka et al. (2014), USGS SIM 3292 · I-1802',
    'ctx-orbital': 'MRO CTX LOD 11 (~10,2 m/px) + HRSC/MOLA WMTS',
    'hirise-regolith': 'McEwen et al. (2007), MRO HiRISE / ESA HRSC',
    'mola-hypsometric': 'Smith et al. (2001), MOLA MEGDR / Mars Trek',
  },
};

export const LAYER_BIB_BY_LANG: Record<AppLanguage, Record<HabitatLayerId, string>> = {
  en: {
    geology: 'Hibbard et al. · Aa1–Aa5 Units',
    slope: 'DTM Slopes · Pandolf-Santee',
    cospar: 'COSPAR IVb Policy',
    radiation: 'Hassler et al. (2014), MSL RAD',
    ice: 'Putzig et al. (2009), MRO SHARAD',
    rfLos: 'Fresnel UHF/UWB Link over DTM',
  },
  es: {
    geology: 'Hibbard et al. · Unidades Aa1–Aa5',
    slope: 'Pendientes DTM · Pandolf-Santee',
    cospar: 'Política COSPAR IVb',
    radiation: 'Hassler et al. (2014), MSL RAD',
    ice: 'Putzig et al. (2009), MRO SHARAD',
    rfLos: 'Enlace Fresnel UHF/UWB sobre DTM',
  },
};

export const FORMATION_ANCHORS_BY_LANG: Record<
  AppLanguage,
  Array<{ id: string; title: string; subtitle: string; badgeColor: string; wx: number; wy: number }>
> = {
  en: [
    { id: 'BANNER-F1', title: 'FORMATION 1 · USGS Aa1', subtitle: 'Oldest Layer · Northern Plains', badgeColor: '#e6d5ad', wx: -180, wy: 1550 },
    { id: 'BANNER-F2', title: 'FORMATION 2 · USGS Aa2', subtitle: 'Volcanic Cones & Wrinkle Ridges', badgeColor: '#ea4c89', wx: 1380, wy: -60 },
    { id: 'BANNER-F5', title: 'FORMATION 5 · USGS Aa5', subtitle: 'Young Base Zone · Level Surface', badgeColor: '#eb6328', wx: -240, wy: -980 },
    { id: 'BANNER-F4', title: 'BASAL UNIT · USGS Aa4', subtitle: 'Southern Basal Plain (Scarp)', badgeColor: '#db9c3a', wx: -1550, wy: -1850 },
    { id: 'BANNER-V1', title: 'V1 (NW): 47.7047°N, -163.2637°W', subtitle: 'NW Vertex', badgeColor: '#38e8ff', wx: -2280, wy: 2280 },
    { id: 'BANNER-V2', title: 'V2 (NE): 47.64015°N, -163.00552°W', subtitle: 'NE Vertex', badgeColor: '#38e8ff', wx: 2280, wy: 2280 },
    { id: 'BANNER-V3', title: 'V3 (SE): 47.38472°N, -163.08792°W', subtitle: 'SE Vertex', badgeColor: '#38e8ff', wx: 2280, wy: -2280 },
    { id: 'BANNER-V4', title: 'V4 (SW): 47.47124°N, -163.3406°W', subtitle: 'SW Vertex', badgeColor: '#38e8ff', wx: -2280, wy: -2280 },
  ],
  es: [
    { id: 'BANNER-F1', title: 'FORMACIÓN 1 · USGS Aa1', subtitle: 'Capa más vieja · Llanura Norte', badgeColor: '#e6d5ad', wx: -180, wy: 1550 },
    { id: 'BANNER-F2', title: 'FORMACIÓN 2 · USGS Aa2', subtitle: 'Conos Volcánicos y Crestas', badgeColor: '#ea4c89', wx: 1380, wy: -60 },
    { id: 'BANNER-F5', title: 'FORMACIÓN 5 · USGS Aa5', subtitle: 'Zona Base joven · Nivelada', badgeColor: '#eb6328', wx: -240, wy: -980 },
    { id: 'BANNER-F4', title: 'UNIDAD BASAL · USGS Aa4', subtitle: 'Llanura Basal Sur (Escarpe)', badgeColor: '#db9c3a', wx: -1550, wy: -1850 },
    { id: 'BANNER-V1', title: 'V1 (NO): 47.7047°N, -163.2637°O', subtitle: 'Vértice NO', badgeColor: '#38e8ff', wx: -2280, wy: 2280 },
    { id: 'BANNER-V2', title: 'V2 (NE): 47.64015°N, -163.00552°O', subtitle: 'Vértice NE', badgeColor: '#38e8ff', wx: 2280, wy: 2280 },
    { id: 'BANNER-V3', title: 'V3 (SE): 47.38472°N, -163.08792°O', subtitle: 'Vértice SE', badgeColor: '#38e8ff', wx: 2280, wy: -2280 },
    { id: 'BANNER-V4', title: 'V4 (SO): 47.47124°N, -163.3406°O', subtitle: 'Vértice SO', badgeColor: '#38e8ff', wx: -2280, wy: -2280 },
  ],
};

export const HABITAT_SCENE_LABELS: Record<AppLanguage, string[]> = {
  en: ['Observatory', 'Airlock', 'Bio Module'],
  es: ['Observatorio', 'Esclusa', 'Módulo Bio'],
};

const WAZE_TITLE_EN: Record<string, { title: string; mineralSignature: string }> = {
  'AI-WZN-01': {
    title: 'Unplanned Aa5-Aa2 basaltic sample',
    mineralSignature: 'Basaltic pyroxene / olivine (CRISM)',
  },
  'AI-WZN-02': {
    title: 'Hydrated salt outcrop',
    mineralSignature: 'Hydrated sulfates + dielectric signature ε′=3.1',
  },
  'AI-WZN-03': {
    title: 'Phyllosilicates on Aa4 scarp',
    mineralSignature: 'Fe/Mg smectites + deep ice lens',
  },
  'AI-WZN-04': {
    title: 'Volatile-rich vesicular nodule',
    mineralSignature: 'GRS H₂ anomaly + novel spectral signature',
  },
};

export function getWazeTitle(item: WazeSuggestion, lang: AppLanguage): string {
  return lang === 'en' ? (WAZE_TITLE_EN[item.id]?.title ?? item.title) : item.title;
}

export function getDonkiSummaryText(status: NasaDonkiSpaceWeatherStatus | null, lang: AppLanguage): string {
  if (!status) {
    return lang === 'en'
      ? 'Nominal GCR telemetry in Arcadia Polygon (47.5502°N, -163.1744°W)'
      : 'Telemetría GCR nominal en Polígono Arcadia (47.5502°N, -163.1744°O)';
  }
  if (lang === 'en') {
    if (status.latestEventSummary.startsWith('Última fulguración DONKI:')) {
      return status.latestEventSummary
        .replace('Última fulguración DONKI: Clase', 'Latest DONKI Solar Flare: Class');
    }
    if (status.latestEventSummary.startsWith('Fondo GCR nominal')) {
      return 'Nominal GCR background at Arcadia Polygon (47.55°N, -163.17°W · ~660 µSv/day / 27.5 µSv/h MSL RAD)';
    }
    if (status.latestEventSummary.startsWith('Modo Autónomo')) {
      return 'Autonomous Edge Fallback active: nominal GCR telemetry (~27.5 µSv/h · ~660 µSv/day MSL RAD) · Polygon 47.5502°N, -163.1744°W';
    }
  }
  return status.latestEventSummary;
}

export function getVertexLabel(vertexId: string, lang: AppLanguage): string {
  if (lang === 'en') {
    return vertexId.replace('(NO)', '(NW)').replace('(SO)', '(SW)');
  }
  return vertexId;
}

export function lonDir(lang: AppLanguage): string {
  return lang === 'en' ? 'W' : 'O';
}
