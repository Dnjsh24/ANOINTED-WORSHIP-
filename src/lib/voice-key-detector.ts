import { PitchDetector } from "pitchy";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const DISPLAY_KEY_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

const STARTUP_IGNORE_MS = 400;
const RMS_THRESHOLD = 0.015;
const CLARITY_THRESHOLD = 0.88;
const TUNING_TOLERANCE_CENTS = 35;
const MIN_PITCH_SAMPLES = 10;
const MIN_UNIQUE_PITCH_CLASSES = 4;

export interface VoiceKeyResult {
  key: string;
  mode: "major" | "minor";
  confidence: number;
  topNote: string | null;
  sampleCount: number;
  uniquePitchClasses: number;
}

export type VoiceDetectionOutcome =
  | ({ status: "ok" } & VoiceKeyResult)
  | {
      status: "insufficient_data";
      message: string;
      topNote: string | null;
      sampleCount: number;
      uniquePitchClasses: number;
    };

function freqToNote(freq: number): { note: string; cents: number } {
  const midi = 12 * (Math.log2(freq / 440)) + 69;
  const rounded = Math.round(midi);
  const cents = Math.round((midi - rounded) * 100);
  const note = NOTE_NAMES[((rounded % 12) + 12) % 12];
  return { note, cents };
}

function rms(input: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < input.length; i++) {
    sum += input[i] * input[i];
  }
  return Math.sqrt(sum / input.length);
}

export class VoiceKeyDetector {
  private audioCtx: AudioContext;
  private stream: MediaStream;
  private analyser: AnalyserNode | null = null;
  private rafId: number | null = null;
  private startedAt = 0;
  private onUpdate: (note: string, stableCount: number) => void;
  private onLevel?: (level: number) => void;
  private pitchDetector = PitchDetector.forFloat32Array(4096);
  private pitchBuffer = new Float32Array(4096);
  private noteHistory: string[] = [];
  private pitchClassWeights = new Array<number>(12).fill(0);
  private acceptedSampleCount = 0;
  private currentStableNote: string | null = null;
  private currentStableCount = 0;
  private lastAcceptedPitchClass: number | null = null;
  private smoothedLevel = 0;

  constructor(
    audioCtx: AudioContext,
    stream: MediaStream,
    onUpdate: (note: string, stableCount: number) => void,
    onLevel?: (level: number) => void,
  ) {
    this.audioCtx = audioCtx;
    this.stream = stream;
    this.onUpdate = onUpdate;
    this.onLevel = onLevel;
  }

  start(useHighpass = false) {
    const source = this.audioCtx.createMediaStreamSource(this.stream);
    
    let targetNode: AudioNode = source;
    if (useHighpass) {
      const filter = this.audioCtx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = 300;
      source.connect(filter);
      targetNode = filter;
    }

    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 4096;
    targetNode.connect(this.analyser);
    
    this.pitchDetector.clarityThreshold = CLARITY_THRESHOLD;
    this.pitchDetector.minVolumeAbsolute = RMS_THRESHOLD;
    this.startedAt = performance.now();
    this.tick();
  }

  stop(): VoiceDetectionOutcome {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.stream.getTracks().forEach((track) => track.stop());
    this.audioCtx.close();
    this.analyser = null;

    const top = this.countTop();
    const uniquePitchClasses = this.pitchClassWeights.filter((value) => value > 0).length;
    const summary = scoreNoteDistribution(this.pitchClassWeights, {
      topNoteIndex: top.note ? NOTE_NAMES.indexOf(top.note) : null,
      finalNoteIndex: this.lastAcceptedPitchClass,
    });

    if (!summary) {
      return {
        status: "insufficient_data",
        message: "No clear key detected. Sing a longer melodic phrase with several notes in a quieter room.",
        topNote: top.note,
        sampleCount: this.acceptedSampleCount,
        uniquePitchClasses,
      };
    }

    return {
      status: "ok",
      ...summary,
      topNote: top.note,
      sampleCount: this.acceptedSampleCount,
      uniquePitchClasses,
    };
  }

  cleanup() {
    this.stop();
  }

  private tick = () => {
    if (!this.analyser) return;
    this.analyser.getFloatTimeDomainData(this.pitchBuffer);
    const inputRms = rms(this.pitchBuffer);
    const normalizedLevel = Math.max(0, Math.min(1, inputRms / 0.12));
    this.smoothedLevel = this.smoothedLevel * 0.72 + normalizedLevel * 0.28;
    this.onLevel?.(this.smoothedLevel);

    if (performance.now() - this.startedAt >= STARTUP_IGNORE_MS) {
      if (inputRms >= RMS_THRESHOLD) {
        const [pitch, clarity] = this.pitchDetector.findPitch(this.pitchBuffer, this.audioCtx.sampleRate);
        if (pitch > 0 && clarity >= CLARITY_THRESHOLD) {
          const { note, cents } = freqToNote(pitch);
          if (Math.abs(cents) <= TUNING_TOLERANCE_CENTS) {
            this.acceptPitch(note, clarity);
          }
        } else {
          this.currentStableCount = 0;
          this.currentStableNote = null;
          this.onUpdate("", 0);
        }
      } else {
        this.currentStableCount = 0;
        this.currentStableNote = null;
        this.onUpdate("", 0);
      }
    }

    this.rafId = requestAnimationFrame(this.tick);
  };

  private acceptPitch(note: string, clarity: number) {
    const index = NOTE_NAMES.indexOf(note);
    if (index < 0) return;

    this.acceptedSampleCount += 1;
    this.lastAcceptedPitchClass = index;
    this.noteHistory.push(note);
    if (this.noteHistory.length > 300) this.noteHistory.shift();

    if (this.currentStableNote === note) {
      this.currentStableCount += 1;
    } else {
      this.currentStableNote = note;
      this.currentStableCount = 1;
    }

    const stabilityWeight = 1 + Math.min(this.currentStableCount / 6, 1.5);
    const clarityWeight = 0.6 + clarity;
    this.pitchClassWeights[index] += stabilityWeight * clarityWeight;

    this.onUpdate(note, this.currentStableCount);
  }

  private countTop(): { note: string | null; count: number } {
    const counts = new Map<string, number>();
    for (const note of this.noteHistory) {
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

interface DistributionOptions {
  topNoteIndex: number | null;
  finalNoteIndex: number | null;
}

export function scoreNoteDistribution(
  counts: number[],
  options: Partial<DistributionOptions> = {},
): Omit<VoiceKeyResult, "topNote" | "sampleCount" | "uniquePitchClasses"> | null {
  const total = counts.reduce((sum, count) => sum + count, 0);
  const uniquePitchClasses = counts.filter((count) => count > 0).length;

  if (total < MIN_PITCH_SAMPLES || uniquePitchClasses < MIN_UNIQUE_PITCH_CLASSES) {
    return null;
  }

  let best: { tonic: number; mode: "major" | "minor"; score: number } = { tonic: 0, mode: "major", score: -Infinity };
  let second: { tonic: number; mode: "major" | "minor"; score: number } = { tonic: 0, mode: "major", score: -Infinity };

  for (let tonic = 0; tonic < 12; tonic++) {
    const majorScore = pearsonCorrelation(counts, rotateProfile(MAJOR_PROFILE, tonic)) + noteBias(tonic, options, false);
    const minorScore = pearsonCorrelation(counts, rotateProfile(MINOR_PROFILE, tonic)) + noteBias(tonic, options, true);

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
  const richness = Math.min(1, uniquePitchClasses / 7);
  const confidence = Math.max(0.18, Math.min(0.97, margin * 1.9 + richness * 0.18 + 0.08));

  return {
    key: DISPLAY_KEY_NAMES[best.tonic],
    mode: best.mode,
    confidence,
  };
}

function noteBias(tonic: number, options: Partial<DistributionOptions>, isMinor: boolean): number {
  let score = 0;
  if (options.finalNoteIndex === tonic) score += 0.06;
  if (options.topNoteIndex === tonic) score += 0.03;
  if (isMinor && options.finalNoteIndex === tonic) score += 0.02;
  return score;
}

function rotateProfile(profile: number[], tonic: number): number[] {
  const rotated = new Array<number>(12);
  for (let i = 0; i < 12; i++) {
    rotated[i] = profile[(i - tonic + 12) % 12];
  }
  return rotated;
}

function pearsonCorrelation(a: number[], b: number[]): number {
  const aMean = average(a);
  const bMean = average(b);
  let numerator = 0;
  let aDenominator = 0;
  let bDenominator = 0;

  for (let i = 0; i < 12; i++) {
    const aDelta = a[i] - aMean;
    const bDelta = b[i] - bMean;
    numerator += aDelta * bDelta;
    aDenominator += aDelta * aDelta;
    bDenominator += bDelta * bDelta;
  }

  const denominator = Math.sqrt(aDenominator * bDenominator);
  if (denominator === 0) return -1;
  return numerator / denominator;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
