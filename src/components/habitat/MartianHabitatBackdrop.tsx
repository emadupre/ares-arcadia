import React, { useEffect, useRef } from 'react';
import { useI18n } from '../../i18n/I18nContext';

export interface HabitatSceneSpec {
  id: string;
  label: string;
  title: string;
  imageUrl: string;
}

export const HABITAT_SCENES: HabitatSceneSpec[] = [
  {
    id: 'lounge',
    label: 'Observatorio',
    title: 'Módulo Observación Arcadia',
    imageUrl: '/assets/habitat/habitat-lounge.jpg',
  },
  {
    id: 'airlock',
    label: 'Esclusa',
    title: 'Bahía de Esclusa y Trajes',
    imageUrl: '/assets/habitat/habitat-airlock.jpg',
  },
  {
    id: 'hydroponics',
    label: 'Módulo Bio',
    title: 'Invernadero Presurizado',
    imageUrl: '/assets/habitat/habitat-hydroponics.jpg',
  },
];

interface MartianHabitatBackdropProps {
  sceneIdx: number;
  povOffset: { x: number; y: number };
}

/**
 * Fondo animado compartido por Pre-EVA y Post-EVA: muestra el interior vivo
 * del módulo marciano (sin texto superpuesto) con paneo continuo, iluminación
 * solar ambiental y micropartículas en suspensión sincronizadas.
 */
export const MartianHabitatBackdrop: React.FC<MartianHabitatBackdropProps> = ({
  sceneIdx,
  povOffset,
}) => {
  const { lang } = useI18n();
  const particleCanvasRef = useRef<HTMLCanvasElement>(null);
  const sceneAltTitles: Record<string, string> =
    lang === 'en'
      ? {
          lounge: 'Arcadia Observation Module',
          airlock: 'Airlock & EVA Suit Bay',
          hydroponics: 'Pressurized Hydroponics Bay',
        }
      : {
          lounge: 'Módulo Observación Arcadia',
          airlock: 'Bahía de Esclusa y Trajes',
          hydroponics: 'Invernadero Presurizado',
        };

  useEffect(() => {
    const canvas = particleCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const motes = Array.from({ length: 84 }, (_, i) => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: 1.0 + (i % 4) * 0.72,
      vx: 0.42 + (i % 6) * 0.14,
      vy: -0.22 - (i % 4) * 0.09,
      alpha: 0.22 + (i % 5) * 0.065,
      tint:
        i % 5 === 0
          ? 'rgba(130, 232, 255,'
          : i % 7 === 0
            ? 'rgba(182, 244, 198,'
            : 'rgba(255, 224, 186,',
      phase: i * 0.55,
    }));

    const render = (now: number) => {
      rafId = requestAnimationFrame(render);
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const t = now * 0.001;

      const sweepX = w * (0.48 + Math.sin(t * 0.42) * 0.16);
      const sweepY = h * (0.28 + Math.cos(t * 0.33) * 0.07);
      const beamGrad = ctx.createRadialGradient(sweepX, sweepY, 24, sweepX, sweepY, w * 0.62);
      beamGrad.addColorStop(0, 'rgba(255, 206, 158, 0.15)');
      beamGrad.addColorStop(0.45, 'rgba(120, 198, 255, 0.05)');
      beamGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = beamGrad;
      ctx.fillRect(0, 0, w, h);

      for (const m of motes) {
        m.x += m.vx + Math.sin(t * 1.3 + m.phase) * 0.28;
        m.y += m.vy + Math.cos(t * 0.9 + m.phase) * 0.12;
        if (m.x > w + 12) m.x = -12;
        if (m.y < -12) m.y = h + 12;

        const twinkle = 0.55 + 0.45 * Math.sin(t * 2.4 + m.phase);
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fillStyle = `${m.tint} ${(m.alpha * twinkle).toFixed(3)})`;
        ctx.fill();
      }
    };

    rafId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div
      className="pointer-events-none absolute -inset-4 z-0 overflow-hidden transition-transform duration-700 ease-out"
      style={{
        transform: `translate3d(${(-povOffset.x * 12).toFixed(1)}px, ${(-povOffset.y * 8).toFixed(1)}px, 0) scale(1.03)`,
      }}
    >
      {HABITAT_SCENES.map((scene, idx) => (
        <img
          key={scene.id}
          src={scene.imageUrl}
          alt={sceneAltTitles[scene.id] ?? scene.title}
          className={`animate-habitat-kenburns absolute inset-0 h-full w-full object-cover transition-opacity duration-[950ms] ease-in-out ${
            idx === sceneIdx ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            animationDelay: `${idx * -3.8}s`,
          }}
        />
      ))}

      {/* Luz solar marciana filtrada por las escotillas del hábitat */}
      <div
        className="animate-habitat-light absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 68% 54% at 48% 36%, rgba(255, 198, 146, 0.18), rgba(56, 232, 255, 0.05) 55%, transparent 80%)',
        }}
      />

      {/* Viñeta óptica perimetral nítida sin desenfocar el interior 4K */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 48%, rgba(4, 7, 13, 0.08) 28%, rgba(4, 7, 13, 0.48) 78%, rgba(3, 5, 9, 0.82) 100%)',
        }}
      />
      <canvas ref={particleCanvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
};
