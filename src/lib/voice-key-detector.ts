const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const DISPLAY_KEY_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export interface VoiceKeyResult {
  key: string;
  mode: "major" | "minor";
  confidence: number;
  topNote: string | null;
}

function freqToNote(freq: number): { note: string; cents: number } {
  const midi = 12 * (Math.log2(freq / 440)) + 69;
  const rounded = Math.round(midi);
  const cents = Math.round((midi - rounded) * 100);
  const note = NOTE_NAMES[((rounded % 12) + 12) % 12];
  return { note, cents };
}

function detectPitch(buffer: Float32Array, sampleRate: number): number | null {
  const len = buffer.length;
  let rms = 0;
  for (let i = 0; i < len; i++) {
    rms += buffer[i] * buffer[i];
  }
  rms = Math.sqrt(rms / len);
  if (rms < 0.01) return null;

  let bestLag = -1;
  let bestCorr = 0;
  const minLag = Math.floor(sampleRate / 1000);
  const maxLag = Math.floor(sampleRate / 70);

  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < len - lag; i++) {
      corr += buffer[i] * buffer[i + lag];
    }
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }

  if (bestLag <= 0) return null;
  const freq = sampleRate / bestLag;
  if (freq < 70 || freq > 1000) return null;
  return freq;
}

export class VoiceKeyDetector {
  private audioCtx: AudioContext;
  private stream: MediaStream;
  private analyser: AnalyserNode | null = null;
  private rafId: number | null = null;
  private onUpdate: (note: string, stableCount: number) => void;
  private history: string[] = [];
  private pitchClassCounts = new Array<number>(12).fill(0);

  constructor(audioCtx: AudioContext, stream: MediaStream, onUpdate: (note: string, stableCount: number) => void) {
    this.audioCtx = audioCtx;
    this.stream = stream;
    this.onUpdate = onUpdate;
  }

  start() {
    const source = this.audioCtx.createMediaStreamSource(this.stream);
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 2048;
    source.connect(this.analyser);
    this.tick();
  }

  private tick = () => {
    if (!this.analyser) return;
    const buffer = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buffer);
    const freq = detectPitch(buffer, this.audioCtx.sampleRate);
    if (freq) {
      const { note, cents } = freqToNote(freq);
      if (Math.abs(cents) <= 35) {
        this.history.push(note);
        this.pitchClassCounts[NOTE_NAMES.indexOf(note)] += 1;
        if (this.history.length > 120) this.history.shift();
        this.onUpdate(note, this.countTop().count);
      }
    }
    this.rafId = requestAnimationFrame(this.tick);
  };

  stop(): VoiceKeyResult | null {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.stream.getTracks().forEach((t) => t.stop());
    this.audioCtx.close();
    this.analyser = null;

    const top = this.countTop();
    const distribution = scoreNoteDistribution(this.pitchClassCounts);

    if (distribution) {
      return {
        key: distribution.key,
        mode: distribution.mode,
        confidence: distribution.confidence,
        topNote: top.note,
      };
    }

    if (top.count >= 8 && top.note) {
      return {
        key: top.note,
        mode: "major",
        confidence: 0.4,
        topNote: top.note,
      };
    }

    return null;
  }

  cleanup() {
    this.stop();
  }

  private countTop(): { note: string | null; count: number } {
    const counts = new Map<string, number>();
    for (const note of this.history) {
      counts.set(note, (counts.get(note) ?? 0) + 1);
    }
    let bestNote: string | null = null;
    let bestCount = 0;
    for (const [note, count] of counts) {
      if (count > bestCount) {
        bestNote = note;
        bestCount = count;
      }
    }
    return { note: bestNote, count: bestCount };
  }
}

export function scoreNoteDistribution(counts: number[]): Omit<VoiceKeyResult, "topNote"> | null {
  const total = counts.reduce((sum, c) => sum + c, 0);
  if (total < 10) return null;

  let best: { tonic: number; mode: "major" | "minor"; score: number } = { tonic: 0, mode: "major", score: -Infinity };
  let second: { tonic: number; mode: "major" | "minor"; score: number } = { tonic: 0, mode: "major", score: -Infinity };

  for (let tonic = 0; tonic < 12; tonic++) {
    const majorScore = dotProduct(counts, rotateProfile(MAJOR_PROFILE, tonic));
    const minorScore = dotProduct(counts, rotateProfile(MINOR_PROFILE, tonic));

    for (const candidate of [
      { tonic, mode: "major" as const, score: majorScore },
      { tonic, mode: "minor" as const, score: minorScore },
    ]) {
      if (candidate.score > best.score) {
        second = best;
        best = candidate;
      } else if (candidate.score > second.score) {
        second = candidate;
      }
    }
  }

  const margin = Math.max(0, best.score - second.score);
  const confidence = Math.max(0.45, Math.min(0.97, margin / (total * 2)));

  return {
    key: DISPLAY_KEY_NAMES[best.tonic],
    mode: best.mode,
    confidence,
  };
}

function rotateProfile(profile: number[], tonic: number): number[] {
  const rotated = new Array<number>(12);
  for (let i = 0; i < 12; i++) {
    rotated[i] = profile[(i - tonic + 12) % 12];
  }
  return rotated;
}

function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}
