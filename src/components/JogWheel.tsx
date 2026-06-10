import { useCallback, useRef } from "react";

interface JogWheelProps {
  playing: boolean;
  scratching: boolean;
  accentClass?: string; // bg-* for the centre label
  onScratch: (deltaTicks: number) => void;
  onScratchActive: (active: boolean) => void;
}

const TICKS_PER_REV = 60;

// A turntable platter: spins while playing, drag to scratch.
export function JogWheel({ playing, scratching, accentClass = "bg-fri3d-purple", onScratch, onScratchActive }: JogWheelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const lastAngle = useRef<number | null>(null);

  const angleAt = useCallback((clientX: number, clientY: number): number => {
    const el = ref.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.atan2(clientY - (rect.top + rect.height / 2), clientX - (rect.left + rect.width / 2));
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      lastAngle.current = angleAt(e.clientX, e.clientY);
      onScratchActive(true);
    },
    [angleAt, onScratchActive],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (lastAngle.current == null) return;
      const a = angleAt(e.clientX, e.clientY);
      let d = a - lastAngle.current;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      lastAngle.current = a;
      onScratch((d / (2 * Math.PI)) * TICKS_PER_REV);
    },
    [angleAt, onScratch],
  );

  const end = useCallback(() => {
    if (lastAngle.current == null) return;
    lastAngle.current = null;
    onScratchActive(false);
  }, [onScratchActive]);

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      className="relative mx-auto aspect-square w-40 cursor-grab touch-none select-none rounded-full border-4 border-black bg-fri3d-darkgrey shadow-hard active:cursor-grabbing"
    >
      {/* grooves */}
      <div className={`absolute inset-2 rounded-full border-2 border-black/40 bg-black ${playing && !scratching ? "animate-spin-slow" : ""}`}>
        <div className="absolute inset-3 rounded-full border border-white/10" />
        <div className="absolute inset-6 rounded-full border border-white/10" />
        {/* marker dot so motion is visible */}
        <div className="absolute left-1/2 top-2 h-2 w-2 -translate-x-1/2 rounded-full bg-fri3d-orange" />
      </div>
      {/* centre label */}
      <div className={`absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-black ${accentClass}`}>
        <span className="font-display text-[0.6rem] font-bold uppercase text-white">Fri3d</span>
      </div>
    </div>
  );
}
