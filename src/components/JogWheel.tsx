import { useCallback, useEffect, useRef } from "react";

interface JogWheelProps {
  /** Live playback position in seconds — drives the platter rotation. */
  getTime: () => number;
  accentClass?: string; // bg-* for the centre label
  /** Scratch by a relative number of seconds. */
  onScratch: (seconds: number) => void;
  /** Grab (true) / release (false) the platter. */
  onScratchActive: (active: boolean) => void;
}

// 33⅓ RPM → degrees of platter rotation per second of audio.
const DEG_PER_SEC = (360 * (100 / 3)) / 60; // = 200

// A turntable platter. Its rotation is derived from the playback position, so
// it spins while playing, holds its spot when paused, and follows the mouse
// 1:1 while scratching. Grabbing it stops the record (see the audio engine).
export function JogWheel({ getTime, accentClass = "bg-fri3d-purple", onScratch, onScratchActive }: JogWheelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const platterRef = useRef<HTMLDivElement>(null);
  const lastAngle = useRef<number | null>(null);
  const getTimeRef = useRef(getTime);
  useEffect(() => {
    getTimeRef.current = getTime;
  });

  // Drive rotation from playback position every frame.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = platterRef.current;
      if (el) el.style.transform = `rotate(${getTimeRef.current() * DEG_PER_SEC}deg)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

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
      // Map the drag angle to audio time so the platter tracks the cursor 1:1.
      onScratch((d * (180 / Math.PI)) / DEG_PER_SEC);
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
      {/* The whole platter rotates together (grooves, marker and hub). */}
      <div ref={platterRef} className="absolute inset-0 will-change-transform">
        <div className="absolute inset-2 rounded-full border-2 border-black/40 bg-black">
          <div className="absolute inset-3 rounded-full border border-white/10" />
          <div className="absolute inset-6 rounded-full border border-white/10" />
          {/* marker dot so motion is visible */}
          <div className="absolute left-1/2 top-2 h-2 w-2 -translate-x-1/2 rounded-full bg-fri3d-orange" />
        </div>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className={`flex h-12 w-12 items-center justify-center rounded-full border-4 border-black ${accentClass}`}>
            <span className="font-display text-[0.6rem] font-bold uppercase text-white">Fri3d</span>
          </div>
        </div>
      </div>
    </div>
  );
}
