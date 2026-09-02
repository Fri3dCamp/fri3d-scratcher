interface PadProps {
  label: string;
  sub?: string;
  /** Background (+ text) Tailwind classes for the pad's fill, e.g. "bg-yellow-300 text-black". */
  colorClass: string;
  tutorialId?: string;
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
// The caller picks colorClass, mirroring the DJ addon's hardware LED colour for this pad.
export function Pad({ label, sub, colorClass, tutorialId, pressed = false, onTrigger, onPress, onRelease, onContext }: PadProps) {
  // Drive the same pressed look from a MIDI button as from a mouse :active.
  const press = pressed ? "translate-x-1 translate-y-1 shadow-none" : "shadow-hard-sm";
  return (
    <button
      type="button"
      data-tutorial={tutorialId}
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
      className={`flex w-full flex-col items-center justify-center rounded-md border-4 border-black px-2 py-3 font-display font-bold uppercase transition-transform active:translate-x-1 active:translate-y-1 active:shadow-none ${press} ${colorClass}`}
    >
      <span className="text-sm leading-none">{label}</span>
      {sub && <span className="mt-0.5 text-[0.55rem] font-semibold opacity-70">{sub}</span>}
    </button>
  );
}
