import { useCallback, useEffect, useRef } from "react";

export interface CueMarker {
  time: number; // seconds
  color: string;
  label: string;
}

interface BeatWaveformProps {
  /** Live playback position in seconds. */
  getTime: () => number;
  /** High-res peaks spanning the whole track (or null while decoding). */
  getDetailPeaks: () => Float32Array | null;
  duration: number;
  /** Precise tempo (BPM) for the beat grid, or null if undetected. */
  tempo: number | null;
  /** Time of the first beat (seconds). */
  beatOffset: number;
  /** Waveform color (deck accent). */
  accentColor: string;
  /** Cue / hot-cue markers to draw on the grid. */
  markers: CueMarker[];
  /** Drag-to-seek: move playback position by a number of seconds. */
  onSeek: (seconds: number) => void;
}

const W = 600;
const H = 96;
const WINDOW = 6; // seconds of audio shown across the strip

// A zoomed, playhead-centered waveform with a beat grid and cue markers — the
// scrolling "detail" view found in Serato/Rekordbox. Drag it to seek the track.
export function BeatWaveform({ getTime, getDetailPeaks, duration, tempo, beatOffset, accentColor, markers, onSeek }: BeatWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragX = useRef<number | null>(null);
  // Latest props for the animation loop without restarting it every render.
  const propsRef = useRef({ getTime, getDetailPeaks, duration, tempo, beatOffset, accentColor, markers });
  useEffect(() => {
    propsRef.current = { getTime, getDetailPeaks, duration, tempo, beatOffset, accentColor, markers };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let raf = 0;

    const draw = () => {
      const p = propsRef.current;
      const t = p.getTime();
      const peaks = p.getDetailPeaks();
      const dur = p.duration;
      const mid = H / 2;
      const start = t - WINDOW / 2;
      const end = t + WINDOW / 2;
      const xOf = (time: number) => ((time - start) / WINDOW) * W;

      ctx.fillStyle = "rgb(45,45,45)";
      ctx.fillRect(0, 0, W, H);

      // Beat grid (drawn under the waveform).
      if (p.tempo && p.tempo > 0) {
        const period = 60 / p.tempo;
        const nStart = Math.ceil((start - p.beatOffset) / period);
        const nEnd = Math.floor((end - p.beatOffset) / period);
        for (let n = nStart; n <= nEnd; n++) {
          const beatTime = p.beatOffset + n * period;
          if (beatTime < 0 || beatTime > dur) continue;
          const x = xOf(beatTime);
          const downbeat = ((n % 4) + 4) % 4 === 0;
          ctx.fillStyle = downbeat ? "rgba(255,173,100,0.9)" : "rgba(255,255,255,0.22)";
          ctx.fillRect(x - (downbeat ? 1 : 0.5), 0, downbeat ? 2 : 1, H);
        }
      }

      // Waveform across the visible window.
      if (peaks && dur > 0) {
        const len = peaks.length;
        ctx.fillStyle = p.accentColor;
        for (let x = 0; x < W; x++) {
          const time = start + (x / W) * WINDOW;
          if (time < 0 || time > dur) continue;
          const idx = Math.min(len - 1, Math.floor((time / dur) * len));
          const h = Math.max(1, peaks[idx] * (H - 8));
          ctx.fillRect(x, mid - h / 2, 1, h);
        }
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.fillRect(0, mid - 1, W, 2);
      }

      // Cue / hot-cue markers with a small flag + label.
      for (const m of p.markers) {
        if (m.time < start || m.time > end) continue;
        const x = xOf(m.time);
        ctx.fillStyle = m.color;
        ctx.fillRect(x - 1, 0, 2, H);
        ctx.fillRect(x, 0, 12, 12);
        ctx.fillStyle = "#000";
        ctx.font = "bold 9px sans-serif";
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";
        ctx.fillText(m.label, x + 6, 6);
      }

      // Fixed center playhead.
      ctx.fillStyle = "#fff";
      ctx.fillRect(W / 2 - 1, 0, 2, H);

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Drag the waveform to seek. Dragging right rewinds (grab-the-record feel).
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragX.current = e.clientX;
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (dragX.current == null) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const dx = e.clientX - dragX.current;
      dragX.current = e.clientX;
      onSeek(-(dx / rect.width) * WINDOW);
    },
    [onSeek],
  );

  const endDrag = useCallback(() => {
    dragX.current = null;
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className="h-20 w-full cursor-grab touch-none rounded-md border-4 border-black bg-fri3d-darkgrey active:cursor-grabbing"
    />
  );
}
