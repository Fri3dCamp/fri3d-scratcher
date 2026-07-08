import { useCallback, useState } from "react";
import { useMixer } from "./lib/useMixer";
import { TopBar } from "./components/TopBar";
import { Deck } from "./components/Deck";
import { MixerPanel } from "./components/MixerPanel";
import { Tutorial } from "./components/Tutorial";
import { DEMO_TRACKS } from "./lib/demoTracks";
import type { DeckSide } from "./lib/audio";

const TUTORIAL_SEEN_KEY = "fri3d-scratcher-tutorial-seen";

export function App() {
  const mixer = useMixer();
  // Show the tutorial automatically on the first visit.
  const [tutorialOpen, setTutorialOpen] = useState(
    () => localStorage.getItem(TUTORIAL_SEEN_KEY) == null,
  );

  const closeTutorial = useCallback(() => {
    localStorage.setItem(TUTORIAL_SEEN_KEY, "1");
    setTutorialOpen(false);
  }, []);

  // Fetch the two example songs and load one into each deck.
  const loadDemoTracks = useCallback(async () => {
    const sides: DeckSide[] = ["left", "right"];
    await Promise.all(
      DEMO_TRACKS.map(async (track, i) => {
        const res = await fetch(track.url);
        if (!res.ok) throw new Error(`Failed to fetch ${track.url}`);
        const blob = await res.blob();
        const file = new File([blob], track.name, { type: blob.type || "audio/mpeg" });
        mixer.loadFile(sides[i], file);
      }),
    );
  }, [mixer]);

  return (
    <div className="grid min-h-screen grid-rows-[auto_1fr] bg-white text-black">
      <TopBar
        status={mixer.midiStatus}
        supported={mixer.midiSupported}
        deviceName={mixer.deviceName}
        onConnect={mixer.connectMidi}
        onHelp={() => setTutorialOpen(true)}
        recording={mixer.recording}
        recordingSupported={mixer.recordingSupported}
        recordingElapsed={mixer.recordingElapsed}
        onToggleRecording={mixer.toggleRecording}
      />

      <main className="mx-auto grid w-full max-w-350 grid-cols-1 gap-6 p-6 lg:grid-cols-12">
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

      <Tutorial open={tutorialOpen} onClose={closeTutorial} onLoadDemo={loadDemoTracks} />
    </div>
  );
}
