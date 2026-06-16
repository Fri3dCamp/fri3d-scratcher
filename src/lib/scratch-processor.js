// AudioWorklet processor: real turntable scratching from a decoded buffer.
//
// It owns a floating-point playhead (in buffer samples) and reads the track
// with linear interpolation at a signed rate. The rate can be negative
// (reverse), >1 (pitched up) or 0 (held) — which is exactly what makes a
// scratch sound like a scratch rather than a stutter-seek.
//
// Two motion modes:
//   • playing  → the playhead advances at the tempo rate every sample.
//   • scratching → the playhead chases a target position the main thread
//     feeds from the platter. Velocity is proportional to the distance left
//     to cover, so a flick produces a fast chirp that eases as it lands, and
//     holding the platter still drops the velocity (and the sound) to zero —
//     just like a hand on vinyl.
//
// decodeAudioData resamples to the context rate, so buffer sample rate always
// equals `sampleRate` here; rate is dimensionless (1 = normal speed) and a
// position in seconds is simply playhead / sampleRate.

const RATE_CAP = 8; // clamp |playback rate| so wild flicks don't scream
const RATE_GATE = 0.002; // below this |rate| the platter is "held" → silent
// On release the platter keeps its velocity and friction eases it to the
// target rate, so letting go with speed winds down like a real deck.
const COAST_TAU_RESUME = 0.18; // s — pitch springs back up to play speed
const COAST_TAU_STOP = 0.2; // s — platter coasts to a halt when paused
const COAST_EPS = 0.002; // settle threshold on the eased rate

class ScratchProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.channels = []; // Float32Array per channel
    this.numChannels = 0;
    this.length = 0; // samples per channel

    this.playhead = 0; // float sample index
    this.target = 0; // scratch chase target (samples)
    this.rate = 0; // current signed playback rate
    this.tempo = 1; // base rate when playing normally
    this.gain = 0; // smoothed output gain (de-click / hold-silence)

    this.playing = false;
    this.scratching = false;
    this.coasting = false; // friction wind-down after a release
    this.coastTarget = 0; // rate the wind-down eases toward
    this.coastCoeff = 0; // per-sample easing factor for the wind-down

    // Position-chase time constant (~28 ms): in steady motion the playback
    // rate matches the platter's velocity, with this much lag.
    this.smoothing = 1 / (0.028 * sampleRate);
    // Output-gain ramp (~2 ms) so play/pause/hold transitions don't click.
    this.gainStep = 1 / (0.002 * sampleRate);

    this.postCounter = 0;
    this.port.onmessage = (e) => this.handle(e.data);
  }

  handle(m) {
    switch (m.type) {
      case "load":
        this.channels = m.channels.map((b) => new Float32Array(b));
        this.numChannels = this.channels.length;
        this.length = m.length;
        this.playhead = 0;
        this.target = 0;
        this.rate = 0;
        this.playing = false;
        this.scratching = false;
        break;
      case "play":
        this.playing = true;
        this.coasting = false;
        break;
      case "pause":
        this.playing = false;
        this.coasting = false;
        this.rate = 0;
        break;
      case "seek":
        this.playhead = this.clampPos(m.pos * sampleRate);
        this.target = this.playhead;
        this.coasting = false;
        break;
      case "tempo":
        this.tempo = m.value;
        break;
      case "scratchStart":
        this.scratching = true;
        this.coasting = false;
        this.target = this.playhead;
        break;
      case "scratchTarget":
        this.target = this.clampPos(m.pos * sampleRate);
        break;
      case "scratchEnd":
        // Keep the platter's current velocity and let friction ease it to the
        // target rate — resume → play speed, stop → 0 — so a release with
        // speed winds down instead of snapping.
        this.scratching = false;
        this.playing = m.resume;
        this.coasting = true;
        this.coastTarget = m.resume ? this.tempo : 0;
        this.coastCoeff = 1 - Math.exp(-1 / ((m.resume ? COAST_TAU_RESUME : COAST_TAU_STOP) * sampleRate));
        break;
    }
  }

  clampPos(pos) {
    if (pos < 0) return 0;
    const max = this.length > 0 ? this.length - 1 : 0;
    return pos > max ? max : pos;
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    const chCount = out.length;
    if (this.numChannels === 0 || this.length === 0) return true; // silence

    const frames = out[0].length;
    for (let i = 0; i < frames; i++) {
      // --- advance the playhead -------------------------------------------
      if (this.scratching) {
        // Velocity proportional to remaining distance → smooth chase.
        let v = (this.target - this.playhead) * this.smoothing;
        if (v > RATE_CAP) v = RATE_CAP;
        else if (v < -RATE_CAP) v = -RATE_CAP;
        this.rate = v;
      } else if (this.coasting) {
        // Friction: ease the release velocity toward the target rate.
        this.rate += (this.coastTarget - this.rate) * this.coastCoeff;
        if (Math.abs(this.rate - this.coastTarget) < COAST_EPS) {
          this.rate = this.coastTarget;
          this.coasting = false;
        }
      } else if (this.playing) {
        this.rate = this.tempo;
      } else {
        this.rate = 0;
      }
      this.playhead += this.rate;

      // End of track (not while scratching — you can scrub to the edge freely).
      if (this.playhead >= this.length - 1) {
        this.playhead = this.length - 1;
        if (!this.scratching && (this.playing || this.coasting)) {
          this.playing = false;
          this.coasting = false;
          this.rate = 0;
          this.port.postMessage({ type: "ended" });
        }
      }
      if (this.playhead < 0) this.playhead = 0;

      // --- output gain: silence a held/paused/stopped platter -------------
      const targetGain = Math.abs(this.rate) > RATE_GATE ? 1 : 0;
      if (this.gain < targetGain) this.gain = Math.min(targetGain, this.gain + this.gainStep);
      else if (this.gain > targetGain) this.gain = Math.max(targetGain, this.gain - this.gainStep);

      // --- read interpolated sample ---------------------------------------
      const idx = this.playhead | 0;
      const frac = this.playhead - idx;
      const idx2 = idx + 1 < this.length ? idx + 1 : idx;
      for (let c = 0; c < chCount; c++) {
        const src = this.channels[c < this.numChannels ? c : this.numChannels - 1];
        out[c][i] = (src[idx] + (src[idx2] - src[idx]) * frac) * this.gain;
      }
    }

    // Report position to the main thread a few times per render cadence so it
    // can drive the platter rotation and time readouts (extrapolated between).
    if (++this.postCounter >= 4) {
      this.postCounter = 0;
      this.port.postMessage({
        type: "pos",
        pos: this.playhead / sampleRate,
        rate: this.rate,
        time: currentTime,
        playing: this.playing,
      });
    }
    return true;
  }
}

registerProcessor("scratch-processor", ScratchProcessor);
