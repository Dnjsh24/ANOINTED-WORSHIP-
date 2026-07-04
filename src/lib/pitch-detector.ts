const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function freqToNote(freq: number): { note: string; cents: number; midi: number } {
  if (freq <= 0) return { note: "A", cents: 0, midi: 69 };
  const midi = 12 * (Math.log2(freq / 440)) + 69;
  const rounded = Math.round(midi);
  const cents = Math.round((midi - rounded) * 100);
  const note = NOTE_NAMES[((rounded % 12) + 12) % 12];
  return { note, cents, midi: rounded };
}

function yinDifference(buffer: Float32Array, sampleRate: number): number | null {
  const minFreq = 60;
  const maxFreq = 880;
  const minPeriod = Math.floor(sampleRate / maxFreq);
  const maxPeriod = Math.ceil(sampleRate / minFreq);
  const halfLen = Math.floor(buffer.length / 2);

  const diff = new Float32Array(maxPeriod + 1);
  let tau = 0;
  let runningSum = 0;
  let bestTau = -1;
  let bestVal = Infinity;

  for (tau = minPeriod; tau <= maxPeriod; tau++) {
    let d = 0;
    for (let i = 0; i < halfLen; i++) {
      const delta = buffer[i] - buffer[i + tau];
      d += delta * delta;
    }
    diff[tau] = d;
  }

  diff[0] = 1;
  runningSum = 0;
  for (tau = 1; tau <= maxPeriod; tau++) {
    runningSum += diff[tau];
    const norm = runningSum === 0 ? 1 : diff[tau] / (runningSum / tau);
    diff[tau] = norm;
  }

  for (tau = minPeriod; tau <= maxPeriod; tau++) {
    if (diff[tau] < 0.15) {
      bestTau = tau;
      bestVal = diff[tau];
      break;
    }
  }

  if (bestTau < 0) {
    for (tau = minPeriod; tau <= maxPeriod; tau++) {
      if (diff[tau] < 0.3) {
        bestTau = tau;
        bestVal = diff[tau];
        break;
      }
    }
  }

  if (bestTau < 0) return null;

  const y0 = diff[bestTau];
  const y1 = bestTau + 1 <= maxPeriod ? diff[bestTau + 1] : y0;
  const y_1 = bestTau - 1 >= 0 ? diff[bestTau - 1] : y0;

  const denom = 2 * y1 - 4 * y0 + 2 * y_1;
  if (Math.abs(denom) < 1e-12) return sampleRate / bestTau;

  const shift = (y_1 - y1) / denom;
  return sampleRate / (bestTau + shift);
}

export type PitchDetectorState =
  | { status: "idle" }
  | { status: "listening"; detected: string }
  | { status: "done"; key: string }
  | { status: "error"; message: string };

export type PitchListener = (state: PitchDetectorState) => void;

const HISTORY_SIZE = 60;
const CONFIRMATION_THRESHOLD = 35;

export class PitchDetector {
  private audioCtx: AudioContext;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream;
  private animFrame: number | null = null;
  private listener: PitchListener;
  private freqHistory: { freq: number; note: string }[] = [];
  private confirmedNote: string | null = null;
  private silentFrames = 0;

  constructor(audioCtx: AudioContext, stream: MediaStream, listener: PitchListener) {
    this.audioCtx = audioCtx;
    this.stream = stream;
    this.listener = listener;
  }

  start() {
    try {
      const source = this.audioCtx.createMediaStreamSource(this.stream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 4096;
      source.connect(this.analyser);
      this.poll();
    } catch {
      this.listener({ status: "error", message: "Could not start audio analysis." });
    }
  }

  private getMostFrequentNote(): { note: string; count: number } | null {
    if (this.freqHistory.length < 10) return null;
    const counts = new Map<string, number>();
    for (const entry of this.freqHistory) {
      counts.set(entry.note, (counts.get(entry.note) || 0) + 1);
    }
    let best: { note: string; count: number } | null = null;
    for (const [note, count] of counts) {
      if (!best || count > best.count) {
        best = { note, count };
      }
    }
    return best;
  }

  private poll = () => {
    if (!this.analyser) return;

    const buffer = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buffer);

    const freq = yinDifference(buffer, this.audioCtx.sampleRate);

    if (freq && freq > 50 && freq < 2000) {
      const { note, cents } = freqToNote(freq);
      this.silentFrames = 0;

      if (Math.abs(cents) < 50) {
        this.freqHistory.push({ freq, note });
        if (this.freqHistory.length > HISTORY_SIZE) {
          this.freqHistory.shift();
        }

        const top = this.getMostFrequentNote();
        if (top && top.count >= CONFIRMATION_THRESHOLD) {
          this.confirmedNote = top.note;
        }

        this.listener({
          status: "listening",
          detected: this.confirmedNote || note,
        });
      }
    } else {
      this.silentFrames++;
      if (this.silentFrames > 20) {
        this.freqHistory = [];
      }
    }

    this.animFrame = requestAnimationFrame(this.poll);
  };

  stop(): string | null {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    this.stream.getTracks().forEach((t) => t.stop());
    this.audioCtx.close();
    this.analyser = null;
    return this.confirmedNote;
  }

  cleanup() {
    this.stop();
  }
}
