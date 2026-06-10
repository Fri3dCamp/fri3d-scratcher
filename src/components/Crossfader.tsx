import { useCallback, useRef } from "react";

interface CrossfaderProps {
  value: number; // 0 = left, 1 = right
  onChange: (value: number) => void;
}

// Horizontal crossfader between the two decks.
export function Crossfader({ value, onChange }: CrossfaderProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  const updateFromEvent = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const t = (clientX - rect.left) / rect.width;
      onChange(Math.max(0, Math.min(1, t)));
    },
    [onChange],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      updateFromEvent(e.clientX);
    },
    [updateFromEvent],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      updateFromEvent(e.clientX);
    },
    [updateFromEvent],
  );

  return (
    <div className="flex flex-col items-center gap-2 select-none">
      <div className="flex w-full justify-between font-display text-[0.65rem] font-bold uppercase">
        <span className="text-fri3d-purple">A</span>
        <span className="text-fri3d-mint-dark">B</span>
      </div>
      <div
        ref={trackRef}
        role="slider"
        aria-label="Crossfader"
        aria-valuenow={Math.round(value * 100)}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onDoubleClick={() => onChange(0.5)}
        className="relative h-10 w-full cursor-ew-resize touch-none rounded-md border-4 border-black bg-fri3d-purple-light"
      >
        <div className="absolute top-1 bottom-1 left-1/2 w-0.5 -translate-x-1/2 bg-black/30" />
        <div
          className="absolute top-1/2 h-12 w-7 -translate-x-1/2 -translate-y-1/2 rounded-sm border-4 border-black bg-white"
          style={{ left: `${value * 100}%` }}
        />
      </div>
    </div>
  );
}
