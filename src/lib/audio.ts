// Web Audio engine for two decks plus a crossfader.
//
// Per deck the signal chain is:
//   MediaElementSource -> low(shelf) -> mid(peak) -> high(shelf)
//     -> volume(gain) -> crossfade(gain) -> master -> destination
//
// MediaElement playback keeps file loading, seeking and play/pause trivial,
// which is plenty for a "basic" mixer. Scratching nudges currentTime.

export type DeckSide = "left" | "right";
export type EqBand = "high" | "mid" | "low";

const EQ_RANGE_DB = 26; // pot at 0 ≈ -26 dB (kill), at 1 ≈ +26 dB, centre = 0

export class Deck {
  readonly el: HTMLAudioElement;
  private source: MediaElementAudioSourceNode;
  private low: BiquadFilterNode;
  private mid: BiquadFilterNode;
  private high: BiquadFilterNode;
  private volume: GainNode;
  /** Crossfade contribution, driven by the engine. */
  readonly crossGain: GainNode;

  private objectUrl: string | null = null;
  /** Logical play intent, independent of transient scratch playback. */
  private wantsPlay = false;
  private scratching = false;

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.el = new Audio();
    this.el.crossOrigin = "anonymous";
    this.el.preload = "auto";

    this.source = ctx.createMediaElementSource(this.el);

    this.low = ctx.createBiquadFilter();
    this.low.type = "lowshelf";
    this.low.frequency.value = 150;

    this.mid = ctx.createBiquadFilter();
    this.mid.type = "peaking";
    this.mid.frequency.value = 1000;
    this.mid.Q.value = 0.8;

    this.high = ctx.createBiquadFilter();
    this.high.type = "highshelf";
    this.high.frequency.value = 4000;

    this.volume = ctx.createGain();
    this.volume.gain.value = 1;

    this.crossGain = ctx.createGain();
    this.crossGain.gain.value = 1;

    this.source.connect(this.low);
    this.low.connect(this.mid);
    this.mid.connect(this.high);
    this.high.connect(this.volume);
    this.volume.connect(this.crossGain);
    this.crossGain.connect(destination);
  }

  loadFile(file: File): string {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = URL.createObjectURL(file);
    this.el.src = this.objectUrl;
    this.el.load();
    this.wantsPlay = false;
    return file.name;
  }

  get hasTrack(): boolean {
    return this.objectUrl !== null;
  }

  get isPlaying(): boolean {
    return this.wantsPlay;
  }

  get currentTime(): number {
    return this.el.currentTime || 0;
  }

  get duration(): number {
    return Number.isFinite(this.el.duration) ? this.el.duration : 0;
  }

  async play(): Promise<void> {
    if (!this.hasTrack) return;
    this.wantsPlay = true;
    try {
      await this.el.play();
    } catch {
      /* autoplay may reject until a user gesture; ignored */
    }
  }

  pause(): void {
    this.wantsPlay = false;
    if (!this.scratching) this.el.pause();
  }

  togglePlay(): void {
    if (this.wantsPlay) this.pause();
    else void this.play();
  }

  /** Jump to the start. Keeps playing if it already was. */
  cue(): void {
    this.el.currentTime = 0;
    if (this.wantsPlay) void this.el.play();
  }

  seekTo(seconds: number): void {
    if (!this.hasTrack) return;
    this.el.currentTime = Math.max(0, Math.min(this.duration || seconds, seconds));
  }

  // --- EQ -----------------------------------------------------------------

  /** band gain from a 0..1 pot value (0.5 = flat). */
  setEq(band: EqBand, value: number): void {
    const db = (value - 0.5) * 2 * EQ_RANGE_DB;
    const node = band === "low" ? this.low : band === "mid" ? this.mid : this.high;
    node.gain.value = db;
  }

  setVolume(value: number): void {
    this.volume.gain.value = Math.max(0, Math.min(1, value));
  }

  // --- Scratch ------------------------------------------------------------

  setScratching(active: boolean): void {
    if (active === this.scratching) return;
    this.scratching = active;
    if (active) {
      // Allow audio through while scratching even if logically paused.
      void this.el.play().catch(() => {});
    } else {
      this.el.playbackRate = 1;
      if (!this.wantsPlay) this.el.pause();
    }
  }

  /** Nudge playback position by a signed encoder/jog delta (in ticks). */
  scratch(deltaTicks: number): void {
    if (!this.hasTrack) return;
    const seconds = deltaTicks * 0.018;
    this.el.currentTime = Math.max(0, Math.min(this.duration, this.el.currentTime + seconds));
  }

  destroy(): void {
    this.el.pause();
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
  }
}

/**
 * Downsample a decoded buffer to `buckets` amplitude peaks (0..1) for drawing
 * a waveform. Uses the max absolute sample in each bucket of channel 0.
 */
export function computePeaks(buffer: AudioBuffer, buckets = 480): number[] {
  const channel = buffer.getChannelData(0);
  const size = Math.floor(channel.length / buckets) || 1;
  const peaks = new Array<number>(buckets);
  let globalMax = 0;
  for (let i = 0; i < buckets; i++) {
    const start = i * size;
    let max = 0;
    for (let j = 0; j < size; j++) {
      const v = Math.abs(channel[start + j] || 0);
      if (v > max) max = v;
    }
    peaks[i] = max;
    if (max > globalMax) globalMax = max;
  }
  // Normalise so the loudest peak reaches 1.
  if (globalMax > 0) {
    for (let i = 0; i < buckets; i++) peaks[i] /= globalMax;
  }
  return peaks;
}

export class MixerEngine {
  readonly ctx: AudioContext;
  readonly left: Deck;
  readonly right: Deck;
  private master: GainNode;
  private crossfaderValue = 0.5;

  constructor() {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
    this.left = new Deck(this.ctx, this.master);
    this.right = new Deck(this.ctx, this.master);
    this.applyCrossfader();
  }

  deck(side: DeckSide): Deck {
    return side === "left" ? this.left : this.right;
  }

  /** Resume the context — must be called from a user gesture. */
  resume(): void {
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setMaster(value: number): void {
    this.master.gain.value = Math.max(0, Math.min(1, value));
  }

  /** 0 = full left deck, 1 = full right deck. Equal-power curve. */
  setCrossfader(value: number): void {
    this.crossfaderValue = Math.max(0, Math.min(1, value));
    this.applyCrossfader();
  }

  private applyCrossfader(): void {
    const x = this.crossfaderValue;
    this.left.crossGain.gain.value = Math.cos((x * Math.PI) / 2);
    this.right.crossGain.gain.value = Math.cos(((1 - x) * Math.PI) / 2);
  }

  destroy(): void {
    this.left.destroy();
    this.right.destroy();
    void this.ctx.close();
  }
}
