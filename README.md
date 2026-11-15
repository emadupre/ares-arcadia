# Ares Arcadia — Interplanetary Survival Guide: Martian Map (MVP)

- https://ares-arcadia.vercel.app/

Prototipo web bilingüe (EN / ES) para despliegue estático, desarrollado para el desafío **NASA Space Apps Challenge ("Interplanetary Survival Guide: Martian Map")** bajo el marco técnico **A.R.E.S HUD — Arcadia Planitia**.

## Datos Orbitales y Geológicos Ingestados

Todos los activos orbitales y geológicos locales se almacenan en `public/` para operación determinista sin latencia de servidor en simulacro:

- **Datum canónico de estudio (Arcadia Planitia):** `47.5502° N, -163.1744° W` (`196.8256° E`, cuadrante `5 × 5 km`, `2500` nodos a `100 m`, elevación `-3033.6 m` a `-2946.6 m`).
- **Mosaico orbital real en caché (`public/nasa-layers/manifest.json`):**
  - **USGS/Esri OnMars MRO CTX Global Mosaic LOD 11** (`~10.2 m/px`, tiles `z11 r965..966 c381..383`).
  - **NASA/JPL Mars Trek HRSC+MOLA ClrShade WMTS** (`200 m/px`, `z8 r60 c23..24`).
  - **NASA/JPL Mars Trek Viking MDIM21 Color Mosaic** (`232 m/px`, `z7 r30 c11..12`).
- **Polígonos y estructuras USGS ArcGIS (`public/data/usgs-geology-real.json`):** `USGS I-1802` (`OBJECTID 1798=Aa1, 666=Aa5, 2638=Aa2`) y `Tanaka 2014 SIM 3292` (`1255=Av, 1286=lHl`, estructura `1662`, contacto `3637`).
- **POIs canónicos (`public/data/pois.json`):** `POI-01 (0, 0)`, `POI-02 (-420, 780)`, `POI-03 (640, 220)`, `POI-04 (1180, -540)`, `POI-05 (-860, -620 · Escarpe Refugio)`.

## Arquitectura de Carpetas

```text
ares-arcadia-mvp/
├── public/
│   ├── nasa-layers/                  # Mosaicos reales CTX LOD11 + HRSC+MOLA + Viking + manifest.json
│   └── data/
│       ├── arcadia-grid-50x50.json   # Grilla macro (2500 nodos, 5×5 km) calibrada al polígono real
│       ├── pois.json                 # Estaciones POI-01..POI-05 con coordenadas canónicas
│       └── usgs-geology-real.json    # Features geológicos reales descargados desde USGS ArcGIS
├── scripts/
│   ├── fetch-nasa-layers.mjs         # Ingesta de tiles reales NASA Mars Trek / OnMars CTX y USGS ArcGIS
│   ├── generate-arcadia-data.mjs     # Generador determinista de grilla 50×50 y POIs canónicos
│   └── benchmark-mission.mjs         # Benchmark reproducible A* / ALARA SPE / bioenergética
├── src/
│   ├── config/missionConfig.ts       # Constantes (g=3.72243 m/s², mEMU 104 kg, k_θ=11.4 Nm/rad, ΔP=29.6 kPa)
│   ├── types/mission.ts              # Contratos de telemetría, ruta bloqueada (>18°) y reportes Post-EVA
│   ├── engine/
│   │   ├── radiation.ts              # Dosimetría RAD/MSL R(h, SVF) (~27.5 μSv/h GCR) y control ALARA
│   │   ├── bioenergetics.ts          # Pandolf-Santee 0.38g separando masa inercial horizontal (v²), peso y k_θ/ΔP
│   │   ├── routing.ts                # Motor A* direccional (<12 ms), exclusión COSPAR (<5 m) y bloqueo estricto >18°
│   │   ├── positioning.ts            # Fusión UWB/óptica + PDR/IMU
│   │   ├── subgrid.ts                # Sub-grilla LIDAR + mmWave 77 GHz (Halo de Confianza Ámbar)
│   │   └── poiProspector.ts          # Sugerencias geológicas contextuales ("Modo Waze")
│   ├── workers/
│   │   └── safetyCritical.worker.ts  # Núcleo Safety-Critical aislado (Watchdog 1 Hz + Árbol SPE POI-05 vs POI-01)
│   ├── hooks/
│   │   ├── useSafetyCore.ts          # Enlace reactivo con el Web Worker
│   │   └── useMultimodalInput.ts     # Demo Web Speech ASR + Head-Gaze Dwell SOS (2 s) + Cuff Checklist hold
│   ├── components/
│   │   ├── habitat/                  # Etapa 1 Pre-EVA: Planificador GIS 3D multi-capa (incl. CTX+HRSC Real)
│   │   ├── hud/                      # Etapa 2 EVA: Visor Three.js (Horizonte IMU, Wireframe PDR, Halo 3D) + HUD
│   │   ├── sandbox/                  # Judge Sandbox (SOS / SPE / Polvo / Demo 30 s) y Auditoría de Procedencia
│   │   └── postEva/                  # Etapa 3 Post-EVA: Ciclo EDS ClO₄⁻ de esclusa y exportación JSON
│   └── App.tsx                       # Simulación 20 Hz con velocidad y dt unificados (1.5× default)
└── tests/safetyEngine.test.ts        # Pruebas unitarias Vitest (física, A*, bloqueo >18°, SPE y COSPAR)
```

## Alcance Simulado vs. Datos Reales

- **Datos reales ingestados:** Cartografía orbital CTX / HRSC+MOLA / Viking y polígonos geológicos USGS `I-1802` / `SIM 3292`.
- **Hardware y entorno simulados:** Signos vitales PLSS, tormentas solares SPE (`DONKI` + trigger manual), tormentas de polvo (`τ > 2.5`), hipercapnia (`CO₂ > 7.5 mmHg`) y reconocimiento de voz Web Speech Demo ASR operan como modelos deterministas *hardware-in-the-loop*.

## Ejecución y Verificación Local

> En Windows PowerShell, utiliza `npm.cmd` y `npx.cmd`.

```bash
npm install
npm run ingest-nasa     # (Opcional) Re-descarga capas NASA Mars Trek / OnMars CTX / USGS ArcGIS
npm run generate-data   # Regenera public/data/arcadia-grid-50x50.json y pois.json
npm test                # Ejecuta todas las pruebas unitarias en Vitest
npm run benchmark       # Benchmark reproducible de latencia A*, reducción SPE (%) y ahorro metabólico (%)
npx tsc --noEmit        # Verifica tipado estricto TypeScript
npm run dev             # Levanta servidor local en Vite (http://localhost:5173)
npm run build           # Compila TypeScript + bundle estático en dist/
```
