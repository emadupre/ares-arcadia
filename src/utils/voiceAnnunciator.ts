import type { AppLanguage } from '../i18n/I18nContext';

let lastSpokenKey = '';
let lastSpokenAtMs = 0;

/**
 * Anunciador Vocal Operacional Offline (NASA-STD-3001 Eyes-Free Audio Callouts):
 * Utiliza el motor nativo offline `window.speechSynthesis` del sistema operativo
 * con desduplicación por clave y prioridad para alertas críticas (SOS, SPE, Polvo,
 * avance de circuito multi-POI y retorno obligatorio).
 */
export function speakAresCallout(
  text: string,
  lang: AppLanguage,
  options?: {
    key?: string;
    priority?: 'normal' | 'critical';
    muted?: boolean;
    cooldownMs?: number;
  }
): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  if (options?.muted) return;

  const now = Date.now();
  const dedupKey = options?.key ?? text;
  const cooldownMs = options?.cooldownMs ?? (options?.priority === 'critical' ? 3500 : 5000);

  if (dedupKey === lastSpokenKey && now - lastSpokenAtMs < cooldownMs) {
    return;
  }

  try {
    const synth = window.speechSynthesis;
    if (options?.priority === 'critical') {
      synth.cancel();
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'es' ? 'es-ES' : 'en-US';
    utterance.rate = options?.priority === 'critical' ? 1.06 : 1.02;
    utterance.pitch = options?.priority === 'critical' ? 0.96 : 1.0;
    utterance.volume = 0.9;
    synth.speak(utterance);
    lastSpokenKey = dedupKey;
    lastSpokenAtMs = now;
  } catch {
    // Ignorar silenciosamente si el navegador bloquea autoplay de audio antes de interacción
  }
}
