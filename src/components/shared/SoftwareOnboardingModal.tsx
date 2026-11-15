import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import type { HabitatInteriorSectionId, MissionPhase } from '../../types/mission';

interface SoftwareOnboardingModalProps {
  open: boolean;
  onDismiss: () => void;
  onSyncStage: (stage: {
    phase: MissionPhase;
    habitatSection?: HabitatInteriorSectionId;
  }) => void;
}

type TourPlacement = 'bottom' | 'right' | 'left' | 'top' | 'top-left';

interface TourStep {
  code: string;
  target: string;
  stage: {
    phase: MissionPhase;
    habitatSection?: HabitatInteriorSectionId;
  };
  placement: TourPlacement;
  tag: string;
  title: string;
  body: string;
  keys?: string[];
}

interface SpotRect {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
  centerX: number;
  centerY: number;
}

/**
 * Tutorial guiado in-game con spotlight real sobre cada control del HUD (/ia-slop).
 * Recorre brevemente Pre-EVA, EVA y Post-EVA señalando los botones y atajos clave,
 * sin reaparecer al cambiar de etapa o sección tras omitirse/completarse.
 */
export const SoftwareOnboardingModal: React.FC<SoftwareOnboardingModalProps> = ({
  open,
  onDismiss,
  onSyncStage,
}) => {
  const { lang, setLang, t } = useI18n();
  const [stepIdx, setStepIdx] = useState(0);
  const [spot, setSpot] = useState<SpotRect | null>(null);
  const [cardHeight, setCardHeight] = useState(190);
  const [viewport, setViewport] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1440,
    h: typeof window !== 'undefined' ? window.innerHeight : 900,
  }));
  const cardRef = useRef<HTMLDivElement | null>(null);

  const steps: TourStep[] = useMemo(
    () => [
      {
        code: '01',
        target: 'stage-nav',
        stage: { phase: 'pre-eva', habitatSection: 'pre-eva' },
        placement: 'bottom',
        tag: t('TOP BAR', 'BARRA SUPERIOR'),
        title: t('Mission Stages', 'Etapas del Simulador'),
        body: t(
          'Switch anytime between Pre-EVA base, EVA surface, and Post-EVA audit.',
          'Cambiá cuando quieras entre Pre-EVA, caminata EVA y cierre Post-EVA.'
        ),
      },
      {
        code: '02',
        target: 'status-bar',
        stage: { phase: 'pre-eva', habitatSection: 'pre-eva' },
        placement: 'right',
        tag: t('LIVE TELEMETRY', 'BARRA VITAL'),
        title: t('Vitals & Mood Status', 'Estado Vital e Integridad'),
        body: t(
          'O₂, battery, BPM, fitness, radiation, supplies & psyche. Tap TEC/INT to simplify.',
          'O₂, batería, pulso, físico, radiación, víveres e integridad. Tocá TEC/INT para simplificar.'
        ),
      },
      {
        code: '03',
        target: 'habitat-dock',
        stage: { phase: 'pre-eva', habitatSection: 'pre-eva' },
        placement: 'bottom',
        tag: t('HABITAT MODULES', 'MÓDULO PRE-EVA'),
        title: t('01 Map · 02 Physical · 03 Mood', '01 Mapa · 02 Físico · 03 Emocional'),
        body: t(
          'Plan 3D route, train on 0.38g gym + rations, or relax with CC0 audio.',
          '01 ruta 3D, 02 gym 0,38g y víveres, 03 audio sin © y respiración.'
        ),
      },
      {
        code: '04',
        target: 'launch-eva-btn',
        stage: { phase: 'pre-eva', habitatSection: 'pre-eva' },
        placement: 'left',
        tag: t('EGRESS', 'SALIDA A MARTE'),
        title: t('A* Route & Airlock Exit', 'Ruta A* y Salida EVA'),
        body: t(
          'Pick a map POI above, then click here to cycle the airlock onto Mars.',
          'Elegí un POI en el mapa y tocá acá para cruzar la esclusa hacia Arcadia.'
        ),
      },
      {
        code: '05',
        target: 'eva-sol-bar',
        stage: { phase: 'eva' },
        placement: 'bottom',
        tag: t('EVA · ARCADIA TIME', 'EVA · CICLO SOLAR'),
        title: t('Mars Sol & Safe Sun', 'Hora Sol y Clima Marciano'),
        body: t(
          'Arcadia LTST clock, Safe Sun window, night & seasons. Click to adjust cycles.',
          'Hora LTST real de Arcadia, Sol Seguro, noche y estaciones. Tocá para ajustar.'
        ),
      },
      {
        code: '06',
        target: 'eva-forearm-target',
        stage: { phase: 'eva' },
        placement: 'left',
        tag: t('EVA · CONTROLS', 'EVA · EXPLORACIÓN'),
        title: t('Walk, Rover & Forearm', 'Rover, Muestras y Antebrazo'),
        body: t(
          'Walk WASD + mouse, drive Perseverance [R], sample [E] & open Forearm [Tab].',
          'Movete con WASD + mouse, subí al Rover [R], muestra [E] y Antebrazo [Tab].'
        ),
        keys: ['WASD', 'R', 'E', 'Tab'],
      },
      {
        code: '07',
        target: 'post-eva-verify',
        stage: { phase: 'post-eva' },
        placement: 'top',
        tag: t('POST-EVA', 'EVALUACIÓN POST-EVA'),
        title: t('Audit & GeoJSON Export', 'Auditoría y Exportación'),
        body: t(
          'Back at airlock: run purge check, compare Plan vs EVA, and export GeoJSON.',
          'Al volver por esclusa verificá purga, compará métricas y exportá GeoJSON.'
        ),
      },
    ],
    [t]
  );

  useEffect(() => {
    if (open) setStepIdx(0);
  }, [open]);

  const current = steps[stepIdx];
  const isLast = stepIdx === steps.length - 1;

  // Sincroniza la etapa visible del simulador cuando avanza el recorrido guiado
  useEffect(() => {
    if (!open) return;
    onSyncStage(current.stage);
  }, [open, current, onSyncStage]);

  const measureTarget = useCallback((): boolean => {
    const el = document.querySelector(`[data-tour="${current.target}"]`) as HTMLElement | null;
    if (!el) {
      setSpot(null);
      return false;
    }
    el.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) {
      setSpot(null);
      return false;
    }
    const pad = 6;
    const left = Math.max(4, r.left - pad);
    const top = Math.max(4, r.top - pad);
    const right = Math.min(window.innerWidth - 4, r.right + pad);
    const bottom = Math.min(window.innerHeight - 4, r.bottom + pad);
    const width = Math.max(12, right - left);
    const height = Math.max(12, bottom - top);
    setSpot({
      left,
      top,
      width,
      height,
      right,
      bottom,
      centerX: left + width / 2,
      centerY: top + height / 2,
    });
    return true;
  }, [current.target]);

  useLayoutEffect(() => {
    if (!open) return;
    let rafId = 0;
    let tries = 0;

    const tick = () => {
      const ok = measureTarget();
      tries += 1;
      if ((!ok || tries < 6) && tries < 24) {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    rafId = window.requestAnimationFrame(tick);

    const onResize = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
      measureTarget();
    };
    window.addEventListener('resize', onResize);

    const el = document.querySelector(`[data-tour="${current.target}"]`) as HTMLElement | null;
    const ro =
      el && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => measureTarget()) : null;
    if (el && ro) ro.observe(el);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
    };
  }, [open, current.target, measureTarget]);

  useLayoutEffect(() => {
    if (!open || !cardRef.current) return;
    setCardHeight(cardRef.current.offsetHeight || 190);
  }, [open, stepIdx, lang, spot]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      if (e.key === 'Escape' && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        onDismiss();
      } else if ((e.key === 'ArrowRight' || e.key === 'Enter') && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        if (stepIdx >= steps.length - 1) {
          onDismiss();
        } else {
          setStepIdx((s) => Math.min(steps.length - 1, s + 1));
        }
      } else if (e.key === 'ArrowLeft' && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        setStepIdx((s) => Math.max(0, s - 1));
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, stepIdx, steps.length, onDismiss]);

  if (!open) return null;

  const cw = Math.min(340, viewport.w - 24);
  const ch = cardHeight;
  const gap = 20;
  const margin = 12;

  let cardX = (viewport.w - cw) / 2;
  let cardY = (viewport.h - ch) / 2;

  if (spot) {
    switch (current.placement) {
      case 'bottom':
        cardX = spot.centerX - cw / 2;
        cardY = spot.bottom + gap;
        if (cardY + ch > viewport.h - margin) cardY = spot.top - ch - gap;
        break;
      case 'top':
        cardX = spot.centerX - cw / 2;
        cardY = spot.top - ch - gap;
        if (cardY < margin) cardY = spot.bottom + gap;
        break;
      case 'top-left':
        cardX = spot.right - cw;
        cardY = spot.top - ch - gap;
        if (cardY < margin) cardY = spot.bottom + gap;
        break;
      case 'right':
        cardX = spot.right + gap;
        cardY = spot.centerY - ch / 2;
        if (cardX + cw > viewport.w - margin) cardX = spot.left - cw - gap;
        break;
      case 'left':
        cardX = spot.left - cw - gap;
        cardY = spot.centerY - ch / 2;
        if (cardX < margin) cardX = spot.right + gap;
        break;
    }
    cardX = Math.max(margin, Math.min(viewport.w - cw - margin, cardX));
    cardY = Math.max(margin, Math.min(viewport.h - ch - margin, cardY));
  }

  // Línea guía SVG desde la tarjeta hacia el punto más cercano del elemento resaltado
  const cardCenterX = cardX + cw / 2;
  const cardCenterY = cardY + ch / 2;
  let anchorX = cardCenterX;
  let anchorY = cardCenterY;
  let targetX = spot?.centerX ?? cardCenterX;
  let targetY = spot?.centerY ?? cardCenterY;

  if (spot) {
    targetX = Math.max(spot.left, Math.min(spot.right, cardCenterX));
    targetY = Math.max(spot.top, Math.min(spot.bottom, cardCenterY));
    anchorX = Math.max(cardX, Math.min(cardX + cw, targetX));
    anchorY = Math.max(cardY, Math.min(cardY + ch, targetY));
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('A.R.E.S HUD Interactive Tour', 'Tutorial Interactivo A.R.E.S HUD')}
      className="fixed inset-0 z-[95] pointer-events-none"
    >
      {/* Máscara oscura con recorte nítido sobre el elemento activo */}
      <svg
        className="pointer-events-auto fixed inset-0 h-full w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <defs>
          <mask id="ares-tour-spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {spot && (
              <rect
                x={spot.left}
                y={spot.top}
                width={spot.width}
                height={spot.height}
                rx={12}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(4, 7, 15, 0.72)"
          mask="url(#ares-tour-spotlight-mask)"
        />

        {spot && (
          <>
            <line
              x1={anchorX}
              y1={anchorY}
              x2={targetX}
              y2={targetY}
              stroke="#38e8ff"
              strokeWidth="1.75"
              strokeDasharray="4 3"
              strokeLinecap="round"
            />
            <circle cx={targetX} cy={targetY} r="4" fill="#38e8ff" />
            <circle
              cx={targetX}
              cy={targetY}
              r="7.5"
              fill="none"
              stroke="#38e8ff"
              strokeOpacity="0.45"
              strokeWidth="1.2"
            />
          </>
        )}
      </svg>

      {/* Marco cian alrededor del control señalado */}
      {spot && (
        <div
          className="pointer-events-none fixed rounded-xl border border-cyan-300 shadow-[0_0_24px_rgba(56,232,255,0.45),inset_0_0_12px_rgba(56,232,255,0.16)] transition-all duration-150"
          style={{
            left: spot.left,
            top: spot.top,
            width: spot.width,
            height: spot.height,
          }}
        />
      )}

      {/* Ficha compacta in-game (/ia-slop) posicionada junto al elemento */}
      <div
        ref={cardRef}
        style={{ left: cardX, top: cardY, width: cw }}
        className="pointer-events-auto fixed overflow-hidden rounded-xl border border-cyan-300/35 bg-[#060b16]/96 text-white shadow-[0_18px_55px_rgba(0,0,0,0.8)] backdrop-blur-md transition-all duration-150"
      >
        {/* Barra segmentada clicable de progreso rápido */}
        <div className="grid grid-cols-7 gap-0.5 bg-white/10 p-0.5">
          {steps.map((s, idx) => (
            <button
              key={s.code}
              type="button"
              onClick={() => setStepIdx(idx)}
              aria-label={`${s.code} ${s.title}`}
              className={`h-1 rounded-sm transition ${
                idx <= stepIdx ? 'bg-cyan-300' : 'bg-white/15 hover:bg-white/30'
              }`}
            />
          ))}
        </div>

        <div className="px-3.5 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="rounded border border-cyan-300/40 bg-cyan-400/12 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-cyan-200">
                {current.code}/0{steps.length}
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-white/55">
                {current.tag}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <div className="flex items-center rounded border border-white/15 bg-white/[0.04] p-0.5 font-mono text-[9px]">
                <button
                  type="button"
                  onClick={() => setLang('en')}
                  className={`rounded px-1 py-0.5 font-semibold ${
                    lang === 'en' ? 'bg-cyan-300 text-slate-950' : 'text-white/55 hover:text-white'
                  }`}
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => setLang('es')}
                  className={`rounded px-1 py-0.5 font-semibold ${
                    lang === 'es' ? 'bg-cyan-300 text-slate-950' : 'text-white/55 hover:text-white'
                  }`}
                >
                  ES
                </button>
              </div>

              <button
                type="button"
                onClick={onDismiss}
                aria-label={t('Skip tutorial', 'Omitir tutorial')}
                className="flex items-center gap-0.5 rounded border border-white/12 bg-white/5 px-1.5 py-0.5 text-[9.5px] font-medium text-white/75 transition hover:border-white/30 hover:text-white"
              >
                <span>{t('Skip', 'Omitir')}</span>
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>

          <h2 className="mt-2 text-[13px] font-semibold tracking-tight text-white">
            {current.title}
          </h2>
          <p className="mt-1 text-[11px] leading-snug text-white/80">{current.body}</p>

          {current.keys && (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {current.keys.map((k) => (
                <kbd
                  key={k}
                  className="rounded border border-cyan-300/30 bg-cyan-400/10 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-cyan-200"
                >
                  {k}
                </kbd>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/10 bg-black/40 px-3.5 py-2">
          <span className="font-mono text-[9px] text-white/40">[← →] · [Esc]</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={stepIdx === 0}
              onClick={() => setStepIdx((s) => Math.max(0, s - 1))}
              className="flex items-center gap-0.5 rounded-md border border-white/12 bg-white/5 px-2 py-1 text-[10.5px] font-medium text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ChevronLeft className="h-3 w-3" />
              <span>{t('Back', 'Anterior')}</span>
            </button>
            <button
              type="button"
              onClick={() => (isLast ? onDismiss() : setStepIdx((s) => s + 1))}
              className="flex items-center gap-0.5 rounded-md bg-cyan-300 px-3 py-1 text-[10.5px] font-semibold text-slate-950 transition hover:bg-cyan-200"
            >
              <span>{isLast ? t('Start', 'Empezar') : t('Next', 'Siguiente')}</span>
              {!isLast && <ChevronRight className="h-3 w-3" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
