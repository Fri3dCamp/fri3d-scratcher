export const USER_BANK_SIZE = 64;
export const USER_1_BASE = 8;
export const USER_2_BASE = USER_1_BASE + USER_BANK_SIZE;

export const DEFAULT_SAMPLE_NAMES = [
  "Kick",
  "Snare",
  "Closed hi-hat",
  "Open hi-hat",
  "Clap",
  "Tom",
  "Rim",
  "Cowbell",
] as const;

type SampleShape = (time: number, sample: number, noise: () => number) => number;

/** Polyphonic one-shot sample playback mixed into the main output. */
export class SamplePlayer {
  private readonly ctx: AudioContext;
  private readonly output: AudioNode;
  private readonly buffers = new Array<AudioBuffer | null>(USER_2_BASE + USER_BANK_SIZE).fill(null);
  private readonly voices = new Set<AudioBufferSourceNode>();

  constructor(ctx: AudioContext, output: AudioNode) {
    this.ctx = ctx;
    this.output = output;
    this.loadDefaultKit();
  }

  private makeBuffer(duration: number, seed: number, shape: SampleShape): AudioBuffer {
    const length = Math.ceil(duration * this.ctx.sampleRate);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let state = seed >>> 0;
    const noise = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return (state / 0xffffffff) * 2 - 1;
    };
    for (let sample = 0; sample < length; sample++) {
      const value = shape(sample / this.ctx.sampleRate, sample, noise);
      data[sample] = Math.max(-1, Math.min(1, value));
    }
    return buffer;
  }

  /** Small synthesized drum kit: available immediately, with no network fetch. */
  private loadDefaultKit(): void {
    const rate = this.ctx.sampleRate;

    let kickPhase = 0;
    this.buffers[0] = this.makeBuffer(0.6, 1, (time, sample) => {
      const frequency = 43 + 125 * Math.exp(-time * 28);
      kickPhase += (Math.PI * 2 * frequency) / rate;
      const body = Math.sin(kickPhase) * Math.exp(-time * 9);
      const click = sample < rate * 0.006 ? (1 - sample / (rate * 0.006)) * 0.35 : 0;
      return body * 0.95 + click;
    });

    this.buffers[1] = this.makeBuffer(0.45, 2, (time, _sample, noise) => {
      const noiseBody = noise() * Math.exp(-time * 13);
      const tone = Math.sin(Math.PI * 2 * 185 * time) * Math.exp(-time * 20);
      return noiseBody * 0.8 + tone * 0.38;
    });

    let closedPrevious = 0;
    this.buffers[2] = this.makeBuffer(0.13, 3, (time, _sample, noise) => {
      const current = noise();
      const highPassed = current - closedPrevious * 0.92;
      closedPrevious = current;
      return highPassed * Math.exp(-time * 48) * 0.55;
    });

    let openPrevious = 0;
    this.buffers[3] = this.makeBuffer(0.7, 4, (time, _sample, noise) => {
      const current = noise();
      const highPassed = current - openPrevious * 0.94;
      openPrevious = current;
      return highPassed * Math.exp(-time * 7) * 0.42;
    });

    this.buffers[4] = this.makeBuffer(0.5, 5, (time, _sample, noise) => {
      const bursts = Math.exp(-time * 55) + (time > 0.025 ? Math.exp(-(time - 0.025) * 65) : 0) +
        (time > 0.052 ? Math.exp(-(time - 0.052) * 70) : 0);
      const tail = time > 0.052 ? Math.exp(-(time - 0.052) * 12) * 0.45 : 0;
      return noise() * Math.min(1, bursts + tail) * 0.72;
    });

    let tomPhase = 0;
    this.buffers[5] = this.makeBuffer(0.55, 6, (time) => {
      const frequency = 92 + 95 * Math.exp(-time * 16);
      tomPhase += (Math.PI * 2 * frequency) / rate;
      return (Math.sin(tomPhase) + Math.sin(tomPhase * 2) * 0.18) * Math.exp(-time * 8) * 0.82;
    });

    this.buffers[6] = this.makeBuffer(0.16, 7, (time, _sample, noise) => {
      const ring = Math.sin(Math.PI * 2 * 510 * time) + Math.sin(Math.PI * 2 * 1420 * time) * 0.55;
      return (ring * 0.55 + noise() * 0.18) * Math.exp(-time * 35);
    });

    this.buffers[7] = this.makeBuffer(0.32, 8, (time) => {
      const squareA = Math.sin(Math.PI * 2 * 540 * time) >= 0 ? 1 : -1;
      const squareB = Math.sin(Math.PI * 2 * 800 * time) >= 0 ? 1 : -1;
      return (squareA + squareB * 0.75) * Math.exp(-time * 13) * 0.38;
    });

    // User 1 opens with the drum kit across its first row. All remaining User
    // 1 pads and all User 2 pads are free for user audio.
    for (let index = 0; index < 8; index++) this.buffers[USER_1_BASE + index] = this.buffers[index];
  }

  setBuffer(index: number, buffer: AudioBuffer): void {
    if (index < 0 || index >= this.buffers.length) return;
    this.buffers[index] = buffer;
  }

  hasBuffer(index: number): boolean {
    return this.buffers[index] != null;
  }

  /** Trigger one sample. `when` is an AudioContext timestamp for tight sequencing. */
  trigger(index: number, when = this.ctx.currentTime): void {
    const buffer = this.buffers[index];
    if (!buffer) return;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.output);
    source.onended = () => {
      source.disconnect();
      this.voices.delete(source);
    };
    this.voices.add(source);
    source.start(Math.max(when, this.ctx.currentTime));
  }

  stopAll(): void {
    for (const source of this.voices) {
      try {
        source.stop();
      } catch {
        // Voice already ended between iteration and stop().
      }
      source.disconnect();
    }
    this.voices.clear();
  }

  destroy(): void {
    this.stopAll();
    this.buffers.fill(null);
  }
}
