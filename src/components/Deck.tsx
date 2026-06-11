import { useRef } from "react";
import type { DeckSide } from "../lib/audio";
import type { DeckState, MixerApi } from "../lib/useMixer";
import { Knob } from "./Knob";
import { Fader } from "./Fader";
import { JogWheel } from "./JogWheel";
import { Pad } from "./Pad";
import { Waveform } from "./Waveform";
import { BeatWaveform } from "./BeatWaveform";
import type { CueMarker } from "./BeatWaveform";

interface DeckProps {
  side: DeckSide;
  state: DeckState;
  mixer: MixerApi;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function Deck({ side, state, mixer }: DeckProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const isLeft = side === "left";

  const borderAccent = isLeft ? "border-fri3d-purple" : "border-fri3d-mint";
  const titleAccent = isLeft ? "text-fri3d-purple" : "text-fri3d-mint-dark";
  const jogAccent = isLeft ? "bg-fri3d-purple" : "bg-fri3d-mint-dark";
  const faderAccent = isLeft ? "bg-fri3d-purple" : "bg-fri3d-mint";
  const waveColor = isLeft ? "rgb(192,133,255)" : "rgb(60,232,179)";

  const fraction = state.duration > 0 ? state.currentTime / state.duration : 0;
  const progress = fraction * 100;

  const pitch = (state.tempo - 1) * 100;
  const tempoShifted = Math.abs(pitch) > 0.05;

  const cueMarkers: CueMarker[] = [];
  if (state.hotCues[0] != null) cueMarkers.push({ time: state.hotCues[0], color: "#36c5ff", label: "1" });
  if (state.hotCues[1] != null) cueMarkers.push({ time: state.hotCues[1], color: "#ff5bd0", label: "2" });

  return (
    <section className={`flex flex-col gap-4 border-8 bg-white p-5 ${borderAccent}`}>
      <header className="flex items-center justify-between gap-3">
        <h2 className={`font-display text-2xl font-bold uppercase ${titleAccent}`}>
          Deck {isLeft ? "A" : "B"}
        </h2>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded-md border-4 border-black bg-fri3d-mint px-3 py-2 font-display text-xs font-bold uppercase shadow-hard-sm transition-transform active:translate-x-1 active:translate-y-1 active:shadow-none"
        >
          Load track
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) mixer.loadFile(side, file);
            e.target.value = "";
          }}
        />
      </header>

      {/* Track display */}
      <div className="rounded-md border-4 border-black bg-fri3d-darkgrey px-3 py-2 text-white">
        <div className="truncate font-display text-sm font-semibold">
          {state.trackName ?? "No track loaded"}
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/20">
          <div className="h-full bg-fri3d-orange" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-1 flex justify-between font-display text-[0.65rem] tabular-nums">
          <span>{formatTime(state.currentTime)}</span>
          <span>{formatTime(state.duration)}</span>
        </div>
      </div>

      {/* Waveform overview */}
      <Waveform
        peaks={state.peaks}
        progress={fraction}
        playedColor={waveColor}
        onSeek={(f) => mixer.seek(side, f)}
      />

      {/* BPM + beat sync */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className={`font-display text-3xl font-bold tabular-nums ${titleAccent}`}>
            {state.bpm != null ? (tempoShifted ? state.effectiveBpm?.toFixed(1) : state.bpm) : "—"}
          </span>
          <span className="font-display text-xs font-semibold uppercase text-fri3d-darkgrey">BPM</span>
          {tempoShifted && state.bpm != null && (
            <span className="font-display text-xs font-semibold tabular-nums text-fri3d-red">
              {pitch > 0 ? "+" : ""}
              {pitch.toFixed(1)}% · {state.bpm}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => mixer.sync(side)}
            disabled={state.bpm == null}
            className="rounded-md border-4 border-black bg-fri3d-purple px-3 py-1.5 font-display text-xs font-bold uppercase text-white shadow-hard-sm transition-transform enabled:active:translate-x-1 enabled:active:translate-y-1 enabled:active:shadow-none disabled:opacity-40"
          >
            Sync
          </button>
          <button
            type="button"
            onClick={() => mixer.resetTempo(side)}
            disabled={!tempoShifted}
            className="rounded-md border-4 border-black bg-white px-3 py-1.5 font-display text-xs font-bold uppercase shadow-hard-sm transition-transform enabled:active:translate-x-1 enabled:active:translate-y-1 enabled:active:shadow-none disabled:opacity-40"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Zoomed waveform with beat grid */}
      <BeatWaveform
        getTime={() => mixer.getTime(side)}
        getDetailPeaks={() => mixer.getDetailPeaks(side)}
        duration={state.duration}
        tempo={state.preciseTempo}
        beatOffset={state.beatOffset}
        accentColor={waveColor}
        markers={cueMarkers}
        onSeek={(s) => mixer.seekBy(side, s)}
      />

      {/* Jog + EQ */}
      <div className={`flex items-center gap-4 ${isLeft ? "flex-row" : "flex-row-reverse"}`}>
        <JogWheel
          playing={state.playing}
          scratching={state.scratching}
          accentClass={jogAccent}
          onScratch={(d) => mixer.scratch(side, d)}
          onScratchActive={(a) => mixer.setScratching(side, a)}
        />
        <div className="flex flex-1 items-end justify-center gap-3">
          <div className="flex flex-col items-center gap-3">
            <Knob label="High" value={state.eqHigh} onChange={(v) => mixer.setEq(side, "high", v)} />
            <Knob label="Mid" value={state.eqMid} onChange={(v) => mixer.setEq(side, "mid", v)} />
            <Knob label="Low" value={state.eqLow} onChange={(v) => mixer.setEq(side, "low", v)} />
          </div>
          <Fader label="Volume" value={state.volume} onChange={(v) => mixer.setVolume(side, v)} accentClass={faderAccent} />
        </div>
      </div>

      {/* Pads */}
      <div className="grid grid-cols-4 gap-2">
        <Pad label="Play" sub={state.playing ? "playing" : "paused"} active={state.playing} pressed={state.padsPressed[0]} onTrigger={() => mixer.togglePlay(side)} />
        <Pad label="Cue" sub="to start" pressed={state.padsPressed[1]} onTrigger={() => mixer.cue(side)} />
        <Pad label="Hot 1" sub={state.hotCues[0] != null ? formatTime(state.hotCues[0]) : "set"} hot={state.hotCues[0] != null} pressed={state.padsPressed[2]} onTrigger={() => mixer.hotCue(side, 0)} />
        <Pad label="Hot 2" sub={state.hotCues[1] != null ? formatTime(state.hotCues[1]) : "set"} hot={state.hotCues[1] != null} pressed={state.padsPressed[3]} onTrigger={() => mixer.hotCue(side, 1)} />
      </div>
    </section>
  );
}
