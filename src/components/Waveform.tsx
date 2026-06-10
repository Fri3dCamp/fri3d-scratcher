import { useCallback, useEffect, useRef } from "react";

interface WaveformProps {
  peaks: number[] | null;
  progress: number; // 0..1
  playedColor: string; // CSS color for the played portion
  /** Seek callback, fraction 0..1 of the track. */
  onSeek: (fraction: number) => void;
}

const UNPLAYED = "rgba(255,255,255,0.25)";
const W = 600;
const H = 80;

// Canvas waveform with a played/unplayed split and click-to-seek.
export function Waveform({ peaks, progress, playedColor, onSeek }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);

    if (!peaks || peaks.length === 0) {
      // flat baseline while there's no decoded audio yet
      ctx.fillStyle = UNPLAYED;
      ctx.fillRect(0, H / 2 - 1, W, 2);
      return;
    }

    const mid = H / 2;
    const barW = W / peaks.length;
    const splitX = progress * W;
    for (let i = 0; i < peaks.length; i++) {
      const x = i * barW;
      const h = Math.max(2, peaks[i] * (H - 6));
      ctx.fillStyle = x < splitX ? playedColor : UNPLAYED;
      ctx.fillRect(x, mid - h / 2, Math.max(1, barW - 0.5), h);
    }
    // playhead
    ctx.fillStyle = "#ffad64";
    ctx.fillRect(Math.min(W - 2, splitX), 0, 2, H);
  }, [peaks, progress, playedColor]);

  const onClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      onSeek(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
    },
    [onSeek],
  );

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      onClick={onClick}
      className="h-16 w-full cursor-pointer rounded-md border-4 border-black bg-fri3d-darkgrey"
    />
  );
}
