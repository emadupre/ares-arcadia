/**
 * Motor Generativo de Audio y Música Ambiental Sin Copyright (Web Audio API).
 *
 * Genera paisajes sonoros terrestres, música armónica original (CC0) y perfil acústico
 * atmosférico de Marte (inspirado en datos públicos NASA InSight / Perseverance) en tiempo real,
 * 100 % offline y libre de derechos de autor.
 */

export type AmbientSoundscapeId =
  | 'earth-orbital-piano'
  | 'earth-rain-forest'
  | 'earth-ocean-waves'
  | 'mars-arcadia-wind';

export interface AmbientSoundscapeTrack {
  id: AmbientSoundscapeId;
  origin: 'earth' | 'mars';
  kind: 'music' | 'ambient';
  titleEn: string;
  titleEs: string;
  licenseLabel: string;
  descriptionEn: string;
  descriptionEs: string;
}

export const AMBIENT_SOUNDSCAPE_TRACKS: readonly AmbientSoundscapeTrack[] = [
  {
    id: 'earth-orbital-piano',
    origin: 'earth',
    kind: 'music',
    titleEn: 'Orbital Piano',
    titleEs: 'Piano Orbital',
    licenseLabel: 'CC0 · Generative Original',
    descriptionEn: 'Copyright-free warm Lydian Earth acoustic synth',
    descriptionEs: 'Música armónica sin copyright generada en vivo',
  },
  {
    id: 'earth-rain-forest',
    origin: 'earth',
    kind: 'ambient',
    titleEn: 'Earth Rain & Forest',
    titleEs: 'Lluvia y Bosque',
    licenseLabel: 'CC0 · Earth Nature Synth',
    descriptionEn: 'Filtered rainfall canopy & wooden wind chimes',
    descriptionEs: 'Lluvia suave, viento en hojas y campanas de bambú',
  },
  {
    id: 'earth-ocean-waves',
    origin: 'earth',
    kind: 'ambient',
    titleEn: 'Atlantic Waves',
    titleEs: 'Olas del Océano',
    licenseLabel: 'CC0 · Earth Ocean Synth',
    descriptionEn: 'Slow tidal surf cycle for circadian relaxation',
    descriptionEs: 'Oleaje costero lento para reducir estrés de aislamiento',
  },
  {
    id: 'mars-arcadia-wind',
    origin: 'mars',
    kind: 'ambient',
    titleEn: 'Arcadia Mars Wind',
    titleEs: 'Viento en Marte',
    licenseLabel: 'NASA Public Domain Profile',
    descriptionEn: '0.61 kPa thin CO₂ wind & InSight seismic resonance',
    descriptionEs: 'Viento tenue marciano 0,61 kPa y resonancia InSight',
  },
];

type CleanupFn = () => void;

class AmbientSoundscapeController {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private cleanupTrack: CleanupFn | null = null;
  private activeTrackId: AmbientSoundscapeId | null = null;

  public getActiveTrack(): AmbientSoundscapeId | null {
    return this.activeTrackId;
  }

  public setVolume(volume01: number): void {
    const clamped = Math.max(0, Math.min(1, volume01));
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(clamped * 0.45, this.ctx.currentTime, 0.08);
    }
  }

  public stop(): void {
    if (this.cleanupTrack) {
      try {
        this.cleanupTrack();
      } catch {
        // Ignore teardown exceptions in restricted browser contexts
      }
      this.cleanupTrack = null;
    }
    this.activeTrackId = null;
  }

  public start(trackId: AmbientSoundscapeId, volume01 = 0.65): boolean {
    if (typeof window === 'undefined') return false;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return false;

    this.stop();

    try {
      if (!this.ctx) {
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }

      if (!this.masterGain) {
        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination);
      }
      const clampedVol = Math.max(0, Math.min(1, volume01));
      this.masterGain.gain.setValueAtTime(clampedVol * 0.45, this.ctx.currentTime);

      if (trackId === 'earth-orbital-piano') {
        this.cleanupTrack = this.buildOrbitalPiano(this.ctx, this.masterGain);
      } else if (trackId === 'earth-rain-forest') {
        this.cleanupTrack = this.buildRainForest(this.ctx, this.masterGain);
      } else if (trackId === 'earth-ocean-waves') {
        this.cleanupTrack = this.buildOceanWaves(this.ctx, this.masterGain);
      } else {
        this.cleanupTrack = this.buildMarsWind(this.ctx, this.masterGain);
      }
      this.activeTrackId = trackId;
      return true;
    } catch {
      this.activeTrackId = null;
      return false;
    }
  }

  private createNoiseBuffer(ctx: AudioContext, seconds = 3, brown = true): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      if (brown) {
        lastOut = (lastOut + 0.02 * white) / 1.02;
        data[i] = Math.max(-1, Math.min(1, lastOut * 3.4));
      } else {
        data[i] = white * 0.5;
      }
    }
    return buffer;
  }

  private buildOrbitalPiano(ctx: AudioContext, out: GainNode): CleanupFn {
    const bus = ctx.createGain();
    bus.gain.value = 0.85;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1150;

    // Gentle delay echo for calm orbital room depth
    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.38;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.34;
    delay.connect(feedback);
    feedback.connect(delay);

    bus.connect(filter);
    filter.connect(out);
    filter.connect(delay);
    delay.connect(out);

    // Warm Cmaj9 / Lydian meditative Earth chord drone
    const padFreqs = [130.81, 196.0, 246.94, 293.66]; // C3 G3 B3 D4
    const padOscs: OscillatorNode[] = [];
    for (const f of padFreqs) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      g.gain.value = 0.045;
      osc.connect(g);
      g.connect(bus);
      osc.start();
      padOscs.push(osc);
    }

    // Soft generative pentatonic piano notes
    const scaleHz = [261.63, 293.66, 329.63, 392.0, 493.88, 523.25, 587.33, 659.25];
    let step = 0;
    const triggerNote = () => {
      const now = ctx.currentTime;
      const idx = (step * 3 + Math.floor(Math.random() * 2)) % scaleHz.length;
      step += 1;
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(scaleHz[idx], now);
      env.gain.setValueAtTime(0.0001, now);
      env.gain.exponentialRampToValueAtTime(0.11, now + 0.08);
      env.gain.exponentialRampToValueAtTime(0.0005, now + 2.7);
      osc.connect(env);
      env.connect(bus);
      osc.start(now);
      osc.stop(now + 2.8);
    };
    triggerNote();
    const timer = window.setInterval(triggerNote, 1750);

    return () => {
      window.clearInterval(timer);
      padOscs.forEach((o) => {
        try {
          o.stop();
          o.disconnect();
        } catch {
          // ignore
        }
      });
      bus.disconnect();
      filter.disconnect();
      delay.disconnect();
      feedback.disconnect();
    };
  }

  private buildRainForest(ctx: AudioContext, out: GainNode): CleanupFn {
    const src = ctx.createBufferSource();
    src.buffer = this.createNoiseBuffer(ctx, 4, false);
    src.loop = true;

    const rainBand = ctx.createBiquadFilter();
    rainBand.type = 'bandpass';
    rainBand.frequency.value = 1050;
    rainBand.Q.value = 0.55;

    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.09;
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain);
    lfoGain.connect(rainBand.frequency);

    const gain = ctx.createGain();
    gain.gain.value = 0.34;
    src.connect(rainBand);
    rainBand.connect(gain);
    gain.connect(out);

    src.start();
    lfo.start();

    const chimeHz = [440, 523.25, 587.33, 783.99];
    const timer = window.setInterval(() => {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = chimeHz[Math.floor(Math.random() * chimeHz.length)];
      env.gain.setValueAtTime(0.0001, now);
      env.gain.exponentialRampToValueAtTime(0.045, now + 0.05);
      env.gain.exponentialRampToValueAtTime(0.0004, now + 2.1);
      osc.connect(env);
      env.connect(out);
      osc.start(now);
      osc.stop(now + 2.2);
    }, 3100);

    return () => {
      window.clearInterval(timer);
      try {
        src.stop();
        lfo.stop();
      } catch {
        // ignore
      }
      src.disconnect();
      rainBand.disconnect();
      lfo.disconnect();
      lfoGain.disconnect();
      gain.disconnect();
    };
  }

  private buildOceanWaves(ctx: AudioContext, out: GainNode): CleanupFn {
    const src = ctx.createBufferSource();
    src.buffer = this.createNoiseBuffer(ctx, 5, true);
    src.loop = true;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 480;

    const swellGain = ctx.createGain();
    swellGain.gain.value = 0.34;

    const swellLfo = ctx.createOscillator();
    swellLfo.frequency.value = 0.11; // ~9 s ocean wave cycle
    const swellDepth = ctx.createGain();
    swellDepth.gain.value = 0.24;
    swellLfo.connect(swellDepth);
    swellDepth.connect(swellGain.gain);

    src.connect(lowpass);
    lowpass.connect(swellGain);
    swellGain.connect(out);

    src.start();
    swellLfo.start();

    return () => {
      try {
        src.stop();
        swellLfo.stop();
      } catch {
        // ignore
      }
      src.disconnect();
      lowpass.disconnect();
      swellGain.disconnect();
      swellLfo.disconnect();
      swellDepth.disconnect();
    };
  }

  private buildMarsWind(ctx: AudioContext, out: GainNode): CleanupFn {
    const src = ctx.createBufferSource();
    src.buffer = this.createNoiseBuffer(ctx, 4, true);
    src.loop = true;

    // 0.61 kPa Martian thin CO2 acoustic spectral emphasis around 160-480 Hz
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 270;
    band.Q.value = 2.1;

    const gustLfo = ctx.createOscillator();
    gustLfo.frequency.value = 0.07;
    const gustDepth = ctx.createGain();
    gustDepth.gain.value = 140;
    gustLfo.connect(gustDepth);
    gustDepth.connect(band.frequency);

    const windGain = ctx.createGain();
    windGain.gain.value = 0.42;

    // Subtle 64 Hz InSight micro-seismic ground resonance
    const seismicOsc = ctx.createOscillator();
    seismicOsc.type = 'sine';
    seismicOsc.frequency.value = 64;
    const seismicGain = ctx.createGain();
    seismicGain.gain.value = 0.055;

    src.connect(band);
    band.connect(windGain);
    windGain.connect(out);
    seismicOsc.connect(seismicGain);
    seismicGain.connect(out);

    src.start();
    gustLfo.start();
    seismicOsc.start();

    return () => {
      try {
        src.stop();
        gustLfo.stop();
        seismicOsc.stop();
      } catch {
        // ignore
      }
      src.disconnect();
      band.disconnect();
      gustLfo.disconnect();
      gustDepth.disconnect();
      windGain.disconnect();
      seismicOsc.disconnect();
      seismicGain.disconnect();
    };
  }
}

export const ambientSoundscapeEngine = new AmbientSoundscapeController();
