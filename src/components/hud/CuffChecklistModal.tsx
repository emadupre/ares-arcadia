import React from 'react';
import { ShieldAlert, X } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';

interface CuffChecklistModalProps {
  open: boolean;
  onClose: () => void;
  cuffHoldProgress: number;
  onStartCuffHold: () => void;
  onCancelCuffHold: () => void;
  onVoiceSimulatedCommand: (cmd: string) => void;
}

export const CuffChecklistModal: React.FC<CuffChecklistModalProps> = ({
  open,
  onClose,
  cuffHoldProgress,
  onStartCuffHold,
  onCancelCuffHold,
  onVoiceSimulatedCommand,
}) => {
  const { lang, t } = useI18n();
  if (!open) return null;

  const voiceCommands =
    lang === 'en'
      ? ['SOS Emergency', 'Clear SOS', 'Contours', 'Return to Base', 'Divert', 'Ignore']
      : ['SOS Emergencia', 'Desactivar SOS', 'Contornos', 'Retorno a Base', 'Desviar', 'Ignorar'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="nms-chamfer w-full max-w-lg border border-[#ffae24]/60 bg-[#050a12]/95 p-5 text-xs text-[#f4efe6] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/15 pb-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#ffae24]">
              {t(
                'Apollo 15–17 Heritage // Pressurized Forearm Control',
                'Precedente Apollo 15–17 // Control Presurizado de Antebrazo'
              )}
            </div>
            <h3 className="text-base font-bold text-[#f4efe6]">
              {t('Cuff Checklist & Autonomous Guide', 'Cuff Checklist & Guía Autónoma')}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="nms-chamfer-sm border border-white/20 p-1.5 text-[#f4efe6]/70 hover:border-[#38e8ff] hover:text-[#f4efe6]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div className="nms-chamfer-sm border border-[#ff2a4b]/60 bg-[#ff2a4b]/10 p-3">
            <div className="font-semibold text-[#ff2a4b]">
              {t(
                'Physical SOS Button (Hold 2.0 s — accidental activation lock)',
                'Botón Físico SOS (Mantener 2,0 s — seguro anti-activación)'
              )}
            </div>
            <button
              type="button"
              onMouseDown={onStartCuffHold}
              onMouseUp={onCancelCuffHold}
              onMouseLeave={onCancelCuffHold}
              onTouchStart={onStartCuffHold}
              onTouchEnd={onCancelCuffHold}
              className="nms-chamfer-btn relative mt-2 w-full overflow-hidden border-2 border-[#ff2a4b] bg-[#ff2a4b]/20 py-3 font-mono text-xs font-bold text-[#f4efe6]"
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                <ShieldAlert className="h-4 w-4" />
                {t('HOLD 2 S — TRIGGER SOS', 'MANTENER PULSADO 2 S — DISPARAR SOS')}
              </span>
              <div
                className="absolute inset-y-0 left-0 bg-[#ff2a4b]/65 transition-all"
                style={{ width: `${Math.round(cuffHoldProgress * 100)}%` }}
              />
            </button>
          </div>

          <div className="nms-chamfer-sm border border-white/15 bg-white/5 p-3">
            <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wider text-[#38e8ff]">
              {t(
                'Deterministic Voice Commands (Web Speech ASR)',
                'Comandos Deterministas por Voz (Web Speech ASR)'
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {voiceCommands.map((cmd) => (
                <button
                  key={cmd}
                  type="button"
                  onClick={() => {
                    onVoiceSimulatedCommand(cmd);
                    onClose();
                  }}
                  className="nms-chamfer-sm border border-[#38e8ff]/40 bg-[#04070d] px-2.5 py-1 font-mono text-[10px] text-[#38e8ff] hover:bg-[#38e8ff]/20"
                >
                  "{cmd}"
                </button>
              ))}
            </div>
          </div>

          <div className="nms-chamfer-sm space-y-1.5 border border-white/10 bg-white/5 p-3">
            <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#ffae24]">
              {t('Offline Autonomous Decision Trees', 'Árboles de Decisión Autónoma Offline')}
            </div>
            <ul className="list-disc space-y-1 pl-4 text-[11px] text-[#f4efe6]/80">
              <li>
                <strong>{t('ΔP Leak / Critical O₂:', 'Fuga ΔP / O₂ crítico:')}</strong>{' '}
                {t(
                  'Halt traverse, jettison 7.00 kg payload (POI-CACHE), activate 406 MHz / UHF beacon.',
                  'Detener marcha, liberar carga 7,00 kg (POI-CACHE), activar baliza 406 MHz / UHF.'
                )}
              </li>
              <li>
                <strong>{t('SPE Solar Storm:', 'Tormenta SPE:')}</strong>{' '}
                {t(
                  'Divert to POI-05 (SVF ≈ 0.48), orient PLSS backpack as radiation/wind shield.',
                  'Desviar a POI-05 (SVF ≈ 0,48), orientar mochila PLSS como escudo hacia sol/viento.'
                )}
              </li>
              <li>
                <strong>{t('Thermal Isolation (< -100 °C):', 'Aislamiento térmico (< -100 °C):')}</strong>{' '}
                {t(
                  'Direct umbilical thermal/power tether between EV1 and EV2 PLSS packs.',
                  'Enlace umbilical directo entre mochilas PLSS de EV1 y EV2.'
                )}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
