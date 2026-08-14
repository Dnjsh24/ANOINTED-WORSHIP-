"use client";

import React from "react";
import { getGuitarChordDiagram } from "@/lib/domain/practice-features";

type ChordDiagramProps = {
  chordName: string;
  className?: string;
};

export function ChordDiagram({ chordName, className = "" }: ChordDiagramProps) {
  const diagram = getGuitarChordDiagram(chordName);

  if (!diagram) {
    return (
      <div className={`p-3 text-center bg-zinc-900 border border-white/10 rounded-lg text-xs text-zinc-400 font-mono ${className}`}>
        <p className="font-bold text-violet-300 text-sm">{chordName}</p>
        <p className="mt-1 text-[11px] text-zinc-500">Diagram unavailable</p>
      </div>
    );
  }

  const { frets, fingers, barre, baseFret = 1 } = diagram;
  const strings = 6;
  const numFrets = 5;

  // SVG Grid metrics
  const width = 140;
  const height = 160;
  const paddingX = 25;
  const paddingTop = 35;
  const paddingBottom = 20;

  const stringSpacing = (width - paddingX * 2) / (strings - 1);
  const fretSpacing = (height - paddingTop - paddingBottom) / numFrets;

  const stringX = (stringIdx: number) => paddingX + stringIdx * stringSpacing;
  const fretY = (fretIdx: number) => paddingTop + fretIdx * fretSpacing;

  return (
    <div className={`flex flex-col items-center justify-center p-3 rounded-xl bg-zinc-950 border border-violet-500/30 shadow-2xl backdrop-blur-md text-white select-none ${className}`}>
      {/* Chord Name Header */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base font-black tracking-wide text-violet-300 font-mono">{chordName}</span>
        {baseFret > 1 && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-600/30 border border-violet-500/40 text-violet-200">
            Fret {baseFret}
          </span>
        )}
      </div>

      {/* SVG Guitar Neck */}
      <svg width={width} height={height} className="overflow-visible">
        {/* Nut Line (Thick bar at top if baseFret === 1) */}
        {baseFret === 1 ? (
          <line
            x1={stringX(0)}
            y1={fretY(0)}
            x2={stringX(strings - 1)}
            y2={fretY(0)}
            stroke="#ffffff"
            strokeWidth="4"
            strokeLinecap="round"
          />
        ) : (
          <line
            x1={stringX(0)}
            y1={fretY(0)}
            x2={stringX(strings - 1)}
            y2={fretY(0)}
            stroke="#a1a1aa"
            strokeWidth="1.5"
          />
        )}

        {/* Fret Lines (Horizontal) */}
        {Array.from({ length: numFrets + 1 }).map((_, idx) => (
          <line
            key={`fret-${idx}`}
            x1={stringX(0)}
            y1={fretY(idx)}
            x2={stringX(strings - 1)}
            y2={fretY(idx)}
            stroke="#3f3f46"
            strokeWidth="1"
          />
        ))}

        {/* String Lines (Vertical) */}
        {Array.from({ length: strings }).map((_, idx) => (
          <line
            key={`string-${idx}`}
            x1={stringX(idx)}
            y1={fretY(0)}
            x2={stringX(idx)}
            y2={fretY(numFrets)}
            stroke="#71717a"
            strokeWidth={idx === 0 ? "2.5" : idx === 1 ? "2" : "1.2"} // Thicker bass strings
          />
        ))}

        {/* Top Indicators: Open (O) / Muted (X) */}
        {frets.map((fretVal, stringIdx) => {
          const x = stringX(stringIdx);
          const y = paddingTop - 12;

          if (fretVal === -1) {
            return (
              <text
                key={`top-${stringIdx}`}
                x={x}
                y={y + 4}
                textAnchor="middle"
                fill="#ef4444"
                fontSize="12"
                fontWeight="900"
              >
                ✕
              </text>
            );
          }

          if (fretVal === 0) {
            return (
              <circle
                key={`top-${stringIdx}`}
                cx={x}
                cy={y}
                r="4.5"
                fill="none"
                stroke="#10b981"
                strokeWidth="2"
              />
            );
          }

          return null;
        })}

        {/* Barre Indicator */}
        {barre && (
          <rect
            x={stringX(barre.fromString - 1)}
            y={fretY(barre.fret - baseFret + 1) - fretSpacing / 2 - 5}
            width={stringX(barre.toString - 1) - stringX(barre.fromString - 1)}
            height="10"
            rx="5"
            fill="#8b5cf6"
            opacity="0.8"
          />
        )}

        {/* Finger Dots */}
        {frets.map((fretVal, stringIdx) => {
          if (fretVal <= 0) return null;

          const displayFret = fretVal - baseFret + 1;
          if (displayFret < 1 || displayFret > numFrets) return null;

          const cx = stringX(stringIdx);
          const cy = fretY(displayFret) - fretSpacing / 2;
          const fingerNum = fingers ? fingers[stringIdx] : null;

          return (
            <g key={`dot-${stringIdx}`}>
              <circle cx={cx} cy={cy} r="7.5" fill="#8b5cf6" stroke="#ffffff" strokeWidth="1.5" />
              {fingerNum ? (
                <text
                  x={cx}
                  y={cy + 3.5}
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="9"
                  fontWeight="bold"
                >
                  {fingerNum}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>

      {/* String Tuning Labels at bottom */}
      <div className="flex justify-between w-[90px] text-[10px] font-mono text-zinc-400 mt-1">
        <span>E</span>
        <span>A</span>
        <span>D</span>
        <span>G</span>
        <span>B</span>
        <span>E</span>
      </div>
    </div>
  );
}
