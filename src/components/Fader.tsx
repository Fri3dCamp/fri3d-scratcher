import { useCallback, useRef } from "react";

interface FaderProps {
  label: string;
  value: number; // 0..1, 1 = top
  onChange: (value: number) => void;
  accentClass?: string; // tailwind bg-* for the thumb
}

// A vertical volume fader. Click or drag anywhere on the track.
export function Fader({ label, value, onChange, accentClass = "bg-fri3d-purple-light" }: FaderProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  const updateFromEvent = useCallback(
    (clientY: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const t = 1 - (clientY - rect.top) / rect.height;
      onChange(Math.max(0, Math.min(1, t)));
    },
    [onChange],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      updateFromEvent(e.clientY);
    },
    [updateFromEvent],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      updateFromEvent(e.clientY);
    },
    [updateFromEvent],
  );

  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <div
        ref={trackRef}
        role="slider"
        aria-label={label}
        aria-valuenow={Math.round(value * 100)}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        className="relative h-40 w-10 cursor-ns-resize touch-none rounded-md border-4 border-black bg-white"
      >
        {/* centre rail */}
        <div className="absolute left-1/2 top-2 bottom-2 w-1 -translate-x-1/2 bg-fri3d-darkgrey/30" />
        {/* thumb */}
        <div
          className={`absolute left-1/2 h-6 w-9 -translate-x-1/2 rounded-sm border-4 border-black ${accentClass}`}
          style={{ top: `calc(${(1 - value) * 100}% - 0.75rem)` }}
        />
      </div>
      <span className="font-display text-[0.65rem] font-semibold uppercase tracking-wide text-fri3d-darkgrey">
        {label}
      </span>
    </div>
  );
}
