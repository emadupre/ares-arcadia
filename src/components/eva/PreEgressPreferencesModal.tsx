import React, { useEffect } from 'react';
import {
  Cpu,
  DoorOpen,
  Dumbbell,
  Eye,
  Radiation,
  Volume2,
  VolumeX,
  Wind,
  X,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import type { HudLanguageMode } from '../../types/mission';

interface PreEgressPreferencesModalProps {
  open: boolean;
  hudMode: HudLanguageMode;
  onChangeHudMode: (mode: HudLanguageMode) => void;
  voiceMuted: boolean;
  onToggleVoiceMuted: () => void;
  plannedPoiLabel: string;
  onCancel: () => void;
  onConfirmEgress: () => void;
}

/**
 * Concise <5-second pre-egress preferences configurator shown between
 * Pre-EVA planning and the Martian module airlock exit animation.
 */
export const PreEgressPreferencesModal: React.FC<PreEgressPreferencesModalProps> = ({
  open,
  hudMode,
  onChangeHudMode,
  voiceMuted,
  onToggleVoiceMuted,
  plannedPoiLabel,
  onCancel,
  onConfirmEgress,
}) => {
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        onConfirmEgress();
      } else if (e.key === 'Escape' && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, onConfirmEgress, onCancel]);

  if (!open) return null;

  const isTech = hudMode === 'technical';

  return (
    <div
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={t('Pre-Egress HUD Preferences (< 5s)', 'Preferencias Rápidas del Visor (< 5s)')}
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/72 p-4 backdrop-blur-md"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-3xl border border-cyan-300/35 bg-slate-950/92 p-5 font-sans text-white shadow-[0_28px_80px_rgba(0,0,0,0.85),0_0_40px_rgba(56,232,255,0.16)]"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
          <div>
            <h2 className="text-base font-semibold text-white">
              {t('EVA Visor Setup', 'Configurar Visor EVA')}
            </h2>
            <p className="text-[11px] text-white/60">
              {t('Target:', 'Destino:')}{' '}
              <strong className="text-cyan-200">{plannedPoiLabel}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t('Back', 'Volver')}
            className="rounded-full border border-white/15 p-1.5 text-white/65 transition hover:border-white/35 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Preference 1: HUD Language (Technical vs Intuitive) */}
        <div className="mt-3.5">
          <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-white/80">
            <span>{t('HUD Style', 'Lenguaje del HUD')}</span>
            <span className="font-mono text-[9.5px] text-cyan-300/80">[Enter]</span>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => onChangeHudMode('technical')}
              className={`rounded-2xl border p-3 text-left transition ${
                isTech
                  ? 'border-cyan-300 bg-cyan-400/18 shadow-[0_0_20px_rgba(56,232,255,0.22)]'
                  : 'border-white/12 bg-white/[0.04] hover:border-white/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-white">
                  <Cpu className="h-4 w-4 text-cyan-300" />
                  <span>{t('Technical', 'Técnico')}</span>
                </span>
                {isTech && (
                  <span className="rounded-full bg-cyan-300 px-2 py-0.5 font-mono text-[9px] font-bold text-slate-950">
                    ON
                  </span>
                )}
              </div>
              <p className="mt-1 text-[10.5px] text-white/70">
                {t('Direct metrics: kPa, W, µSv/h, dB.', 'Datos exactos: kPa, W, µSv/h, dB.')}
              </p>
            </button>

            <button
              type="button"
              onClick={() => onChangeHudMode('intuitive')}
              className={`rounded-2xl border p-3 text-left transition ${
                !isTech
                  ? 'border-emerald-300 bg-emerald-400/18 shadow-[0_0_20px_rgba(52,211,153,0.22)]'
                  : 'border-white/12 bg-white/[0.04] hover:border-white/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-white">
                  <Eye className="h-4 w-4 text-emerald-300" />
                  <span>{t('Intuitive', 'Intuitivo')}</span>
                </span>
                {!isTech && (
                  <span className="rounded-full bg-emerald-300 px-2 py-0.5 font-mono text-[9px] font-bold text-slate-950">
                    ON
                  </span>
                )}
              </div>
              <p className="mt-1 text-[10.5px] text-white/70">
                {t('Universal icons, plain reading.', 'Iconos simples, lectura directa.')}
              </p>
            </button>
          </div>

          {/* Instant Visual Preview */}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 text-[10.5px]">
            <span className="flex items-center gap-1.5 text-cyan-200 nms-holo-text">
              <Wind className="h-3.5 w-3.5 text-cyan-300" />
              {isTech ? 'O₂ 98% · 185m' : t('Oxygen 98%', 'Oxígeno 98%')}
            </span>
            <span className="flex items-center gap-1.5 text-emerald-200 nms-holo-text">
              <Dumbbell className="h-3.5 w-3.5 text-emerald-300" />
              {isTech ? t('Bone/Musc 84% · 333W', 'Óseo-Musc 84% · 333W') : t('Fitness 84%', 'Físico 84%')}
            </span>
            <span className="flex items-center gap-1.5 text-amber-200 nms-holo-text">
              <Radiation className="h-3.5 w-3.5 text-amber-300" />
              {isTech ? '27.5 µSv/h' : t('Safe', 'Segura')}
            </span>
          </div>
        </div>

        {/* Preference 2: Voice Callouts (1-click) */}
        <div className="mt-3 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-3.5 py-2">
          <div className="text-[11px] font-medium text-white">
            {t('Helmet Voice Alerts', 'Voz en Casco')}
          </div>
          <button
            type="button"
            onClick={onToggleVoiceMuted}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10.5px] font-semibold transition ${
              voiceMuted
                ? 'border-white/20 bg-white/5 text-white/70'
                : 'border-cyan-300/60 bg-cyan-400/20 text-cyan-100'
            }`}
          >
            {voiceMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            <span>
              {voiceMuted ? t('Muted', 'Silencio') : t('Voice ON', 'Voz ON')}
            </span>
          </button>
        </div>

        {/* Action Row */}
        <div className="mt-3.5 flex items-center gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-white/80 transition hover:bg-white/15"
          >
            {t('Back [Esc]', 'Volver [Esc]')}
          </button>
          <button
            type="button"
            onClick={onConfirmEgress}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-cyan-300 py-2 text-xs font-bold text-slate-950 shadow-[0_8px_24px_rgba(56,232,255,0.35)] transition hover:bg-cyan-200"
          >
            <DoorOpen className="h-4 w-4" />
            <span>{t('Exit to EVA [Enter]', 'Salir a EVA [Enter]')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
