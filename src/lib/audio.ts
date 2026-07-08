// Web Audio engine for two decks plus a crossfader.
//
// Per deck the signal chain is:
//   ScratchWorklet -> low(shelf) -> mid(peak) -> high(shelf)
//     -> volume(gain) -> crossfade(gain) -> main -> destination
//
// Playback is driven by an AudioWorklet (scratch-processor.js) reading a
// decoded AudioBuffer with a floating-point playhead. This gives true
// variable-speed and reverse audio while scratching — a real buffer scratch,
// not a stutter-seek. The main thread keeps a logical mirror of the playhead
// (anchored to worklet position reports) so the UI can read the time
// synchronously every frame.

import scratchProcessorUrl from "./scratch-processor.js?url";
import recorderProcessorUrl from "./recorder-processor.js?url";
import { Mp3Encoder } from "@breezystack/lamejs";

export type DeckSide = "left" | "right";
export type EqBand = "high" | "mid" | "low";

const EQ_RANGE_DB = 26; // pot at 0 ≈ -26 dB (kill), at 1 ≈ +26 dB, centre = 0

/** Latest position snapshot reported by the worklet, for extrapolation. */
interface PosSnapshot {
  pos: number; // seconds
  rate: number; // signed playback rate (1 = normal)
  time: number; // AudioContext time the snapshot was taken
}

export class Deck {
  private readonly ctx: AudioContext;
  private node: AudioWorkletNode | null = null;
  private low: BiquadFilterNode;
  private mid: BiquadFilterNode;
  private high: BiquadFilterNode;
  private volume: GainNode;
  /** Crossfade contribution, driven by the engine. */
  readonly crossGain: GainNode;

  /** Resolves once the worklet module is registered and a node can be made. */
  private readonly workletReady: Promise<void>;
  /** Messages buffered until the worklet node exists. */
  private pending: unknown[] = [];

  private trackName: string | null = null;
  private _duration = 0;
  /** Logical play intent, independent of transient scratch playback. */
  private wantsPlay = false;
  private scratching = false;
  /** Whether playback was active when the platter was grabbed. */
  private wasPlaying = false;
  /** Scratch chase target the platter feeds (seconds), owned by the main thread. */
  private scratchTarget = 0;
  /** Base playback rate (1 = original). Driven by tempo/sync, not scratching. */
  private tempo = 1;
  /** Last position the worklet reported, for synchronous time extrapolation. */
  private snapshot: PosSnapshot = { pos: 0, rate: 0, time: 0 };

  // --- Beat analysis (set after decoding) ---------------------------------
  /** Precise detected tempo in BPM, or null if undetected. */
  preciseTempo: number | null = null;
  /** Time of the first detected beat (seconds) — the beat-grid phase. */
  beatOffset = 0;
  /** High-resolution waveform peaks spanning the whole track, for the zoom view. */
  detailPeaks: Float32Array | null = null;

  constructor(ctx: AudioContext, destination: AudioNode, workletReady: Promise<void>) {
    this.ctx = ctx;
    this.workletReady = workletReady;

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

    this.low.connect(this.mid);
    this.mid.connect(this.high);
    this.high.connect(this.volume);
    this.volume.connect(this.crossGain);
    this.crossGain.connect(destination);
  }

  /** Post to the worklet, queueing until the node is created. */
  private post(msg: unknown): void {
    if (this.node) this.node.port.postMessage(msg);
    else this.pending.push(msg);
  }

  /** Record the track name and reset analysis. The decoded samples arrive
   *  separately via setBuffer once decoding finishes. */
  loadFile(file: File): string {
    this.trackName = file.name;
    this._duration = 0;
    this.wantsPlay = false;
    this.scratching = false;
    this.snapshot = { pos: 0, rate: 0, time: this.ctx.currentTime };
    // Reset any prior analysis/tempo for the new track.
    this.preciseTempo = null;
    this.beatOffset = 0;
    this.detailPeaks = null;
    this.setTempo(1);
    return file.name;
  }

  /** Hand the decoded buffer to the worklet, creating the node on first use. */
  async setBuffer(buffer: AudioBuffer): Promise<void> {
    await this.workletReady;
    if (!this.node) {
      this.node = new AudioWorkletNode(this.ctx, "scratch-processor", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      this.node.port.onmessage = (e) => this.onWorkletMessage(e.data);
      this.node.connect(this.low);
      // Flush anything that was set before the node existed.
      for (const msg of this.pending) this.node.port.postMessage(msg);
      this.pending = [];
    }
    // Copy each channel so the original AudioBuffer stays usable for analysis,
    // and transfer the copies to the worklet thread.
    const channels: ArrayBuffer[] = [];
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const copy = new Float32Array(buffer.length);
      copy.set(buffer.getChannelData(c));
      channels.push(copy.buffer);
    }
    this._duration = buffer.duration;
    this.snapshot = { pos: 0, rate: 0, time: this.ctx.currentTime };
    this.node.port.postMessage({ type: "load", channels, length: buffer.length }, channels);
    this.post({ type: "tempo", value: this.tempo });
  }

  private onWorkletMessage(data: { type: string; pos?: number; rate?: number; time?: number }): void {
    if (data.type === "pos") {
      this.snapshot = { pos: data.pos ?? 0, rate: data.rate ?? 0, time: data.time ?? this.ctx.currentTime };
    } else if (data.type === "ended") {
      this.wantsPlay = false;
    }
  }

  get hasTrack(): boolean {
    return this.trackName !== null;
  }

  get isPlaying(): boolean {
    return this.wantsPlay;
  }

  /** Synchronous playhead estimate: the last reported position extrapolated
   *  forward by the elapsed context time at the reported rate. */
  get currentTime(): number {
    const s = this.snapshot;
    const t = s.pos + s.rate * (this.ctx.currentTime - s.time);
    return Math.max(0, Math.min(this._duration || t, t));
  }

  get duration(): number {
    return this._duration;
  }

  async play(): Promise<void> {
    if (!this.hasTrack) return;
    this.wantsPlay = true;
    if (!this.scratching) this.post({ type: "play" });
  }

  pause(): void {
    this.wantsPlay = false;
    if (!this.scratching) this.post({ type: "pause" });
  }

  togglePlay(): void {
    if (this.wantsPlay) this.pause();
    else void this.play();
  }

  /** Jump to the start. Keeps playing if it already was. */
  cue(): void {
    this.seekTo(0);
  }

  seekTo(seconds: number): void {
    if (!this.hasTrack) return;
    const pos = Math.max(0, Math.min(this._duration || seconds, seconds));
    this.scratchTarget = pos;
    this.snapshot = { pos, rate: this.snapshot.rate, time: this.ctx.currentTime };
    this.post({ type: "seek", pos });
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

  /** Set the tempo multiplier (1 = original). */
  setTempo(ratio: number): void {
    this.tempo = Math.max(0.5, Math.min(2, ratio));
    this.post({ type: "tempo", value: this.tempo });
  }

  // --- Scratch ------------------------------------------------------------

  /** Grab/release the platter. Grabbing holds the record (motion makes sound);
   *  releasing resumes normal playback if it had been playing. */
  setScratching(active: boolean): void {
    if (active === this.scratching) return;
    this.scratching = active;
    if (active) {
      this.wasPlaying = this.wantsPlay;
      this.scratchTarget = this.currentTime;
      this.post({ type: "scratchStart" });
    } else {
      this.wantsPlay = this.wasPlaying;
      this.post({ type: "scratchEnd", resume: this.wasPlaying });
    }
  }

  /** Scratch by a signed encoder/jog delta (in ticks). */
  scratch(deltaTicks: number): void {
    this.scratchMove(deltaTicks * 0.018);
  }

  /** Move the scratch target by a number of seconds; the worklet sonifies the
   *  motion. Only meaningful while the platter is grabbed. */
  scratchMove(seconds: number): void {
    if (!this.hasTrack || !this.scratching) return;
    this.scratchTarget = Math.max(0, Math.min(this._duration, this.scratchTarget + seconds));
    this.post({ type: "scratchTarget", pos: this.scratchTarget });
  }

  /** Move the playback position by a number of seconds (silent seek). */
  nudgeSeconds(seconds: number): void {
    this.seekTo(this.currentTime + seconds);
  }

  destroy(): void {
    this.node?.disconnect();
    this.post({ type: "pause" });
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

/** Minimal typings for the File System Access API used to stream to disk. */
interface DiskWriter {
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort?(): Promise<void>;
}
interface SaveFileHandle {
  createWritable(): Promise<DiskWriter>;
}
type ShowSaveFilePicker = (options?: {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
}) => Promise<SaveFileHandle>;

/** MP3 bitrate (kbps) for recorded sets — 192 is a good quality/size balance. */
const REC_BITRATE_KBPS = 192;

export class MixerEngine {
  readonly ctx: AudioContext;
  readonly left: Deck;
  readonly right: Deck;
  private main: GainNode;
  private crossfaderValue = 0.5;

  // --- Recording (encodes MP3 and streams it straight to a file on disk) ---
  private readonly recorderReady: Promise<void>;
  private recNode: AudioWorkletNode | null = null;
  private recWriter: DiskWriter | null = null;
  /** Serialises disk writes so encoded frames never overlap on the stream. */
  private recWriteQueue: Promise<void> = Promise.resolve();
  private recEncoder: Mp3Encoder | null = null;
  private recChannels = 2;
  private _recording = false;

  constructor() {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.main = this.ctx.createGain();
    this.main.gain.value = 0.9;
    this.main.connect(this.ctx.destination);
    // Register the scratch worklet once; decks create their nodes when ready.
    const workletReady = this.ctx.audioWorklet.addModule(scratchProcessorUrl);
    // Register the recorder probe worklet used to stream audio to disk.
    this.recorderReady = this.ctx.audioWorklet.addModule(recorderProcessorUrl);
    this.left = new Deck(this.ctx, this.main, workletReady);
    this.right = new Deck(this.ctx, this.main, workletReady);
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

  /** Whether streaming a recording to disk is possible in this browser
   *  (needs the File System Access API's showSaveFilePicker). */
  get canRecord(): boolean {
    return typeof window !== "undefined" && "showSaveFilePicker" in window;
  }

  get isRecording(): boolean {
    return this._recording;
  }

  /** Ask the user where to save, then stream the master output to that file as
   *  an MP3. Taps `main` so it captures exactly what is heard — both decks, EQ,
   *  crossfader and master gain. Rejects with AbortError if the user cancels.
   *  Must be called from a user gesture (the save dialog requires activation). */
  async startRecording(): Promise<void> {
    if (this._recording) return;
    const showSaveFilePicker = (window as unknown as { showSaveFilePicker?: ShowSaveFilePicker }).showSaveFilePicker;
    if (!showSaveFilePicker) throw new Error("File System Access API not supported");

    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    // Ask where to record before touching the audio graph.
    const handle = await showSaveFilePicker({
      suggestedName: `fri3d-set-${stamp}.mp3`,
      types: [{ description: "MP3 audio", accept: { "audio/mpeg": [".mp3"] } }],
    });
    const writer = await handle.createWritable();

    await this.recorderReady;
    this.resume();

    this.recChannels = 2;
    this.recWriteQueue = Promise.resolve();
    // lamejs supports the standard MP3 sample rates; browser contexts run at
    // 44100 or 48000, both of which are valid here.
    this.recEncoder = new Mp3Encoder(this.recChannels, this.ctx.sampleRate, REC_BITRATE_KBPS);
    this.recWriter = writer;

    this.recNode = new AudioWorkletNode(this.ctx, "recorder-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    this.recNode.port.onmessage = (e: MessageEvent<{ chans: Float32Array[] }>) => this.onRecChunk(e.data.chans);
    this.main.connect(this.recNode);
    // The silent output keeps the node in the render graph so process() runs.
    this.recNode.connect(this.ctx.destination);
    this.recNode.port.postMessage("start");
    this._recording = true;
  }

  /** Encode a quantum of Float32 channels to MP3 and queue the frames for
   *  writing. Writes are serialised so encoded data never interleaves. */
  private onRecChunk(chans: Float32Array[]): void {
    if (!this.recWriter || !this.recEncoder || !this._recording) return;
    const frames = chans[0].length;
    const left = new Int16Array(frames);
    const right = new Int16Array(frames);
    const chL = chans[0];
    const chR = chans[1] ?? chans[0];
    for (let i = 0; i < frames; i++) {
      const l = Math.max(-1, Math.min(1, chL[i]));
      const r = Math.max(-1, Math.min(1, chR[i]));
      left[i] = l < 0 ? l * 0x8000 : l * 0x7fff;
      right[i] = r < 0 ? r * 0x8000 : r * 0x7fff;
    }
    const mp3 = this.recEncoder.encodeBuffer(left, right);
    if (mp3.length > 0) this.enqueueWrite(mp3);
  }

  /** Append encoded bytes to the disk stream, keeping writes strictly ordered. */
  private enqueueWrite(bytes: Uint8Array): void {
    const writer = this.recWriter;
    if (!writer) return;
    this.recWriteQueue = this.recWriteQueue.then(() => writer.write(bytes)).catch(() => {});
  }

  /** Stop capturing, flush the encoder and close the file. Resolves once
   *  everything is flushed to disk. */
  async stopRecording(): Promise<void> {
    if (!this._recording) return;
    this._recording = false;
    this.recNode?.port.postMessage("stop");
    if (this.recNode) {
      this.main.disconnect(this.recNode);
      this.recNode.disconnect();
      this.recNode = null;
    }
    // Flush the encoder's final MP3 frame, then drain the write queue.
    if (this.recEncoder) {
      const tail = this.recEncoder.flush();
      if (tail.length > 0) this.enqueueWrite(tail);
      this.recEncoder = null;
    }
    await this.recWriteQueue;
    const writer = this.recWriter;
    this.recWriter = null;
    if (writer) await writer.close();
  }

  destroy(): void {
    if (this.recNode) {
      this.recNode.port.postMessage("stop");
      this.main.disconnect(this.recNode);
      this.recNode.disconnect();
      this.recNode = null;
    }
    this.recEncoder = null;
    if (this.recWriter) {
      const writer = this.recWriter;
      this.recWriter = null;
      this._recording = false;
      void this.recWriteQueue.then(() => writer.abort?.() ?? writer.close());
    }
    this.left.destroy();
    this.right.destroy();
    void this.ctx.close();
  }
}
