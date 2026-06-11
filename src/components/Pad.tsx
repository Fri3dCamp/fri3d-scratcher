interface PadProps {
  label: string;
  sub?: string;
  active?: boolean;
  hot?: boolean;
  /** Held-down state coming from the hardware, mirrors the mouse :active look. */
  pressed?: boolean;
  /** Simple click handler (Play / Cue pads). */
  onTrigger?: () => void;
  /** Pointer-down handler (hot-cue pads). `shift` = overwrite. */
  onPress?: (shift: boolean) => void;
  /** Pointer-up handler (hot-cue pads). */
  onRelease?: () => void;
  /** Right-click handler (hot-cue overwrite). */
  onContext?: () => void;
}

// A Fri3d-style pad button: flat fill, thick black border, hard offset shadow.
export function Pad({ label, sub, active = false, hot = false, pressed = false, onTrigger, onPress, onRelease, onContext }: PadProps) {
  const fill = hot ? "bg-fri3d-red text-white" : active ? "bg-fri3d-mint text-black" : "bg-fri3d-orange text-black";
  // Drive the same pressed look from a MIDI button as from a mouse :active.
  const press = pressed ? "translate-x-1 translate-y-1 shadow-none" : "shadow-hard-sm";
  return (
    <button
      type="button"
      onClick={onTrigger}
      onPointerDown={
        onPress
          ? (e) => {
              if (e.button !== 0) return; // ignore right/middle button (handled by context menu)
              e.currentTarget.setPointerCapture(e.pointerId);
              onPress(e.shiftKey);
            }
          : undefined
      }
      onPointerUp={onRelease ? () => onRelease() : undefined}
      onContextMenu={
        onContext
          ? (e) => {
              e.preventDefault();
              onContext();
            }
          : undefined
      }
      className={`flex flex-col items-center justify-center rounded-md border-4 border-black px-2 py-3 font-display font-bold uppercase transition-transform active:translate-x-1 active:translate-y-1 active:shadow-none ${press} ${fill}`}
    >
      <span className="text-sm leading-none">{label}</span>
      {sub && <span className="mt-0.5 text-[0.55rem] font-semibold opacity-70">{sub}</span>}
    </button>
  );
}
