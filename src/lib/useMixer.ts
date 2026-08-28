import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { analyze, guess } from "web-audio-beat-detector";
import { parseBlob, selectCover } from "music-metadata";
import { computeDetailPeaks, computePeaks, MixerEngine } from "./audio";
import type { DeckSide, EqBand } from "./audio";
import { DEFAULT_SAMPLE_NAMES, USER_1_BASE, USER_2_BASE, USER_BANK_SIZE } from "./samplePlayer";
import { CC, LED_COLOR, MidiController, wrapDelta } from "./midi";
import type { MidiStatus } from "./midi";

// RGB equivalents of BloopPad.tsx's per-row TRACK_COLORS Tailwind classes, so the
// BLOOPPAD-MAXX LEDs match what's on screen. Keep in sync.
const TRACK_COLORS_RGB: readonly [number, number, number][] = [
  [192, 133, 255], // bg-fri3d-purple-light
  [255, 173, 100], // bg-fri3d-orange
  [60, 232, 179], // bg-fri3d-mint
  [255, 62, 62], // bg-fri3d-red
  [96, 165, 250], // bg-blue-400
  [244, 114, 182], // bg-pink-400
  [253, 224, 71], // bg-yellow-300
  [103, 232, 249], // bg-cyan-300
];
const GRID_OFF_RGB: readonly [number, number, number] = [0, 0, 0]; // LED off
const PLAYHEAD_RGB: readonly [number, number, number] = [255, 255, 255]; // full white

export interface DeckState {
  trackName: string | null;
  /** ID3/metadata title, falls back to the file name. */
  title: string | null;
  /** ID3/metadata artist, if present. */
  artist: string | null;
  /** Object URL for embedded cover art, if present. */
  coverUrl: string | null;
  playing: boolean;
  scratching: boolean;
  duration: number;
  currentTime: number;
  eqHigh: number;
  eqMid: number;
  eqLow: number;
  volume: number;
  /** Two hot-cue positions in seconds, or null if unset. */
  hotCues: [number | null, number | null];
  /** Visual press state for the 4 pads, driven by hardware buttons. */
  padsPressed: [boolean, boolean, boolean, boolean];
  /** Normalised waveform peaks (0..1), or null while decoding. */
  peaks: number[] | null;
  /** Rounded detected tempo (BPM), or null if undetected / not analysed yet. */
  bpm: number | null;
  /** Precise detected tempo, for beat-grid math. */
  preciseTempo: number | null;
  /** First-beat offset in seconds (beat-grid phase). */
  beatOffset: number;
  /** Tempo multiplier from sync / nudges (1 = original). */
  tempo: number;
  /** Effective BPM after the tempo multiplier. */
  effectiveBpm: number | null;
  /** Whether this deck is sent to the cue/headphone output (PFL). */
  cue: boolean;
}

const initialDeck = (): DeckState => ({
  trackName: null,
  title: null,
  artist: null,
  coverUrl: null,
  playing: false,
  scratching: false,
  duration: 0,
  currentTime: 0,
  eqHigh: 0.5,
  eqMid: 0.5,
  eqLow: 0.5,
  volume: 1,
  hotCues: [null, null],
  padsPressed: [false, false, false, false],
  peaks: null,
  bpm: null,
  preciseTempo: null,
  beatOffset: 0,
  tempo: 1,
  effectiveBpm: null,
  cue: false,
});

export interface SampleSlot {
  name: string | null;
  loading: boolean;
  error: boolean;
}

export type SamplerMode = "sequence" | "user1" | "user2";

export interface SamplerApi {
  samples: SampleSlot[];
  userBanks: [SampleSlot[], SampleSlot[]];
  userPressed: boolean[];
  mode: SamplerMode;
  sequence: boolean[][];
  playing: boolean;
  bpm: number;
  currentStep: number;
  loadSample: (index: number, file: File) => void;
  loadUserSample: (bank: 0 | 1, index: number, file: File) => void;
  triggerSample: (index: number) => void;
  triggerUserSample: (bank: 0 | 1, index: number) => void;
  setMode: (mode: SamplerMode) => void;
  toggleStep: (row: number, column: number) => void;
  setBpm: (bpm: number) => void;
  togglePlaying: () => void;
  stop: () => void;
  clear: () => void;
}

const emptySequence = (): boolean[][] => Array.from({ length: 8 }, () => new Array<boolean>(8).fill(false));
const defaultSamples = (): SampleSlot[] =>
  DEFAULT_SAMPLE_NAMES.map((name) => ({ name, loading: false, error: false }));
const emptyUserBank = (): SampleSlot[] =>
  Array.from({ length: USER_BANK_SIZE }, () => ({ name: null, loading: false, error: false }));
const defaultUserBanks = (): [SampleSlot[], SampleSlot[]] => {
  const user1 = emptyUserBank();
  DEFAULT_SAMPLE_NAMES.forEach((name, index) => {
    user1[index] = { name, loading: false, error: false };
  });
  return [user1, emptyUserBank()];
};

export interface MixerApi {
  left: DeckState;
  right: DeckState;
  crossfader: number;
  main: number;
  midiStatus: MidiStatus;
  midiSupported: boolean;
  deviceName?: string;
  sampler: SamplerApi;

  /** Whether the master output is currently being recorded. */
  recording: boolean;
  /** Whether recording is supported in this browser. */
  recordingSupported: boolean;
  /** Seconds elapsed in the current recording (0 when idle). */
  recordingElapsed: number;

  /** Whether cue/headphone preview is supported in this browser. */
  cueSupported: boolean;
  /** Label of the selected cue output device, once chosen. */
  cueDeviceName?: string;
  /** Prompt the user to pick a cue/headphone output device. */
  selectCueDevice: () => void;
  /** Toggle whether a deck is sent to the cue output (PFL). */
  toggleCue: (side: DeckSide) => void;
  /** Whether cue is split across ears (cue left, master right) vs both ears. */
  splitCue: boolean;
  /** Toggle split-cue mode. */
  toggleSplitCue: () => void;

  connectMidi: () => void;
  loadFile: (side: DeckSide, file: File) => void;
  togglePlay: (side: DeckSide) => void;
  cue: (side: DeckSide) => void;
  /** Press a hot-cue pad (overwrite stores at the playhead instead of jumping). */
  hotCuePress: (side: DeckSide, index: number, overwrite?: boolean) => void;
  /** Release a hot-cue pad; plays from the cue if it was parked. */
  hotCueRelease: (side: DeckSide, index: number) => void;
  /** Clear a stored hot-cue position. */
  clearHotCue: (side: DeckSide, index: number) => void;
  /** Seek to a fraction (0..1) of the track. */
  seek: (side: DeckSide, fraction: number) => void;
  /** Match this deck's tempo + beat phase to the other deck. */
  sync: (side: DeckSide) => void;
  /** Set this deck's tempo multiplier directly (1 = original). */
  setTempo: (side: DeckSide, ratio: number) => void;
  /** Reset this deck's tempo multiplier to 1. */
  resetTempo: (side: DeckSide) => void;
  /** Live playback position (seconds) — for animated views. */
  getTime: (side: DeckSide) => number;
  /** High-res waveform peaks for the zoom view. */
  getDetailPeaks: (side: DeckSide) => Float32Array | null;
  setEq: (side: DeckSide, band: EqBand, value: number) => void;
  setVolume: (side: DeckSide, value: number) => void;
  setCrossfader: (value: number) => void;
  setMain: (value: number) => void;
  /** Jog/scratch from the UI (drag). delta in ticks, active = touching. */
  scratch: (side: DeckSide, delta: number) => void;
  /** Scratch by a relative number of seconds (platter drag). */
  scratchSeconds: (side: DeckSide, seconds: number) => void;
  /** Seek by a relative number of seconds (beat-window drag). */
  seekBy: (side: DeckSide, seconds: number) => void;
  setScratching: (side: DeckSide, active: boolean) => void;
  /** Start recording the master output. */
  startRecording: () => void;
  /** Stop recording and download the captured set. */
  stopRecording: () => void;
  /** Start recording if idle, otherwise stop and download. */
  toggleRecording: () => void;
}

export function useMixer(): MixerApi {
  const engineRef = useRef<MixerEngine | null>(null);
  const midiRef = useRef<MidiController | null>(null);
  const sequenceRef = useRef<boolean[][]>(emptySequence());
  const samplerModeRef = useRef<SamplerMode>("sequence");
  // Mirrors of state read by computeBloopPadColors, so it can be called from a
  // stable MIDI event handler (the BLOOPPAD-MAXX connect animation callback)
  // without capturing stale values.
  const userBanksRef = useRef<[SampleSlot[], SampleSlot[]]>([[], []]);
  const sequencerPlayingRef = useRef(false);
  const currentStepRef = useRef(-1);
  const nextStepRef = useRef(0);
  const sampleLoadRef = useRef<number[]>(new Array<number>(USER_2_BASE + USER_BANK_SIZE).fill(0));
  const scratchPosRef = useRef<{ left: number | null; right: number | null }>({
    left: null,
    right: null,
  });
  // Object URLs for cover art, revoked when a deck loads a new track.
  const coverUrlRef = useRef<{ left: string | null; right: string | null }>({
    left: null,
    right: null,
  });
  // Whether a held hot-cue pad parked the deck (so releasing should play).
  const cuePreviewRef = useRef<Record<string, boolean>>({});

  const [left, setLeft] = useState<DeckState>(initialDeck);
  const [right, setRight] = useState<DeckState>(initialDeck);
  const [crossfader, setCrossfaderState] = useState(0.5);
  const [main, setMainState] = useState(0.9);
  const [midiStatus, setMidiStatus] = useState<MidiStatus>("idle");
  const [deviceName, setDeviceName] = useState<string | undefined>(undefined);
  const [samples, setSamples] = useState<SampleSlot[]>(defaultSamples);
  const [userBanks, setUserBanks] = useState<[SampleSlot[], SampleSlot[]]>(defaultUserBanks);
  const [userPressed, setUserPressed] = useState<boolean[]>(() => new Array<boolean>(USER_BANK_SIZE).fill(false));
  const [samplerMode, setSamplerModeState] = useState<SamplerMode>("sequence");
  const [sequence, setSequence] = useState<boolean[][]>(emptySequence);
  const [sequencerPlaying, setSequencerPlaying] = useState(false);
  const [sequencerBpm, setSequencerBpm] = useState(120);
  const [currentStep, setCurrentStep] = useState(-1);
  const [recording, setRecording] = useState(false);
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  // Wall-clock time the current recording started, for the elapsed counter.
  const recordStartRef = useRef<number | null>(null);
  const [cueDeviceName, setCueDeviceName] = useState<string | undefined>(undefined);
  const [splitCue, setSplitCueState] = useState(false);

  const setDeck = useCallback((side: DeckSide, patch: Partial<DeckState>) => {
    const setter = side === "left" ? setLeft : setRight;
    setter((prev) => ({ ...prev, ...patch }));
  }, []);

  // Lazily create the audio engine (kept across renders, torn down on unmount).
  const ensureEngine = useCallback((): MixerEngine => {
    if (!engineRef.current) engineRef.current = new MixerEngine();
    engineRef.current.resume();
    return engineRef.current;
  }, []);

  // --- actions ------------------------------------------------------------

  const loadFile = useCallback(
    (side: DeckSide, file: File) => {
      const engine = ensureEngine();
      const name = engine.deck(side).loadFile(file);
      // Revoke any previous cover art for this deck.
      if (coverUrlRef.current[side]) URL.revokeObjectURL(coverUrlRef.current[side]!);
      coverUrlRef.current[side] = null;
      setDeck(side, {
        trackName: name,
        title: name, // replaced by the ID3 title once parsed
        artist: null,
        coverUrl: null,
        playing: false,
        duration: 0,
        currentTime: 0,
        hotCues: [null, null],
        peaks: null,
        bpm: null,
        preciseTempo: null,
        beatOffset: 0,
        tempo: 1,
        effectiveBpm: null,
      });
      // Parse ID3/metadata tags for title, artist and cover art.
      parseBlob(file, { skipCovers: false })
        .then((meta) => {
          const cover = selectCover(meta.common.picture);
          let coverUrl: string | null = null;
          if (cover) {
            coverUrl = URL.createObjectURL(new Blob([cover.data as BlobPart], { type: cover.format }));
            coverUrlRef.current[side] = coverUrl;
          }
          setDeck(side, {
            title: meta.common.title ?? name,
            artist: meta.common.artist ?? null,
            coverUrl,
          });
        })
        .catch(() => {
          /* no tags: keep the file name as the title */
        });
      // Decode the track: the samples feed the scratch worklet for playback,
      // and the same buffer drives the waveform + beat analysis. Peaks render
      // first; BPM detection follows.
      file
        .arrayBuffer()
        .then((buf) => engine.ctx.decodeAudioData(buf))
        .then(async (audioBuffer) => {
          const deck = engine.deck(side);
          void deck.setBuffer(audioBuffer);
          deck.detailPeaks = computeDetailPeaks(audioBuffer);
          setDeck(side, { peaks: computePeaks(audioBuffer), duration: audioBuffer.duration });
          try {
            // analyze() gives the precise tempo; guess() gives the rounded BPM
            // and the first-beat offset (the grid phase). The default 90-180
            // window misreads ~120 BPM house tracks as 160 (a 4:3 error), so
            // constrain it to the typical dance-music range instead.
            const tempoSettings = { minTempo: 85, maxTempo: 155 };
            const [tempo, { bpm, offset }] = await Promise.all([
              analyze(audioBuffer, tempoSettings),
              guess(audioBuffer, tempoSettings),
            ]);
            deck.preciseTempo = tempo;
            deck.beatOffset = offset;
            setDeck(side, { bpm, preciseTempo: tempo, beatOffset: offset, effectiveBpm: tempo });
          } catch {
            /* no detectable beats: leave BPM unset */
          }
        })
        .catch(() => {
          /* undecodable file: leave the waveform empty */
        });
    },
    [ensureEngine, setDeck],
  );

  const togglePlay = useCallback(
    (side: DeckSide) => {
      const engine = ensureEngine();
      const deck = engine.deck(side);
      if (!deck.hasTrack) return;
      deck.togglePlay();
      setDeck(side, { playing: deck.isPlaying });
    },
    [ensureEngine, setDeck],
  );

  const cue = useCallback(
    (side: DeckSide) => {
      const engine = engineRef.current;
      if (!engine) return;
      engine.deck(side).cue();
      setDeck(side, { currentTime: 0 });
    },
    [setDeck],
  );

  const seek = useCallback(
    (side: DeckSide, fraction: number) => {
      const engine = engineRef.current;
      if (!engine) return;
      const deck = engine.deck(side);
      const target = fraction * deck.duration;
      deck.seekTo(target);
      setDeck(side, { currentTime: target });
    },
    [setDeck],
  );

  const applyTempo = useCallback(
    (side: DeckSide, ratio: number) => {
      const engine = ensureEngine();
      const deck = engine.deck(side);
      deck.setTempo(ratio);
      setDeck(side, { tempo: deck.playbackTempo, effectiveBpm: deck.effectiveBpm });
    },
    [ensureEngine, setDeck],
  );

  const resetTempo = useCallback((side: DeckSide) => applyTempo(side, 1), [applyTempo]);

  // Match this deck's tempo and beat phase to the other deck (one-shot SYNC).
  const sync = useCallback(
    (side: DeckSide) => {
      const engine = engineRef.current;
      if (!engine) return;
      const other: DeckSide = side === "left" ? "right" : "left";
      const deck = engine.deck(side);
      const lead = engine.deck(other);
      if (deck.preciseTempo == null || lead.effectiveBpm == null || lead.preciseTempo == null) return;

      // 1. Match tempo so the effective BPMs are equal.
      applyTempo(side, lead.effectiveBpm / deck.preciseTempo);

      // 2. Align beat phase by nudging to the nearest matching beat.
      const leadPeriod = 60 / lead.preciseTempo;
      const thisPeriod = 60 / deck.preciseTempo;
      const frac = (x: number) => x - Math.floor(x);
      const leadPhase = frac((lead.currentTime - lead.beatOffset) / leadPeriod);
      const thisPhase = frac((deck.currentTime - deck.beatOffset) / thisPeriod);
      let delta = leadPhase - thisPhase;
      if (delta > 0.5) delta -= 1;
      if (delta < -0.5) delta += 1;
      deck.seekTo(deck.currentTime + delta * thisPeriod);
      setDeck(side, { currentTime: deck.currentTime });
    },
    [applyTempo, setDeck],
  );

  const getTime = useCallback((side: DeckSide): number => engineRef.current?.deck(side).currentTime ?? 0, []);

  const getDetailPeaks = useCallback(
    (side: DeckSide): Float32Array | null => engineRef.current?.deck(side).detailPeaks ?? null,
    [],
  );

  // Press a hot-cue pad. An empty pad (or overwrite via shift/right-click)
  // stores the current position. A set pad parks the deck at the cue, paused,
  // until release — see hotCueRelease.
  const hotCuePress = useCallback((side: DeckSide, index: number, overwrite = false) => {
    const engine = engineRef.current;
    if (!engine) return;
    const deck = engine.deck(side);
    if (!deck.hasTrack) return;
    const setter = side === "left" ? setLeft : setRight;
    const key = `${side}:${index}`;
    setter((prev) => {
      const cues = [...prev.hotCues] as [number | null, number | null];
      const stored = cues[index];
      if (overwrite || stored == null) {
        cues[index] = deck.currentTime; // set / overwrite at the playhead
        cuePreviewRef.current[key] = false;
        return { ...prev, hotCues: cues };
      }
      // Park at the cue, paused; releasing the pad starts playback.
      deck.seekTo(stored);
      deck.pause();
      cuePreviewRef.current[key] = true;
      return { ...prev, hotCues: cues, currentTime: stored, playing: false };
    });
  }, []);

  // Release a hot-cue pad: if it parked the deck, start playing from the cue.
  const hotCueRelease = useCallback((side: DeckSide, index: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    const key = `${side}:${index}`;
    if (!cuePreviewRef.current[key]) return;
    cuePreviewRef.current[key] = false;
    const deck = engine.deck(side);
    void deck.play();
    const setter = side === "left" ? setLeft : setRight;
    setter((prev) => ({ ...prev, playing: deck.isPlaying }));
  }, []);

  // Clear a stored hot-cue (set it to null).
  const clearHotCue = useCallback((side: DeckSide, index: number) => {
    const setter = side === "left" ? setLeft : setRight;
    setter((prev) => {
      const cues = [...prev.hotCues] as [number | null, number | null];
      cues[index] = null;
      return { ...prev, hotCues: cues };
    });
  }, []);

  const setEq = useCallback(
    (side: DeckSide, band: EqBand, value: number) => {
      const engine = ensureEngine();
      engine.deck(side).setEq(band, value);
      const key = band === "high" ? "eqHigh" : band === "mid" ? "eqMid" : "eqLow";
      setDeck(side, { [key]: value } as Partial<DeckState>);
    },
    [ensureEngine, setDeck],
  );

  const setVolume = useCallback(
    (side: DeckSide, value: number) => {
      const engine = ensureEngine();
      engine.deck(side).setVolume(value);
      setDeck(side, { volume: value });
    },
    [ensureEngine, setDeck],
  );

  const setCrossfader = useCallback(
    (value: number) => {
      ensureEngine().setCrossfader(value);
      setCrossfaderState(value);
    },
    [ensureEngine],
  );

  const setMain = useCallback(
    (value: number) => {
      ensureEngine().setMain(value);
      setMainState(value);
    },
    [ensureEngine],
  );

  const scratch = useCallback(
    (side: DeckSide, delta: number) => {
      engineRef.current?.deck(side).scratch(delta);
    },
    [],
  );

  const scratchSeconds = useCallback(
    (side: DeckSide, seconds: number) => {
      const deck = engineRef.current?.deck(side);
      if (!deck) return;
      deck.scratchMove(seconds);
      setDeck(side, { currentTime: deck.currentTime });
    },
    [setDeck],
  );

  const seekBy = useCallback(
    (side: DeckSide, seconds: number) => {
      const deck = engineRef.current?.deck(side);
      if (!deck) return;
      deck.nudgeSeconds(seconds);
      setDeck(side, { currentTime: deck.currentTime });
    },
    [setDeck],
  );

  const setScratching = useCallback(
    (side: DeckSide, active: boolean) => {
      const engine = ensureEngine();
      engine.deck(side).setScratching(active);
      if (!active) scratchPosRef.current[side] = null;
      setDeck(side, { scratching: active });
    },
    [ensureEngine, setDeck],
  );

  // --- BLOOPPAD-MAXX sampler + sequencer ---------------------------------

  const loadSample = useCallback(
    (index: number, file: File) => {
      if (index < 0 || index > 7) return;
      const engine = ensureEngine();
      const loadId = ++sampleLoadRef.current[index];
      setSamples((prev) => prev.map((slot, i) => (i === index ? { name: file.name, loading: true, error: false } : slot)));
      file
        .arrayBuffer()
        .then((data) => engine.ctx.decodeAudioData(data))
        .then((buffer) => {
          if (sampleLoadRef.current[index] !== loadId) return;
          engine.sampler.setBuffer(index, buffer);
          setSamples((prev) => prev.map((slot, i) => (i === index ? { ...slot, loading: false } : slot)));
        })
        .catch(() => {
          if (sampleLoadRef.current[index] !== loadId) return;
          setSamples((prev) => prev.map((slot, i) => (i === index ? { ...slot, loading: false, error: true } : slot)));
        });
    },
    [ensureEngine],
  );

  const triggerSample = useCallback(
    (index: number) => {
      ensureEngine().sampler.trigger(index);
    },
    [ensureEngine],
  );

  const loadUserSample = useCallback(
    (bank: 0 | 1, index: number, file: File) => {
      if (index < 0 || index >= USER_BANK_SIZE) return;
      const engine = ensureEngine();
      const bufferIndex = (bank === 0 ? USER_1_BASE : USER_2_BASE) + index;
      const loadId = ++sampleLoadRef.current[bufferIndex];
      setUserBanks((prev) => {
        const next: [SampleSlot[], SampleSlot[]] = [[...prev[0]], [...prev[1]]];
        next[bank][index] = { name: file.name, loading: true, error: false };
        return next;
      });
      file
        .arrayBuffer()
        .then((data) => engine.ctx.decodeAudioData(data))
        .then((buffer) => {
          if (sampleLoadRef.current[bufferIndex] !== loadId) return;
          engine.sampler.setBuffer(bufferIndex, buffer);
          setUserBanks((prev) => {
            const next: [SampleSlot[], SampleSlot[]] = [[...prev[0]], [...prev[1]]];
            next[bank][index] = { ...next[bank][index], loading: false };
            return next;
          });
        })
        .catch(() => {
          if (sampleLoadRef.current[bufferIndex] !== loadId) return;
          setUserBanks((prev) => {
            const next: [SampleSlot[], SampleSlot[]] = [[...prev[0]], [...prev[1]]];
            next[bank][index] = { ...next[bank][index], loading: false, error: true };
            return next;
          });
        });
    },
    [ensureEngine],
  );

  const triggerUserSample = useCallback(
    (bank: 0 | 1, index: number) => {
      const bufferIndex = (bank === 0 ? USER_1_BASE : USER_2_BASE) + index;
      ensureEngine().sampler.trigger(bufferIndex);
    },
    [ensureEngine],
  );

  const setSamplerMode = useCallback((mode: SamplerMode) => {
    samplerModeRef.current = mode;
    setSamplerModeState(mode);
    setUserPressed(new Array<boolean>(USER_BANK_SIZE).fill(false));
  }, []);

  const toggleStep = useCallback((row: number, column: number) => {
    if (row < 0 || row > 7 || column < 0 || column > 7) return;
    setSequence((prev) => {
      const next = prev.map((steps) => [...steps]);
      next[row][column] = !next[row][column];
      sequenceRef.current = next;
      return next;
    });
  }, []);

  const setBpm = useCallback((bpm: number) => {
    if (!Number.isFinite(bpm)) return;
    setSequencerBpm(Math.max(40, Math.min(240, Math.round(bpm))));
  }, []);

  const stopSequencer = useCallback(() => {
    setSequencerPlaying(false);
    setCurrentStep(-1);
    nextStepRef.current = 0;
    engineRef.current?.sampler.stopAll();
  }, []);

  const toggleSequencer = useCallback(() => {
    setSequencerPlaying((playing) => !playing);
  }, []);

  const clearSequence = useCallback(() => {
    const next = emptySequence();
    sequenceRef.current = next;
    setSequence(next);
  }, []);

  // Web Audio look-ahead scheduler: queue notes 100 ms ahead while polling
  // every 25 ms. This avoids setInterval jitter without making UI sluggish.
  useEffect(() => {
    if (!sequencerPlaying) return;
    const engine = ensureEngine();
    const stepDuration = 30 / sequencerBpm; // eighth notes
    let nextStepTime = engine.ctx.currentTime + 0.05;
    let step = nextStepRef.current;
    const uiTimers = new Set<number>();

    const schedule = () => {
      while (nextStepTime < engine.ctx.currentTime + 0.1) {
        for (let row = 0; row < 8; row++) {
          if (sequenceRef.current[row][step]) engine.sampler.trigger(row, nextStepTime);
        }
        const shownStep = step;
        const delay = Math.max(0, (nextStepTime - engine.ctx.currentTime) * 1000);
        const timer = window.setTimeout(() => {
          uiTimers.delete(timer);
          setCurrentStep(shownStep);
        }, delay);
        uiTimers.add(timer);
        step = (step + 1) % 8;
        nextStepRef.current = step;
        nextStepTime += stepDuration;
      }
    };

    schedule();
    const id = window.setInterval(schedule, 25);
    return () => {
      window.clearInterval(id);
      for (const timer of uiTimers) window.clearTimeout(timer);
    };
  }, [sequencerPlaying, sequencerBpm, ensureEngine]);

  // --- Recording ----------------------------------------------------------

  const startRecording = useCallback(() => {
    const engine = ensureEngine();
    if (!engine.canRecord || engine.isRecording) return;
    // startRecording opens the "where to save" dialog, then streams to disk.
    void engine
      .startRecording()
      .then(() => {
        recordStartRef.current = Date.now();
        setRecordingElapsed(0);
        setRecording(true);
      })
      .catch((err: unknown) => {
        // The user dismissing the save dialog is not an error worth surfacing.
        if ((err as DOMException)?.name !== "AbortError") console.error("Recording failed:", err);
      });
  }, [ensureEngine]);

  const stopRecording = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || !engine.isRecording) return;
    setRecording(false);
    recordStartRef.current = null;
    void engine.stopRecording();
  }, []);

  const toggleRecording = useCallback(() => {
    if (engineRef.current?.isRecording) stopRecording();
    else startRecording();
  }, [startRecording, stopRecording]);

  // Tick the elapsed-time counter while recording.
  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => {
      if (recordStartRef.current != null) {
        setRecordingElapsed((Date.now() - recordStartRef.current) / 1000);
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [recording]);

  // --- Cue / headphone preview ---------------------------------------------

  const toggleCue = useCallback(
    (side: DeckSide) => {
      const engine = ensureEngine();
      const enabled = !(side === "left" ? left.cue : right.cue);
      engine.deck(side).setCue(enabled);
      setDeck(side, { cue: enabled });
    },
    [ensureEngine, setDeck, left.cue, right.cue],
  );

  const toggleSplitCue = useCallback(() => {
    const engine = ensureEngine();
    const next = !engine.splitCue;
    engine.setSplitCue(next);
    setSplitCueState(next);
  }, [ensureEngine]);

  const selectCueDevice = useCallback(() => {
    const engine = ensureEngine();
    if (!engine.canCue) return;
    void engine
      .selectCueOutput()
      .then((label) => setCueDeviceName(label))
      .catch((err: unknown) => {
        // The user dismissing the device picker is not an error worth surfacing.
        if ((err as DOMException)?.name !== "NotFoundError") console.error("Cue output selection failed:", err);
      });
  }, [ensureEngine]);

  // --- MIDI ---------------------------------------------------------------

  // Current 64-cell BLOOPPAD-MAXX colours, matching each pad's on-screen background colour,
  // with the playhead column lit full white. Keep in sync with TRACK_COLORS in BloopPad.tsx.
  // Reads refs (not state) so it can be called from the stable onBloopPadConnected handler below.
  const computeBloopPadColors = useCallback((): Array<readonly [number, number, number]> => {
    const colors: Array<readonly [number, number, number]> = [];
    if (samplerModeRef.current === "sequence") {
      for (let row = 0; row < 8; row++) {
        for (let column = 0; column < 8; column++) {
          const active = sequenceRef.current[row][column];
          const playhead = sequencerPlayingRef.current && column === currentStepRef.current;
          colors.push(playhead ? PLAYHEAD_RGB : active ? TRACK_COLORS_RGB[row] : GRID_OFF_RGB);
        }
      }
    } else {
      const bank = userBanksRef.current[samplerModeRef.current === "user1" ? 0 : 1];
      for (let index = 0; index < USER_BANK_SIZE; index++) {
        colors.push(bank[index].name ? TRACK_COLORS_RGB[Math.floor(index / 8)] : GRID_OFF_RGB);
      }
    }
    return colors;
  }, []);

  const connectMidi = useCallback(() => {
    ensureEngine();
    const controller = new MidiController({
      onStatus: (status, name) => {
        setMidiStatus(status);
        if (name) setDeviceName(name);
      },
      onAnalog: (cc, value) => {
        switch (cc) {
          // Top pot drives LOW, bottom pot drives HIGH (matches the hardware layout).
          case CC.LEFT_TOP:
            setEq("left", "low", value);
            break;
          case CC.LEFT_MID:
            setEq("left", "mid", value);
            break;
          case CC.LEFT_BOTTOM:
            setEq("left", "high", value);
            break;
          case CC.LEFT_FADER:
            setVolume("left", value);
            break;
          case CC.RIGHT_TOP:
            setEq("right", "low", value);
            break;
          case CC.RIGHT_MID:
            setEq("right", "mid", value);
            break;
          case CC.RIGHT_BOTTOM:
            setEq("right", "high", value);
            break;
          case CC.RIGHT_FADER:
            setVolume("right", value);
            break;
          case CC.CROSSFADER:
            setCrossfader(value);
            break;
        }
      },
      onScratchPosition: (side, position) => {
        const prev = scratchPosRef.current[side];
        scratchPosRef.current[side] = position;
        if (prev != null) scratch(side, wrapDelta(prev, position));
      },
      onScratchActive: (side, active) => setScratching(side, active),
      onBloopPadConnected: () => {
        midiRef.current?.setBloopPadLeds(computeBloopPadColors());
      },
      onBloopPadButton: (row, column, pressed) => {
        const mode = samplerModeRef.current;
        if (mode === "sequence") {
          if (pressed) toggleStep(row, column);
          return;
        }
        const index = row * 8 + column;
        setUserPressed((prev) => {
          const next = [...prev];
          next[index] = pressed;
          return next;
        });
        if (pressed) triggerUserSample(mode === "user1" ? 0 : 1, index);
      },
      onButton: (index, pressed) => {
        const side: DeckSide = index < 4 ? "left" : "right";
        // Map a hardware button slot to a UI pad. Slot 1 fires Hot 2 and slot 3
        // fires Cue (Cue and Hot 2 swapped vs. the UI's Play/Cue/Hot1/Hot2 order).
        const PAD_FOR_BUTTON = [0, 3, 2, 1] as const;
        const pad = PAD_FOR_BUTTON[index % 4];
        // Reflect the physical press as a visual pad animation.
        const setter = side === "left" ? setLeft : setRight;
        setter((prev) => {
          const padsPressed = [...prev.padsPressed] as DeckState["padsPressed"];
          padsPressed[pad] = pressed;
          return { ...prev, padsPressed };
        });
        // UI pads: 0 Play · 1 Cue · 2 Hot 1 · 3 Hot 2
        if (pad === 0) {
          if (pressed) togglePlay(side);
        } else if (pad === 1) {
          if (pressed) cue(side);
        } else {
          // Hot cues: park on press, play on release (hardware has no shift).
          const cueIndex = pad === 2 ? 0 : 1;
          if (pressed) hotCuePress(side, cueIndex);
          else hotCueRelease(side, cueIndex);
        }
      },
    });
    midiRef.current = controller;
    void controller.connect();
  }, [
    ensureEngine,
    setEq,
    setVolume,
    setCrossfader,
    scratch,
    setScratching,
    computeBloopPadColors,
    toggleStep,
    triggerUserSample,
    togglePlay,
    cue,
    hotCuePress,
    hotCueRelease,
  ]);

  // Push play position into state a few times a second for the displays.
  useEffect(() => {
    const id = window.setInterval(() => {
      const engine = engineRef.current;
      if (!engine) return;
      setLeft((p) =>
        p.trackName
          ? { ...p, currentTime: engine.left.currentTime, duration: engine.left.duration, playing: engine.left.isPlaying }
          : p,
      );
      setRight((p) =>
        p.trackName
          ? { ...p, currentTime: engine.right.currentTime, duration: engine.right.duration, playing: engine.right.isPlaying }
          : p,
      );
    }, 250);
    return () => window.clearInterval(id);
  }, []);

  // Mirror deck/pad state onto the controller LEDs.
  useEffect(() => {
    const midi = midiRef.current;
    if (!midi || midiStatus !== "connected") return;
    // LED order matches the pad order: Play · Hot 2 · Hot 1 · Cue
    const ledsFor = (d: DeckState): number[] => [
      d.playing ? LED_COLOR.GREEN : d.trackName ? LED_COLOR.WARM_WHITE : LED_COLOR.OFF,
      d.hotCues[1] != null ? LED_COLOR.ORANGE_RED : LED_COLOR.OFF,
      d.hotCues[0] != null ? LED_COLOR.BLUE : LED_COLOR.OFF,
      d.trackName ? LED_COLOR.TEAL : LED_COLOR.OFF,
    ];
    midi.setLeds([...ledsFor(left), ...ledsFor(right)]);
  }, [left, right, midiStatus]);

  // Keep read-only mirrors of state that computeBloopPadColors needs to read
  // from the stable onBloopPadConnected handler (see connectMidi below).
  useEffect(() => {
    userBanksRef.current = userBanks;
    sequencerPlayingRef.current = sequencerPlaying;
    currentStepRef.current = currentStep;
  }, [userBanks, sequencerPlaying, currentStep]);

  // Mirror active mode onto all 64 BLOOPPAD RGB LEDs whenever it changes.
  useEffect(() => {
    const midi = midiRef.current;
    if (!midi || midiStatus !== "connected") return;
    midi.setBloopPadLeds(computeBloopPadColors());
  }, [userBanks, samplerMode, sequence, sequencerPlaying, currentStep, midiStatus, computeBloopPadColors]);

  // Tear down on unmount.
  useEffect(() => {
    const covers = coverUrlRef.current;
    return () => {
      engineRef.current?.destroy();
      if (covers.left) URL.revokeObjectURL(covers.left);
      if (covers.right) URL.revokeObjectURL(covers.right);
    };
  }, []);

  return useMemo(
    () => ({
      left,
      right,
      crossfader,
      main,
      midiStatus,
      midiSupported: typeof navigator !== "undefined" && "requestMIDIAccess" in navigator,
      deviceName,
      sampler: {
        samples,
        userBanks,
        userPressed,
        mode: samplerMode,
        sequence,
        playing: sequencerPlaying,
        bpm: sequencerBpm,
        currentStep,
        loadSample,
        loadUserSample,
        triggerSample,
        triggerUserSample,
        setMode: setSamplerMode,
        toggleStep,
        setBpm,
        togglePlaying: toggleSequencer,
        stop: stopSequencer,
        clear: clearSequence,
      },
      recording,
      recordingSupported: typeof window !== "undefined" && "showSaveFilePicker" in window,
      recordingElapsed,
      cueSupported:
        typeof navigator !== "undefined" &&
        !!navigator.mediaDevices &&
        "selectAudioOutput" in navigator.mediaDevices &&
        typeof HTMLMediaElement !== "undefined" &&
        "setSinkId" in HTMLMediaElement.prototype,
      cueDeviceName,
      selectCueDevice,
      toggleCue,
      splitCue,
      toggleSplitCue,
      connectMidi,
      loadFile,
      togglePlay,
      cue,
      hotCuePress,
      hotCueRelease,
      clearHotCue,
      seek,
      sync,
      setTempo: applyTempo,
      resetTempo,
      getTime,
      getDetailPeaks,
      setEq,
      setVolume,
      setCrossfader,
      setMain,
      scratch,
      scratchSeconds,
      seekBy,
      setScratching,
      startRecording,
      stopRecording,
      toggleRecording,
    }),
    [left, right, crossfader, main, midiStatus, deviceName, samples, userBanks, userPressed, samplerMode, sequence, sequencerPlaying, sequencerBpm, currentStep, loadSample, loadUserSample, triggerSample, triggerUserSample, setSamplerMode, toggleStep, setBpm, toggleSequencer, stopSequencer, clearSequence, connectMidi, loadFile, togglePlay, cue, hotCuePress, hotCueRelease, clearHotCue, seek, sync, applyTempo, resetTempo, getTime, getDetailPeaks, setEq, setVolume, setCrossfader, setMain, scratch, scratchSeconds, seekBy, setScratching, recording, recordingElapsed, startRecording, stopRecording, toggleRecording, cueDeviceName, selectCueDevice, toggleCue, splitCue, toggleSplitCue],
  );
}
