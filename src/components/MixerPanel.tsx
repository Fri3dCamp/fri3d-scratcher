import type { MixerApi } from "../lib/useMixer";
import { Fader } from "./Fader";
import { Crossfader } from "./Crossfader";

interface MixerPanelProps {
  mixer: MixerApi;
}

// Centre column: main volume and the crossfader.
export function MixerPanel({ mixer }: MixerPanelProps) {
  return (
    <section className="flex flex-col items-center gap-6 border-8 border-black bg-fri3d-orange p-5">
      <h2 className="font-display text-xl font-bold uppercase text-black">Mixer</h2>

      <Fader label="Main" value={mixer.main} onChange={mixer.setMain} accentClass="bg-fri3d-red" />

      <div data-tutorial="crossfader" className="w-full border-t-4 border-black/30 pt-5">
        <Crossfader value={mixer.crossfader} onChange={mixer.setCrossfader} />
      </div>
    </section>
  );
}
