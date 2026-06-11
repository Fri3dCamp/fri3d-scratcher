import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { analyze, guess } from "web-audio-beat-detector";
import { computeDetailPeaks, computePeaks, MixerEngine } from "./audio";
import type { DeckSide, EqBand } from "./audio";
import { CC, LED_COLOR, MidiController, wrapDelta } from "./midi";
import type { MidiStatus } from "./midi";

export interface DeckState {
  trackName: string | null;
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
}

const initialDeck = (): DeckState => ({
  trackName: null,
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
});

export interface MixerApi {
  left: DeckState;
  right: DeckState;
  crossfader: number;
  master: number;
  midiStatus: MidiStatus;
  midiSupported: boolean;
  deviceName?: string;

  connectMidi: () => void;
  loadFile: (side: DeckSide, file: File) => void;
  togglePlay: (side: DeckSide) => void;
  cue: (side: DeckSide) => void;
  hotCue: (side: DeckSide, index: number) => void;
  /** Seek to a fraction (0..1) of the track. */
  seek: (side: DeckSide, fraction: number) => void;
  /** Match this deck's tempo + beat phase to the other deck. */
  sync: (side: DeckSide) => void;
  /** Reset this deck's tempo multiplier to 1. */
  resetTempo: (side: DeckSide) => void;
  /** Live playback position (seconds) — for animated views. */
  getTime: (side: DeckSide) => number;
  /** High-res waveform peaks for the zoom view. */
  getDetailPeaks: (side: DeckSide) => Float32Array | null;
  setEq: (side: DeckSide, band: EqBand, value: number) => void;
  setVolume: (side: DeckSide, value: number) => void;
  setCrossfader: (value: number) => void;
  setMaster: (value: number) => void;
  /** Jog/scratch from the UI (drag). delta in ticks, active = touching. */
  scratch: (side: DeckSide, delta: number) => void;
  /** Seek by a relative number of seconds (beat-window drag). */
  seekBy: (side: DeckSide, seconds: number) => void;
  setScratching: (side: DeckSide, active: boolean) => void;
}

export function useMixer(): MixerApi {
  const engineRef = useRef<MixerEngine | null>(null);
  const midiRef = useRef<MidiController | null>(null);
  const scratchPosRef = useRef<{ left: number | null; right: number | null }>({
    left: null,
    right: null,
  });

  const [left, setLeft] = useState<DeckState>(initialDeck);
  const [right, setRight] = useState<DeckState>(initialDeck);
  const [crossfader, setCrossfaderState] = useState(0.5);
  const [master, setMasterState] = useState(0.9);
  const [midiStatus, setMidiStatus] = useState<MidiStatus>("idle");
  const [deviceName, setDeviceName] = useState<string | undefined>(undefined);

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
      setDeck(side, {
        trackName: name,
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
      // Decode a separate copy for the waveform + beat analysis (playback uses
      // the MediaElement). Peaks render first; BPM detection follows.
      file
        .arrayBuffer()
        .then((buf) => engine.ctx.decodeAudioData(buf))
        .then(async (audioBuffer) => {
          const deck = engine.deck(side);
          deck.detailPeaks = computeDetailPeaks(audioBuffer);
          setDeck(side, { peaks: computePeaks(audioBuffer) });
          try {
            // analyze() gives the precise tempo; guess() gives the rounded BPM
            // and the first-beat offset (the grid phase).
            const [tempo, { bpm, offset }] = await Promise.all([analyze(audioBuffer), guess(audioBuffer)]);
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

  const hotCue = useCallback(
    (side: DeckSide, index: number) => {
      const engine = engineRef.current;
      if (!engine) return;
      const deck = engine.deck(side);
      if (!deck.hasTrack) return;
      const setter = side === "left" ? setLeft : setRight;
      setter((prev) => {
        const cues = [...prev.hotCues] as [number | null, number | null];
        const stored = cues[index];
        if (stored == null) {
          cues[index] = deck.currentTime;
        } else {
          deck.seekTo(stored);
          if (!deck.isPlaying) void deck.play();
        }
        return { ...prev, hotCues: cues, playing: deck.isPlaying };
      });
    },
    [],
  );

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

  const setMaster = useCallback(
    (value: number) => {
      ensureEngine().setMaster(value);
      setMasterState(value);
    },
    [ensureEngine],
  );

  const scratch = useCallback(
    (side: DeckSide, delta: number) => {
      engineRef.current?.deck(side).scratch(delta);
    },
    [],
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

  // --- MIDI ---------------------------------------------------------------

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
        if (!pressed) return; // act on press, ignore release
        // UI pads: 0 Play · 1 Cue · 2 Hot 1 · 3 Hot 2
        if (pad === 0) togglePlay(side);
        else if (pad === 1) cue(side);
        else if (pad === 2) hotCue(side, 0);
        else hotCue(side, 1);
      },
    });
    midiRef.current = controller;
    void controller.connect();
  }, [ensureEngine, setEq, setVolume, setCrossfader, scratch, setScratching, togglePlay, cue, hotCue]);

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

  // Tear down on unmount.
  useEffect(() => {
    return () => engineRef.current?.destroy();
  }, []);

  return useMemo(
    () => ({
      left,
      right,
      crossfader,
      master,
      midiStatus,
      midiSupported: typeof navigator !== "undefined" && "requestMIDIAccess" in navigator,
      deviceName,
      connectMidi,
      loadFile,
      togglePlay,
      cue,
      hotCue,
      seek,
      sync,
      resetTempo,
      getTime,
      getDetailPeaks,
      setEq,
      setVolume,
      setCrossfader,
      setMaster,
      scratch,
      seekBy,
      setScratching,
    }),
    [left, right, crossfader, master, midiStatus, deviceName, connectMidi, loadFile, togglePlay, cue, hotCue, seek, sync, resetTempo, getTime, getDetailPeaks, setEq, setVolume, setCrossfader, setMaster, scratch, seekBy, setScratching],
  );
}
