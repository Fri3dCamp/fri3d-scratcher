import type { MidiStatus } from "../lib/midi";

interface TopBarProps {
  status: MidiStatus;
  supported: boolean;
  deviceName?: string;
  onConnect: () => void;
}

const STATUS_TEXT: Record<MidiStatus, string> = {
  unsupported: "Web MIDI not supported in this browser",
  idle: "No controller connected",
  connecting: "Connecting…",
  connected: "Controller connected",
  error: "MIDI connection failed",
};

export function TopBar({ status, supported, deviceName, onConnect }: TopBarProps) {
  const live = status === "connected";
  return (
    <header className="grid grid-cols-[auto_1fr_auto] items-stretch bg-black text-white">
      <div className="flex items-center gap-2 px-4 py-3 font-display text-xl font-bold uppercase">
        <span className="text-fri3d-orange">Fri3d</span>
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
        onClick={onConnect}
        disabled={!supported || status === "connecting"}
        className="m-2 rounded-md border-4 border-white bg-fri3d-purple px-4 py-2 font-display text-xs font-bold uppercase text-white transition-transform enabled:active:translate-x-0.5 enabled:active:translate-y-0.5 disabled:opacity-50"
      >
        {live ? "Reconnect" : "Connect controller"}
      </button>
    </header>
  );
}
