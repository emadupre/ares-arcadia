import React, { useState } from 'react';
import {
  Droplets,
  PackageCheck,
  RockingChair,
  Snowflake,
  Sparkles,
  Sprout,
  Utensils,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { getWazeTitle } from '../../i18n/catalog';
import type { FoodInventoryState, HudLanguageMode, PoiStation, WazeSuggestion } from '../../types/mission';

interface HabitatGalleyConsoleProps {
  supplies: FoodInventoryState;
  hudMode: HudLanguageMode;
  embedded?: boolean;
  onUpdateSupplies: (updater: (prev: FoodInventoryState) => FoodInventoryState) => void;
  samplesCollectedKg: number;
  samplesCachedKg: number;
  cacheNode: PoiStation | null;
  capturedAnomalies: WazeSuggestion[];
}

/**
 * Sección 4 del Módulo Marciano: Almacén Alimenticio, Extracción de Hielo SHARAD,
 * Empaque en Envases Multicapa de Alta Barrera y Laboratorio/Depósito de Muestras.
 */
export const HabitatGalleyConsole: React.FC<HabitatGalleyConsoleProps> = ({
  supplies,
  hudMode,
  embedded = false,
  onUpdateSupplies,
  samplesCollectedKg,
  samplesCachedKg,
  cacheNode,
  capturedAnomalies,
}) => {
  const { lang, t } = useI18n();
  const isIntuitive = hudMode === 'intuitive';
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const notify = (msg: string) => {
    setStatusNotice(msg);
  };

  const handleExtractSharadIce = () => {
    onUpdateSupplies((prev) => ({
      ...prev,
      sharadIceExtractedKg: Number((prev.sharadIceExtractedKg + 12.0).toFixed(1)),
      potableWaterLiters: Number((prev.potableWaterLiters + 10.8).toFixed(1)),
      isruAutonomyGainDays: prev.isruAutonomyGainDays + 3,
    }));
    notify(
      t(
        'Precision SHARAD sub-ice drill batch extracted +12.0 kg ice -> +10.8 L purified water (+3 autonomy sols).',
        'Extracción de precisión SHARAD completada: +12,0 kg hielo → +10,8 L agua purificada (+3 soles autonomía).'
      )
    );
  };

  const handleHarvestGreens = () => {
    if (supplies.potableWaterLiters < 2.2) {
      notify(t('Low water reserve: run SHARAD ice extraction first.', 'Agua insuficiente: extrae hielo SHARAD primero.'));
      return;
    }
    onUpdateSupplies((prev) => ({
      ...prev,
      potableWaterLiters: Number((prev.potableWaterLiters - 2.2).toFixed(1)),
      hydroponicGreensKg: Number((prev.hydroponicGreensKg + 1.6).toFixed(1)),
      isruAutonomyGainDays: prev.isruAutonomyGainDays + 2,
      highBarrierPouches: Math.max(0, prev.highBarrierPouches - 1),
    }));
    notify(
      t(
        'Harvested +1.6 kg fresh hydroponic greens locally & sealed in high-barrier multilayer pouch.',
        'Cosechados +1,6 kg de verduras hidropónicas locales y sellados en envase multicapa de alta barrera.'
      )
    );
  };

  const handleConsumeRation = (
    type: 'dehydrated' | 'thermo' | 'intermediate' | 'irradiated'
  ) => {
    if (type === 'dehydrated') {
      if (supplies.potableWaterLiters < 0.6 || supplies.dehydratedFreezeDriedKg < 0.4) return;
      onUpdateSupplies((prev) => ({
        ...prev,
        potableWaterLiters: Number((prev.potableWaterLiters - 0.6).toFixed(1)),
        dehydratedFreezeDriedKg: Number((prev.dehydratedFreezeDriedKg - 0.4).toFixed(1)),
        caloriesKcalToday: prev.caloriesKcalToday + 460,
        spaceContainmentBags: Math.max(0, prev.spaceContainmentBags - 1),
      }));
      notify(
        t(
          'Rehydrated freeze-dried meal (-0.6 L water, +460 kcal). Pouch transferred to space bag.',
          'Alimento deshidratado/liofilizado rehidratado (-0,6 L agua, +460 kcal).'
        )
      );
      return;
    }

    if (type === 'thermo') {
      if (supplies.thermostabilizedKg < 0.45) return;
      onUpdateSupplies((prev) => ({
        ...prev,
        thermostabilizedKg: Number((prev.thermostabilizedKg - 0.45).toFixed(1)),
        caloriesKcalToday: prev.caloriesKcalToday + 420,
      }));
      notify(t('Heated thermostabilized pouch (+420 kcal).', 'Alimento termoestabilizado calentado (+420 kcal).'));
      return;
    }

    if (type === 'intermediate') {
      if (supplies.intermediateMoistureKg < 0.35) return;
      onUpdateSupplies((prev) => ({
        ...prev,
        intermediateMoistureKg: Number((prev.intermediateMoistureKg - 0.35).toFixed(1)),
        caloriesKcalToday: prev.caloriesKcalToday + 290,
      }));
      notify(t('Issued intermediate-moisture ration (+290 kcal).', 'Ración de humedad intermedia asignada (+290 kcal).'));
      return;
    }

    if (supplies.irradiatedKg < 0.45) return;
    onUpdateSupplies((prev) => ({
      ...prev,
      irradiatedKg: Number((prev.irradiatedKg - 0.45).toFixed(1)),
      caloriesKcalToday: prev.caloriesKcalToday + 510,
    }));
    notify(t('Prepared irradiated shelf-stable protein (+510 kcal).', 'Proteína irradiada preparada (+510 kcal).'));
  };

  const handleSealMultilayerBatch = () => {
    onUpdateSupplies((prev) => ({
      ...prev,
      highBarrierPouches: prev.highBarrierPouches + 4,
      spaceContainmentBags: prev.spaceContainmentBags + 6,
    }));
    notify(
      t(
        'Prepared +4 high-barrier multilayer containers & +6 space-grade plastic bags for sample & food storage.',
        'Alistados +4 envases multicapa de alta barrera y +6 bolsas plásticas espaciales para depósito.'
      )
    );
  };

  const calPct = Math.min(100, Math.round((supplies.caloriesKcalToday / supplies.dailyTargetKcal) * 100));

  return (
    <div className={`flex h-full w-full flex-col justify-between overflow-y-auto bg-slate-950/55 text-white ${embedded ? 'p-3' : 'p-4'}`}>
      {/* Header & Earth Supply Cap (< 3 Months) */}
      {!embedded && (
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-2.5">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-white">
            <Utensils className="h-4 w-4 text-cyan-300" />
            <span>{t('Food, ISRU Water & Samples', 'Comida, Hielo SHARAD y Muestras')}</span>
          </h2>
          <p className="text-[11px] text-white/60">
            {t('Earth <3 mos cap · Local ice & greens ISRU', 'Límite Tierra <3 meses · Agua y vegetales locales')}
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-cyan-300/35 bg-cyan-500/10 px-3.5 py-2">
          <div>
            <div className="text-[9.5px] uppercase tracking-wider text-amber-200/90">
              {t('Earth <3m', 'Tierra <3m')}
            </div>
            <div className="font-mono text-base font-bold text-amber-300">
              {supplies.earthSupplyDaysRemaining}d
            </div>
          </div>
          <div className="h-8 w-px bg-white/15" />
          <div>
            <div className="text-[9.5px] uppercase tracking-wider text-emerald-200/90">
              {t('ISRU Gain', 'ISRU Local')}
            </div>
            <div className="font-mono text-base font-bold text-emerald-300">
              +{supplies.isruAutonomyGainDays}d
            </div>
          </div>
          <div className="h-8 w-px bg-white/15" />
          <div>
            <div className="text-[9.5px] uppercase tracking-wider text-cyan-200/90">
              {isIntuitive ? t('Diet', 'Dieta') : 'Kcal'}
            </div>
            <div className="font-mono text-xs font-semibold text-white">
              {supplies.caloriesKcalToday}/{supplies.dailyTargetKcal} ({calPct}%)
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Compact supply summary bar when embedded inside Physical Section */}
      {embedded && (
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-2 text-[11px] font-mono">
          <div className="flex items-center gap-3">
            <span className="text-amber-200">
              {t('Earth <3m:', 'Tierra <3m:')} <strong>{supplies.earthSupplyDaysRemaining}d</strong>
            </span>
            <span className="text-white/25">|</span>
            <span className="text-emerald-300">
              ISRU: <strong>+{supplies.isruAutonomyGainDays}d</strong>
            </span>
          </div>
          <span className="text-cyan-200">
            {isIntuitive ? t('Diet:', 'Dieta:') : 'Kcal:'} {supplies.caloriesKcalToday}/{supplies.dailyTargetKcal} ({calPct}%)
          </span>
        </div>
      )}

      {/* Main 3-Column Interactive Depot */}
      <div className="my-2 grid flex-1 grid-cols-1 gap-2.5 md:grid-cols-12">
        {/* Col 1 (4 cols): SHARAD Precision Ice Extraction & Local Greens */}
        <section className="flex flex-col justify-between rounded-2xl border border-cyan-300/25 bg-cyan-950/20 p-2.5 md:col-span-4">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs font-semibold text-cyan-200">
              <span className="flex items-center gap-1.5">
                <Snowflake className="h-4 w-4 text-cyan-300" />
                {t('SHARAD Ice & Greens', 'Hielo SHARAD & Verduras')}
              </span>
              <span className="font-mono text-[10px] text-white/70">
                {supplies.sharadIceExtractedKg} kg
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-black/35 p-2.5 font-mono text-[11px]">
              <div>
                <div className="flex items-center gap-1 font-sans text-[9.5px] text-cyan-200/75">
                  <Droplets className="h-3 w-3" /> {t('Water', 'Agua')}
                </div>
                <div className="mt-0.5 text-base font-bold text-cyan-300">
                  {supplies.potableWaterLiters.toFixed(1)} L
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1 font-sans text-[9.5px] text-emerald-200/75">
                  <Sprout className="h-3 w-3" /> {t('Greens', 'Verduras')}
                </div>
                <div className="mt-0.5 text-base font-bold text-emerald-300">
                  {supplies.hydroponicGreensKg.toFixed(1)} kg
                </div>
              </div>
            </div>
          </div>

          <div className="mt-2.5 space-y-1.5">
            <button
              type="button"
              onClick={handleExtractSharadIce}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-cyan-300 py-2 text-[11px] font-semibold text-slate-950 transition hover:bg-cyan-200"
            >
              <Snowflake className="h-3.5 w-3.5" />
              <span>{t('Extract Ice (+12 kg)', 'Extraer Hielo SHARAD (+12 kg)')}</span>
            </button>
            <button
              type="button"
              onClick={handleHarvestGreens}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-300/50 bg-emerald-400/18 py-1.5 text-[10.5px] font-semibold text-emerald-100 transition hover:bg-emerald-400/30"
            >
              <Sprout className="h-3.5 w-3.5 text-emerald-300" />
              <span>{t('Harvest Greens (+1.6 kg)', 'Cosechar Verduras (+1,6 kg)')}</span>
            </button>
          </div>
        </section>

        {/* Col 2 (5 cols): 4 Space Food Preservation Types + Multilayer Packaging */}
        <section className="flex flex-col justify-between rounded-2xl border border-white/14 bg-white/[0.04] p-2.5 md:col-span-5">
          <div>
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="text-xs font-semibold text-white">
                {t('Preserved Food', 'Alimentos')}
              </span>
              <span className="font-mono text-[9.5px] text-amber-200">
                {supplies.highBarrierPouches} {t('pouches', 'env.')} · {supplies.spaceContainmentBags}{' '}
                {t('bags', 'bolsas')}
              </span>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 text-[10.5px]">
              <button
                type="button"
                onClick={() => handleConsumeRation('dehydrated')}
                className="flex flex-col justify-between rounded-xl border border-cyan-300/25 bg-black/30 p-2 text-left transition hover:border-cyan-300"
              >
                <div className="font-semibold text-cyan-200">
                  {t('Dehydrated & Freeze-Dried', 'Deshidratados y Liofilizados')}
                </div>
                <div className="mt-1 flex items-center justify-between font-mono text-[10px]">
                  <span className="text-white/75">{supplies.dehydratedFreezeDriedKg.toFixed(1)} kg</span>
                  <span className="text-cyan-300">+Rehidr.</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleConsumeRation('thermo')}
                className="flex flex-col justify-between rounded-xl border border-amber-300/25 bg-black/30 p-2 text-left transition hover:border-amber-300"
              >
                <div className="font-semibold text-amber-200">
                  {t('Thermostabilized', 'Termoestabilizados')}
                </div>
                <div className="mt-1 flex items-center justify-between font-mono text-[10px]">
                  <span className="text-white/75">{supplies.thermostabilizedKg.toFixed(1)} kg</span>
                  <span className="text-amber-300">+Calentar</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleConsumeRation('intermediate')}
                className="flex flex-col justify-between rounded-xl border border-emerald-300/25 bg-black/30 p-2 text-left transition hover:border-emerald-300"
              >
                <div className="font-semibold text-emerald-200">
                  {t('Intermediate Moisture', 'Humedad Intermedia')}
                </div>
                <div className="mt-1 flex items-center justify-between font-mono text-[10px]">
                  <span className="text-white/75">{supplies.intermediateMoistureKg.toFixed(1)} kg</span>
                  <span className="text-emerald-300">+Servir</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleConsumeRation('irradiated')}
                className="flex flex-col justify-between rounded-xl border border-violet-300/25 bg-black/30 p-2 text-left transition hover:border-violet-300"
              >
                <div className="font-semibold text-violet-200">
                  {t('Irradiated', 'Irradiados')}
                </div>
                <div className="mt-1 flex items-center justify-between font-mono text-[10px]">
                  <span className="text-white/75">{supplies.irradiatedKg.toFixed(1)} kg</span>
                  <span className="text-violet-300">+Prep.</span>
                </div>
              </button>
            </div>
          </div>

          {/* High-barrier multilayer packaging & space-grade bags */}
          <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xl border border-white/12 bg-black/35 px-2.5 py-2 text-[10px]">
            <div className="font-medium text-white">
              {t('Multilayer High-Barrier & Space Bags', 'Envases Multicapa y Bolsas Espaciales')}
            </div>
            <button
              type="button"
              onClick={handleSealMultilayerBatch}
              className="shrink-0 rounded-lg border border-cyan-300/40 bg-cyan-400/15 px-2.5 py-1 font-mono text-[9.5px] font-semibold text-cyan-200 hover:bg-cyan-400/30"
            >
              <PackageCheck className="mr-1 inline h-3 w-3" />
              {t('+Pack', '+Embalar')}
            </button>
          </div>
        </section>

        {/* Col 3 (3 cols): EVA Geological Samples Vault */}
        <section className="flex flex-col justify-between rounded-2xl border border-white/14 bg-white/[0.04] p-2.5 md:col-span-3">
          <div>
            <div className="flex items-center gap-1.5 border-b border-white/10 pb-2 text-xs font-semibold text-amber-200">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              <span>{t('EVA Samples', 'Muestras EVA')}</span>
            </div>

            <div className="mt-2 space-y-2 text-[10.5px]">
              <div className="rounded-xl border border-white/10 bg-black/35 p-2.5 font-mono">
                <div className="text-[9.5px] text-white/55">
                  {t('In Suit', 'En Traje')}
                </div>
                <div className="text-lg font-bold text-white">
                  {samplesCollectedKg.toFixed(2)} kg
                </div>
                <div className="text-[9.5px] text-cyan-300/85">
                  POI-CACHE: {samplesCachedKg.toFixed(2)} kg
                </div>
                {cacheNode && (
                  <div className="mt-0.5 text-[9px] text-amber-200/80">
                    ({Math.round(cacheNode.x)}m, {Math.round(cacheNode.y)}m)
                  </div>
                )}
              </div>

              <div className="max-h-28 space-y-1 overflow-y-auto pr-0.5">
                {capturedAnomalies.length === 0 ? (
                  <div className="rounded-lg border border-white/10 bg-black/25 px-2.5 py-2 text-[10px] text-white/60">
                    <RockingChair className="mr-1.5 inline h-3.5 w-3.5 text-cyan-300/70" />
                    {t('No EVA samples yet.', 'Sin muestras EVA aún.')}
                  </div>
                ) : (
                  capturedAnomalies.map((anom) => (
                    <div
                      key={anom.id}
                      className="flex items-center justify-between rounded-lg border border-cyan-300/25 bg-cyan-400/10 px-2 py-1 text-[10px]"
                    >
                      <span className="truncate font-medium text-white">
                        {getWazeTitle(anom, lang)}
                      </span>
                      <span className="ml-1 shrink-0 font-mono text-cyan-300">
                        +{anom.sampleMassKg} kg
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="mt-2 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-center font-mono text-[9.5px] text-white/65">
            {t('Sealed COSPAR Tubes', 'Cilindros Multicapa COSPAR')}
          </div>
        </section>
      </div>

      {/* Interactive Feedback Line */}
      {statusNotice && (
        <div className="rounded-xl border border-emerald-300/35 bg-emerald-500/12 px-3 py-1.5 text-[10.5px] text-emerald-100">
          {statusNotice}
        </div>
      )}
    </div>
  );
};
