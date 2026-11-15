import { Frown, Meh, Smile } from 'lucide-react';
import type React from 'react';

export interface EmotionalStatusMeta {
  icon: React.ComponentType<{ className?: string }>;
  tone: 'emerald' | 'amber' | 'rose';
  barColor: string;
  glowColor: string;
  badgeClass: string;
  iconColorClass: string;
  stateKey: 'good' | 'tense' | 'low';
}

/**
 * Resolves the expressive face icon (happy -> neutral -> sad) and telemetry
 * colors from current emotional integrity percentage (0-100%).
 */
export function getEmotionalStatusMeta(integrityPct: number): EmotionalStatusMeta {
  if (integrityPct >= 70) {
    return {
      icon: Smile,
      tone: 'emerald',
      barColor: '#34d399',
      glowColor: 'rgba(52,211,153,0.8)',
      badgeClass: 'border-emerald-300/45 bg-emerald-500/15 text-emerald-200',
      iconColorClass: 'text-emerald-300',
      stateKey: 'good',
    };
  }
  if (integrityPct >= 45) {
    return {
      icon: Meh,
      tone: 'amber',
      barColor: '#fbbf24',
      glowColor: 'rgba(251,191,36,0.8)',
      badgeClass: 'border-amber-300/45 bg-amber-500/15 text-amber-200',
      iconColorClass: 'text-amber-300',
      stateKey: 'tense',
    };
  }
  return {
    icon: Frown,
    tone: 'rose',
    barColor: '#ff3b5c',
    glowColor: 'rgba(255,59,92,0.88)',
    badgeClass: 'border-rose-300/50 bg-rose-500/15 text-rose-200',
    iconColorClass: 'text-rose-300',
    stateKey: 'low',
  };
}
