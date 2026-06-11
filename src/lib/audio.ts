// Web Audio engine for two decks plus a crossfader.
//
// Per deck the signal chain is:
//   MediaElementSource -> low(shelf) -> mid(peak) -> high(shelf)
//     -> volume(gain) -> crossfade(gain) -> main -> destination
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
  /** Whether playback was active when the platter was grabbed. */
  private wasPlaying = false;
  /** Timer that re-pauses the record shortly after scratch movement stops. */
  private scratchPauseTimer: ReturnType<typeof setTimeout> | null = null;
  /** Base playback rate (1 = original). Driven by tempo/sync, not scratching. */
  private tempo = 1;

  // --- Beat analysis (set after decoding) ---------------------------------
  /** Precise detected tempo in BPM, or null if undetected. */
  preciseTempo: number | null = null;
  /** Time of the first detected beat (seconds) — the beat-grid phase. */
  beatOffset = 0;
  /** High-resolution waveform peaks spanning the whole track, for the zoom view. */
  detailPeaks: Float32Array | null = null;

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
    // Reset any prior analysis/tempo for the new track.
    this.preciseTempo = null;
    this.beatOffset = 0;
    this.detailPeaks = null;
    this.setTempo(1);
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

  // --- Tempo / sync -------------------------------------------------------

  /** Base playback-rate multiplier (1 = original tempo). */
  get playbackTempo(): number {
    return this.tempo;
  }

  /** Effective BPM after the tempo multiplier, or null if undetected. */
  get effectiveBpm(): number | null {
    return this.preciseTempo == null ? null : this.preciseTempo * this.tempo;
  }

  /** Set the tempo multiplier. preservesPitch keeps it pitch-correct. */
  setTempo(ratio: number): void {
    this.tempo = Math.max(0.5, Math.min(2, ratio));
    this.el.preservesPitch = true;
    if (!this.scratching) this.el.playbackRate = this.tempo;
  }

  // --- Scratch ------------------------------------------------------------

  /** Grab/release the platter. Grabbing stops the record dead (like a hand
   *  on the vinyl); releasing resumes if it had been playing. */
  setScratching(active: boolean): void {
    if (active === this.scratching) return;
    this.scratching = active;
    if (active) {
      this.wasPlaying = this.wantsPlay;
      this.el.pause(); // hold the record → silence, position frozen
    } else {
      if (this.scratchPauseTimer !== null) {
        clearTimeout(this.scratchPauseTimer);
        this.scratchPauseTimer = null;
      }
      this.el.playbackRate = this.tempo;
      if (this.wasPlaying) void this.el.play().catch(() => {});
      else this.el.pause();
    }
  }

  /** Scratch by a signed encoder/jog delta (in ticks). */
  scratch(deltaTicks: number): void {
    this.scratchMove(deltaTicks * 0.018);
  }

  /** Move the playback position by a number of seconds while scratching;
   *  produces sound only while the record is actually moving. */
  scratchMove(seconds: number): void {
    if (!this.hasTrack) return;
    this.el.currentTime = Math.max(0, Math.min(this.duration, this.el.currentTime + seconds));
    if (!this.scratching) return;
    // Brief playback so the movement is audible, then silence once it stops.
    void this.el.play().catch(() => {});
    if (this.scratchPauseTimer !== null) clearTimeout(this.scratchPauseTimer);
    this.scratchPauseTimer = setTimeout(() => {
      this.el.pause();
      this.scratchPauseTimer = null;
    }, 70);
  }

  /** Move the playback position by a number of seconds (silent seek). */
  nudgeSeconds(seconds: number): void {
    if (!this.hasTrack) return;
    this.el.currentTime = Math.max(0, Math.min(this.duration, this.el.currentTime + seconds));
  }

  destroy(): void {
    if (this.scratchPauseTimer !== null) clearTimeout(this.scratchPauseTimer);
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

/**
 * High-resolution peaks (≈`pps` points per second) spanning the whole track,
 * for the zoomed beat-grid view. Index a time `t` with `t / duration * length`.
 */
export function computeDetailPeaks(buffer: AudioBuffer, pps = 160): Float32Array {
  const channel = buffer.getChannelData(0);
  const points = Math.max(1, Math.ceil(buffer.duration * pps));
  const size = Math.floor(channel.length / points) || 1;
  const peaks = new Float32Array(points);
  let globalMax = 0;
  for (let i = 0; i < points; i++) {
    const start = i * size;
    let max = 0;
    for (let j = 0; j < size; j++) {
      const v = Math.abs(channel[start + j] || 0);
      if (v > max) max = v;
    }
    peaks[i] = max;
    if (max > globalMax) globalMax = max;
  }
  if (globalMax > 0) {
    for (let i = 0; i < points; i++) peaks[i] /= globalMax;
  }
  return peaks;
}

export class MixerEngine {
  readonly ctx: AudioContext;
  readonly left: Deck;
  readonly right: Deck;
  private main: GainNode;
  private crossfaderValue = 0.5;

  constructor() {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.main = this.ctx.createGain();
    this.main.gain.value = 0.9;
    this.main.connect(this.ctx.destination);
    this.left = new Deck(this.ctx, this.main);
    this.right = new Deck(this.ctx, this.main);
    this.applyCrossfader();
  }

  deck(side: DeckSide): Deck {
    return side === "left" ? this.left : this.right;
  }

  /** Resume the context — must be called from a user gesture. */
  resume(): void {
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setMain(value: number): void {
    this.main.gain.value = Math.max(0, Math.min(1, value));
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
