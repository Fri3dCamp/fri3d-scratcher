import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { computePeaks, MixerEngine } from "./audio";
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
  setEq: (side: DeckSide, band: EqBand, value: number) => void;
  setVolume: (side: DeckSide, value: number) => void;
  setCrossfader: (value: number) => void;
  setMaster: (value: number) => void;
  /** Jog/scratch from the UI (drag). delta in ticks, active = touching. */
  scratch: (side: DeckSide, delta: number) => void;
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
      });
      // Decode a separate copy to draw the waveform (playback uses MediaElement).
      file
        .arrayBuffer()
        .then((buf) => engine.ctx.decodeAudioData(buf))
        .then((audioBuffer) => setDeck(side, { peaks: computePeaks(audioBuffer) }))
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
      setEq,
      setVolume,
      setCrossfader,
      setMaster,
      scratch,
      setScratching,
    }),
    [left, right, crossfader, master, midiStatus, deviceName, connectMidi, loadFile, togglePlay, cue, hotCue, seek, setEq, setVolume, setCrossfader, setMaster, scratch, setScratching],
  );
}
