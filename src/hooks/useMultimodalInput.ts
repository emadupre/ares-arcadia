import { useCallback, useEffect, useRef, useState } from 'react';
import { MISSION_CONFIG } from '../config/missionConfig';
import type { AppLanguage } from '../i18n/I18nContext';

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export interface MultimodalHandlers {
  lang?: AppLanguage;
  onTriggerSos: (source: string) => void;
  onClearSos?: (source: string) => void;
  onToggleContours: () => void;
  onAcceptSuggestion: () => void;
  onRejectSuggestion: () => void;
  onReturnToBase: () => void;
}

/**
 * Redundancia Multimodal de Entrada (Estándar EVA con guantes presurizados):
 * 1) Voz determinista (WebSpeech API en prototipo web; Whisper-Tiny WASM/ONNX en vuelo)
 * 2) Puntero cefálico (Head-Gaze Dwell Selection de 1,5 s)
 * 3) Botonera física de antebrazo (Cuff Checklist Digital — pulsación sostenida 2,0 s)
 */
export function useMultimodalInput(handlers: MultimodalHandlers) {
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [lastVoiceCommand, setLastVoiceCommand] = useState<string | null>(null);
  const [dwellProgress, setDwellProgress] = useState(0); // 0..1
  const [cuffHoldProgress, setCuffHoldProgress] = useState(0); // 0..1

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const dwellTimerRef = useRef<number | null>(null);
  const cuffTimerRef = useRef<number | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const processTranscript = useCallback((rawText: string) => {
    const t = rawText.toLowerCase().trim();
    const isEn = (handlersRef.current.lang ?? 'en') === 'en';
    setLastVoiceCommand(rawText.trim());
    if (
      t.includes('desactivar') ||
      t.includes('cancelar') ||
      t.includes('apagar') ||
      t.includes('deactivate') ||
      t.includes('clear') ||
      t.includes('cancel') ||
      t.includes('nominal')
    ) {
      handlersRef.current.onClearSos?.(
        isEn ? `Voice ASR: "${rawText.trim()}"` : `Voz ASR: "${rawText.trim()}"`
      );
    } else if (
      t.includes('sos') ||
      t.includes('mayday') ||
      t.includes('emergencia') ||
      t.includes('emergency')
    ) {
      handlersRef.current.onTriggerSos(
        isEn ? `Offline Voice/ASR: "${rawText.trim()}"` : `Voz offline/ASR: "${rawText.trim()}"`
      );
    } else if (t.includes('contorno') || t.includes('curva') || t.includes('contour')) {
      handlersRef.current.onToggleContours();
    } else if (
      t === 'si' ||
      t === 'sí' ||
      t === 'yes' ||
      t.includes('desviar') ||
      t.includes('aceptar') ||
      t.includes('divert') ||
      t.includes('accept')
    ) {
      handlersRef.current.onAcceptSuggestion();
    } else if (
      t === 'no' ||
      t.includes('rechazar') ||
      t.includes('ignorar') ||
      t.includes('reject') ||
      t.includes('ignore')
    ) {
      handlersRef.current.onRejectSuggestion();
    } else if (
      t.includes('retorno') ||
      t.includes('base') ||
      t.includes('volver') ||
      t.includes('return') ||
      t.includes('back')
    ) {
      handlersRef.current.onReturnToBase();
    }
  }, []);

  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    setVoiceSupported(Boolean(Ctor));
  }, []);

  const toggleVoice = useCallback(() => {
    if (voiceActive) {
      recognitionRef.current?.stop();
      setVoiceActive(false);
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;

    const rec = new Ctor();
    rec.lang = (handlersRef.current.lang ?? 'en') === 'en' ? 'en-US' : 'es-ES';
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      const lastIdx = e.results.length - 1;
      const transcript = e.results[lastIdx]?.[0]?.transcript;
      if (transcript) processTranscript(transcript);
    };
    rec.onerror = () => {
      setVoiceActive(false);
    };
    rec.onend = () => {
      setVoiceActive(false);
    };
    recognitionRef.current = rec;
    try {
      rec.start();
      setVoiceActive(true);
    } catch {
      setVoiceActive(false);
    }
  }, [voiceActive, processTranscript]);

  // Head-Gaze Dwell Selection (1.5 s hover)
  const startHeadGazeDwell = useCallback(() => {
    if (dwellTimerRef.current) window.clearInterval(dwellTimerRef.current);
    const start = performance.now();
    const duration = MISSION_CONFIG.thresholds.headGazeDwellMs;
    dwellTimerRef.current = window.setInterval(() => {
      const p = Math.min(1, (performance.now() - start) / duration);
      setDwellProgress(p);
      if (p >= 1) {
        if (dwellTimerRef.current) window.clearInterval(dwellTimerRef.current);
        dwellTimerRef.current = null;
        setDwellProgress(0);
        const isEn = (handlersRef.current.lang ?? 'en') === 'en';
        handlersRef.current.onTriggerSos(
          isEn
            ? 'Head-Gaze Pointer (Dwell 1.5 s)'
            : 'Puntero Cefálico (Head-Gaze Dwell 1,5 s)'
        );
      }
    }, 30);
  }, []);

  const cancelHeadGazeDwell = useCallback(() => {
    if (dwellTimerRef.current) {
      window.clearInterval(dwellTimerRef.current);
      dwellTimerRef.current = null;
    }
    setDwellProgress(0);
  }, []);

  // Cuff Checklist Digital hold (2.0 s)
  const startCuffSosHold = useCallback(() => {
    if (cuffTimerRef.current) window.clearInterval(cuffTimerRef.current);
    const start = performance.now();
    const duration = MISSION_CONFIG.thresholds.cuffSosHoldMs;
    cuffTimerRef.current = window.setInterval(() => {
      const p = Math.min(1, (performance.now() - start) / duration);
      setCuffHoldProgress(p);
      if (p >= 1) {
        if (cuffTimerRef.current) window.clearInterval(cuffTimerRef.current);
        cuffTimerRef.current = null;
        setCuffHoldProgress(0);
        const isEn = (handlersRef.current.lang ?? 'en') === 'en';
        handlersRef.current.onTriggerSos(
          isEn
            ? 'Physical Cuff Checklist Button (2.0 s)'
            : 'Botonera Física Cuff Checklist (2,0 s)'
        );
      }
    }, 30);
  }, []);

  const cancelCuffSosHold = useCallback(() => {
    if (cuffTimerRef.current) {
      window.clearInterval(cuffTimerRef.current);
      cuffTimerRef.current = null;
    }
    setCuffHoldProgress(0);
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      if (dwellTimerRef.current) window.clearInterval(dwellTimerRef.current);
      if (cuffTimerRef.current) window.clearInterval(cuffTimerRef.current);
    };
  }, []);

  return {
    voiceActive,
    voiceSupported,
    lastVoiceCommand,
    dwellProgress,
    cuffHoldProgress,
    toggleVoice,
    processTranscript,
    startHeadGazeDwell,
    cancelHeadGazeDwell,
    startCuffSosHold,
    cancelCuffSosHold,
  };
}
