import React from 'react';
import { useI18n } from '../../i18n/I18nContext';

interface SpacecraftConsoleFrameProps {
  variant: 'wall-tv' | 'holo-table';
  povOffset: { x: number; y: number };
  elevateModal?: boolean;
  wrapperClassName?: string;
  screenClassName?: string;
  children: React.ReactNode;
}

/**
 * Chasis físico compartido por Pre-EVA (mesa/consola proyectora holográfica)
 * y Post-EVA (televisor de mamparo alejado del POV), integrando la serigrafía
 * institucional de la nave en el bisel inferior.
 */
export const SpacecraftConsoleFrame: React.FC<SpacecraftConsoleFrameProps> = ({
  variant,
  povOffset,
  elevateModal = false,
  wrapperClassName = '',
  screenClassName = '',
  children,
}) => {
  const { t } = useI18n();
  const isHoloTable = variant === 'holo-table';

  const tx = elevateModal ? 0 : Math.round(povOffset.x * 6);
  const ty = elevateModal ? 0 : Math.round(povOffset.y * 4);

  return (
    <div
      className={`relative ${elevateModal ? 'z-40' : 'z-10'} flex max-h-full flex-col items-center transition-transform duration-300 ease-out ${
        elevateModal ? '' : 'will-change-transform'
      } ${wrapperClassName}`}
      style={
        elevateModal
          ? undefined
          : {
              transform: `translate3d(${tx}px, ${ty}px, 0)`,
            }
      }
    >
      {/* Halo ambiental proyectado sobre el mamparo o alrededor de la mesa */}
      <div className="pointer-events-none -inset-6 absolute rounded-[40px] bg-gradient-to-b from-cyan-400/14 via-amber-300/8 to-slate-950/60 blur-2xl" />

      {/* Soportes superiores de mamparo (solo en televisor de pared) */}
      {!isHoloTable && (
        <div className="pointer-events-none -top-3 left-1/2 flex -translate-x-1/2 gap-36 absolute">
          <div className="h-4 w-7 rounded-t-md border border-slate-500/30 bg-gradient-to-b from-slate-700 to-slate-900 shadow-lg" />
          <div className="h-4 w-7 rounded-t-md border border-slate-500/30 bg-gradient-to-b from-slate-700 to-slate-900 shadow-lg" />
        </div>
      )}

      {/* Estructura física de titanio cepillado */}
      <div
        className={`relative flex w-full flex-col rounded-[26px] border p-2 sm:p-2.5 shadow-[0_38px_90px_rgba(0,0,0,0.95),0_12px_28px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.22)] ${
          isHoloTable
            ? 'h-full border-cyan-300/25 bg-gradient-to-b from-[#25303d]/92 via-[#111822]/90 to-[#090d14]/96'
            : 'max-h-[78vh] border-white/18 bg-gradient-to-b from-[#28313e] via-[#141a23] to-[#0a0d13]'
        }`}
      >
        <span className="pointer-events-none absolute left-3 top-3 h-1 w-1 rounded-full bg-slate-400/40 ring-1 ring-black/70" />
        <span className="pointer-events-none absolute right-3 top-3 h-1 w-1 rounded-full bg-slate-400/40 ring-1 ring-black/70" />

        {/* Sensor óptico / indicador superior */}
        <div className="mx-auto mb-1.5 flex items-center gap-1.5">
          <span className="h-0.5 w-6 rounded-full bg-white/10" />
          <span className="animate-tv-led h-1.5 w-1.5 rounded-full bg-cyan-300" />
          <span className="h-0.5 w-6 rounded-full bg-white/10" />
        </div>

        {/* Superficie de cristal / óptica de alta definición */}
        <div
          className={`relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[18px] border border-white/18 text-white antialiased shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_0_32px_rgba(6,12,24,0.55)] ${
            isHoloTable
              ? elevateModal
                ? 'bg-slate-950/24'
                : 'bg-slate-950/24 backdrop-blur-[3px]'
              : elevateModal
                ? 'bg-[#0b111c]/90'
                : 'bg-[#0b111c]/90 backdrop-blur-md'
          } ${screenClassName}`}
        >
          {/* Reflejo sutil sobre el cristal */}
          <div
            className="pointer-events-none absolute inset-0 z-20 rounded-[18px]"
            style={{
              background:
                'linear-gradient(125deg, rgba(255,255,255,0.065) 0%, rgba(255,255,255,0.015) 28%, transparent 52%)',
            }}
          />

          {/* Cono emisor óptico ascendente para mesa holográfica Pre-EVA */}
          {isHoloTable && (
            <>
              <div
                className="pointer-events-none absolute inset-x-6 bottom-0 z-10 h-32"
                style={{
                  background:
                    'linear-gradient(to top, rgba(56, 232, 255, 0.22) 0%, rgba(56, 232, 255, 0.05) 45%, transparent 100%)',
                }}
              />
              <div className="pointer-events-none absolute inset-x-10 bottom-0 z-10 h-[2px] rounded-full bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent shadow-[0_0_16px_rgba(56,232,255,0.85)]" />
            </>
          )}

          {children}
        </div>

        {/* Bisel inferior físico de la nave únicamente con logo del equipo y NASA Space Apps Challenge */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 sm:px-8 pt-2.5 pb-1 text-slate-300/85 select-none">
          {/* Logo 1: Proyecto / Equipo Ares Arcadia */}
          <div className="flex items-center gap-3 opacity-95">
            <div className="h-10 w-10 sm:h-11 sm:w-11 shrink-0 overflow-hidden rounded-full ring-1 ring-slate-300/45 shadow-[inset_0_1px_4px_rgba(0,0,0,0.85),0_2px_10px_rgba(0,0,0,0.45)]">
              <img
                src="/assets/habitat/ares-arcadia-patch.jpg"
                alt={t('Ares Arcadia Team Patch', 'Logo Equipo Ares Arcadia')}
                className="h-full w-full object-cover opacity-95 saturate-95"
              />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-[12px] sm:text-[13px] font-bold tracking-[0.22em] text-slate-100/92 drop-shadow-[0_1px_0_rgba(0,0,0,0.85)]">
                ARES ARCADIA
              </span>
              <span className="mt-1 text-[8px] sm:text-[8.5px] uppercase tracking-[0.22em] text-slate-400/80">
                {t('Habitat Module Mk-IV', 'Módulo Hábitat Mk-IV')}
              </span>
            </div>
          </div>

          {/* Logo 2: NASA International Space Apps Challenge */}
          <div className="flex items-center">
            <img
              src="/assets/logos/nasa-space-apps-challenge.png"
              alt="NASA Space Apps Challenge Logo"
              className="h-9 sm:h-10 w-auto max-w-[165px] object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
            />
          </div>
        </div>
      </div>

      {/* Pedestal de mesa táctica holográfica debajo del chasis en Pre-EVA */}
      {isHoloTable && (
        <div className="pointer-events-none flex flex-col items-center">
          <div className="flex gap-40">
            <div className="h-3.5 w-8 border-x border-b border-slate-500/35 bg-gradient-to-b from-slate-800 to-slate-950 shadow-md" />
            <div className="h-3.5 w-8 border-x border-b border-slate-500/35 bg-gradient-to-b from-slate-800 to-slate-950 shadow-md" />
          </div>
          <div className="h-2.5 w-[260px] rounded-b-xl border border-t-0 border-cyan-300/20 bg-gradient-to-b from-slate-800/95 to-slate-950 shadow-[0_12px_30px_rgba(0,0,0,0.9)]" />
        </div>
      )}
    </div>
  );
};
