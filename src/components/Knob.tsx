import { useCallback, useRef } from "react";

interface KnobProps {
  label: string;
  value: number; // 0..1
  onChange: (value: number) => void;
}

// A rotary knob. Drag up/down to turn, double-click to recentre.
export function Knob({ label, value, onChange }: KnobProps) {
  const startRef = useRef({ y: 0, value: 0 });

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      startRef.current = { y: e.clientY, value };
    },
    [value],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      const dy = startRef.current.y - e.clientY;
      const next = Math.max(0, Math.min(1, startRef.current.value + dy / 180));
      onChange(next);
    },
    [onChange],
  );

  const angle = (value - 0.5) * 270; // -135deg .. +135deg

  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <div
        role="slider"
        aria-label={label}
        aria-valuenow={Math.round(value * 100)}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onDoubleClick={() => onChange(0.5)}
        className="relative h-14 w-14 cursor-ns-resize rounded-full border-4 border-black bg-fri3d-orange shadow-hard-sm touch-none"
      >
        {/* The indicator rotates around the knob centre (container's own centre). */}
        <div className="absolute inset-0" style={{ transform: `rotate(${angle}deg)` }}>
          <div className="absolute left-1/2 top-1 h-4 w-1 -translate-x-1/2 rounded-full bg-black" />
        </div>
      </div>
      <span className="font-display text-[0.65rem] font-semibold uppercase tracking-wide text-fri3d-darkgrey">
        {label}
      </span>
    </div>
  );
}
