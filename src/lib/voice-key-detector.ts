const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

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
        if (this.history.length > 120) this.history.shift();
        this.onUpdate(note, this.countTop().count);
      }
    }
    this.rafId = requestAnimationFrame(this.tick);
  };

  stop(): string | null {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.stream.getTracks().forEach((t) => t.stop());
    this.audioCtx.close();
    this.analyser = null;
    const top = this.countTop();
    return top.count >= 8 ? top.note : null;
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
