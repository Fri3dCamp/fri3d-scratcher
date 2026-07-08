// AudioWorklet processor that taps the master output and forwards raw PCM to
// the main thread, where it is written to disk as a WAV stream.
//
// It sits on the master bus purely as a probe: it copies the input channels
// each render quantum and posts them (transferring the buffers so there is no
// copy on the main thread). Its own output stays silent — connecting that
// silent output to the destination is only what keeps the node in the render
// graph so process() keeps being called.

class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = false;
    this.port.onmessage = (e) => {
      if (e.data === "start") this.recording = true;
      else if (e.data === "stop") this.recording = false;
    };
  }

  process(inputs) {
    const input = inputs[0];
    if (this.recording && input && input.length > 0 && input[0].length > 0) {
      const chans = [];
      const transfer = [];
      for (let c = 0; c < input.length; c++) {
        const copy = new Float32Array(input[c].length);
        copy.set(input[c]);
        chans.push(copy);
        transfer.push(copy.buffer);
      }
      this.port.postMessage({ chans }, transfer);
    }
    return true;
  }
}

registerProcessor("recorder-processor", RecorderProcessor);
