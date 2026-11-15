import React from 'react';
import { Dumbbell, Utensils } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import type {
  FoodInventoryState,
  HudLanguageMode,
  MusculoskeletalState,
  PoiStation,
  WazeSuggestion,
} from '../../types/mission';
import { HabitatGalleyConsole } from './HabitatGalleyConsole';
import { HabitatGymConsole } from './HabitatGymConsole';

export type PhysicalDivisionId = 'gym' | 'galley';

interface HabitatPhysicalConsoleProps {
  activeDivision: PhysicalDivisionId;
  onChangeDivision: (division: PhysicalDivisionId) => void;
  musculoskeletal: MusculoskeletalState;
  astronautMassKg: number;
  hudMode: HudLanguageMode;
  onUpdateMusculoskeletal: (updater: (prev: MusculoskeletalState) => MusculoskeletalState) => void;
  supplies: FoodInventoryState;
  onUpdateSupplies: (updater: (prev: FoodInventoryState) => FoodInventoryState) => void;
  samplesCollectedKg: number;
  samplesCachedKg: number;
  cacheNode: PoiStation | null;
  capturedAnomalies: WazeSuggestion[];
}

/**
 * Sección 02 del Módulo Marciano (Pre-EVA): Salud Física.
 * Divide estrictamente dos compartimentos independientes (Gimnasio 0.38g y
 * Alimento / Hielo SHARAD / Muestras) con instrumentación clara y sin ruido visual.
 */
export const HabitatPhysicalConsole: React.FC<HabitatPhysicalConsoleProps> = ({
  activeDivision,
  onChangeDivision,
  musculoskeletal,
  astronautMassKg,
  hudMode,
  onUpdateMusculoskeletal,
  supplies,
  onUpdateSupplies,
  samplesCollectedKg,
  samplesCachedKg,
  cacheNode,
  capturedAnomalies,
}) => {
  const { t } = useI18n();
  const isIntuitive = hudMode === 'intuitive';
  const totalAutonomyDays = supplies.earthSupplyDaysRemaining + supplies.isruAutonomyGainDays;

  const divisions: Array<{
    id: PhysicalDivisionId;
    code: string;
    label: string;
    metric: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      id: 'gym',
      code: '02.A',
      label: t('Gym · 0.38g', 'Gimnasio · 0,38g'),
      metric: isIntuitive
        ? `${musculoskeletal.indexPct.toFixed(0)}% · ${musculoskeletal.dailyExerciseMin}m`
        : `${musculoskeletal.indexPct.toFixed(1)}% · ${musculoskeletal.dailyExerciseMin}/120m`,
      icon: Dumbbell,
    },
    {
      id: 'galley',
      code: '02.B',
      label: t('Food & Samples', 'Alimento y Muestras'),
      metric: isIntuitive
        ? `${totalAutonomyDays}d · ${supplies.potableWaterLiters.toFixed(0)}L`
        : `${totalAutonomyDays}d · ${supplies.caloriesKcalToday}kcal`,
      icon: Utensils,
    },
  ];

  return (
    <div className="flex h-full w-full flex-col bg-slate-950/60 text-white">
      {/* Encabezado limpio con las 2 divisiones independientes de Salud Física */}
      <div className="grid shrink-0 grid-cols-2 divide-x divide-white/12 border-b border-white/12 bg-slate-950/75">
        {divisions.map((div) => {
          const Icon = div.icon;
          const active = activeDivision === div.id;
          return (
            <button
              key={div.id}
              type="button"
              onClick={() => onChangeDivision(div.id)}
              aria-pressed={active}
              className={`relative flex items-center justify-between gap-2 px-3 py-2 text-left transition ${
                active ? 'bg-white/[0.06] text-white' : 'text-white/55 hover:bg-white/[0.03] hover:text-white/85'
              }`}
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="font-mono text-[9.5px] font-semibold tracking-wider text-cyan-300/80">
                  {div.code}
                </span>
                <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-cyan-300' : 'text-white/50'}`} />
                <span className="whitespace-nowrap text-[11.5px] font-semibold tracking-tight">{div.label}</span>
              </div>
              <span className="shrink-0 font-mono text-[10px] font-medium tabular-nums text-white/80">
                {div.metric}
              </span>
              {active && (
                <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-cyan-300 shadow-[0_0_10px_#38e8ff]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Área enfocada de la división seleccionada */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeDivision === 'gym' ? (
          <HabitatGymConsole
            embedded
            musculoskeletal={musculoskeletal}
            astronautMassKg={astronautMassKg}
            hudMode={hudMode}
            onUpdateMusculoskeletal={onUpdateMusculoskeletal}
          />
        ) : (
          <HabitatGalleyConsole
            embedded
            supplies={supplies}
            hudMode={hudMode}
            onUpdateSupplies={onUpdateSupplies}
            samplesCollectedKg={samplesCollectedKg}
            samplesCachedKg={samplesCachedKg}
            cacheNode={cacheNode}
            capturedAnomalies={capturedAnomalies}
          />
        )}
      </div>
    </div>
  );
};
