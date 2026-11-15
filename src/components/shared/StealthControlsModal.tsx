import React, { useEffect } from 'react';
import { Keyboard, X } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';

interface StealthControlsModalProps {
  open: boolean;
  onClose: () => void;
}

interface ControlBinding {
  keys: string[];
  label: string;
}

/**
 * Menú de controles oculto (sin presencia visual en interfaz hasta pulsar la tecla [H]).
 * Formato técnico limpio /ia-slop con referencia completa de atajos de Pre-EVA, EVA y emergencia.
 */
export const StealthControlsModal: React.FC<StealthControlsModalProps> = ({
  open,
  onClose,
}) => {
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose]);

  if (!open) return null;

  const groups: Array<{ title: string; rows: ControlBinding[] }> = [
    {
      title: t('Movement & Visor (EVA)', 'Movimiento y Visor (EVA)'),
      rows: [
        { keys: ['W', 'A', 'S', 'D'], label: t('Walk or drive rover', 'Caminar o conducir rover') },
        { keys: ['↑', '↓', '←', '→'], label: t('Alternate movement keys', 'Desplazamiento alternativo') },
        { keys: [t('Drag', 'Arrastrar')], label: t('Rotate helmet / orbit camera', 'Mirar con el casco / rotar mapa') },
        { keys: ['C'], label: t('Toggle elevation contours', 'Alternar curvas de nivel') },
        { keys: ['Space'], label: t('Skip airlock egress animation', 'Saltar animación de esclusa') },
      ],
    },
    {
      title: t('Forearm AR & Pre-EVA', 'Antebrazo AR y Pre-EVA'),
      rows: [
        { keys: ['Tab', 'B'], label: t('Raise / lower forearm HUD', 'Subir / bajar antebrazo AR') },
        { keys: ['1', '2', '3', '4'], label: t('EVA tabs (Nav/Bio/Maps/Weather) · Pre-EVA tools', 'Pestañas EVA (Nav/Bio/Mapas/Clima) · Pre-EVA') },
        { keys: ['5', '6', 'V'], label: t('Pre-EVA markers, SPE view, clean visor', 'Pre-EVA marcadores, SPE y visor limpio') },
        { keys: ['H'], label: t('Toggle this controls sheet', 'Abrir / cerrar este menú de controles') },
        { keys: ['Esc'], label: t('Close active overlay / lower arm', 'Cerrar ventana activa / bajar brazo') },
      ],
    },
    {
      title: t('Rover, Samples & Survival', 'Rover, Muestras y Supervivencia'),
      rows: [
        { keys: ['R'], label: t('Board / dismount Rover Perseverance', 'Subirse / bajarse del Rover Perseverance') },
        { keys: ['E', 'F'], label: t('Collect soil or outcrop sample', 'Tomar muestra del suelo o afloramiento') },
        { keys: ['U'], label: t('Deploy RF relay repeater', 'Desplegar repetidor RF') },
        { keys: ['L'], label: t('Switch backup O₂ PLSS loop', 'Conmutar circuito O₂ PLSS respaldo') },
        { keys: ['G'], label: t('Enter Habitat Airlock → Post-EVA', 'Ingresar a Esclusa → Post-EVA') },
      ],
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('Keyboard Controls Reference', 'Referencia de Controles')}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[96] flex items-center justify-center bg-slate-950/72 px-4 backdrop-blur-md"
    >
      <div className="w-full max-w-[740px] overflow-hidden rounded-xl border border-cyan-300/25 bg-[#060b16]/95 text-white shadow-[0_24px_80px_rgba(0,0,0,0.8)]">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-cyan-300" />
            <span className="text-xs font-semibold tracking-tight text-white">
              {t('Controls & Shortcuts', 'Controles y Atajos')}
            </span>
            <span className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[9.5px] text-cyan-200">
              [H]
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('Close controls menu', 'Cerrar menú de controles')}
            className="flex items-center gap-1 rounded-md border border-white/12 bg-white/5 px-2 py-1 font-mono text-[10px] text-white/75 transition hover:border-white/30 hover:text-white"
          >
            <span>Esc</span>
            <X className="h-3 w-3" />
          </button>
        </div>

        <div className="grid grid-cols-1 divide-y divide-white/10 md:grid-cols-3 md:divide-x md:divide-y-0">
          {groups.map((group) => (
            <div key={group.title} className="p-3.5">
              <div className="mb-2.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-cyan-300/85">
                {group.title}
              </div>
              <div className="space-y-2">
                {group.rows.map((row) => (
                  <div key={row.label} className="flex items-start justify-between gap-2 text-[11px]">
                    <span className="leading-snug text-white/80">{row.label}</span>
                    <div className="flex shrink-0 items-center gap-1">
                      {row.keys.map((k) => (
                        <kbd
                          key={k}
                          className="rounded border border-white/20 bg-white/[0.07] px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-white"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
