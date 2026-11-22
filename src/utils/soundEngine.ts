type SoundType =
  | 'move'
  | 'capture'
  | 'check'
  | 'castle'
  | 'promote'
  | 'game-start'
  | 'victory'
  | 'defeat'
  | 'draw'
  | 'low-time'
  | 'puzzle-success'
  | 'puzzle-error';

class ChessSoundEngine {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private volume = 0.7;
  private soundPack: 'wood' | 'marble' | 'crisp' = 'wood';
  private ambientEnabled = false;
  private ambientVolume = 0.25;
  private ambientTimer: number | null = null;
  private ambientGain: GainNode | null = null;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public configure(opts: {
    soundEnabled?: boolean;
    soundVolume?: number;
    soundPack?: 'wood' | 'marble' | 'crisp';
    ambientMusicEnabled?: boolean;
    ambientVolume?: number;
  }) {
    if (opts.soundEnabled !== undefined) this.enabled = opts.soundEnabled;
    if (opts.soundVolume !== undefined) this.volume = Math.max(0, Math.min(1, opts.soundVolume));
    if (opts.soundPack !== undefined) this.soundPack = opts.soundPack;
    if (opts.ambientVolume !== undefined) {
      this.ambientVolume = Math.max(0, Math.min(1, opts.ambientVolume));
      if (this.ambientGain && this.ctx) {
        this.ambientGain.gain.setTargetAtTime(this.ambientVolume * 0.14, this.ctx.currentTime, 0.15);
      }
    }
    if (opts.ambientMusicEnabled !== undefined && opts.ambientMusicEnabled !== this.ambientEnabled) {
      this.ambientEnabled = opts.ambientMusicEnabled;
      if (this.ambientEnabled) {
        this.startAmbient();
      } else {
        this.stopAmbient();
      }
    }
  }

  public play(type: SoundType) {
    if (!this.enabled || this.volume <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const v = this.volume;
    const baseMoveFreq = this.soundPack === 'marble' ? 420 : this.soundPack === 'crisp' ? 310 : 175;
    const endMoveFreq = this.soundPack === 'marble' ? 210 : this.soundPack === 'crisp' ? 160 : 95;
    const dur = this.soundPack === 'crisp' ? 0.042 : this.soundPack === 'marble' ? 0.055 : 0.065;

    switch (type) {
      case 'move':
        this.woodTap(ctx, now, baseMoveFreq, endMoveFreq, dur, 0.42 * v);
        break;
      case 'capture':
        this.woodTap(ctx, now, baseMoveFreq * 1.35, endMoveFreq * 0.85, dur + 0.02, 0.55 * v);
        this.woodTap(ctx, now + 0.032, baseMoveFreq * 0.85, endMoveFreq * 0.7, dur + 0.01, 0.35 * v);
        break;
      case 'castle':
        this.woodTap(ctx, now, baseMoveFreq, endMoveFreq, dur, 0.4 * v);
        this.woodTap(ctx, now + 0.085, baseMoveFreq * 1.15, endMoveFreq * 1.1, dur, 0.38 * v);
        break;
      case 'promote':
        this.tone(ctx, now, 523.25, 'triangle', 0.14, 0.22 * v);
        this.tone(ctx, now + 0.07, 659.25, 'triangle', 0.16, 0.24 * v);
        this.tone(ctx, now + 0.14, 783.99, 'sine', 0.24, 0.24 * v);
        break;
      case 'check':
        this.woodTap(ctx, now, baseMoveFreq * 1.2, endMoveFreq * 1.1, dur, 0.45 * v);
        this.tone(ctx, now + 0.015, 660, 'sine', 0.22, 0.22 * v);
        this.tone(ctx, now + 0.015, 990, 'triangle', 0.16, 0.08 * v);
        break;
      case 'game-start':
        this.tone(ctx, now, 392.0, 'sine', 0.14, 0.18 * v);
        this.tone(ctx, now + 0.09, 523.25, 'sine', 0.22, 0.22 * v);
        break;
      case 'victory':
        this.tone(ctx, now, 523.25, 'triangle', 0.18, 0.22 * v);
        this.tone(ctx, now + 0.1, 659.25, 'triangle', 0.18, 0.22 * v);
        this.tone(ctx, now + 0.2, 783.99, 'triangle', 0.22, 0.24 * v);
        this.tone(ctx, now + 0.31, 1046.5, 'sine', 0.42, 0.26 * v);
        break;
      case 'defeat':
        this.tone(ctx, now, 392.0, 'sine', 0.2, 0.2 * v);
        this.tone(ctx, now + 0.14, 349.23, 'sine', 0.22, 0.2 * v);
        this.tone(ctx, now + 0.28, 293.66, 'sine', 0.35, 0.22 * v);
        break;
      case 'draw':
        this.tone(ctx, now, 440, 'sine', 0.18, 0.18 * v);
        this.tone(ctx, now + 0.14, 440, 'sine', 0.24, 0.16 * v);
        break;
      case 'low-time':
        this.tone(ctx, now, 880, 'square', 0.045, 0.09 * v);
        break;
      case 'puzzle-success':
        this.tone(ctx, now, 587.33, 'sine', 0.12, 0.2 * v);
        this.tone(ctx, now + 0.08, 880, 'sine', 0.26, 0.24 * v);
        break;
      case 'puzzle-error':
        this.tone(ctx, now, 210, 'sawtooth', 0.14, 0.12 * v);
        this.tone(ctx, now + 0.1, 175, 'sawtooth', 0.18, 0.12 * v);
        break;
    }
  }

  private woodTap(
    ctx: AudioContext,
    startTime: number,
    freqStart: number,
    freqEnd: number,
    duration: number,
    gainPeak: number
  ) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freqStart, startTime);
    osc.frequency.exponentialRampToValueAtTime(freqEnd, startTime + duration);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1100, startTime);

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);
  }

  private tone(
    ctx: AudioContext,
    startTime: number,
    freq: number,
    type: OscillatorType,
    duration: number,
    gainPeak: number
  ) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  private startAmbient() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (this.ambientTimer) return;

    this.ambientGain = ctx.createGain();
    this.ambientGain.gain.setValueAtTime(this.ambientVolume * 0.14, ctx.currentTime);
    this.ambientGain.connect(ctx.destination);

    // Gentle warm ambient study chord progression (Dm9 - G13 - Cmaj9 - Am9)
    const chords = [
      [293.66, 349.23, 440.0, 523.25],
      [196.0, 329.63, 392.0, 493.88],
      [261.63, 329.63, 392.0, 493.88],
      [220.0, 261.63, 329.63, 493.88],
    ];
    let step = 0;

    const triggerChord = () => {
      if (!this.ambientEnabled || !this.ctx || !this.ambientGain) return;
      const now = this.ctx.currentTime;
      const notes = chords[step % chords.length];
      step++;
      notes.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const noteGain = this.ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        noteGain.gain.setValueAtTime(0.0001, now + idx * 0.08);
        noteGain.gain.linearRampToValueAtTime(0.18, now + idx * 0.08 + 1.1);
        noteGain.gain.exponentialRampToValueAtTime(0.0001, now + 4.4);
        osc.connect(noteGain);
        noteGain.connect(this.ambientGain!);
        osc.start(now + idx * 0.08);
        osc.stop(now + 4.5);
      });
    };

    triggerChord();
    this.ambientTimer = window.setInterval(triggerChord, 4200);
  }

  private stopAmbient() {
    if (this.ambientTimer) {
      clearInterval(this.ambientTimer);
      this.ambientTimer = null;
    }
    if (this.ambientGain && this.ctx) {
      this.ambientGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.2);
    }
  }
}

export const soundEngine = new ChessSoundEngine();
