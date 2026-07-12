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
  const logoUrl = `${import.meta.env.BASE_URL}fri3d-logo-white.svg`;

  return (
    <header className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-stretch bg-black text-white">
      <div className="flex items-center gap-3 px-4 py-3 font-display text-xl font-bold uppercase">
        <img src={logoUrl} alt="Fri3d" className="h-8 w-auto" />
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

      <a
        href="https://github.com/Fri3dCamp/fri3d-scratcher"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="View source code on GitHub"
        title="Source code"
        className="m-2 ml-0 flex items-center justify-center rounded-md border-4 border-white bg-black px-3 py-2 text-white transition-transform active:translate-x-0.5 active:translate-y-0.5"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
          <path d="M12 .296a12 12 0 0 0-3.793 23.39c.6.111.82-.26.82-.577v-2.254c-3.338.726-4.043-1.61-4.043-1.61-.546-1.387-1.334-1.757-1.334-1.757-1.09-.745.082-.73.082-.73 1.205.084 1.84 1.237 1.84 1.237 1.071 1.835 2.809 1.305 3.495.998.108-.775.419-1.305.762-1.605-2.665-.304-5.467-1.333-5.467-5.931 0-1.31.468-2.381 1.236-3.221-.124-.304-.536-1.527.117-3.182 0 0 1.008-.323 3.301 1.23a11.5 11.5 0 0 1 6.006 0c2.291-1.553 3.298-1.23 3.298-1.23.655 1.655.243 2.878.12 3.182.77.84 1.235 1.911 1.235 3.221 0 4.61-2.807 5.624-5.479 5.921.431.372.815 1.103.815 2.222v3.293c0 .32.216.694.825.576A12 12 0 0 0 12 .296" />
        </svg>
      </a>

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
