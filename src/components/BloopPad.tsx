import { useRef, useState } from "react";
import type { SamplerApi, SamplerMode } from "../lib/useMixer";

interface BloopPadProps {
  sampler: SamplerApi;
}

const TRACK_COLORS = [
  "bg-fri3d-purple-light",
  "bg-fri3d-orange",
  "bg-fri3d-mint",
  "bg-fri3d-red text-white",
  "bg-blue-400",
  "bg-pink-400",
  "bg-yellow-300",
  "bg-cyan-300",
];

const MODES: { id: SamplerMode; label: string }[] = [
  { id: "sequence", label: "Sequencer" },
  { id: "user1", label: "User 1" },
  { id: "user2", label: "User 2" },
];

export function BloopPad({ sampler }: BloopPadProps) {
  return (
    <section className="mt-8 border-4 border-black bg-white p-4 shadow-hard" aria-labelledby="bloop-title">
      <div className="mb-4 flex flex-wrap items-center gap-3 border-b-4 border-black pb-4">
        <div className="mr-auto">
          <h2 id="bloop-title" className="font-display text-xl font-bold uppercase">
            BLOOPPAD-MAXX
          </h2>
          <p className="text-xs text-fri3d-darkgrey">Sequencer plus two Launchpad-style 8×8 sample banks</p>
        </div>

        <div className="flex gap-2" role="tablist" aria-label="BLOOPPAD mode">
          {MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              role="tab"
              aria-selected={sampler.mode === mode.id}
              onClick={() => sampler.setMode(mode.id)}
              className={`rounded-md border-4 border-black px-3 py-2 font-display text-xs font-bold uppercase ${
                sampler.mode === mode.id ? "bg-fri3d-purple text-white shadow-none" : "bg-white shadow-hard-sm"
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {sampler.mode === "sequence" ? (
        <Sequencer sampler={sampler} />
      ) : (
        <UserBank sampler={sampler} bank={sampler.mode === "user1" ? 0 : 1} />
      )}
    </section>
  );
}

function Sequencer({ sampler }: BloopPadProps) {
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
        <label className="flex items-center gap-2 font-display text-xs font-bold uppercase">
          BPM
          <input
            type="number"
            min={40}
            max={240}
            value={sampler.bpm}
            onChange={(event) => sampler.setBpm(event.currentTarget.valueAsNumber)}
            className="w-18 rounded-md border-4 border-black px-2 py-2 text-center text-sm"
          />
        </label>
        <ControlButton onClick={sampler.togglePlaying} active={sampler.playing}>
          {sampler.playing ? "Pause" : "Play"}
        </ControlButton>
        <ControlButton onClick={sampler.stop}>Stop</ControlButton>
        <ControlButton onClick={sampler.clear}>Clear</ControlButton>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="min-w-205 space-y-2">
          <div className="grid grid-cols-[13rem_repeat(8,minmax(0,1fr))] gap-2">
            <span />
            {Array.from({ length: 8 }, (_, step) => (
              <span
                key={step}
                className={`text-center font-display text-xs font-bold ${sampler.currentStep === step ? "text-fri3d-red" : ""}`}
              >
                {step + 1}
              </span>
            ))}
          </div>

          {sampler.samples.map((sample, row) => (
            <div key={row} className="grid grid-cols-[13rem_repeat(8,minmax(0,1fr))] gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => sampler.triggerSample(row)}
                  disabled={!sample.name || sample.loading}
                  title={sample.name ? `Play ${sample.name}` : "Load a sample first"}
                  className={`h-11 w-11 shrink-0 rounded-md border-4 border-black font-display text-xs font-bold shadow-hard-sm enabled:active:translate-x-1 enabled:active:translate-y-1 enabled:active:shadow-none disabled:opacity-40 ${TRACK_COLORS[row]}`}
                >
                  ▶ {row + 1}
                </button>
                <label className="min-w-0 flex-1 cursor-pointer rounded-md border-2 border-black px-2 py-1.5 text-xs hover:bg-black hover:text-white">
                  <span className="block truncate font-semibold">
                    {sample.loading ? "Decoding…" : sample.error ? "Could not load" : sample.name ?? "Load sample"}
                  </span>
                  <input
                    type="file"
                    accept="audio/*"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      if (file) sampler.loadSample(row, file);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>

              {sampler.sequence[row].map((active, column) => {
                const playhead = sampler.playing && sampler.currentStep === column;
                return (
                  <button
                    key={column}
                    type="button"
                    onClick={() => sampler.toggleStep(row, column)}
                    aria-label={`Track ${row + 1}, step ${column + 1}`}
                    aria-pressed={active}
                    className={`h-11 rounded-md border-4 border-black transition-transform active:scale-90 ${
                      active ? TRACK_COLORS[row] : "bg-neutral-200"
                    } ${playhead ? "ring-4 ring-fri3d-red ring-offset-2" : ""}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <p className="mt-3 text-xs text-fri3d-darkgrey">
        Kick, snare, hi-hats, clap, tom, rim, and cowbell are ready to play. Click a sound name to replace it. BLOOPPAD grid toggles matching steps.
      </p>
    </>
  );
}

function UserBank({ sampler, bank }: BloopPadProps & { bank: 0 | 1 }) {
  const [assigning, setAssigning] = useState(false);
  const pendingPad = useRef(0);
  const singleInput = useRef<HTMLInputElement>(null);
  const slots = sampler.userBanks[bank];

  const chooseFile = (index: number) => {
    pendingPad.current = index;
    singleInput.current?.click();
  };

  return (
    <div role="tabpanel">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h3 className="font-display text-lg font-bold uppercase">User {bank + 1} sample bank</h3>
          <p className="text-xs text-fri3d-darkgrey">Each pad holds an independent one-shot sample. Sounds may overlap.</p>
        </div>
        <ControlButton onClick={() => setAssigning((value) => !value)} active={assigning}>
          {assigning ? "Assigning pads" : "Assign one"}
        </ControlButton>
        <label className="cursor-pointer rounded-md border-4 border-black bg-fri3d-orange px-4 py-2 font-display text-xs font-bold uppercase shadow-hard-sm active:translate-x-1 active:translate-y-1 active:shadow-none">
          Load bank
          <input
            type="file"
            accept="audio/*"
            multiple
            className="sr-only"
            onChange={(event) => {
              [...(event.currentTarget.files ?? [])].slice(0, 64).forEach((file, index) => sampler.loadUserSample(bank, index, file));
              event.currentTarget.value = "";
            }}
          />
        </label>
        <input
          ref={singleInput}
          type="file"
          accept="audio/*"
          className="sr-only"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) sampler.loadUserSample(bank, pendingPad.current, file);
            event.currentTarget.value = "";
          }}
        />
      </div>

      <div className="mx-auto grid max-w-220 grid-cols-8 gap-2">
        {slots.map((slot, index) => {
          const row = Math.floor(index / 8);
          const pressed = sampler.userPressed[index];
          return (
            <button
              key={index}
              type="button"
              onClick={() => (assigning ? chooseFile(index) : sampler.triggerUserSample(bank, index))}
              onContextMenu={(event) => {
                event.preventDefault();
                chooseFile(index);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files[0];
                if (file?.type.startsWith("audio/")) sampler.loadUserSample(bank, index, file);
              }}
              aria-label={`${slot.name ? `Play ${slot.name}` : "Empty"}, pad ${index + 1}`}
              className={`aspect-square min-w-0 rounded-md border-4 border-black p-1 font-display text-[0.55rem] font-bold uppercase leading-tight transition-transform ${
                slot.name ? TRACK_COLORS[row] : "bg-neutral-200 text-neutral-500"
              } ${pressed ? "scale-90 ring-4 ring-white" : "active:scale-90"}`}
            >
              <span className="block text-[0.5rem] opacity-60">{index + 1}</span>
              <span className="block overflow-hidden text-ellipsis">{slot.loading ? "Loading…" : slot.error ? "Error" : slot.name ?? "+"}</span>
            </button>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-fri3d-darkgrey">
        Click pads to play. Enable <strong>Assign one</strong>, right-click, or drop an audio file to replace a pad. <strong>Load bank</strong> maps up to 64 selected files in order. Hardware pads follow active User mode with RGB feedback.
      </p>
    </div>
  );
}

function ControlButton({ children, onClick, active = false }: { children: React.ReactNode; onClick: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-md border-4 border-black px-4 py-2 font-display text-xs font-bold uppercase shadow-hard-sm active:translate-x-1 active:translate-y-1 active:shadow-none ${
        active ? "bg-fri3d-red text-white" : "bg-fri3d-mint"
      }`}
    >
      {children}
    </button>
  );
}
