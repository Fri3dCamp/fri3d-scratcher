interface PadProps {
  label: string;
  sub?: string;
  active?: boolean;
  hot?: boolean;
  /** Held-down state coming from the hardware, mirrors the mouse :active look. */
  pressed?: boolean;
  onTrigger: () => void;
}

// A Fri3d-style pad button: flat fill, thick black border, hard offset shadow.
export function Pad({ label, sub, active = false, hot = false, pressed = false, onTrigger }: PadProps) {
  const fill = hot ? "bg-fri3d-red text-white" : active ? "bg-fri3d-mint text-black" : "bg-fri3d-orange text-black";
  // Drive the same pressed look from a MIDI button as from a mouse :active.
  const press = pressed ? "translate-x-1 translate-y-1 shadow-none" : "shadow-hard-sm";
  return (
    <button
      type="button"
      onClick={onTrigger}
      className={`flex flex-col items-center justify-center rounded-md border-4 border-black px-2 py-3 font-display font-bold uppercase transition-transform active:translate-x-1 active:translate-y-1 active:shadow-none ${press} ${fill}`}
    >
      <span className="text-sm leading-none">{label}</span>
      {sub && <span className="mt-0.5 text-[0.55rem] font-semibold opacity-70">{sub}</span>}
    </button>
  );
}
