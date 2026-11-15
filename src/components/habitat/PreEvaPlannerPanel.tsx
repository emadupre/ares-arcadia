import React, { useEffect, useState } from 'react';
import type {
  GridNode,
  HabitatLayerId,
  PoiStation,
  PreEvaModalId,
  RouteMetrics,
} from '../../types/mission';
import { computeArcadiaWeight } from '../../engine/bioenergetics';
import {
  ARCADIA_ZONES,
  type ArcadiaZoneId,
  type ArcadiaZoneSpec,
} from '../../services/nasaApiService';
import {
  CheckCircle2,
  Compass,
  Download,
  Eye,
  Flame,
  Info,
  Layers,
  Map as MapIcon,
  MapPin,
  Navigation,
  Plus,
  Route,
  Ruler,
  ShieldAlert,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import type { MultiPoiCircuitPlan } from '../../engine/routing';
import { useI18n } from '../../i18n/I18nContext';
import { getPoiCopy, lonDir } from '../../i18n/catalog';

interface PreEvaPlannerPanelProps {
  pois: PoiStation[];
  selectedPoiId: string;
  onSelectPoiId: (id: string) => void;
  customPoiIds?: Set<string>;
  onAddCustomPoi?: (input: {
    name: string;
    x: number;
    y: number;
    kind?: 'science' | 'shelter';
  }) => void;
  onRemoveCustomPoi?: (id: string) => void;
  circuitPlan?: MultiPoiCircuitPlan | null;
  circuitModeEnabled?: boolean;
  onToggleCircuitMode?: () => void;
  onExportGeoJson?: () => void;
  activeLayer: HabitatLayerId;
  onChangeLayer: (layer: HabitatLayerId) => void;
  spePreview: boolean;
  onToggleSpePreview: () => void;
  astronautMassKg: number;
  onChangeAstronautMassKg: (kg: number) => void;
  alaraBudgetMicroSv: number;
  onChangeAlaraBudget: (budget: number) => void;
  selectedNode: GridNode | null;
  plannedRoute: RouteMetrics | null;
  onLaunchEva: () => void;
  activeZoneId?: ArcadiaZoneId;
  plannerOpen: boolean;
  onTogglePlannerOpen: () => void;
  activeModal: PreEvaModalId;
  onChangeModal: (modal: PreEvaModalId) => void;
  detailedMarkers: boolean;
  onToggleDetailedMarkers: () => void;
  cleanVisor: boolean;
  onToggleCleanVisor: () => void;
  flyoverActive?: boolean;
  onToggleFlyover?: () => void;
}

export const PreEvaPlannerPanel: React.FC<PreEvaPlannerPanelProps> = ({
  pois,
  selectedPoiId,
  onSelectPoiId,
  customPoiIds,
  onAddCustomPoi,
  onRemoveCustomPoi,
  circuitPlan,
  circuitModeEnabled = false,
  onToggleCircuitMode,
  onExportGeoJson,
  spePreview,
  onToggleSpePreview,
  astronautMassKg,
  onChangeAstronautMassKg,
  alaraBudgetMicroSv,
  onChangeAlaraBudget,
  selectedNode,
  plannedRoute,
  onLaunchEva,
  activeZoneId = 'zona-1-marstrek',
  plannerOpen,
  onTogglePlannerOpen,
  activeModal,
  onChangeModal,
  detailedMarkers,
  onToggleDetailedMarkers,
  cleanVisor,
  onToggleCleanVisor,
  flyoverActive = false,
  onToggleFlyover,
}) => {
  const { lang, t } = useI18n();
  const [forearmRaised, setForearmRaised] = useState(false);
  const [addingPoi, setAddingPoi] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customX, setCustomX] = useState('250');
  const [customY, setCustomY] = useState('250');
  const [customKind, setCustomKind] = useState<'science' | 'shelter'>('science');

  // Auto-sync 3D terrain click coordinates while the manual POI creator is open
  useEffect(() => {
    if (!addingPoi || !selectedNode) return;
    setCustomX(String(Math.round(selectedNode.x)));
    setCustomY(String(Math.round(selectedNode.y)));
  }, [addingPoi, selectedNode]);

  const openAddPoiForm = () => {
    const baseX = selectedNode ? Math.round(selectedNode.x) : 250;
    const baseY = selectedNode ? Math.round(selectedNode.y) : 250;
    setCustomName('');
    setCustomX(String(baseX));
    setCustomY(String(baseY));
    setCustomKind('science');
    setAddingPoi(true);
  };

  const handleFillFromSelectedNode = () => {
    if (!selectedNode) return;
    setCustomX(String(Math.round(selectedNode.x)));
    setCustomY(String(Math.round(selectedNode.y)));
  };

  const handleSubmitCustomPoi = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onAddCustomPoi) return;
    const parsedX = Number.parseFloat(customX);
    const parsedY = Number.parseFloat(customY);
    const safeX = Number.isFinite(parsedX)
      ? parsedX
      : selectedNode
        ? selectedNode.x
        : 0;
    const safeY = Number.isFinite(parsedY)
      ? parsedY
      : selectedNode
        ? selectedNode.y
        : 0;
    onAddCustomPoi({
      name: customName.trim(),
      x: safeX,
      y: safeY,
      kind: customKind,
    });
    setAddingPoi(false);
    setCustomName('');
  };

  const activeZone: ArcadiaZoneSpec =
    ARCADIA_ZONES.find((z) => z.id === activeZoneId) ?? ARCADIA_ZONES[0];

  const totalMassKg = 104 + astronautMassKg;
  const totalWeight = computeArcadiaWeight(totalMassKg);

  const destinationPois = pois.filter((p) => p.id !== 'POI-01');
  const currentPoi =
    destinationPois.find((p) => p.id === selectedPoiId) ?? destinationPois[0];

  const dosePct = plannedRoute
    ? Math.min(100, Math.round((plannedRoute.radiationDoseMicroSv / alaraBudgetMicroSv) * 100))
    : 0;
  const o2Safe = (plannedRoute?.o2RequiredMin ?? 0) < 160;
  const routeGo = Boolean(plannedRoute) && dosePct < 85 && o2Safe;

  // Keyboard shortcuts: [Tab] / [B] raises/lowers the astronaut's forearm AR HUD
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      const key = e.key.toLowerCase();
      if (key === 'tab' || key === 'b') {
        e.preventDefault();
        setForearmRaised((prev) => !prev);
      } else if (key === '1') {
        onTogglePlannerOpen();
      } else if (key === '2') {
        onChangeModal(activeModal === 'layers' ? 'none' : 'layers');
      } else if (key === '3') {
        onChangeModal(activeModal === 'geodesic' ? 'none' : 'geodesic');
      } else if (key === '4') {
        onChangeModal(activeModal === 'atlas' ? 'none' : 'atlas');
      } else if (key === '5') {
        onToggleDetailedMarkers();
      } else if (key === '6') {
        onToggleSpePreview();
      } else if (key === 'v') {
        onToggleCleanVisor();
      } else if (key === 'escape') {
        if (activeModal !== 'none') {
          onChangeModal('none');
        } else {
          setForearmRaised(false);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeModal,
    onChangeModal,
    onToggleCleanVisor,
    onToggleDetailedMarkers,
    onTogglePlannerOpen,
    onToggleSpePreview,
  ]);

  const forearmButtons = [
    {
      key: '1',
      label: t('Destinations', 'Destinos'),
      active: plannerOpen && !cleanVisor,
      icon: Navigation,
      alert: false,
      onClick: () => onTogglePlannerOpen(),
    },
    {
      key: '2',
      label: t('GIS Layers', 'Capas GIS'),
      active: activeModal === 'layers',
      icon: Layers,
      alert: false,
      onClick: () => onChangeModal(activeModal === 'layers' ? 'none' : 'layers'),
    },
    {
      key: '3',
      label: t('Zones & Ø', 'Zonas y Ø'),
      active: activeModal === 'geodesic',
      icon: Ruler,
      alert: false,
      onClick: () => onChangeModal(activeModal === 'geodesic' ? 'none' : 'geodesic'),
    },
    {
      key: '4',
      label: 'USGS Atlas',
      active: activeModal === 'atlas',
      icon: MapIcon,
      alert: false,
      onClick: () => onChangeModal(activeModal === 'atlas' ? 'none' : 'atlas'),
    },
    {
      key: '5',
      label: t('3D Labels', 'Etiquetas 3D'),
      active: detailedMarkers && !cleanVisor,
      icon: Tag,
      alert: false,
      onClick: () => onToggleDetailedMarkers(),
    },
    {
      key: '6',
      label: spePreview ? t('SPE Active', 'SPE Activa') : t('Simulate SPE', 'Simular SPE'),
      active: spePreview,
      icon: Flame,
      alert: spePreview,
      onClick: () => onToggleSpePreview(),
    },
    {
      key: 'V',
      label: t('Clean Visor', 'Visor Limpio'),
      active: cleanVisor,
      icon: Eye,
      alert: false,
      onClick: () => onToggleCleanVisor(),
    },
  ];

  const currentPoiCopy = currentPoi ? getPoiCopy(currentPoi, lang) : null;

  return (
    <>
      {/* LEFT SPATIAL GLASS INSPECTOR (CERO ENCASILLADO / LIMPIEZA VISUAL /ia-slop) */}
      {/* RIGHT SPATIAL GLASS INSPECTOR (CERO ENCASILLADO / DEJA DESPEJADO STATUS HOLOGRÁFICO IZQUIERDO) */}
      {plannerOpen && !cleanVisor && (
        <aside className="pointer-events-auto absolute right-3 top-3 z-20 flex max-h-[calc(100%-64px)] w-[264px] flex-col overflow-y-auto rounded-[20px] border border-white/15 bg-slate-950/38 font-sans text-xs text-white/95 backdrop-blur-2xl shadow-[0_24px_60px_rgba(0,0,0,0.48),inset_0_1px_0_rgba(255,255,255,0.22)]">
          {/* Header limpio sin cápsula externa */}
          <div className="border-b border-white/10 px-3.5 py-2">
            <div className="flex items-center justify-between">
              <span
                className={`flex items-center gap-1.5 text-[11px] font-semibold tracking-tight ${
                  spePreview
                    ? 'text-amber-300'
                    : routeGo
                      ? 'text-emerald-300'
                      : 'text-amber-200'
                }`}
              >
                {spePreview ? (
                  <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                )}
                {spePreview
                  ? t('SPE Diversion → POI-05', 'Desvío SPE → POI-05')
                  : routeGo
                    ? t('Validated Safe Route', 'Ruta Segura Validada')
                    : t('Check Reserves', 'Revisar Reservas')}
              </span>
              <button
                type="button"
                onClick={onTogglePlannerOpen}
                className="text-white/40 transition hover:text-white"
                title={t('Hide panel [1]', 'Ocultar panel [1]')}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-0.5 font-mono text-[9.5px] text-white/50">
              {activeZone.centerLatDeg.toFixed(2)}°N, {activeZone.centerLonWestDeg.toFixed(2)}°
              {lonDir(lang)} · 5×5 km
            </div>
          </div>

          {/* Lista limpia de Destinos EVA sin burbujas ni cajas anidadas */}
          <div className="border-b border-white/10 px-2.5 py-2">
            <div className="px-1.5 pb-1 text-[9px] font-medium uppercase leading-snug tracking-[0.09em] text-white/45">
              {t(
                'EVA Destinations, Suggested by A.R.E.S System',
                'Destinos EVA, Sugeridos por Sistema A.R.E.S'
              )}
            </div>

            <div className="max-h-[168px] space-y-0.5 overflow-y-auto pr-0.5">
              {destinationPois.map((poi) => {
                const active = poi.id === selectedPoiId;
                const distM = Math.round(Math.hypot(poi.x, poi.y));
                const isCustom = Boolean(customPoiIds?.has(poi.id));
                return (
                  <div
                    key={poi.id}
                    className={`group relative flex w-full items-center rounded-xl transition ${
                      active
                        ? 'bg-white/[0.13] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]'
                        : 'text-white/70 hover:bg-white/[0.05] hover:text-white/95'
                    }`}
                  >
                    {active && (
                      <span className="absolute left-0.5 top-2 bottom-2 w-0.5 rounded-full bg-cyan-300 shadow-[0_0_8px_#38e8ff]" />
                    )}
                    <button
                      type="button"
                      onClick={() => onSelectPoiId(poi.id)}
                      className="flex min-w-0 flex-1 flex-col px-2.5 py-2 text-left"
                    >
                      <div className="flex w-full items-baseline justify-between gap-2">
                        <span className="truncate text-[11px] font-medium">
                          {getPoiCopy(poi, lang).compactPreEva}
                        </span>
                        <span
                          className={`shrink-0 font-mono text-[9px] ${
                            active ? 'text-cyan-300' : 'text-white/35'
                          }`}
                        >
                          {poi.id}
                        </span>
                      </div>
                      <div className="mt-0.5 flex w-full items-center justify-between font-mono text-[9px] text-white/45">
                        <span>
                          {distM} m · {poi.unit}
                        </span>
                        {poi.featureDiameterM ? (
                          <span className={active ? 'text-amber-200/90' : 'text-white/40'}>
                            Ø {poi.featureDiameterM} m
                          </span>
                        ) : isCustom ? (
                          <span className={active ? 'text-cyan-200/85' : 'text-white/35'}>
                            {t('MANUAL', 'MANUAL')}
                          </span>
                        ) : null}
                      </div>
                    </button>
                    {isCustom && onRemoveCustomPoi && (
                      <button
                        type="button"
                        onClick={() => onRemoveCustomPoi(poi.id)}
                        title={t('Remove custom POI', 'Eliminar POI manual')}
                        aria-label={t('Remove custom POI', 'Eliminar POI manual')}
                        className="mr-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-white/35 opacity-70 transition hover:bg-rose-500/20 hover:text-rose-200 hover:opacity-100"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {onAddCustomPoi && !addingPoi && (
              <button
                type="button"
                onClick={openAddPoiForm}
                aria-label={t('Add manual POI', 'Agregar POI manual')}
                className="mt-1.5 flex w-full items-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-2.5 py-1.5 text-left text-[10.5px] font-medium text-white/75 transition hover:border-cyan-300/45 hover:bg-cyan-400/[0.07] hover:text-cyan-100"
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-md border border-cyan-300/35 bg-cyan-400/10 text-cyan-300">
                  <Plus className="h-3 w-3" />
                </span>
                <span>{t('Add manual POI', 'Agregar POI manual')}</span>
              </button>
            )}

            {onAddCustomPoi && addingPoi && (
              <form
                onSubmit={handleSubmitCustomPoi}
                className="mt-2 space-y-2 rounded-xl border border-cyan-300/25 bg-black/35 p-2.5 backdrop-blur-md"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-cyan-200/90">
                    + {t('New Manual POI', 'Nuevo POI manual')}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAddingPoi(false)}
                    aria-label={t('Close manual POI form', 'Cerrar formulario de POI manual')}
                    className="rounded-md p-0.5 text-white/45 transition hover:bg-white/10 hover:text-white/85"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>

                <div>
                  <label className="mb-0.5 block text-[9px] uppercase tracking-wider text-white/45">
                    {t('Name', 'Nombre')}
                  </label>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder={t('e.g. North Ice Core', 'ej. Núcleo Hielo Norte')}
                    maxLength={42}
                    autoFocus
                    className="w-full rounded-lg border border-white/15 bg-white/[0.05] px-2 py-1 text-[11px] text-white placeholder-white/30 outline-none focus:border-cyan-300/50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <label className="mb-0.5 block font-mono text-[9px] text-white/45">
                      X (m)
                    </label>
                    <input
                      type="number"
                      value={customX}
                      onChange={(e) => setCustomX(e.target.value)}
                      min={-2400}
                      max={2400}
                      step={10}
                      className="w-full rounded-lg border border-white/15 bg-white/[0.05] px-2 py-1 font-mono text-[10.5px] text-white outline-none focus:border-cyan-300/50"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block font-mono text-[9px] text-white/45">
                      Y (m)
                    </label>
                    <input
                      type="number"
                      value={customY}
                      onChange={(e) => setCustomY(e.target.value)}
                      min={-2400}
                      max={2400}
                      step={10}
                      className="w-full rounded-lg border border-white/15 bg-white/[0.05] px-2 py-1 font-mono text-[10.5px] text-white outline-none focus:border-cyan-300/50"
                    />
                  </div>
                </div>

                {selectedNode && (
                  <button
                    type="button"
                    onClick={handleFillFromSelectedNode}
                    className="flex w-full items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-[9.5px] text-cyan-200/85 transition hover:border-cyan-300/35 hover:bg-cyan-400/10"
                  >
                    <MapPin className="h-3 w-3 text-cyan-300" />
                    <span>
                      {t('Use map point', 'Usar punto del mapa')} ({Math.round(selectedNode.x)},{' '}
                      {Math.round(selectedNode.y)})
                    </span>
                  </button>
                )}

                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => setCustomKind('science')}
                    className={`rounded-lg border px-2 py-1 text-[9.5px] font-medium transition ${
                      customKind === 'science'
                        ? 'border-cyan-300/50 bg-cyan-400/15 text-cyan-100'
                        : 'border-white/10 bg-white/[0.03] text-white/55 hover:text-white/85'
                    }`}
                  >
                    {t('Science', 'Ciencia')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomKind('shelter')}
                    className={`rounded-lg border px-2 py-1 text-[9.5px] font-medium transition ${
                      customKind === 'shelter'
                        ? 'border-amber-300/50 bg-amber-400/15 text-amber-100'
                        : 'border-white/10 bg-white/[0.03] text-white/55 hover:text-white/85'
                    }`}
                  >
                    {t('SPE Shelter', 'Refugio SPE')}
                  </button>
                </div>

                <div className="flex items-center justify-end gap-1.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setAddingPoi(false)}
                    className="rounded-lg px-2 py-1 text-[10px] font-medium text-white/55 transition hover:bg-white/10 hover:text-white/85"
                  >
                    {t('Cancel', 'Cancelar')}
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg border border-cyan-300/45 bg-cyan-400/20 px-2.5 py-1 text-[10px] font-semibold text-cyan-100 transition hover:bg-cyan-400/30"
                  >
                    {t('Add POI', 'Agregar POI')}
                  </button>
                </div>
              </form>
            )}

            {currentPoi && (
              <button
                type="button"
                onClick={() =>
                  onChangeModal(activeModal === 'poi-detail' ? 'none' : 'poi-detail')
                }
                className="mt-1.5 flex w-full items-center gap-1.5 px-2 py-1 text-[10px] font-medium text-cyan-200/80 transition hover:text-cyan-200"
              >
                <Info className="h-3 w-3 text-cyan-300/85" />
                <span>
                  {t(
                    `Stratigraphic sheet · ${currentPoi.id}`,
                    `Ficha estratigráfica · ${currentPoi.id}`
                  )}
                </span>
              </button>
            )}
          </div>

          {/* Control segmentado sutil, métricas abiertas sin caja y CTA */}
          <div className="space-y-2 px-3.5 py-2.5">
            <div className="grid grid-cols-2 rounded-lg bg-black/30 p-0.5 text-[10px]">
              <button
                type="button"
                onClick={() => {
                  onChangeAstronautMassKg(76);
                  onChangeAlaraBudget(350);
                }}
                className={`rounded-md py-1 font-medium transition ${
                  alaraBudgetMicroSv === 350
                    ? 'bg-white/18 text-white shadow-sm'
                    : 'text-white/50 hover:text-white/80'
                }`}
              >
                {t('Standard · 350', 'Estándar · 350')}
              </button>
              <button
                type="button"
                onClick={() => {
                  onChangeAstronautMassKg(76);
                  onChangeAlaraBudget(250);
                }}
                className={`rounded-md py-1 font-medium transition ${
                  alaraBudgetMicroSv === 250
                    ? 'bg-white/18 text-amber-200 shadow-sm'
                    : 'text-white/50 hover:text-white/80'
                }`}
              >
                {t('Conservative · 250', 'Conservador · 250')}
              </button>
            </div>

            {plannedRoute && (
              <>
                <div className="grid grid-cols-3 divide-x divide-white/10 text-center font-mono text-[10px]">
                  <div className="px-1">
                    <div className="font-sans text-[8.5px] text-white/45">
                      {t('Distance', 'Distancia')}
                    </div>
                    <div className="mt-0.5 font-semibold text-white">
                      {plannedRoute.blocked ? t('BLOCKED', 'BLOQUEADA') : `${plannedRoute.distanceMeters} m`}
                    </div>
                  </div>
                  <div className="px-1">
                    <div className="font-sans text-[8.5px] text-white/45">
                      {t('Time', 'Tiempo')}
                    </div>
                    <div className={`mt-0.5 font-semibold ${plannedRoute.blocked ? 'text-rose-400' : 'text-cyan-300'}`}>
                      {plannedRoute.blocked ? '>18°' : `${plannedRoute.estimatedTimeMin} min`}
                    </div>
                  </div>
                  <div className="px-1">
                    <div className="font-sans text-[8.5px] text-white/45">
                      {t('O₂ Out', 'O₂ ida')}
                    </div>
                    <div className={`mt-0.5 font-semibold ${plannedRoute.blocked ? 'text-rose-400' : 'text-emerald-300'}`}>
                      {plannedRoute.blocked ? 'N/A' : `${plannedRoute.o2RequiredMin} min`}
                    </div>
                  </div>
                </div>

                {/* Curiosity Mount Sharp Traverse Elevation & Dose Profile */}
                {!plannedRoute.blocked && plannedRoute.profile && plannedRoute.profile.length > 1 && (() => {
                  const prof = plannedRoute.profile;
                  const minE = Math.min(...prof.map((p) => p.elevationM));
                  const maxE = Math.max(...prof.map((p) => p.elevationM));
                  const spanE = Math.max(1, maxE - minE);
                  const maxD = Math.max(1, prof[prof.length - 1].distM);
                  const polyPts = prof
                    .map((p) => {
                      const px = (p.distM / maxD) * 200;
                      const py = 26 - ((p.elevationM - minE) / spanE) * 22;
                      return `${px.toFixed(1)},${py.toFixed(1)}`;
                    })
                    .join(' ');
                  const maxSlope = Math.max(...prof.map((p) => p.slopeDeg));
                  return (
                    <div className="rounded-xl border border-white/10 bg-black/30 px-2.5 py-1.5">
                      <div className="flex items-center justify-between text-[8.5px] text-white/60">
                        <span className="font-semibold text-cyan-200/85">
                          {t('Curiosity Traverse Profile', 'Perfil Corredor Curiosity')}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-white/55">
                            {minE.toFixed(0)}..{maxE.toFixed(0)}m · {maxSlope.toFixed(1)}°
                          </span>
                          {onToggleFlyover && (
                            <button
                              type="button"
                              onClick={onToggleFlyover}
                              className={`rounded border px-1.5 py-0.5 font-mono text-[8px] font-semibold transition ${
                                flyoverActive
                                  ? 'border-amber-300 bg-amber-400/25 text-amber-100 animate-pulse'
                                  : 'border-cyan-300/35 bg-cyan-400/10 text-cyan-200 hover:border-cyan-300'
                              }`}
                            >
                              {flyoverActive ? t('FLYING', 'VOLANDO') : t('FLYOVER', 'SOBREVUELO')}
                            </button>
                          )}
                        </div>
                      </div>
                      <svg viewBox="0 0 200 28" className="mt-1 h-7 w-full overflow-visible">
                        <polyline
                          fill="none"
                          stroke="#38e8ff"
                          strokeWidth="1.6"
                          points={polyPts}
                        />
                      </svg>
                    </div>
                  );
                })()}
              </>
            )}

            {/* Optimización de Circuito Multi-POI cerrado + Exportación GIS GeoJSON IAU 2000 */}
            {circuitPlan && circuitPlan.orderedPoiIds.length > 1 && onToggleCircuitMode && (
              <div className="rounded-xl border border-white/10 bg-black/30 p-2">
                <div className="flex items-center justify-between gap-1.5">
                  <button
                    type="button"
                    onClick={onToggleCircuitMode}
                    className={`flex flex-1 items-center justify-between rounded-lg border px-2 py-1 text-left text-[9.5px] font-medium transition ${
                      circuitModeEnabled
                        ? 'border-cyan-300/50 bg-cyan-400/15 text-cyan-100'
                        : 'border-white/10 bg-white/[0.03] text-white/65 hover:border-white/25 hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <Route className="h-3 w-3 text-cyan-300" />
                      <span>
                        {t('Multi-POI Auto-Circuit', 'Circuito Óptimo Multi-POI')}
                      </span>
                    </span>
                    <span className="font-mono text-[8.5px] uppercase text-cyan-300">
                      {circuitModeEnabled ? t('ACTIVE', 'ACTIVO') : t('OFF', 'INACTIVO')}
                    </span>
                  </button>

                  {onExportGeoJson && (
                    <button
                      type="button"
                      onClick={onExportGeoJson}
                      title={t(
                        'Export IAU 2000 Mars GeoJSON for QGIS / ArcGIS / JMARS',
                        'Exportar GeoJSON Marte IAU 2000 para QGIS / ArcGIS / JMARS'
                      )}
                      className="flex items-center gap-1 rounded-lg border border-white/12 bg-white/[0.04] px-2 py-1 font-mono text-[9px] text-white/75 transition hover:border-cyan-300/45 hover:bg-cyan-400/10 hover:text-cyan-100"
                    >
                      <Download className="h-3 w-3 text-cyan-300" />
                      <span>GeoJSON</span>
                    </button>
                  )}
                </div>

                {circuitModeEnabled && (
                  <div className="mt-1.5 space-y-1 border-t border-white/10 pt-1.5 font-mono text-[8.5px] text-white/65">
                    <div className="truncate text-cyan-200/90">
                      {circuitPlan.fullSequenceIds.join(' → ')}
                    </div>
                    <div className="flex items-center justify-between text-white/50">
                      <span>{circuitPlan.totalDistanceMeters} m</span>
                      <span>O₂ {circuitPlan.totalO2RequiredMin}m</span>
                      <span>{circuitPlan.totalRadiationDoseMicroSv} µSv</span>
                      <span>{circuitPlan.totalSampleMassKg} kg</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              data-tour="launch-eva-btn"
              onClick={onLaunchEva}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-cyan-300/95 py-2 text-[11px] font-semibold text-slate-950 shadow-[0_6px_20px_rgba(56,232,255,0.28)] transition hover:bg-cyan-200"
            >
              <Navigation className="h-3.5 w-3.5" />
              <span>{t('Confirm Route & Exit to EVA', 'Confirmar Ruta y Salir a EVA')}</span>
            </button>
          </div>
        </aside>
      )}

      {/* STRATIGRAPHIC SHEET MODAL */}
      {activeModal === 'poi-detail' && currentPoi && currentPoiCopy && (
        <div
          onClick={() => onChangeModal('none')}
          className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-black/55 p-4 backdrop-blur-md"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl rounded-3xl border border-white/15 bg-slate-950/85 p-5 font-sans text-xs text-white backdrop-blur-2xl shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <div className="text-sm font-semibold text-white">
                  {currentPoi.id} · {currentPoiCopy.name}
                </div>
                <div className="text-[10px] text-cyan-300">
                  {t('Geologic Unit', 'Unidad Geológica')} {currentPoi.unit} · Arcadia Planitia
                </div>
              </div>
              <button
                type="button"
                onClick={() => onChangeModal('none')}
                className="rounded-full border border-white/15 p-1.5 text-white/75 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-black/35 p-3 text-[11px]">
              <div>
                <span className="text-white/55">{t('Coordinates', 'Coordenadas')}:</span>{' '}
                <strong className="font-mono text-cyan-300">
                  ({currentPoi.x}m, {currentPoi.y}m)
                </strong>
              </div>
              <div>
                <span className="text-white/55">{t('Radial Distance', 'Distancia Radial')}:</span>{' '}
                <strong className="font-mono text-white">
                  {Math.round(Math.hypot(currentPoi.x, currentPoi.y))} m
                </strong>
              </div>
              <div className="col-span-2">
                <span className="text-white/55">{t('Geometry', 'Geometría')}:</span>{' '}
                <strong className="text-amber-300">
                  {currentPoiCopy.featureDiameterLabel ?? t('Ø Operational', 'Ø Operativo')}
                </strong>
              </div>
              <div className="col-span-2">
                <span className="text-white/55">{t('SHARAD Ice', 'Hielo SHARAD')}:</span>{' '}
                <strong className="text-emerald-300">{currentPoiCopy.iceDepthLabel}</strong>
              </div>
            </div>

            <div className="mt-3 space-y-2 text-[11px] leading-relaxed">
              <p className="text-white/90">
                <strong className="text-cyan-300">{t('Objective', 'Objetivo')}:</strong>{' '}
                {currentPoiCopy.objective}
              </p>
              <p className="rounded-2xl border border-amber-300/35 bg-amber-400/10 p-2.5 text-amber-200">
                <strong>{t('COSPAR Restriction', 'Restricción COSPAR')}:</strong>{' '}
                {currentPoiCopy.riskAndRestriction}
              </p>
            </div>

            {selectedNode && (
              <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-[10px]">
                <div className="mb-1 flex items-center justify-between font-semibold text-cyan-300">
                  <span className="flex items-center gap-1">
                    <Compass className="h-3.5 w-3.5" /> {t('Inspected Node', 'Nodo Inspeccionado')}
                  </span>
                  <span>
                    {t('Unit', 'Unidad')} {selectedNode.unit}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-white/80">
                  <span>
                    XY: ({selectedNode.x}m, {selectedNode.y}m)
                  </span>
                  <span>
                    {selectedNode.latDeg.toFixed(4)}°N, {selectedNode.lonDeg.toFixed(4)}°
                    {lonDir(lang)}
                  </span>
                  <span>
                    {t('Elevation', 'Cota')}: {selectedNode.elevationM.toFixed(1)} m
                  </span>
                  <span>
                    {t('Slope', 'Pendiente')}: {selectedNode.slopeDeg.toFixed(1)}° · SVF{' '}
                    {selectedNode.svf.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            <div className="mt-3 space-y-1.5 border-t border-white/10 pt-3 text-[11px]">
              <div className="flex justify-between">
                <span>
                  {t('Crew Mass', 'Masa Tripulante')}: {astronautMassKg} kg + mEMU 104 kg
                </span>
                <span className="font-mono font-semibold text-cyan-300">
                  {totalMassKg} kg ({totalWeight.weightN} N · 0.38g)
                </span>
              </div>
              <input
                type="range"
                min={55}
                max={116}
                value={astronautMassKg}
                onChange={(e) => onChangeAstronautMassKg(Number(e.target.value))}
                className="h-1.5 w-full accent-cyan-300"
              />
            </div>
          </div>
        </div>
      )}

      {/* DIEGETIC FIRST-PERSON FOREARM AR CONSOLE IN PRE-EVA (NO BOTTOM BAR; ACTIVATED BY [TAB] / [B]) */}
      <div
        className={`pointer-events-none absolute bottom-3 right-6 flex flex-col items-end ${
          forearmRaised ? 'z-30' : 'z-20'
        }`}
      >
        <div
          className={`pointer-events-auto origin-bottom-right transition-all duration-500 ease-out ${
            forearmRaised
              ? 'translate-y-0 scale-100 opacity-100'
              : 'translate-y-20 scale-90 opacity-0 pointer-events-none'
          }`}
          style={{
            transform: forearmRaised
              ? 'perspective(1000px) rotateX(5deg) rotateY(-8deg)'
              : 'perspective(1000px) rotateX(22deg) rotateY(-16deg) translateY(80px)',
          }}
        >
          <div className="w-[340px] rounded-3xl border border-white/18 bg-slate-950/55 p-4 font-sans text-white backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.55),0_0_25px_rgba(56,232,255,0.14)]">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_8px_#38e8ff]" />
                <span className="text-[11px] font-semibold">
                  {t('AR Forearm · Planning', 'Antebrazo AR · Planificación')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setForearmRaised(false)}
                className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] text-white/65 hover:text-white"
              >
                {t('Lower [Tab]', 'Bajar [Tab]')}
              </button>
            </div>

            <div className="mt-2.5 grid grid-cols-2 gap-1.5">
              {forearmButtons.map((btn) => {
                const Icon = btn.icon;
                return (
                  <button
                    key={btn.key}
                    type="button"
                    onClick={btn.onClick}
                    className={`flex items-center justify-between rounded-2xl border px-3 py-2 text-[10px] font-medium transition ${
                      btn.alert
                        ? 'border-amber-300 bg-amber-400/25 text-amber-100'
                        : btn.active
                          ? 'border-cyan-300/50 bg-cyan-400/20 text-cyan-200'
                          : 'border-white/10 bg-black/25 text-white/75 hover:border-white/25'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5 text-cyan-300" />
                      <span>{btn.label}</span>
                    </span>
                    <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[9px] text-white/70">
                      {btn.key}
                    </kbd>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {!forearmRaised && (
          <button
            type="button"
            onClick={() => setForearmRaised(true)}
            className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/12 bg-slate-950/35 px-3.5 py-1.5 font-sans text-[10px] text-white/75 backdrop-blur-xl transition hover:border-cyan-300/45 hover:text-white"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
            <span>{t('AR Forearm', 'Antebrazo AR')}</span>
            <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[9px] text-cyan-200">
              Tab
            </kbd>
          </button>
        )}
      </div>
    </>
  );
};
