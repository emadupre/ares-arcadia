import React from 'react';
import { Compass, Dumbbell } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import type { HabitatInteriorSectionId } from '../../types/mission';
import { getEmotionalStatusMeta } from '../shared/emotionalStatus';

interface HabitatSectionsDockProps {
  activeSection: HabitatInteriorSectionId;
  onSelectSection: (section: HabitatInteriorSectionId) => void;
  musculoskeletalPct: number;
  autonomyDays: number;
  emotionalIntegrityPct: number;
}

/**
 * Navegación interior del Módulo Marciano (3 secciones activas en Base:
 * 01 Planificación, 02 Físico [Gimnasio + Alimento] y 03 Emocional).
 */
export const HabitatSectionsDock: React.FC<HabitatSectionsDockProps> = ({
  activeSection,
  onSelectSection,
  musculoskeletalPct,
  autonomyDays,
  emotionalIntegrityPct,
}) => {
  const { t } = useI18n();
  const emoMeta = getEmotionalStatusMeta(emotionalIntegrityPct);
  const EmoFaceIcon = emoMeta.icon;

  const sections: Array<{
    id: HabitatInteriorSectionId;
    num: string;
    label: string;
    sub: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      id: 'pre-eva',
      num: '01',
      label: t('Planning', 'Planificación'),
      sub: t('3D Map', 'Mapa 3D'),
      icon: Compass,
    },
    {
      id: 'physical',
      num: '02',
      label: t('Physical', 'Físico'),
      sub: `${musculoskeletalPct.toFixed(0)}% · ${autonomyDays}d`,
      icon: Dumbbell,
    },
    {
      id: 'emotional',
      num: '03',
      label: t('Emotional', 'Emocional'),
      sub: `${Math.round(emotionalIntegrityPct)}% · ${
        emoMeta.stateKey === 'good'
          ? t('Stable', 'Estable')
          : emoMeta.stateKey === 'tense'
            ? t('Tense', 'Tenso')
            : t('Low', 'Bajo')
      }`,
      icon: EmoFaceIcon,
    },
  ];

  return (
    <div
      data-tour="habitat-dock"
      className="pointer-events-auto z-20 flex flex-wrap md:flex-nowrap items-center justify-center gap-1.5 rounded-full border border-white/15 bg-slate-950/65 p-1 backdrop-blur-xl shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
    >
      {sections.map((sec) => {
        const Icon = sec.icon;
        const active = activeSection === sec.id;
        return (
          <button
            key={sec.id}
            type="button"
            onClick={() => onSelectSection(sec.id)}
            className={`flex items-center gap-2 rounded-full px-3 py-1 text-left transition ${
              active
                ? 'bg-cyan-300 text-slate-950 shadow-[0_0_14px_rgba(56,232,255,0.45)]'
                : 'text-white/80 hover:bg-white/10 hover:text-white'
            }`}
          >
            <span
              className={`flex h-4 w-4 items-center justify-center rounded-full font-mono text-[8.5px] font-bold ${
                active ? 'bg-slate-950/20 text-slate-950' : 'bg-white/10 text-cyan-300'
              }`}
            >
              {sec.num}
            </span>
            <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-slate-950' : 'text-cyan-300'}`} />
            <div className="flex flex-col leading-none">
              <span className="text-[10px] font-semibold tracking-wide whitespace-nowrap">
                {sec.label}
              </span>
              <span
                className={`mt-0.5 font-mono text-[8px] whitespace-nowrap ${
                  active ? 'text-slate-800' : 'text-white/55'
                }`}
              >
                {sec.sub}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
};
