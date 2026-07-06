// Chromatic scale for note calculations
export const CHROMATIC_SCALE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const ENHARMONIC_MAP: Record<string, string> = {
  "Db": "C#",
  "Eb": "D#",
  "Gb": "F#",
  "Ab": "G#",
  "Bb": "A#",
  "B#": "C",
  "Cb": "B",
  "E#": "F",
  "Fb": "E"
};

export function normalizeNoteName(note: string): string {
  if (!note) return "";
  const capitalized = note.charAt(0).toUpperCase() + note.slice(1).toLowerCase();
  return ENHARMONIC_MAP[capitalized] ?? capitalized;
}

// Represents guitar fret positions (string 1-6: E-low to E-high)
// null means mute (X), 0 means open (O), numbers are fret positions.
export interface GuitarShape {
  frets: (number | "x")[];
  barre?: { fret: number; startString: number; endString: number };
  baseFret?: number;
}

// Mapping of normalized root + quality to guitar shapes
const GUITAR_DATABASE: Record<string, GuitarShape> = {
  "C": { frets: ["x", 3, 2, 0, 1, 0] },
  "Cm": { frets: ["x", 3, 5, 5, 4, 3], baseFret: 3 },
  "C7": { frets: ["x", 3, 2, 3, 1, 0] },
  "Cmaj7": { frets: ["x", 3, 2, 0, 0, 0] },
  "Csus4": { frets: ["x", 3, 3, 0, 1, 1] },
  "C/F": { frets: [1, 3, 2, 0, 1, 0] },
  "C/E": { frets: [0, 3, 2, 0, 1, 0] },

  "C#": { frets: ["x", 4, 6, 6, 6, 4], baseFret: 4 },
  "C#m": { frets: ["x", 4, 6, 6, 5, 4], baseFret: 4 },
  "C#7": { frets: ["x", 4, 6, 4, 6, 4], baseFret: 4 },
  "C#sus4": { frets: ["x", 4, 6, 6, 7, 4], baseFret: 4 },

  "D": { frets: ["x", "x", 0, 2, 3, 2] },
  "Dm": { frets: ["x", "x", 0, 2, 3, 1] },
  "D7": { frets: ["x", "x", 0, 2, 1, 2] },
  "Dmaj7": { frets: ["x", "x", 0, 2, 2, 2] },
  "Dsus4": { frets: ["x", "x", 0, 2, 3, 3] },
  "D/G": { frets: [3, "x", 0, 2, 3, 2] },
  "D/F#": { frets: [2, 0, 0, 2, 3, 2] },

  "D#": { frets: ["x", 6, 8, 8, 8, 6], baseFret: 6 },
  "D#m": { frets: ["x", 6, 8, 8, 7, 6], baseFret: 6 },
  "D#sus4": { frets: ["x", 6, 8, 8, 9, 6], baseFret: 6 },

  "E": { frets: [0, 2, 2, 1, 0, 0] },
  "Em": { frets: [0, 2, 2, 0, 0, 0] },
  "E7": { frets: [0, 2, 0, 1, 0, 0] },
  "Emaj7": { frets: [0, 2, 1, 1, 0, 0] },
  "Esus4": { frets: [0, 2, 2, 2, 0, 0] },

  "F": { frets: [1, 3, 3, 2, 1, 1] },
  "Fm": { frets: [1, 3, 3, 1, 1, 1] },
  "F7": { frets: [1, 3, 1, 2, 1, 1] },
  "Fmaj7": { frets: ["x", "x", 3, 2, 1, 0] },
  "Fsus4": { frets: [1, 3, 3, 3, 1, 1] },
  "F/Bb": { frets: ["x", 1, 3, 2, 1, 1] },
  "F/C": { frets: [3, 3, 3, 2, 1, 1] },

  "F#": { frets: [2, 4, 4, 3, 2, 2], baseFret: 2 },
  "F#m": { frets: [2, 4, 4, 2, 2, 2], baseFret: 2 },
  "F#7": { frets: [2, 4, 2, 3, 2, 2], baseFret: 2 },
  "F#sus4": { frets: [2, 4, 4, 4, 2, 2], baseFret: 2 },

  "G": { frets: [3, 2, 0, 0, 0, 3] },
  "Gm": { frets: [3, 5, 5, 3, 3, 3], baseFret: 3 },
  "G7": { frets: [3, 2, 0, 0, 0, 1] },
  "Gmaj7": { frets: [3, 2, 0, 0, 0, 2] },
  "Gsus4": { frets: [3, 3, 0, 0, 1, 3] },
  "G/B": { frets: ["x", 2, 0, 0, 0, 3] },
  "G/C": { frets: [3, 3, 2, 0, 1, 3] },
  "G/D": { frets: ["x", "x", 0, 0, 0, 3] },

  "G#": { frets: [4, 6, 6, 5, 4, 4], baseFret: 4 },
  "G#m": { frets: [4, 6, 6, 4, 4, 4], baseFret: 4 },
  "G#sus4": { frets: [4, 6, 6, 6, 4, 4], baseFret: 4 },

  "A": { frets: ["x", 0, 2, 2, 2, 0] },
  "Am": { frets: ["x", 0, 2, 2, 1, 0] },
  "A7": { frets: ["x", 0, 2, 0, 2, 0] },
  "Amaj7": { frets: ["x", 0, 2, 1, 2, 0] },
  "Asus4": { frets: ["x", 0, 2, 2, 3, 0] },
  "A/Db": { frets: ["x", 4, 2, 2, 2, 0] },
  "A/C#": { frets: ["x", 4, 2, 2, 2, 0] },
  "A/D": { frets: ["x", "x", 0, 2, 2, 0] },
  "A/G": { frets: [3, 0, 2, 2, 2, 0] },

  "A#": { frets: ["x", 1, 3, 3, 3, 1] },
  "A#m": { frets: ["x", 1, 3, 3, 2, 1] },
  "A#sus4": { frets: ["x", 1, 3, 3, 4, 1] },

  "B": { frets: ["x", 2, 4, 4, 4, 2], baseFret: 2 },
  "Bm": { frets: ["x", 2, 4, 4, 3, 2], baseFret: 2 },
  "B7": { frets: ["x", 2, 1, 2, 0, 2] },
  "Bmaj7": { frets: ["x", 2, 4, 3, 4, 2], baseFret: 2 },
  "Bsus4": { frets: ["x", 2, 4, 4, 5, 2], baseFret: 2 },
  "Bbm": { frets: ["x", 1, 3, 3, 2, 1] },

  // Added m7 chords
  "Cm7": { frets: ["x", 3, 5, 3, 4, 3], baseFret: 3 },
  "C#m7": { frets: ["x", 4, 6, 4, 5, 4], baseFret: 4 },
  "Dm7": { frets: ["x", "x", 0, 2, 1, 1] },
  "D#m7": { frets: ["x", 6, 8, 6, 7, 6], baseFret: 6 },
  "Em7": { frets: [0, 2, 2, 0, 3, 0] },
  "Fm7": { frets: [1, 3, 1, 1, 1, 1] },
  "F#m7": { frets: [2, 4, 2, 2, 2, 2], baseFret: 2 },
  "Gm7": { frets: [3, 5, 3, 3, 3, 3], baseFret: 3 },
  "G#m7": { frets: [4, 6, 4, 4, 4, 4], baseFret: 4 },
  "Am7": { frets: ["x", 0, 2, 0, 1, 0] },
  "A#m7": { frets: ["x", 1, 3, 1, 2, 1] },
  "Bm7": { frets: ["x", 2, 4, 2, 3, 2], baseFret: 2 },

  // Advanced Chords
  "C6": { frets: [8,"x",8,9,8,"x"], baseFret: 8 },
  "C9": { frets: ["x",3,2,3,3,"x"], baseFret: 2 },
  "C11": { frets: ["x",3,3,3,3,3], baseFret: 3 },
  "C13": { frets: ["x",3,2,3,5,"x"], baseFret: 2 },
  "Cm7b5": { frets: [8,"x",8,8,7,"x"], baseFret: 7 },
  "Cdim": { frets: ["x",3,4,5,4,"x"], baseFret: 3 },
  "Cdim7": { frets: ["x",3,4,2,4,"x"], baseFret: 2 },
  "Caug": { frets: ["x",3,6,5,5,"x"], baseFret: 3 },
  "Cm9": { frets: ["x",3,1,3,3,"x"] },
  "Cmaj9": { frets: ["x",3,4,4,3,"x"], baseFret: 3 },
  "C7sus4": { frets: [8,10,8,10,8,8], baseFret: 8 },
  "Cm6": { frets: [8,"x",8,8,8,"x"], baseFret: 8 },
  "C#6": { frets: [9,"x",9,10,9,"x"], baseFret: 9 },
  "C#9": { frets: ["x",4,3,4,4,"x"], baseFret: 3 },
  "C#11": { frets: ["x",4,4,4,4,4], baseFret: 4 },
  "C#13": { frets: ["x",4,3,4,6,"x"], baseFret: 3 },
  "C#m7b5": { frets: [9,"x",9,9,8,"x"], baseFret: 8 },
  "C#dim": { frets: ["x",4,5,6,5,"x"], baseFret: 4 },
  "C#dim7": { frets: ["x",4,5,3,5,"x"], baseFret: 3 },
  "C#aug": { frets: ["x",4,7,6,6,"x"], baseFret: 4 },
  "C#m9": { frets: ["x",4,2,4,4,"x"], baseFret: 2 },
  "C#maj9": { frets: ["x",4,5,5,4,"x"], baseFret: 4 },
  "C#7sus4": { frets: [9,11,9,11,9,9], baseFret: 9 },
  "C#m6": { frets: [9,"x",9,9,9,"x"], baseFret: 9 },
  "D6": { frets: [10,"x",10,11,10,"x"], baseFret: 10 },
  "D9": { frets: ["x",5,4,5,5,"x"], baseFret: 4 },
  "D11": { frets: ["x",5,5,5,5,5], baseFret: 5 },
  "D13": { frets: ["x",5,4,5,7,"x"], baseFret: 4 },
  "Dm7b5": { frets: [10,"x",10,10,9,"x"], baseFret: 9 },
  "Ddim": { frets: ["x",5,6,7,6,"x"], baseFret: 5 },
  "Ddim7": { frets: ["x",5,6,4,6,"x"], baseFret: 4 },
  "Daug": { frets: ["x",5,8,7,7,"x"], baseFret: 5 },
  "Dm9": { frets: ["x",5,3,5,5,"x"], baseFret: 3 },
  "Dmaj9": { frets: ["x",5,6,6,5,"x"], baseFret: 5 },
  "D7sus4": { frets: [10,12,10,12,10,10], baseFret: 10 },
  "Dm6": { frets: [10,"x",10,10,10,"x"], baseFret: 10 },
  "D#6": { frets: [11,"x",11,12,11,"x"], baseFret: 11 },
  "D#9": { frets: ["x",6,5,6,6,"x"], baseFret: 5 },
  "D#11": { frets: ["x",6,6,6,6,6], baseFret: 6 },
  "D#13": { frets: ["x",6,5,6,8,"x"], baseFret: 5 },
  "D#m7b5": { frets: [11,"x",11,11,10,"x"], baseFret: 10 },
  "D#dim": { frets: ["x",6,7,8,7,"x"], baseFret: 6 },
  "D#dim7": { frets: ["x",6,7,5,7,"x"], baseFret: 5 },
  "D#aug": { frets: ["x",6,9,8,8,"x"], baseFret: 6 },
  "D#m9": { frets: ["x",6,4,6,6,"x"], baseFret: 4 },
  "D#maj9": { frets: ["x",6,7,7,6,"x"], baseFret: 6 },
  "D#7sus4": { frets: [11,13,11,13,11,11], baseFret: 11 },
  "D#m6": { frets: [11,"x",11,11,11,"x"], baseFret: 11 },
  "E6": { frets: [0,"x",0,1,0,"x"] },
  "E9": { frets: ["x",7,6,7,7,"x"], baseFret: 6 },
  "E11": { frets: ["x",7,7,7,7,7], baseFret: 7 },
  "E13": { frets: ["x",7,6,7,9,"x"], baseFret: 6 },
  "Em7b5": { frets: [0,"x",0,0,0,"x"] },
  "Edim": { frets: ["x",7,8,9,8,"x"], baseFret: 7 },
  "Edim7": { frets: ["x",7,8,6,8,"x"], baseFret: 6 },
  "Eaug": { frets: ["x",7,10,9,9,"x"], baseFret: 7 },
  "Em9": { frets: ["x",7,5,7,7,"x"], baseFret: 5 },
  "Emaj9": { frets: ["x",7,8,8,7,"x"], baseFret: 7 },
  "E7sus4": { frets: [0,2,0,2,0,0], baseFret: 2 },
  "Em6": { frets: [0,"x",0,0,0,"x"] },
  "F6": { frets: [1,"x",1,2,1,"x"] },
  "F9": { frets: ["x",8,7,8,8,"x"], baseFret: 7 },
  "F11": { frets: ["x",8,8,8,8,8], baseFret: 8 },
  "F13": { frets: ["x",8,7,8,10,"x"], baseFret: 7 },
  "Fm7b5": { frets: [1,"x",1,1,0,"x"] },
  "Fdim": { frets: ["x",8,9,10,9,"x"], baseFret: 8 },
  "Fdim7": { frets: ["x",8,9,7,9,"x"], baseFret: 7 },
  "Faug": { frets: ["x",8,11,10,10,"x"], baseFret: 8 },
  "Fm9": { frets: ["x",8,6,8,8,"x"], baseFret: 6 },
  "Fmaj9": { frets: ["x",8,9,9,8,"x"], baseFret: 8 },
  "F7sus4": { frets: [1,3,1,3,1,1] },
  "Fm6": { frets: [1,"x",1,1,1,"x"] },
  "F#6": { frets: [2,"x",2,3,2,"x"], baseFret: 2 },
  "F#9": { frets: ["x",9,8,9,9,"x"], baseFret: 8 },
  "F#11": { frets: ["x",9,9,9,9,9], baseFret: 9 },
  "F#13": { frets: ["x",9,8,9,11,"x"], baseFret: 8 },
  "F#m7b5": { frets: [2,"x",2,2,1,"x"] },
  "F#dim": { frets: ["x",9,10,11,10,"x"], baseFret: 9 },
  "F#dim7": { frets: ["x",9,10,8,10,"x"], baseFret: 8 },
  "F#aug": { frets: ["x",9,12,11,11,"x"], baseFret: 9 },
  "F#m9": { frets: ["x",9,7,9,9,"x"], baseFret: 7 },
  "F#maj9": { frets: ["x",9,10,10,9,"x"], baseFret: 9 },
  "F#7sus4": { frets: [2,4,2,4,2,2], baseFret: 2 },
  "F#m6": { frets: [2,"x",2,2,2,"x"], baseFret: 2 },
  "G6": { frets: [3,"x",3,4,3,"x"], baseFret: 3 },
  "G9": { frets: ["x",10,9,10,10,"x"], baseFret: 9 },
  "G11": { frets: ["x",10,10,10,10,10], baseFret: 10 },
  "G13": { frets: ["x",10,9,10,12,"x"], baseFret: 9 },
  "Gm7b5": { frets: [3,"x",3,3,2,"x"], baseFret: 2 },
  "Gdim": { frets: ["x",10,11,12,11,"x"], baseFret: 10 },
  "Gdim7": { frets: ["x",10,11,9,11,"x"], baseFret: 9 },
  "Gaug": { frets: ["x",10,13,12,12,"x"], baseFret: 10 },
  "Gm9": { frets: ["x",10,8,10,10,"x"], baseFret: 8 },
  "Gmaj9": { frets: ["x",10,11,11,10,"x"], baseFret: 10 },
  "G7sus4": { frets: [3,5,3,5,3,3], baseFret: 3 },
  "Gm6": { frets: [3,"x",3,3,3,"x"], baseFret: 3 },
  "G#6": { frets: [4,"x",4,5,4,"x"], baseFret: 4 },
  "G#9": { frets: ["x",11,10,11,11,"x"], baseFret: 10 },
  "G#11": { frets: ["x",11,11,11,11,11], baseFret: 11 },
  "G#13": { frets: ["x",11,10,11,13,"x"], baseFret: 10 },
  "G#m7b5": { frets: [4,"x",4,4,3,"x"], baseFret: 3 },
  "G#dim": { frets: ["x",11,12,13,12,"x"], baseFret: 11 },
  "G#dim7": { frets: ["x",11,12,10,12,"x"], baseFret: 10 },
  "G#aug": { frets: ["x",11,14,13,13,"x"], baseFret: 11 },
  "G#m9": { frets: ["x",11,9,11,11,"x"], baseFret: 9 },
  "G#maj9": { frets: ["x",11,12,12,11,"x"], baseFret: 11 },
  "G#7sus4": { frets: [4,6,4,6,4,4], baseFret: 4 },
  "G#m6": { frets: [4,"x",4,4,4,"x"], baseFret: 4 },
  "A6": { frets: [5,"x",5,6,5,"x"], baseFret: 5 },
  "A9": { frets: ["x",0,0,0,0,"x"] },
  "A11": { frets: ["x",0,0,0,0,0] },
  "A13": { frets: ["x",0,0,0,2,"x"], baseFret: 2 },
  "Am7b5": { frets: [5,"x",5,5,4,"x"], baseFret: 4 },
  "Adim": { frets: ["x",0,1,2,1,"x"] },
  "Adim7": { frets: ["x",0,1,0,1,"x"] },
  "Aaug": { frets: ["x",0,3,2,2,"x"], baseFret: 2 },
  "Am9": { frets: ["x",0,0,0,0,"x"] },
  "Amaj9": { frets: ["x",0,1,1,0,"x"] },
  "A7sus4": { frets: [5,7,5,7,5,5], baseFret: 5 },
  "Am6": { frets: [5,"x",5,5,5,"x"], baseFret: 5 },
  "A#6": { frets: [6,"x",6,7,6,"x"], baseFret: 6 },
  "A#9": { frets: ["x",1,0,1,1,"x"] },
  "A#11": { frets: ["x",1,1,1,1,1] },
  "A#13": { frets: ["x",1,0,1,3,"x"] },
  "A#m7b5": { frets: [6,"x",6,6,5,"x"], baseFret: 5 },
  "A#dim": { frets: ["x",1,2,3,2,"x"] },
  "A#dim7": { frets: ["x",1,2,0,2,"x"] },
  "A#aug": { frets: ["x",1,4,3,3,"x"] },
  "A#m9": { frets: ["x",1,0,1,1,"x"] },
  "A#maj9": { frets: ["x",1,2,2,1,"x"] },
  "A#7sus4": { frets: [6,8,6,8,6,6], baseFret: 6 },
  "A#m6": { frets: [6,"x",6,6,6,"x"], baseFret: 6 },
  "B6": { frets: [7,"x",7,8,7,"x"], baseFret: 7 },
  "B9": { frets: ["x",2,1,2,2,"x"] },
  "B11": { frets: ["x",2,2,2,2,2], baseFret: 2 },
  "B13": { frets: ["x",2,1,2,4,"x"] },
  "Bm7b5": { frets: [7,"x",7,7,6,"x"], baseFret: 6 },
  "Bdim": { frets: ["x",2,3,4,3,"x"], baseFret: 2 },
  "Bdim7": { frets: ["x",2,3,1,3,"x"] },
  "Baug": { frets: ["x",2,5,4,4,"x"], baseFret: 2 },
  "Bm9": { frets: ["x",2,0,2,2,"x"], baseFret: 2 },
  "Bmaj9": { frets: ["x",2,3,3,2,"x"], baseFret: 2 },
  "B7sus4": { frets: [7,9,7,9,7,7], baseFret: 7 },
  "Bm6": { frets: [7,"x",7,7,7,"x"], baseFret: 7 },
  "Db6": { frets: [9,"x",9,10,9,"x"], baseFret: 9 },
  "Db9": { frets: ["x",4,3,4,4,"x"], baseFret: 3 },
  "Db11": { frets: ["x",4,4,4,4,4], baseFret: 4 },
  "Db13": { frets: ["x",4,3,4,6,"x"], baseFret: 3 },
  "Dbm7b5": { frets: [9,"x",9,9,8,"x"], baseFret: 8 },
  "Dbdim": { frets: ["x",4,5,6,5,"x"], baseFret: 4 },
  "Dbdim7": { frets: ["x",4,5,3,5,"x"], baseFret: 3 },
  "Dbaug": { frets: ["x",4,7,6,6,"x"], baseFret: 4 },
  "Dbm9": { frets: ["x",4,2,4,4,"x"], baseFret: 2 },
  "Dbmaj9": { frets: ["x",4,5,5,4,"x"], baseFret: 4 },
  "Db7sus4": { frets: [9,11,9,11,9,9], baseFret: 9 },
  "Dbm6": { frets: [9,"x",9,9,9,"x"], baseFret: 9 },
  "Eb6": { frets: [11,"x",11,12,11,"x"], baseFret: 11 },
  "Eb9": { frets: ["x",6,5,6,6,"x"], baseFret: 5 },
  "Eb11": { frets: ["x",6,6,6,6,6], baseFret: 6 },
  "Eb13": { frets: ["x",6,5,6,8,"x"], baseFret: 5 },
  "Ebm7b5": { frets: [11,"x",11,11,10,"x"], baseFret: 10 },
  "Ebdim": { frets: ["x",6,7,8,7,"x"], baseFret: 6 },
  "Ebdim7": { frets: ["x",6,7,5,7,"x"], baseFret: 5 },
  "Ebaug": { frets: ["x",6,9,8,8,"x"], baseFret: 6 },
  "Ebm9": { frets: ["x",6,4,6,6,"x"], baseFret: 4 },
  "Ebmaj9": { frets: ["x",6,7,7,6,"x"], baseFret: 6 },
  "Eb7sus4": { frets: [11,13,11,13,11,11], baseFret: 11 },
  "Ebm6": { frets: [11,"x",11,11,11,"x"], baseFret: 11 },
  "Gb6": { frets: [2,"x",2,3,2,"x"], baseFret: 2 },
  "Gb9": { frets: ["x",9,8,9,9,"x"], baseFret: 8 },
  "Gb11": { frets: ["x",9,9,9,9,9], baseFret: 9 },
  "Gb13": { frets: ["x",9,8,9,11,"x"], baseFret: 8 },
  "Gbm7b5": { frets: [2,"x",2,2,1,"x"] },
  "Gbdim": { frets: ["x",9,10,11,10,"x"], baseFret: 9 },
  "Gbdim7": { frets: ["x",9,10,8,10,"x"], baseFret: 8 },
  "Gbaug": { frets: ["x",9,12,11,11,"x"], baseFret: 9 },
  "Gbm9": { frets: ["x",9,7,9,9,"x"], baseFret: 7 },
  "Gbmaj9": { frets: ["x",9,10,10,9,"x"], baseFret: 9 },
  "Gb7sus4": { frets: [2,4,2,4,2,2], baseFret: 2 },
  "Gbm6": { frets: [2,"x",2,2,2,"x"], baseFret: 2 },
  "Ab6": { frets: [4,"x",4,5,4,"x"], baseFret: 4 },
  "Ab9": { frets: ["x",11,10,11,11,"x"], baseFret: 10 },
  "Ab11": { frets: ["x",11,11,11,11,11], baseFret: 11 },
  "Ab13": { frets: ["x",11,10,11,13,"x"], baseFret: 10 },
  "Abm7b5": { frets: [4,"x",4,4,3,"x"], baseFret: 3 },
  "Abdim": { frets: ["x",11,12,13,12,"x"], baseFret: 11 },
  "Abdim7": { frets: ["x",11,12,10,12,"x"], baseFret: 10 },
  "Abaug": { frets: ["x",11,14,13,13,"x"], baseFret: 11 },
  "Abm9": { frets: ["x",11,9,11,11,"x"], baseFret: 9 },
  "Abmaj9": { frets: ["x",11,12,12,11,"x"], baseFret: 11 },
  "Ab7sus4": { frets: [4,6,4,6,4,4], baseFret: 4 },
  "Abm6": { frets: [4,"x",4,4,4,"x"], baseFret: 4 },
  "Bb6": { frets: [6,"x",6,7,6,"x"], baseFret: 6 },
  "Bb9": { frets: ["x",1,0,1,1,"x"] },
  "Bb11": { frets: ["x",1,1,1,1,1] },
  "Bb13": { frets: ["x",1,0,1,3,"x"] },
  "Bbm7b5": { frets: [6,"x",6,6,5,"x"], baseFret: 5 },
  "Bbdim": { frets: ["x",1,2,3,2,"x"] },
  "Bbdim7": { frets: ["x",1,2,0,2,"x"] },
  "Bbaug": { frets: ["x",1,4,3,3,"x"] },
  "Bbm9": { frets: ["x",1,0,1,1,"x"] },
  "Bbmaj9": { frets: ["x",1,2,2,1,"x"] },
  "Bb7sus4": { frets: [6,8,6,8,6,6], baseFret: 6 },
  "Bbm6": { frets: [6,"x",6,6,6,"x"], baseFret: 6 },
};

// Represents bass fretboard root note positions (string 1-4: E, A, D, G)
export interface BassShape {
  frets: (number | "x")[];
  baseFret?: number;
}

const BASS_DATABASE: Record<string, BassShape> = {
  "C": { frets: ["x", 3, "x", "x"] },
  "C#": { frets: ["x", 4, "x", "x"] },
  "D": { frets: ["x", 5, "x", "x"] },
  "D#": { frets: ["x", 6, "x", "x"] },
  "E": { frets: [0, "x", "x", "x"] },
  "F": { frets: [1, "x", "x", "x"] },
  "F#": { frets: [2, "x", "x", "x"] },
  "G": { frets: [3, "x", "x", "x"] },
  "G#": { frets: [4, "x", "x", "x"] },
  "A": { frets: ["x", 0, "x", "x"] },
  "A#": { frets: ["x", 1, "x", "x"] },
  "B": { frets: ["x", 2, "x", "x"] },
};

// Piano keys intervals (semitones from root note)
const PIANO_INTERVALS: Record<string, number[]> = {
  "major": [0, 4, 7],
  "m": [0, 3, 7],
  "minor": [0, 3, 7],
  "7": [0, 4, 7, 10],
  "maj7": [0, 4, 7, 11],
  "m7": [0, 3, 7, 10],
  "sus4": [0, 5, 7],
  "5": [0, 7],
  "add9": [0, 4, 7, 14],
};

export function getGuitarChordShape(chord: string): GuitarShape {
  const normalized = chord.trim();
  if (GUITAR_DATABASE[normalized]) {
    return GUITAR_DATABASE[normalized];
  }

  // 1. Try normalizing root and/or bass enharmonics for slash chords
  const slashIndex = normalized.indexOf("/");
  if (slashIndex > 0) {
    const root = normalized.substring(0, slashIndex);
    const bass = normalized.substring(slashIndex + 1);

    const normRoot = normalizeNoteName(root);
    const normBass = normalizeNoteName(bass);

    const getEnharmonicEquivalent = (note: string): string => {
      const equivalents: Record<string, string> = {
        "C#": "Db", "Db": "C#",
        "D#": "Eb", "Eb": "D#",
        "F#": "Gb", "Gb": "F#",
        "G#": "Ab", "Ab": "G#",
        "A#": "Bb", "Bb": "A#",
      };
      return equivalents[note] ?? note;
    };

    const variations = [
      `${normRoot}/${normBass}`,
      `${root}/${bass}`,
      `${normRoot}/${getEnharmonicEquivalent(normBass)}`,
      `${root}/${getEnharmonicEquivalent(bass)}`,
    ];

    for (const variant of variations) {
      if (GUITAR_DATABASE[variant]) {
        return GUITAR_DATABASE[variant];
      }
    }

    // Fallback: use main chord shape
    const normMainChord = normalizeNoteName(root);
    if (GUITAR_DATABASE[normMainChord]) {
      return GUITAR_DATABASE[normMainChord];
    }
    if (GUITAR_DATABASE[root]) {
      return GUITAR_DATABASE[root];
    }
  }

  // Fallback: search main root + quality
  const match = normalizeNoteName(normalized).match(/^([A-G]#?|Bb|Eb|Ab|Db|Gb)?(.*)$/);
  if (match) {
    const [, root, suffix] = match;
    const baseChord = (root ?? "C") + (suffix ?? "");
    if (GUITAR_DATABASE[baseChord]) {
      return GUITAR_DATABASE[baseChord];
    }
    if (GUITAR_DATABASE[root ?? "C"]) {
      return GUITAR_DATABASE[root ?? "C"];
    }
  }

  return { frets: [0, 0, 0, 0, 0, 0] }; // Empty fallback
}

export function getBassChordShape(chord: string): BassShape {
  const normalized = normalizeNoteName(chord.trim());
  
  // For bass, if it's a slash chord, the bass player plays the slash note!
  // e.g. C/F -> Bass plays F!
  const slashIndex = normalized.indexOf("/");
  if (slashIndex > 0) {
    const bassNote = normalized.substring(slashIndex + 1);
    const bassNormalized = normalizeNoteName(bassNote);
    if (BASS_DATABASE[bassNormalized]) {
      return BASS_DATABASE[bassNormalized];
    }
  }

  const match = normalized.match(/^([A-G]#?|Bb|Eb|Ab|Db|Gb)?(.*)$/);
  if (match) {
    const [, root] = match;
    const cleanRoot = normalizeNoteName(root ?? "C");
    if (BASS_DATABASE[cleanRoot]) {
      return BASS_DATABASE[cleanRoot];
    }
  }

  return { frets: [0, "x", "x", "x"] };
}

export function getPianoKeys(chord: string): number[] {
  const normalized = normalizeNoteName(chord.trim());
  const match = normalized.match(/^([A-G]#?|Bb|Eb|Ab|Db|Gb)?(.*)$/);
  if (!match) return [0, 4, 7];

  const [, root, suffix] = match;
  const cleanRoot = normalizeNoteName(root ?? "C");
  const rootMidiIndex = CHROMATIC_SCALE.indexOf(cleanRoot);
  if (rootMidiIndex < 0) return [0, 4, 7];

  // Determine chord quality/intervals
  let intervals = PIANO_INTERVALS["major"];
  const cleanSuffix = suffix ?? "";
  if (cleanSuffix.startsWith("maj7")) {
    intervals = PIANO_INTERVALS["maj7"];
  } else if (cleanSuffix.startsWith("m7")) {
    intervals = PIANO_INTERVALS["m7"];
  } else if (cleanSuffix.startsWith("m") && !cleanSuffix.startsWith("maj")) {
    intervals = PIANO_INTERVALS["m"];
  } else if (cleanSuffix.startsWith("sus4")) {
    intervals = PIANO_INTERVALS["sus4"];
  } else if (cleanSuffix.startsWith("7")) {
    intervals = PIANO_INTERVALS["7"];
  } else if (cleanSuffix.startsWith("add9")) {
    intervals = PIANO_INTERVALS["add9"];
  } else if (cleanSuffix.startsWith("5")) {
    intervals = PIANO_INTERVALS["5"];
  }

  // Calculate absolute keyboard note positions (0 to 23 for 2 octaves)
  const keysToHighlight = intervals.map((interval) => (rootMidiIndex + interval) % 24);

  // If it's a slash chord, also highlight the bass note in the lower octave!
  const slashIndex = normalized.indexOf("/");
  if (slashIndex > 0) {
    const bassNote = normalizeNoteName(normalized.substring(slashIndex + 1));
    const bassMidiIndex = CHROMATIC_SCALE.indexOf(bassNote);
    if (bassMidiIndex >= 0) {
      keysToHighlight.push(bassMidiIndex); // Add the bass note
    }
  }

  return Array.from(new Set(keysToHighlight));
}
