"use client";

import { useMemo } from "react";
import { getGuitarChordShape, getBassChordShape, getPianoKeys } from "@/lib/domain/chord-shapes";
import { chordToNashville } from "@/lib/domain/chords";

interface ChordCardProps {
  chord: string;
  instrument: "piano" | "guitar" | "bass";
  showNumbers?: boolean;
  selectedKey?: string;
}

export function ChordDiagrams({
  uniqueChords,
  instrument,
  showNumbers,
  selectedKey,
}: {
  uniqueChords: string[];
  instrument: "piano" | "guitar" | "bass";
  showNumbers?: boolean;
  selectedKey?: string;
}) {
  if (uniqueChords.length === 0) return null;

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
        {instrument} Chord Diagrams ({uniqueChords.length})
      </h3>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7">
        {uniqueChords.map((chord) => (
          <ChordCard
            key={chord}
            chord={chord}
            instrument={instrument}
            showNumbers={showNumbers}
            selectedKey={selectedKey}
          />
        ))}
      </div>
    </div>
  );
}

function ChordCard({ chord, instrument, showNumbers, selectedKey }: ChordCardProps) {
  const displayLabel = useMemo(() => {
    if (showNumbers && selectedKey) {
      return chordToNashville(chord, selectedKey);
    }
    return chord;
  }, [chord, showNumbers, selectedKey]);

  return (
    <div className="flex flex-col items-center rounded-lg border border-white/10 bg-[#16151a] p-4 text-center hover:border-violet-400/40 transition">
      <p className="text-base font-bold text-violet-200 mb-3">{displayLabel}</p>
      <div className="w-full flex justify-center items-center h-28">
        {instrument === "piano" && <PianoDiagram chord={chord} />}
        {instrument === "guitar" && <GuitarDiagram chord={chord} />}
        {instrument === "bass" && <BassDiagram chord={chord} />}
      </div>
    </div>
  );
}

// 1. Piano Diagram Component
function PianoDiagram({ chord }: { chord: string }) {
  const activeNotes = useMemo(() => getPianoKeys(chord), [chord]);

  const numWhiteKeys = 14;
  const whiteWidth = 10;
  const whiteHeight = 50;
  const blackWidth = 6;
  const blackHeight = 32;

  // Render 14 white keys
  const whiteKeys: React.ReactNode[] = [];
  for (let i = 0; i < numWhiteKeys; i++) {
    // Determine note value corresponding to this white key
    // Mapping white key index i back to note number in 0-23
    const octave = Math.floor(i / 7);
    const noteInOctave = [0, 2, 4, 5, 7, 9, 11][i % 7];
    const absoluteNote = octave * 12 + noteInOctave;
    const isHighlighted = activeNotes.includes(absoluteNote);

    whiteKeys.push(
      <rect
        key={`w-${i}`}
        x={i * whiteWidth}
        y={0}
        width={whiteWidth - 1}
        height={whiteHeight}
        className={isHighlighted ? "fill-violet-500" : "fill-[#2e2c35] stroke-[#16151a] stroke-1"}
        rx={1}
      />
    );
  }

  // Render black keys
  const blackKeyOffsets = [1, 2, 4, 5, 6]; // white key indices after which black keys go
  const blackKeys: React.ReactNode[] = [];
  for (let octave = 0; octave < 2; octave++) {
    blackKeyOffsets.forEach((offset, idx) => {
      const whiteKeyIdx = octave * 7 + offset - 1;
      const noteInOctave = [1, 3, 6, 8, 10][idx];
      const absoluteNote = octave * 12 + noteInOctave;
      const isHighlighted = activeNotes.includes(absoluteNote);

      const x = whiteKeyIdx * whiteWidth + whiteWidth - blackWidth / 2;

      blackKeys.push(
        <rect
          key={`b-${octave}-${idx}`}
          x={x}
          y={0}
          width={blackWidth}
          height={blackHeight}
          className={isHighlighted ? "fill-violet-300" : "fill-black stroke-[#16151a] stroke-[0.5]"}
          rx={0.7}
        />
      );
    });
  }

  return (
    <svg
      viewBox={`0 0 ${numWhiteKeys * whiteWidth} ${whiteHeight}`}
      className="w-full max-w-[140px] h-auto"
    >
      {whiteKeys}
      {blackKeys}
    </svg>
  );
}

// 2. Guitar Diagram Component
function GuitarDiagram({ chord }: { chord: string }) {
  const shape = useMemo(() => getGuitarChordShape(chord), [chord]);
  const strings = 6;
  const fretsCount = 4; // draw 4 frets
  
  const width = 80;
  const height = 75;
  
  const startX = 15;
  const stringSpacing = 10;
  const startY = 15;
  const fretSpacing = 13;

  const baseFret = shape.baseFret ?? 1;

  // Build grid lines
  const stringLines: React.ReactNode[] = [];
  for (let i = 0; i < strings; i++) {
    const x = startX + i * stringSpacing;
    stringLines.push(
      <line
        key={`s-${i}`}
        x1={x}
        y1={startY}
        x2={x}
        y2={startY + fretsCount * fretSpacing}
        className="stroke-zinc-500 stroke-[1.2]"
      />
    );
  }

  const fretLines: React.ReactNode[] = [];
  for (let i = 0; i <= fretsCount; i++) {
    const y = startY + i * fretSpacing;
    fretLines.push(
      <line
        key={`f-${i}`}
        x1={startX}
        y1={y}
        x2={startX + (strings - 1) * stringSpacing}
        y2={y}
        className={i === 0 && baseFret === 1 ? "stroke-zinc-300 stroke-[3.5]" : "stroke-zinc-600 stroke-[1]"}
      />
    );
  }

  // Markers: frets (string 0 is Low-E, index 5 is High-E)
  const markers: React.ReactNode[] = [];
  for (let s = 0; s < strings; s++) {
    const fretVal = shape.frets[s];
    const x = startX + s * stringSpacing;

    if (fretVal === "x") {
      // Mute marker (X)
      markers.push(
        <text
          key={`m-mute-${s}`}
          x={x}
          y={startY - 5}
          textAnchor="middle"
          className="fill-zinc-400 font-mono text-[9px] font-bold"
        >
          X
        </text>
      );
    } else if (fretVal === 0) {
      // Open marker (O)
      markers.push(
        <circle
          key={`m-open-${s}`}
          cx={x}
          cy={startY - 6}
          r={2.5}
          className="fill-none stroke-zinc-400 stroke-[1.2]"
        />
      );
    } else if (typeof fretVal === "number") {
      // Finger position dot
      // Calculate relative fret position to render on grid
      const relFret = fretVal - baseFret + 1;
      if (relFret >= 1 && relFret <= fretsCount) {
        const y = startY + (relFret - 0.5) * fretSpacing;
        markers.push(
          <circle
            key={`m-dot-${s}`}
            cx={x}
            cy={y}
            r={3.8}
            className="fill-violet-400 stroke-none"
          />
        );
      }
    }
  }

  return (
    <div className="relative">
      {baseFret > 1 && (
        <span className="absolute -left-5 top-[15px] font-mono text-[9px] font-bold text-zinc-400">
          {baseFret}fr
        </span>
      )}
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {stringLines}
        {fretLines}
        {markers}
      </svg>
    </div>
  );
}

// 3. Bass Diagram Component
function BassDiagram({ chord }: { chord: string }) {
  const shape = useMemo(() => getBassChordShape(chord), [chord]);
  const strings = 4;
  const fretsCount = 4; // draw 4 frets
  
  const width = 80;
  const height = 75;
  
  const startX = 25;
  const stringSpacing = 10;
  const startY = 15;
  const fretSpacing = 13;

  const baseFret = shape.baseFret ?? 1;

  // Build grid lines
  const stringLines: React.ReactNode[] = [];
  for (let i = 0; i < strings; i++) {
    const x = startX + i * stringSpacing;
    stringLines.push(
      <line
        key={`s-${i}`}
        x1={x}
        y1={startY}
        x2={x}
        y2={startY + fretsCount * fretSpacing}
        className="stroke-zinc-500 stroke-[1.5]"
      />
    );
  }

  const fretLines: React.ReactNode[] = [];
  for (let i = 0; i <= fretsCount; i++) {
    const y = startY + i * fretSpacing;
    fretLines.push(
      <line
        key={`f-${i}`}
        x1={startX}
        y1={y}
        x2={startX + (strings - 1) * stringSpacing}
        y2={y}
        className={i === 0 && baseFret === 1 ? "stroke-zinc-300 stroke-[3.5]" : "stroke-zinc-600 stroke-[1]"}
      />
    );
  }

  // Markers (string 0 is E-bass, string 3 is G-bass)
  const markers: React.ReactNode[] = [];
  for (let s = 0; s < strings; s++) {
    const fretVal = shape.frets[s];
    const x = startX + s * stringSpacing;

    if (fretVal === "x") {
      // Mute marker (X)
      markers.push(
        <text
          key={`m-mute-${s}`}
          x={x}
          y={startY - 5}
          textAnchor="middle"
          className="fill-zinc-400 font-mono text-[9px] font-bold"
        >
          X
        </text>
      );
    } else if (fretVal === 0) {
      // Open marker (O)
      markers.push(
        <circle
          key={`m-open-${s}`}
          cx={x}
          cy={startY - 6}
          r={2.5}
          className="fill-none stroke-zinc-400 stroke-[1.2]"
        />
      );
    } else if (typeof fretVal === "number") {
      const relFret = fretVal - baseFret + 1;
      if (relFret >= 1 && relFret <= fretsCount) {
        const y = startY + (relFret - 0.5) * fretSpacing;
        markers.push(
          <circle
            key={`m-dot-${s}`}
            cx={x}
            cy={y}
            r={3.8}
            className="fill-violet-400 stroke-none"
          />
        );
      }
    }
  }

  return (
    <div className="relative">
      {baseFret > 1 && (
        <span className="absolute -left-5 top-[15px] font-mono text-[9px] font-bold text-zinc-400">
          {baseFret}fr
        </span>
      )}
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {stringLines}
        {fretLines}
        {markers}
      </svg>
    </div>
  );
}
