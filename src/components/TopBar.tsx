import type { MidiStatus } from "../lib/midi";

interface TopBarProps {
  status: MidiStatus;
  supported: boolean;
  deviceName?: string;
  onConnect: () => void;
  /** Opens the onboarding tutorial. */
  onHelp: () => void;
  /** Whether the master output is currently being recorded. */
  recording: boolean;
  /** Whether recording is supported in this browser. */
  recordingSupported: boolean;
  /** Seconds elapsed in the current recording. */
  recordingElapsed: number;
  /** Start/stop recording the master output. */
  onToggleRecording: () => void;
}

const STATUS_TEXT: Record<MidiStatus, string> = {
  unsupported: "Web MIDI not supported in this browser",
  idle: "No controller connected",
  connecting: "Connecting…",
  connected: "Controller connected",
  error: "MIDI connection failed",
};

/** Format seconds as m:ss for the recording timer. */
function formatElapsed(seconds: number): string {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function TopBar({
  status,
  supported,
  deviceName,
  onConnect,
  onHelp,
  recording,
  recordingSupported,
  recordingElapsed,
  onToggleRecording,
}: TopBarProps) {
  const live = status === "connected";
  return (
    <header className="grid grid-cols-[auto_1fr_auto_auto_auto] items-stretch bg-black text-white">
      <div className="flex items-center gap-3 px-4 py-3 font-display text-xl font-bold uppercase">
        <img src="/fri3d-logo-white.svg" alt="Fri3d" className="h-8 w-auto" />
        <span className="text-fri3d-mint">Scratcher</span>
      </div>

      <div
        className={`flex items-center px-4 font-display text-xs font-semibold uppercase tracking-wide sm:text-sm ${
          live ? "bg-fri3d-mint-dark text-black" : "bg-fri3d-red text-white"
        }`}
      >
        <span className="truncate">
          {STATUS_TEXT[status]}
          {live && deviceName ? ` · ${deviceName}` : ""}
        </span>
      </div>

      <button
        type="button"
        onClick={onToggleRecording}
        disabled={!recordingSupported}
        aria-pressed={recording}
        title={recordingSupported ? "Record your set to an MP3 file on disk" : "Recording needs a Chromium-based browser"}
        className={`m-2 flex items-center gap-2 rounded-md border-4 border-white px-4 py-2 font-display text-xs font-bold uppercase text-white transition-transform enabled:active:translate-x-0.5 enabled:active:translate-y-0.5 disabled:opacity-50 ${
          recording ? "bg-fri3d-red" : "bg-black"
        }`}
      >
        <span
          className={`inline-block h-3 w-3 rounded-full bg-fri3d-red ${recording ? "animate-pulse bg-white" : ""}`}
        />
        {recording ? `Rec ${formatElapsed(recordingElapsed)}` : "Record"}
      </button>

      <button
        type="button"
        data-tutorial="connect"
        onClick={onConnect}
        disabled={!supported || status === "connecting"}
        className="m-2 rounded-md border-4 border-white bg-fri3d-purple px-4 py-2 font-display text-xs font-bold uppercase text-white transition-transform enabled:active:translate-x-0.5 enabled:active:translate-y-0.5 disabled:opacity-50"
      >
        {live ? "Reconnect" : "Connect controller"}
      </button>

      <button
        type="button"
        onClick={onHelp}
        aria-label="Open tutorial"
        title="Tutorial"
        className="m-2 ml-0 rounded-md border-4 border-white bg-fri3d-mint px-3 py-2 font-display text-xs font-bold uppercase text-black transition-transform active:translate-x-0.5 active:translate-y-0.5"
      >
        ?
      </button>
    </header>
  );
}
