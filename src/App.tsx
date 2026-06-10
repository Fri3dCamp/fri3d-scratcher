import { useMixer } from "./lib/useMixer";
import { TopBar } from "./components/TopBar";
import { Deck } from "./components/Deck";
import { MixerPanel } from "./components/MixerPanel";

export function App() {
  const mixer = useMixer();

  return (
    <div className="grid min-h-screen grid-rows-[auto_1fr_auto] bg-white text-black">
      <TopBar
        status={mixer.midiStatus}
        supported={mixer.midiSupported}
        deviceName={mixer.deviceName}
        onConnect={mixer.connectMidi}
      />

      <main className="mx-auto grid w-full max-w-[1400px] grid-cols-1 gap-6 p-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <Deck side="left" state={mixer.left} mixer={mixer} />
        </div>
        <div className="lg:col-span-2">
          <MixerPanel mixer={mixer} />
        </div>
        <div className="lg:col-span-5">
          <Deck side="right" state={mixer.right} mixer={mixer} />
        </div>
      </main>

      <footer className="bg-black px-6 py-5 text-white">
        <p className="font-display text-sm font-semibold uppercase tracking-wide">
          Fri3d Scratcher
        </p>
        <p className="mt-1 text-xs text-white/70">
          Load your own tracks, mix with the crossfader, and connect the Fri3d DJ addon over
          Web MIDI. Drag the knobs, faders and platters with your mouse, or twist the real thing.
        </p>
      </footer>
    </div>
  );
}
