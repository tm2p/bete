class MicrophoneProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.noiseGateThreshold = 0.01;
    this.noiseGateHoldFrames = 3;
    this.noiseGateHold = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const inputData = input[0];
    const output = outputs[0];
    if (output && output.length > 0) {
      output[0].set(inputData);
    }

    let sum = 0;
    for (let i = 0; i < inputData.length; i++) {
      sum += inputData[i] * inputData[i];
    }
    const rms = Math.sqrt(sum / inputData.length);

    if (rms < this.noiseGateThreshold && this.noiseGateHold <= 0) {
      this.port.postMessage({ type: 'audio', rms: 0, data: null });
      return true;
    }

    this.noiseGateHold = rms >= this.noiseGateThreshold ? this.noiseGateHoldFrames : this.noiseGateHold - 1;

    const pcm = new Int16Array(inputData.length);
    for (let i = 0; i < inputData.length; i++) {
      pcm[i] = Math.max(-1, Math.min(1, inputData[i])) * 32767;
    }

    this.port.postMessage({ type: 'audio', rms, data: pcm.buffer }, [pcm.buffer]);
    return true;
  }
}

registerProcessor('microphone-processor', MicrophoneProcessor);
