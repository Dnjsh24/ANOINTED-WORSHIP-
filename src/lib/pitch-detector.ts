const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function freqToNote(freq: number): { note: string; cents: number } {
  if (freq <= 0) return { note: "A", cents: 0 };
  const midi = 12 * (Math.log2(freq / 440)) + 69;
  const rounded = Math.round(midi);
  const cents = Math.round((midi - rounded) * 100);
  const note = NOTE_NAMES[((rounded % 12) + 12) % 12];
  return { note, cents };
}

function autocorrelation(buffer: Float32Array, sampleRate: number): number | null {
  const minFreq = 65;
  const maxFreq = 1000;
  const minPeriod = Math.floor(sampleRate / maxFreq);
  const maxPeriod = Math.ceil(sampleRate / minFreq);

  let bestCorr = -1;
  let bestPeriod = -1;
  const squaredSum = buffer.reduce((sum, s) => sum + s * s, 0);
  if (squaredSum < 0.01) return null;

  for (let period = minPeriod; period <= maxPeriod; period++) {
    let corr = 0;
    for (let i = 0; i < maxPeriod && i + period < buffer.length; i++) {
      corr += buffer[i] * buffer[i + period];
    }
    corr /= squaredSum || 1;
    if (corr > bestCorr) {
      bestCorr = corr;
      bestPeriod = period;
    }
  }

  if (bestCorr < 0.2 || bestPeriod < 0) return null;

  const refined = parabolicInterpolation(buffer, bestPeriod, sampleRate);
  return refined > 0 ? sampleRate / refined : sampleRate / bestPeriod;
}

function parabolicInterpolation(buffer: Float32Array, period: number, sampleRate: number): number {
  const y0 = period > 0 && period < buffer.length ? buffer[period] : 0;
  const y1 = period + 1 < buffer.length ? buffer[period + 1] : 0;
  const y_1 = period - 1 >= 0 ? buffer[period - 1] : 0;

  const denom = 2 * y1 - 4 * y0 + 2 * y_1;
  if (Math.abs(denom) < 1e-6) return sampleRate / period;

  const shift = (y_1 - y1) / denom;
  return sampleRate / (period + shift);
}

export type PitchDetectorState =
  | { status: "idle" }
  | { status: "listening"; detected: string }
  | { status: "done"; key: string }
  | { status: "error"; message: string };

export type PitchListener = (state: PitchDetectorState) => void;

export class PitchDetector {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private animFrame: number | null = null;
  private listener: PitchListener;
  private sampleRate = 44100;
  private stableCount = 0;
  private lastNote: string | null = null;
  private bestGuess: string | null = null;

  constructor(listener: PitchListener) {
    this.listener = listener;
  }

  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioCtx = new AudioContext();
      this.sampleRate = this.audioCtx.sampleRate;

      const source = this.audioCtx.createMediaStreamSource(this.stream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 2048;
      source.connect(this.analyser);

      this.poll();
    } catch {
      this.listener({ status: "error", message: "Microphone access denied or unavailable." });
    }
  }

  private poll = () => {
    if (!this.analyser) return;

    const buffer = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buffer);

    const freq = autocorrelation(buffer, this.sampleRate);
    if (freq) {
      const { note, cents } = freqToNote(freq);
      if (Math.abs(cents) < 30) {
        if (note === this.lastNote) {
          this.stableCount++;
          if (this.stableCount > 15) {
            this.bestGuess = note;
          }
        } else {
          this.stableCount = 0;
          this.lastNote = note;
          this.bestGuess = null;
        }
        this.listener({ status: "listening", detected: note });
      }
    }

    this.animFrame = requestAnimationFrame(this.poll);
  };

  stop(): string | null {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.audioCtx) this.audioCtx.close();
    this.analyser = null;
    this.audioCtx = null;
    this.stream = null;
    return this.bestGuess;
  }

  cleanup() {
    this.stop();
  }
}
