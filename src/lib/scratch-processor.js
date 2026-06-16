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
const RATE_GATE = 0.002; // below this |rate| a scratched platter is "held" → silent

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
        break;
      case "pause":
        this.playing = false;
        break;
      case "seek":
        this.playhead = this.clampPos(m.pos * sampleRate);
        this.target = this.playhead;
        break;
      case "tempo":
        this.tempo = m.value;
        break;
      case "scratchStart":
        this.scratching = true;
        this.target = this.playhead;
        break;
      case "scratchTarget":
        this.target = this.clampPos(m.pos * sampleRate);
        break;
      case "scratchEnd":
        this.scratching = false;
        this.rate = 0;
        this.playing = m.resume;
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
        this.playhead += v;
      } else if (this.playing) {
        this.rate = this.tempo;
        this.playhead += this.tempo;
        if (this.playhead >= this.length - 1) {
          this.playhead = this.length - 1;
          this.playing = false;
          this.rate = 0;
          this.port.postMessage({ type: "ended" });
        }
      } else {
        this.rate = 0;
      }
      if (this.playhead < 0) this.playhead = 0;

      // --- output gain: silence a paused deck or a held platter -----------
      const moving = this.scratching ? Math.abs(this.rate) > RATE_GATE : this.playing;
      const targetGain = moving ? 1 : 0;
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
