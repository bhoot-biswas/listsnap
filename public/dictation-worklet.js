// The microphone as 24 kHz 16-bit mono PCM, in blocks of about 250 ms, for live dictation.
// The context runs at the device's own rate (Firefox refuses a mic in a 24 kHz context),
// so this resamples. Linear interpolation is plenty for speech recognition.

const RATE = 24000;
const BLOCK = 6000; // 250 ms

class Pcm24k extends AudioWorkletProcessor {
  constructor() {
    super();
    this.step = sampleRate / RATE;
    this.pos = 0; // where the next output sample falls, in input samples from `prev`
    this.prev = 0;
    this.out = new Int16Array(BLOCK);
    this.n = 0;
    this.port.onmessage = (e) => {
      if (e.data === "flush") {
        this.send();
        this.port.postMessage("flushed");
      }
    };
  }

  send() {
    if (!this.n) return;
    const block = this.out.slice(0, this.n);
    this.port.postMessage(block.buffer, [block.buffer]);
    this.n = 0;
  }

  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input) return true;
    // input sample i sits at position i + 1 counting `prev` as 0
    while (this.pos < input.length) {
      const i = Math.floor(this.pos);
      const frac = this.pos - i;
      const a = i === 0 ? this.prev : input[i - 1];
      const b = i < input.length ? input[i] : a;
      const v = Math.max(-1, Math.min(1, a + (b - a) * frac));
      this.out[this.n++] = v < 0 ? v * 0x8000 : v * 0x7fff;
      if (this.n === BLOCK) this.send();
      this.pos += this.step;
    }
    this.pos -= input.length;
    this.prev = input[input.length - 1];
    return true;
  }
}

registerProcessor("pcm-24k", Pcm24k);
