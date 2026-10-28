import {
  STAGE_GRID,
  SYMBOLS,
  bpmTravelTimeMs,
  newChart,
  snapTarget,
  sortNotes,
  type Chart,
  type Note,
  type Side,
  type Song,
  type SymbolName
} from './domain';

export type SectionKind = 'intro' | 'verse' | 'build' | 'chorus' | 'bridge' | 'build2' | 'climax' | 'outro';
export type DrumStyle = 'chill' | 'pop' | 'synthwave' | 'waltz' | 'funk' | 'trance' | 'cyber' | 'breakbeat' | 'artcore' | 'boss';

export type DemoSection = {
  kind: SectionKind;
  bars: number;
  progression: number;
  motif: number;
  energy: number;
  octaveShift?: number;
};

export type DemoSpec = {
  level: number;
  id: string;
  title: string;
  artist: string;
  chartName: string;
  difficulty: Chart['difficulty'];
  bpm: number;
  timeSignature: { numerator: 3 | 4; denominator: 4 };
  seconds: number;
  root: number;
  palette: number;
  drumStyle: DrumStyle;
  /** Semitone offsets from root for the 8-note modal scale (includes octave + upper extensions). */
  scaleSemitones: readonly number[];
  /** Scale degree indices (0..7) for 4-bar chord progressions per section type. */
  progressions: readonly (readonly [number, number, number, number])[];
  /** Scale degree indices (0..9, or -1 for rest) for 16-step melodic motifs. */
  motifs: readonly (readonly number[])[];
  /** Arpeggio degree offsets added to the active chord root. */
  arpPattern: readonly number[];
  /** Bass groove rhythm and octave/fifth offsets per 16th step. */
  bassPattern: readonly number[];
  /** Full multi-section song arrangement. */
  sections: readonly DemoSection[];
};

export const DEMO_SPECS: readonly DemoSpec[] = [
  {
    level: 1,
    id: 'demo-afterglow',
    title: '01. Afterglow Horizon',
    artist: 'BeatOrbit Originals',
    chartName: 'First Light',
    difficulty: 'easy',
    bpm: 96,
    timeSignature: { numerator: 4, denominator: 4 },
    seconds: 92,
    root: 174.61, // F3 Lydian
    palette: 0,
    drumStyle: 'chill',
    scaleSemitones: [0, 2, 4, 6, 7, 9, 11, 12, 14, 16],
    progressions: [
      [0, 4, 5, 3], // Intro / Verse: F - C - Dm - Bdim/G
      [3, 4, 5, 4], // Build
      [0, 4, 2, 3], // Chorus: Warm Lydian lift
      [5, 3, 0, 4]  // Bridge
    ],
    motifs: [
      [0, -1, 2, -1, 4, -1, 2, -1, 3, -1, 4, -1, 2, -1, -1, -1],
      [4, -1, 6, -1, 7, -1, 4, -1, 5, -1, 4, -1, 2, -1, 0, -1],
      [7, -1, 6, 4, 7, -1, 9, -1, 7, -1, 6, 4, 5, -1, 4, -1],
      [2, -1, -1, -1, 4, -1, -1, -1, 6, -1, 4, -1, 7, -1, -1, -1]
    ],
    arpPattern: [0, 2, 4, 6, 4, 2, 4, 7],
    bassPattern: [0, 0, -1, 0, 0, -1, 4, -1, 0, 0, -1, 0, 7, -1, 4, -1],
    sections: [
      { kind: 'intro', bars: 4, progression: 0, motif: 3, energy: 0.35 },
      { kind: 'verse', bars: 6, progression: 0, motif: 0, energy: 0.58 },
      { kind: 'build', bars: 4, progression: 1, motif: 1, energy: 0.72 },
      { kind: 'chorus', bars: 8, progression: 2, motif: 2, energy: 0.92 },
      { kind: 'bridge', bars: 4, progression: 3, motif: 3, energy: 0.48 },
      { kind: 'climax', bars: 6, progression: 2, motif: 2, energy: 1.0, octaveShift: 1 },
      { kind: 'outro', bars: 4, progression: 0, motif: 0, energy: 0.4 }
    ]
  },
  {
    level: 2,
    id: 'demo-starlight',
    title: '02. Starlight Promenade',
    artist: 'BeatOrbit Originals',
    chartName: 'Starlit Steps',
    difficulty: 'easy',
    bpm: 104,
    timeSignature: { numerator: 4, denominator: 4 },
    seconds: 96,
    root: 196.00, // G3 Major / Mixolydian
    palette: 1,
    drumStyle: 'pop',
    scaleSemitones: [0, 2, 4, 5, 7, 9, 11, 12, 14, 16],
    progressions: [
      [0, 5, 3, 4], // G - Em - C - D
      [3, 4, 5, 4], // C - D - Em - D
      [0, 4, 5, 3], // G - D - Em - C
      [5, 2, 3, 4]  // Em - Bm - C - D
    ],
    motifs: [
      [0, -1, 2, 4, 4, -1, 2, -1, 5, -1, 4, 2, 4, -1, -1, -1],
      [4, -1, 5, -1, 7, -1, 4, -1, 6, -1, 7, -1, 8, -1, 7, -1],
      [7, -1, 8, 7, 5, -1, 4, -1, 5, -1, 7, 5, 4, -1, 2, -1],
      [4, -1, -1, 2, 0, -1, -1, -1, 2, -1, 4, -1, 7, -1, -1, -1]
    ],
    arpPattern: [0, 4, 2, 7, 4, 2, 7, 4],
    bassPattern: [0, -1, 0, -1, 4, -1, 7, -1, 0, -1, 0, 4, 7, -1, 4, -1],
    sections: [
      { kind: 'intro', bars: 4, progression: 0, motif: 3, energy: 0.38 },
      { kind: 'verse', bars: 8, progression: 0, motif: 0, energy: 0.62 },
      { kind: 'build', bars: 4, progression: 1, motif: 1, energy: 0.76 },
      { kind: 'chorus', bars: 8, progression: 2, motif: 2, energy: 0.94 },
      { kind: 'bridge', bars: 4, progression: 3, motif: 3, energy: 0.5 },
      { kind: 'build2', bars: 4, progression: 1, motif: 1, energy: 0.82 },
      { kind: 'climax', bars: 6, progression: 2, motif: 2, energy: 1.0, octaveShift: 1 },
      { kind: 'outro', bars: 4, progression: 0, motif: 3, energy: 0.42 }
    ]
  },
  {
    level: 3,
    id: 'demo-lunar',
    title: '03. Lunar Drift',
    artist: 'BeatOrbit Originals',
    chartName: 'Lunar Flow',
    difficulty: 'normal',
    bpm: 112,
    timeSignature: { numerator: 4, denominator: 4 },
    seconds: 102,
    root: 220.00, // A3 Dorian
    palette: 2,
    drumStyle: 'synthwave',
    scaleSemitones: [0, 2, 3, 5, 7, 9, 10, 12, 14, 15],
    progressions: [
      [0, 6, 3, 4], // Am - G - D - Em
      [3, 4, 5, 6], // D - Em - F#dim - G
      [0, 3, 6, 4], // Am - D - G - Em
      [5, 3, 0, 6]  // Bridge Dorian shift
    ],
    motifs: [
      [0, -1, 2, 3, 4, -1, 3, 2, 0, -1, 4, -1, 3, -1, 2, -1],
      [4, -1, 5, 6, 7, -1, 6, 5, 4, -1, 7, -1, 8, -1, 7, -1],
      [7, -1, 6, 4, 5, -1, 4, 2, 3, -1, 4, 6, 7, -1, 4, -1],
      [0, 2, 4, -1, 7, 6, 4, -1, 3, 4, 5, -1, 4, -1, -1, -1]
    ],
    arpPattern: [0, 2, 4, 7, 9, 7, 4, 2],
    bassPattern: [0, 0, 7, 0, 0, 0, 7, 0, 0, 0, 7, 0, 4, 4, 7, 4],
    sections: [
      { kind: 'intro', bars: 4, progression: 0, motif: 3, energy: 0.4 },
      { kind: 'verse', bars: 8, progression: 0, motif: 0, energy: 0.65 },
      { kind: 'build', bars: 4, progression: 1, motif: 1, energy: 0.8 },
      { kind: 'chorus', bars: 8, progression: 2, motif: 2, energy: 0.95 },
      { kind: 'bridge', bars: 6, progression: 3, motif: 3, energy: 0.52 },
      { kind: 'build2', bars: 4, progression: 1, motif: 1, energy: 0.85 },
      { kind: 'climax', bars: 8, progression: 2, motif: 2, energy: 1.0, octaveShift: 1 },
      { kind: 'outro', bars: 4, progression: 0, motif: 0, energy: 0.42 }
    ]
  },
  {
    level: 4,
    id: 'demo-velvet',
    title: '04. Velvet Nebula',
    artist: 'BeatOrbit Originals',
    chartName: 'Celestial Waltz',
    difficulty: 'normal',
    bpm: 118,
    timeSignature: { numerator: 3, denominator: 4 },
    seconds: 98,
    root: 293.66, // D4 Aeolian Waltz
    palette: 3,
    drumStyle: 'waltz',
    scaleSemitones: [0, 2, 3, 5, 7, 8, 10, 12, 14, 15],
    progressions: [
      [0, 5, 2, 6], // Dm - Bb - F - C
      [3, 5, 6, 4], // Gm - Bb - C - Am
      [0, 3, 5, 6], // Dm - Gm - Bb - C
      [5, 2, 3, 4]  // Bb - F - Gm - A
    ],
    motifs: [
      // 12 steps per 3/4 bar (padded to 16 for universal lookup)
      [0, -1, -1, 2, 3, -1, 4, -1, 3, -1, 2, -1, 0, -1, 2, -1],
      [4, -1, -1, 5, 7, -1, 6, -1, 4, -1, 3, -1, 4, -1, 7, -1],
      [7, -1, 6, 4, 5, -1, 4, 2, 3, -1, 4, 7, 8, -1, 7, -1],
      [7, -1, -1, -1, 4, -1, -1, -1, 2, -1, 3, -1, 0, -1, -1, -1]
    ],
    arpPattern: [0, 2, 4, 7, 4, 2, 0, 4],
    bassPattern: [0, -1, -1, -1, 7, -1, -1, -1, 4, -1, -1, -1, 0, -1, 4, -1],
    sections: [
      { kind: 'intro', bars: 6, progression: 0, motif: 3, energy: 0.4 },
      { kind: 'verse', bars: 12, progression: 0, motif: 0, energy: 0.66 },
      { kind: 'build', bars: 6, progression: 1, motif: 1, energy: 0.8 },
      { kind: 'chorus', bars: 12, progression: 2, motif: 2, energy: 0.95 },
      { kind: 'bridge', bars: 8, progression: 3, motif: 3, energy: 0.52 },
      { kind: 'build2', bars: 4, progression: 1, motif: 1, energy: 0.86 },
      { kind: 'climax', bars: 10, progression: 2, motif: 2, energy: 1.0, octaveShift: 1 },
      { kind: 'outro', bars: 6, progression: 0, motif: 3, energy: 0.42 }
    ]
  },
  {
    level: 5,
    id: 'demo-solstice',
    title: '05. Neon Solstice',
    artist: 'BeatOrbit Originals',
    chartName: 'Solstice Groove',
    difficulty: 'normal',
    bpm: 124,
    timeSignature: { numerator: 4, denominator: 4 },
    seconds: 106,
    root: 164.81, // E3 Minor / Dorian Electro-Funk
    palette: 4,
    drumStyle: 'funk',
    scaleSemitones: [0, 2, 3, 5, 7, 9, 10, 12, 14, 15],
    progressions: [
      [0, 3, 6, 4], // Em - A - D - Bm
      [2, 3, 4, 6], // G - A - Bm - D
      [0, 5, 3, 6], // Em - C#dim/C - A - D
      [3, 2, 0, 6]
    ],
    motifs: [
      [0, -1, 2, 4, -1, 3, 2, -1, 0, 2, 4, -1, 6, 4, 2, -1],
      [4, -1, 6, 7, -1, 6, 4, -1, 3, 4, 6, -1, 7, 8, 7, -1],
      [7, 6, 4, -1, 7, 8, 9, -1, 7, 6, 4, 2, 3, 4, 6, -1],
      [0, -1, -1, 4, -1, -1, 3, -1, 2, -1, 4, -1, 7, -1, -1, -1]
    ],
    arpPattern: [0, 4, 7, 6, 4, 7, 9, 7],
    bassPattern: [0, -1, 0, 7, -1, 4, 0, -1, 0, -1, 7, 6, 4, -1, 2, 4],
    sections: [
      { kind: 'intro', bars: 6, progression: 0, motif: 3, energy: 0.42 },
      { kind: 'verse', bars: 8, progression: 0, motif: 0, energy: 0.68 },
      { kind: 'build', bars: 4, progression: 1, motif: 1, energy: 0.82 },
      { kind: 'chorus', bars: 10, progression: 2, motif: 2, energy: 0.96 },
      { kind: 'bridge', bars: 6, progression: 3, motif: 3, energy: 0.54 },
      { kind: 'build2', bars: 4, progression: 1, motif: 1, energy: 0.88 },
      { kind: 'climax', bars: 10, progression: 2, motif: 2, energy: 1.0, octaveShift: 1 },
      { kind: 'outro', bars: 6, progression: 0, motif: 0, energy: 0.45 }
    ]
  },
  {
    level: 6,
    id: 'demo-midnight',
    title: '06. Midnight Circuit',
    artist: 'BeatOrbit Originals',
    chartName: 'Circuit Run',
    difficulty: 'hard',
    bpm: 132,
    timeSignature: { numerator: 4, denominator: 4 },
    seconds: 110,
    root: 246.94, // B3 Aeolian Progressive Trance
    palette: 0,
    drumStyle: 'trance',
    scaleSemitones: [0, 2, 3, 5, 7, 8, 10, 12, 14, 15],
    progressions: [
      [0, 5, 6, 4], // Bm - G - A - F#m
      [5, 6, 4, 0], // G - A - F#m - Bm
      [0, 5, 2, 6], // Bm - G - D - A
      [3, 5, 0, 6]  // Em - G - Bm - A
    ],
    motifs: [
      [0, 2, 4, 2, 3, 2, 0, -1, 2, 3, 4, 6, 4, 3, 2, -1],
      [4, 5, 7, 5, 6, 5, 4, 2, 4, 5, 7, 8, 9, 8, 7, -1],
      [7, 6, 4, 7, 8, 7, 6, 4, 5, 4, 2, 5, 7, 6, 4, 2],
      [0, -1, 4, -1, 7, -1, 6, -1, 5, -1, 4, -1, 2, -1, 3, -1]
    ],
    arpPattern: [0, 2, 4, 7, 4, 7, 9, 7],
    bassPattern: [-1, 0, 7, 0, -1, 0, 7, 0, -1, 0, 7, 0, -1, 4, 7, 4],
    sections: [
      { kind: 'intro', bars: 6, progression: 0, motif: 3, energy: 0.45 },
      { kind: 'verse', bars: 10, progression: 0, motif: 0, energy: 0.72 },
      { kind: 'build', bars: 6, progression: 1, motif: 1, energy: 0.85 },
      { kind: 'chorus', bars: 12, progression: 2, motif: 2, energy: 0.98 },
      { kind: 'bridge', bars: 6, progression: 3, motif: 3, energy: 0.52 },
      { kind: 'build2', bars: 4, progression: 1, motif: 1, energy: 0.9 },
      { kind: 'climax', bars: 10, progression: 2, motif: 2, energy: 1.0, octaveShift: 1 },
      { kind: 'outro', bars: 6, progression: 0, motif: 3, energy: 0.45 }
    ]
  },
  {
    level: 7,
    id: 'demo-mirage',
    title: '07. Cybernetic Mirage',
    artist: 'BeatOrbit Originals',
    chartName: 'Phrygian Pulse',
    difficulty: 'hard',
    bpm: 140,
    timeSignature: { numerator: 4, denominator: 4 },
    seconds: 114,
    root: 277.18, // C#4 Phrygian Dominant
    palette: 1,
    drumStyle: 'cyber',
    scaleSemitones: [0, 1, 4, 5, 7, 8, 10, 12, 13, 16],
    progressions: [
      [0, 1, 0, 6], // C# - D - C# - B
      [1, 3, 5, 4], // D - F#m - A - G#
      [0, 5, 1, 4], // C# - A - D - G#
      [3, 1, 5, 4]
    ],
    motifs: [
      [0, 1, 2, 0, 4, 3, 2, 1, 0, 2, 3, 4, 5, 4, 2, 1],
      [4, 5, 6, 4, 7, 6, 5, 4, 5, 6, 7, 8, 9, 7, 6, 4],
      [7, 8, 7, 5, 4, 5, 4, 2, 3, 4, 5, 7, 8, 7, 5, 4],
      [0, -1, 1, -1, 2, -1, 4, -1, 5, -1, 4, -1, 2, 1, 0, -1]
    ],
    arpPattern: [0, 1, 4, 7, 8, 7, 4, 1],
    bassPattern: [0, 0, 7, 0, 1, 0, 7, 0, 0, 0, 8, 7, 5, 4, 2, 1],
    sections: [
      { kind: 'intro', bars: 6, progression: 0, motif: 3, energy: 0.46 },
      { kind: 'verse', bars: 10, progression: 0, motif: 0, energy: 0.75 },
      { kind: 'build', bars: 6, progression: 1, motif: 1, energy: 0.86 },
      { kind: 'chorus', bars: 12, progression: 2, motif: 2, energy: 0.98 },
      { kind: 'bridge', bars: 8, progression: 3, motif: 3, energy: 0.55 },
      { kind: 'build2', bars: 6, progression: 1, motif: 1, energy: 0.9 },
      { kind: 'climax', bars: 12, progression: 2, motif: 2, energy: 1.0, octaveShift: 1 },
      { kind: 'outro', bars: 6, progression: 0, motif: 3, energy: 0.46 }
    ]
  },
  {
    level: 8,
    id: 'demo-aurora',
    title: '08. Aurora Hyperdrive',
    artist: 'BeatOrbit Originals',
    chartName: 'Velocity Vector',
    difficulty: 'hard',
    bpm: 150,
    timeSignature: { numerator: 4, denominator: 4 },
    seconds: 118,
    root: 185.00, // F#3 Minor Melodic Breakbeat / DnB
    palette: 2,
    drumStyle: 'breakbeat',
    scaleSemitones: [0, 2, 3, 5, 7, 8, 10, 12, 14, 15],
    progressions: [
      [0, 5, 2, 6], // F#m - D - A - E
      [3, 5, 6, 4], // Bm - D - E - C#m
      [0, 3, 5, 6], // F#m - Bm - D - E
      [5, 2, 3, 6]
    ],
    motifs: [
      [0, 2, 4, -1, 6, 4, 2, 0, 3, 4, 6, -1, 7, 6, 4, 2],
      [4, 6, 7, 4, 8, 7, 6, 4, 5, 7, 8, 5, 9, 8, 7, 6],
      [7, 9, 8, 7, 6, 7, 6, 4, 5, 7, 6, 5, 4, 6, 7, 9],
      [7, -1, 6, -1, 4, -1, 2, -1, 3, -1, 4, -1, 6, -1, 7, -1]
    ],
    arpPattern: [0, 4, 7, 9, 7, 4, 9, 7],
    bassPattern: [0, -1, -1, 0, -1, 7, 4, -1, 0, -1, 7, -1, 5, -1, 4, 2],
    sections: [
      { kind: 'intro', bars: 8, progression: 0, motif: 3, energy: 0.48 },
      { kind: 'verse', bars: 12, progression: 0, motif: 0, energy: 0.76 },
      { kind: 'build', bars: 6, progression: 1, motif: 1, energy: 0.88 },
      { kind: 'chorus', bars: 14, progression: 2, motif: 2, energy: 0.98 },
      { kind: 'bridge', bars: 8, progression: 3, motif: 3, energy: 0.56 },
      { kind: 'build2', bars: 6, progression: 1, motif: 1, energy: 0.92 },
      { kind: 'climax', bars: 14, progression: 2, motif: 2, energy: 1.0, octaveShift: 1 },
      { kind: 'outro', bars: 6, progression: 0, motif: 3, energy: 0.48 }
    ]
  },
  {
    level: 9,
    id: 'demo-eclipse',
    title: '09. Quantum Eclipse',
    artist: 'BeatOrbit Originals',
    chartName: 'Event Horizon',
    difficulty: 'expert',
    bpm: 162,
    timeSignature: { numerator: 4, denominator: 4 },
    seconds: 124,
    root: 196.00, // G3 Harmonic Minor Symphonic Artcore
    palette: 3,
    drumStyle: 'artcore',
    scaleSemitones: [0, 2, 3, 5, 7, 8, 11, 12, 14, 15],
    progressions: [
      [0, 5, 3, 4], // Gm - Eb - Cm - D7
      [3, 5, 6, 4], // Cm - Eb - F#dim - D7
      [0, 3, 5, 4], // Gm - Cm - Eb - D7
      [5, 2, 3, 4]  // Eb - Bb - Cm - D7
    ],
    motifs: [
      [0, 2, 3, 4, 6, 4, 3, 2, 0, 3, 4, 6, 7, 6, 4, 3],
      [4, 6, 7, 8, 9, 8, 7, 6, 4, 6, 7, 8, 9, 7, 6, 4],
      [7, 8, 9, 7, 6, 7, 8, 6, 4, 6, 7, 4, 6, 7, 8, 9],
      [7, -1, 6, 4, 3, -1, 2, 0, 3, -1, 4, 6, 7, -1, 8, -1]
    ],
    arpPattern: [0, 2, 4, 6, 7, 6, 4, 2],
    bassPattern: [0, 7, 0, 7, 0, 7, 4, 7, 0, 7, 0, 8, 7, 6, 4, 2],
    sections: [
      { kind: 'intro', bars: 8, progression: 0, motif: 3, energy: 0.5 },
      { kind: 'verse', bars: 14, progression: 0, motif: 0, energy: 0.78 },
      { kind: 'build', bars: 6, progression: 1, motif: 1, energy: 0.9 },
      { kind: 'chorus', bars: 16, progression: 2, motif: 2, energy: 0.99 },
      { kind: 'bridge', bars: 8, progression: 3, motif: 3, energy: 0.58 },
      { kind: 'build2', bars: 6, progression: 1, motif: 1, energy: 0.94 },
      { kind: 'climax', bars: 16, progression: 2, motif: 2, energy: 1.0, octaveShift: 1 },
      { kind: 'outro', bars: 8, progression: 0, motif: 3, energy: 0.5 }
    ]
  },
  {
    level: 10,
    id: 'demo-singularity',
    title: '10. Omega Singularity',
    artist: 'BeatOrbit Originals',
    chartName: 'Supernova Finale',
    difficulty: 'expert',
    bpm: 174,
    timeSignature: { numerator: 4, denominator: 4 },
    seconds: 130,
    root: 293.66, // D4 Melodic Minor / In-Sen Hybrid Boss Finale
    palette: 4,
    drumStyle: 'boss',
    scaleSemitones: [0, 1, 3, 5, 7, 8, 11, 12, 13, 15],
    progressions: [
      [0, 5, 3, 6], // Dm - Bb - Gm - C#dim
      [3, 1, 5, 6], // Gm - Eb(b2) - Bb - C#dim
      [0, 1, 5, 4], // Dm - Eb - Bb - A7
      [5, 3, 1, 4]  // Bb - Gm - Eb - A7
    ],
    motifs: [
      [0, 2, 4, 3, 2, 4, 6, 4, 3, 5, 7, 5, 4, 6, 7, 8],
      [4, 6, 7, 8, 9, 8, 7, 6, 5, 7, 8, 9, 7, 8, 9, 7],
      [9, 8, 7, 4, 8, 7, 6, 3, 7, 6, 4, 2, 4, 6, 7, 9],
      [7, 4, 2, 0, 6, 4, 2, 0, 5, 3, 1, 0, 4, 6, 7, 9]
    ],
    arpPattern: [0, 3, 4, 7, 9, 7, 4, 3],
    bassPattern: [0, 7, 0, 7, 1, 7, 4, 7, 0, 7, 5, 7, 6, 4, 2, 1],
    sections: [
      { kind: 'intro', bars: 8, progression: 0, motif: 3, energy: 0.52 },
      { kind: 'verse', bars: 16, progression: 0, motif: 0, energy: 0.82 },
      { kind: 'build', bars: 8, progression: 1, motif: 1, energy: 0.92 },
      { kind: 'chorus', bars: 18, progression: 2, motif: 2, energy: 1.0 },
      { kind: 'bridge', bars: 10, progression: 3, motif: 3, energy: 0.6 },
      { kind: 'build2', bars: 8, progression: 1, motif: 1, energy: 0.96 },
      { kind: 'climax', bars: 18, progression: 2, motif: 2, energy: 1.0, octaveShift: 1 },
      { kind: 'outro', bars: 8, progression: 0, motif: 3, energy: 0.52 }
    ]
  }
];

export function findDemoSpec(bpm: number, root: number, seconds?: number): DemoSpec {
  let best = DEMO_SPECS[0];
  let bestScore = Infinity;
  for (const spec of DEMO_SPECS) {
    const score =
      Math.abs(spec.bpm - bpm) * 4 +
      Math.abs(spec.root - root) * 0.5 +
      (seconds !== undefined && seconds > 20 ? Math.abs(spec.seconds - seconds) * 0.2 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = spec;
    }
  }
  return best;
}

// ---- Fast Wavetable Lookup Tables for High-Quality Procedural Synthesis ----
const TABLE_SIZE = 4096;
const TABLE_MASK = TABLE_SIZE - 1;
const SIN_TABLE = new Float32Array(TABLE_SIZE);
const LEAD_TABLE = new Float32Array(TABLE_SIZE);
const PAD_TABLE = new Float32Array(TABLE_SIZE);
const BASS_TABLE = new Float32Array(TABLE_SIZE);

for (let i = 0; i < TABLE_SIZE; i++) {
  const phase = (i / TABLE_SIZE) * Math.PI * 2;
  const s1 = Math.sin(phase);
  const s2 = Math.sin(phase * 2);
  const s3 = Math.sin(phase * 3);
  const s4 = Math.sin(phase * 4);
  const s5 = Math.sin(phase * 5);
  SIN_TABLE[i] = s1;
  // Expressive synth lead: rich odd/even harmonics with warm roll-off
  LEAD_TABLE[i] = (s1 + 0.42 * s2 + 0.28 * s3 + 0.14 * s4 + 0.08 * s5) * 0.62;
  // Lush analog-style pad waveform
  PAD_TABLE[i] = (s1 + 0.35 * s2 + 0.2 * s3) * 0.7;
  // Punchy FM/saturated bass waveform
  BASS_TABLE[i] = (s1 + 0.55 * s2 + 0.25 * s3) * 0.65;
}

function semitoneRatio(semitones: number): number {
  return Math.pow(2, semitones / 12);
}

function scaleFreq(spec: DemoSpec, degree: number, octaveOffset = 0): number {
  const len = spec.scaleSemitones.length;
  const safeDeg = Math.max(0, degree);
  const oct = Math.floor(safeDeg / 7) + octaveOffset;
  const idx = safeDeg % len;
  return spec.root * semitoneRatio(spec.scaleSemitones[idx] + oct * 12);
}

export function resolveSectionAtBar(spec: DemoSpec, barIndex: number): {
  section: DemoSection;
  barInSection: number;
  sectionProgress: number;
} {
  let totalBars = 0;
  for (const s of spec.sections) totalBars += s.bars;
  const wrappedBar = totalBars > 0 ? barIndex % totalBars : 0;
  let cursor = 0;
  for (const section of spec.sections) {
    if (wrappedBar < cursor + section.bars) {
      const barInSection = wrappedBar - cursor;
      return {
        section,
        barInSection,
        sectionProgress: section.bars > 1 ? barInSection / section.bars : 0
      };
    }
    cursor += section.bars;
  }
  const last = spec.sections[spec.sections.length - 1];
  return { section: last, barInSection: 0, sectionProgress: 0 };
}

/**
 * Generates multi-section, non-repetitive procedural 16-bit PCM WAV audio.
 * Yields periodically so async callers remain responsive within the boot budget.
 */
export function* generateDemoTrackAudio(
  bpm: number,
  seconds: number,
  root = 220,
  specOverride?: DemoSpec
): Generator<void, Blob> {
  const spec = specOverride || findDemoSpec(bpm, root, seconds);
  const rate = 16000;
  const count = Math.floor(seconds * rate);
  const raw = new ArrayBuffer(44 + count * 2);
  const view = new DataView(raw);
  const write = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i));
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + count * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, count * 2, true);
  const samples = new Int16Array(raw, 44, count);

  const beatsPerBar = spec.timeSignature.numerator;
  const stepsPerBar = beatsPerBar * 4; // 16th-note resolution
  const stepSeconds = 60 / bpm / 4;
  const invRate = 1 / rate;
  const invStepSamples = 1 / (rate * stepSeconds);

  // Continuous oscillator phases to prevent clicks across step boundaries
  let bassPhase = 0;
  let padPhase1 = 0;
  let padPhase2 = 0;
  let padPhase3 = 0;
  let leadPhase = 0;
  let arpPhase = 0;
  let kickPhase = 0;
  let noise = (18273 + spec.level * 7919) | 0;

  // Pre-calculate per-sample decay multipliers
  const kickDecay = Math.exp(-16 / rate);
  const kickPitchDecay = Math.exp(-38 / rate);
  const snareDecay = Math.exp(-22 / rate);
  const hatClosedDecay = Math.exp(-95 / rate);
  const hatOpenDecay = Math.exp(-28 / rate);
  const leadDecay = Math.exp(-4.2 / rate);
  const arpDecay = Math.exp(-11.5 / rate);
  const bassDecay = Math.exp(-7.5 / rate);

  let kickEnv = 0;
  let kickPitchEnv = 0;
  let snareEnv = 0;
  let hatEnv = 0;
  let hatDecay = hatClosedDecay;
  let leadEnv = 0;
  let arpEnv = 0;
  let bassEnv = 0;
  let sidechainEnv = 0;

  let bassInc = 0;
  let padInc1 = 0;
  let padInc2 = 0;
  let padInc3 = 0;
  let leadInc = 0;
  let arpInc = 0;

  let padGain = 0.04;
  let leadGain = 0.12;
  let arpGain = 0.08;
  let bassGain = 0.16;
  let riserGain = 0;
  let riserInc = 0;
  let riserPhase = 0;

  let currentStep = -1;
  const scaleFactor = TABLE_SIZE / rate;

  for (let i = 0; i < count; i++) {
    // Yield every 131,072 samples (~8s of audio) to balance responsiveness and minimal timer overhead
    if (i > 0 && (i & 131071) === 0) yield;

    const t = i * invRate;
    const stepIndex = (i * invStepSamples) | 0;

    if (stepIndex !== currentStep) {
      currentStep = stepIndex;
      const barIndex = Math.floor(stepIndex / stepsPerBar);
      const stepInBar = stepIndex % stepsPerBar;
      const beatInBar = Math.floor(stepInBar / 4);
      const subStep = stepInBar % 4;
      const { section, barInSection, sectionProgress } = resolveSectionAtBar(spec, barIndex);
      const kind = section.kind;

      // Resolve harmonic chord degree for this bar (changes every bar or half-bar in climax)
      const prog = spec.progressions[section.progression % spec.progressions.length];
      const chordDeg = prog[(barInSection + (kind === 'climax' && beatInBar >= 2 ? 1 : 0)) % prog.length];

      // Pad triad frequencies (Root, 3rd, 5th in scale) with subtle warm detune
      const padRootFreq = scaleFreq(spec, chordDeg, 0) * (root / spec.root);
      const padThirdFreq = scaleFreq(spec, chordDeg + 2, 0) * (root / spec.root);
      const padFifthFreq = scaleFreq(spec, chordDeg + 4, 0) * (root / spec.root);
      padInc1 = padRootFreq * scaleFactor;
      padInc2 = padThirdFreq * 1.003 * scaleFactor;
      padInc3 = padFifthFreq * 0.997 * scaleFactor;

      // Section-based mix dynamics
      const e = section.energy;
      padGain = (kind === 'bridge' || kind === 'intro' || kind === 'outro' ? 0.065 : 0.042) * e;
      bassGain = (kind === 'intro' ? 0.09 : kind === 'bridge' ? 0.11 : 0.175) * e;
      leadGain = (kind === 'intro' ? 0.06 : kind === 'build' || kind === 'build2' ? 0.11 : 0.145) * e;
      arpGain = (kind === 'chorus' || kind === 'climax' ? 0.095 : 0.065) * e;

      // Riser sweep on build sections
      if (kind === 'build' || kind === 'build2') {
        const stepProgress = (barInSection * stepsPerBar + stepInBar) / (section.bars * stepsPerBar);
        riserGain = stepProgress * 0.065;
        riserInc = padRootFreq * (1 + stepProgress * 2) * scaleFactor;
      } else {
        riserGain = 0;
      }

      // Bassline trigger & pitch
      const bassStepDeg = spec.bassPattern[stepInBar % spec.bassPattern.length];
      const isPreDropSilence = (kind === 'build' || kind === 'build2') && barInSection === section.bars - 1 && beatInBar === beatsPerBar - 1;
      if (bassStepDeg >= 0 && !isPreDropSilence) {
        const bassFreq = scaleFreq(spec, chordDeg + (bassStepDeg % 8), -2) * (root / spec.root);
        bassInc = bassFreq * scaleFactor;
        bassEnv = subStep === 0 ? 1.0 : 0.72;
      }

      // Arpeggio trigger & pitch (evolves across bars using phrase variation)
      const arpPhraseShift = (barInSection % 2 === 1 && stepInBar >= 8) ? 2 : 0;
      const arpDeg = chordDeg + spec.arpPattern[(stepInBar + barInSection) % spec.arpPattern.length] + arpPhraseShift;
      const arpFreq = scaleFreq(spec, arpDeg, kind === 'climax' ? 1 : 0) * (root / spec.root);
      arpInc = arpFreq * scaleFactor;
      if (kind !== 'intro' || stepInBar % 2 === 0) {
        arpEnv = subStep % 2 === 0 ? 0.95 : 0.65;
      }

      // Multi-phrase Lead Melody (rotates motifs across bars so it never loops monotonously)
      const motifIdx = (section.motif + (barInSection % 4 === 3 ? 1 : 0)) % spec.motifs.length;
      const motif = spec.motifs[motifIdx];
      const rawLeadDeg = motif[stepInBar % motif.length];
      if (rawLeadDeg >= 0 && !isPreDropSilence) {
        // Call-and-response variation on odd vs even bars
        const callResponseShift = barInSection % 2 === 1 && stepInBar >= 8 ? (barInSection % 4 === 3 ? 2 : -1) : 0;
        const finalLeadDeg = Math.max(0, rawLeadDeg + chordDeg + callResponseShift);
        const leadOct = (section.octaveShift || 0) + (kind === 'bridge' ? 1 : 0);
        const leadFreq = scaleFreq(spec, finalLeadDeg, leadOct) * (root / spec.root);
        leadInc = leadFreq * scaleFactor;
        leadEnv = stepInBar % 4 === 0 ? 1.0 : 0.82;
      }

      // Drum & Percussion kit triggers by section and style
      if (!isPreDropSilence && kind !== 'outro') {
        let triggerKick = false;
        let triggerSnare = false;
        let triggerHat = false;
        let openHat = false;

        if (kind === 'intro') {
          triggerKick = barInSection >= 2 && stepInBar === 0;
          triggerHat = barInSection >= 2 && subStep === 2;
        } else if (kind === 'bridge') {
          triggerKick = stepInBar === 0;
          triggerSnare = beatsPerBar === 3 ? stepInBar === 8 : stepInBar === 8;
          triggerHat = subStep === 0 || subStep === 2;
        } else if (kind === 'build' || kind === 'build2') {
          const buildHalf = barInSection >= Math.floor(section.bars / 2);
          triggerKick = subStep === 0;
          // Accelerating snare roll in build-up
          triggerSnare = barInSection === section.bars - 1 ? true : buildHalf ? subStep % 2 === 0 : subStep === 0;
          triggerHat = subStep % 2 === 0;
        } else {
          // Active Groove Sections: Verse, Chorus, Climax
          switch (spec.drumStyle) {
            case 'waltz':
              triggerKick = stepInBar === 0 || (kind === 'climax' && stepInBar === 6);
              triggerSnare = stepInBar === 4 || stepInBar === 8;
              triggerHat = subStep === 0 || subStep === 2;
              openHat = stepInBar === 10;
              break;
            case 'breakbeat':
              triggerKick = stepInBar === 0 || stepInBar === 10 || (kind === 'climax' && stepInBar === 6);
              triggerSnare = stepInBar === 4 || stepInBar === 12 || (barInSection % 2 === 1 && stepInBar === 15);
              triggerHat = true;
              openHat = subStep === 2;
              break;
            case 'funk':
              triggerKick = stepInBar === 0 || stepInBar === 6 || stepInBar === 8 || stepInBar === 14;
              triggerSnare = stepInBar === 4 || stepInBar === 12 || stepInBar === 15;
              triggerHat = subStep % 2 === 0 || stepInBar === 7 || stepInBar === 15;
              openHat = subStep === 2;
              break;
            case 'artcore':
            case 'boss':
              triggerKick = subStep === 0 || stepInBar === 6 || stepInBar === 14 || (kind === 'climax' && stepInBar === 11);
              triggerSnare = stepInBar === 4 || stepInBar === 12 || (barInSection % 2 === 1 && stepInBar >= 14);
              triggerHat = true;
              openHat = subStep === 2;
              break;
            default:
              // chill, pop, synthwave, trance, cyber
              triggerKick = subStep === 0 || (spec.drumStyle === 'cyber' && stepInBar === 6);
              triggerSnare = stepInBar === 4 || stepInBar === 12;
              triggerHat = kind === 'verse' ? subStep % 2 === 0 : true;
              openHat = subStep === 2 && (kind === 'chorus' || kind === 'climax');
              break;
          }
        }

        if (triggerKick) {
          kickEnv = 1.0;
          kickPitchEnv = 1.0;
          kickPhase = 0;
          sidechainEnv = 0.65;
        }
        if (triggerSnare) {
          snareEnv = kind === 'build' || kind === 'build2' ? 0.45 + 0.55 * sectionProgress : 0.9;
        }
        if (triggerHat) {
          hatEnv = openHat ? 0.85 : subStep === 0 ? 0.65 : 0.42;
          hatDecay = openHat ? hatOpenDecay : hatClosedDecay;
        }
      }
    }

    // Per-sample synthesis using precomputed wavetables & fast 32-bit xorshift PRNG
    noise ^= noise << 13;
    noise ^= noise >> 17;
    noise ^= noise << 5;
    const white = (noise & 0x7fffffff) * 9.313225746154785e-10 - 1;

    // 1. Kick (Fundamental + rapid pitch-drop punch)
    let kickSample = 0;
    if (kickEnv > 0.001) {
      const kickFreq = 46 + 115 * kickPitchEnv;
      kickPhase += kickFreq * scaleFactor;
      kickSample = SIN_TABLE[kickPhase & TABLE_MASK] * kickEnv * 0.42;
      kickEnv *= kickDecay;
      kickPitchEnv *= kickPitchDecay;
      sidechainEnv *= kickDecay;
    }

    // 2. Snare / Clap (Body tone + crisp noise burst)
    let snareSample = 0;
    if (snareEnv > 0.001) {
      const snareBody = SIN_TABLE[(i * 46) & TABLE_MASK] * 0.35;
      snareSample = (white * 0.75 + snareBody) * snareEnv * 0.18;
      snareEnv *= snareDecay;
    }

    // 3. Hi-Hat
    let hatSample = 0;
    if (hatEnv > 0.001) {
      hatSample = white * hatEnv * 0.065;
      hatEnv *= hatDecay;
    }

    // 4. Bass (Sidechain-ducked against kick for modern dynamic clarity)
    bassPhase += bassInc;
    const duck = 1 - sidechainEnv * 0.55;
    const bassSample = BASS_TABLE[bassPhase & TABLE_MASK] * (0.35 + 0.65 * bassEnv) * bassGain * duck;
    bassEnv *= bassDecay;

    // 5. Lush 3-voice Detuned Pad
    padPhase1 += padInc1;
    padPhase2 += padInc2;
    padPhase3 += padInc3;
    const padSample =
      (PAD_TABLE[padPhase1 & TABLE_MASK] +
        PAD_TABLE[padPhase2 & TABLE_MASK] * 0.8 +
        PAD_TABLE[padPhase3 & TABLE_MASK] * 0.7) *
      padGain *
      duck;

    // 6. Arpeggio
    arpPhase += arpInc;
    const arpSample = SIN_TABLE[arpPhase & TABLE_MASK] * arpEnv * arpGain;
    arpEnv *= arpDecay;

    // 7. Expressive Lead Melody with subtle vibrato
    const vibrato = 1 + SIN_TABLE[(i * 14) & TABLE_MASK] * 0.0035;
    leadPhase += leadInc * vibrato;
    const leadSample = LEAD_TABLE[leadPhase & TABLE_MASK] * leadEnv * leadGain;
    leadEnv *= leadDecay;

    // 8. Build-up Riser
    let riserSample = 0;
    if (riserGain > 0) {
      riserPhase += riserInc;
      riserSample = (SIN_TABLE[riserPhase & TABLE_MASK] * 0.6 + white * 0.4) * riserGain;
    }

    // Master mix + Padé rational tanh soft-clipping limiter + fade in/out
    const fade = Math.min(1, t * 1.8, Math.max(0, (seconds - t) / 2.2));
    const x = (kickSample + snareSample + hatSample + bassSample + padSample + arpSample + leadSample + riserSample) * fade * 1.25;
    const x2 = x * x;
    const softClipped = x > 3 ? 1 : x < -3 ? -1 : (x * (27 + x2)) / (27 + 9 * x2);
    const pcm = (softClipped * 29500) | 0;
    samples[i] = pcm > 32767 ? 32767 : pcm < -32767 ? -32767 : pcm;
  }

  return new Blob([raw], { type: 'audio/wav' });
}

// ---- Systematic, Professional Chart Choreographer ----

const ANGLES = [0, 45, 90, 135, 180, 225, 270, 315] as const;

/**
 * Computes curated, grid-snapped stage coordinates and entry angles based on
 * the musical section, phrase progress, symbol, and track difficulty level.
 */
function choreographPlacement(
  level: number,
  kind: SectionKind,
  symbol: SymbolName,
  noteIndex: number,
  stepInBar: number,
  sideHint: Side = 'either'
): { target: { x: number; y: number }; entryAngleDeg: number } {
  const symIdx = SYMBOLS.indexOf(symbol);
  const gridStep = level >= 7 ? STAGE_GRID.minorStep : STAGE_GRID.majorStep;

  // 1. Orbital Ring formation for Chorus & Climax
  if (kind === 'chorus' || kind === 'climax') {
    const orbitSteps = level >= 8 ? 12 : 8;
    const dir = noteIndex % 16 < 8 ? 1 : -1;
    const theta = ((noteIndex * dir) % orbitSteps) * ((Math.PI * 2) / orbitSteps) - Math.PI / 2;
    const radiusX = kind === 'climax' ? 0.28 : 0.24;
    const radiusY = kind === 'climax' ? 0.25 : 0.22;
    const rawX = sideHint === 'left' ? 0.3 : sideHint === 'right' ? 0.7 : 0.5 + Math.cos(theta) * radiusX;
    const rawY = 0.5 + Math.sin(theta) * radiusY;
    const angleIdx = ((Math.round(((theta * 180) / Math.PI + 360) / 45) % 8) + 8) % 8;
    return {
      target: snapTarget({ x: rawX, y: rawY }, gridStep),
      entryAngleDeg: ANGLES[angleIdx]
    };
  }

  // 2. Rising Staircase / Cascade for Build-ups
  if (kind === 'build' || kind === 'build2') {
    const laneX = sideHint === 'left' ? 0.25 + (noteIndex % 3) * 0.05 : sideHint === 'right' ? 0.75 - (noteIndex % 3) * 0.05 : 0.2 + ((noteIndex % 7) * 0.1);
    const laneY = 0.75 - (stepInBar / 16) * 0.5;
    return {
      target: snapTarget({ x: laneX, y: laneY }, gridStep),
      entryAngleDeg: ANGLES[(noteIndex * 2 + symIdx) % 8]
    };
  }

  // 3. Mirror Wings for Bridge / Intro
  if (kind === 'intro' || kind === 'bridge' || kind === 'outro') {
    const leftWing = noteIndex % 2 === 0;
    const x = sideHint === 'left' ? 0.3 : sideHint === 'right' ? 0.7 : leftWing ? 0.3 : 0.7;
    const y = [0.25, 0.4, 0.6, 0.75][symIdx];
    return {
      target: snapTarget({ x, y }, gridStep),
      entryAngleDeg: leftWing ? 180 : 0
    };
  }

  // 4. Verse: Flowing horizontal wave across the symbol rows
  const wavePositions = [0.25, 0.35, 0.5, 0.65, 0.75, 0.65, 0.5, 0.35];
  const x = sideHint === 'left' ? 0.3 : sideHint === 'right' ? 0.7 : wavePositions[noteIndex % wavePositions.length];
  const y = [0.2, 0.4, 0.6, 0.8][symIdx];
  const angleChoices = level <= 2 ? [270, 0, 90, 180] : ANGLES;
  return {
    target: snapTarget({ x, y }, gridStep),
    entryAngleDeg: angleChoices[(noteIndex + symIdx) % angleChoices.length]
  };
}

/**
 * Generates a systematic, musically synchronized, and 100% playable v2 Chart
 * tailored to the DemoSpec's difficulty level (1..10) and arrangement.
 */
export function buildDemoChart(spec: DemoSpec, song: Song): Chart {
  const chart = newChart(song, spec.difficulty);
  chart.chartId = 'chart-' + spec.id;
  chart.name = spec.chartName;
  chart.revision = 1;
  chart.timing = {
    bpm: spec.bpm,
    offsetMs: 0,
    timeSignature: { numerator: spec.timeSignature.numerator, denominator: 4 }
  };

  const beatMs = 60000 / spec.bpm;
  const stepMs = beatMs / 4; // 16th-note duration
  const beatsPerBar = spec.timeSignature.numerator;
  const stepsPerBar = beatsPerBar * 4;
  const travelTimeMs = bpmTravelTimeMs(spec.bpm);
  const safeEndMs = song.durationMs - Math.max(2400, beatMs * 3);
  const totalSteps = Math.floor(safeEndMs / stepMs);

  let noteCounter = 0;
  let lastNoteEndMs = 0;
  let activeHoldUntilMs = 0;
  let hasActiveSingleHold = false;

  const minGapMs = Math.min(102, Math.floor(stepMs * 1.6));

  const pushTap = (timeMs: number, symbol: SymbolName, kind: SectionKind, stepInBar: number, posHint: Side = 'either') => {
    const time = Math.round(timeMs);
    if (time >= safeEndMs || time - lastNoteEndMs < minGapMs) return;
    const { target, entryAngleDeg } = choreographPlacement(spec.level, kind, symbol, noteCounter++, stepInBar, posHint);
    chart.notes.push({
      id: `${spec.id}-n-${chart.notes.length + 1}`,
      type: 'tap',
      symbol,
      side: 'either',
      timeMs: time,
      target,
      entryAngleDeg,
      travelTimeMs
    });
    lastNoteEndMs = time;
  };

  const pushHold = (timeMs: number, durationMs: number, symbol: SymbolName, kind: SectionKind, stepInBar: number, posHint: Side = 'either') => {
    const time = Math.round(timeMs);
    const dur = Math.max(Math.round(beatMs * 0.5), Math.round(durationMs));
    if (time + dur >= safeEndMs || time - lastNoteEndMs < minGapMs || time < activeHoldUntilMs + minGapMs) return;
    const { target, entryAngleDeg } = choreographPlacement(spec.level, kind, symbol, noteCounter++, stepInBar, posHint);
    chart.notes.push({
      id: `${spec.id}-n-${chart.notes.length + 1}`,
      type: 'hold',
      symbol,
      side: 'either',
      timeMs: time,
      durationMs: dur,
      target,
      entryAngleDeg,
      travelTimeMs
    });
    lastNoteEndMs = time;
    activeHoldUntilMs = time + dur;
    hasActiveSingleHold = true;
  };

  const pushDual = (timeMs: number, symbol: SymbolName, kind: SectionKind, stepInBar: number, durationMs?: number) => {
    const time = Math.round(timeMs);
    const dur = durationMs ? Math.max(Math.round(beatMs * 0.5), Math.round(durationMs)) : 0;
    if (time + dur >= safeEndMs || time - lastNoteEndMs < minGapMs || time < activeHoldUntilMs + minGapMs) return;
    const { target, entryAngleDeg } = choreographPlacement(spec.level, kind, symbol, noteCounter++, stepInBar);
    const chordId = `${spec.id}-chord-${noteCounter}`;
    const holdProps = dur > 0 ? { type: 'hold' as const, durationMs: dur } : { type: 'tap' as const };
    chart.notes.push(
      {
        id: `${spec.id}-n-${chart.notes.length + 1}`,
        ...holdProps,
        symbol,
        side: 'left',
        timeMs: time,
        target,
        entryAngleDeg,
        travelTimeMs,
        chordId
      },
      {
        id: `${spec.id}-n-${chart.notes.length + 2}`,
        ...holdProps,
        symbol,
        side: 'right',
        timeMs: time,
        target,
        entryAngleDeg,
        travelTimeMs,
        chordId
      }
    );
    lastNoteEndMs = time + dur;
    activeHoldUntilMs = time + dur;
    hasActiveSingleHold = false;
  };

  // Start charting after a 2-bar musical lead-in so the player settles into the groove
  const startStep = stepsPerBar * 2;

  for (let step = startStep; step < totalSteps; step++) {
    const timeMs = step * stepMs;
    if (timeMs >= safeEndMs) break;

    const barIndex = Math.floor(step / stepsPerBar);
    const stepInBar = step % stepsPerBar;
    const beatInBar = Math.floor(stepInBar / 4);
    const subStep = stepInBar % 4;
    const { section, barInSection } = resolveSectionAtBar(spec, barIndex);
    const kind = section.kind;

    // Pick symbol musically from the active motif + bar progression
    const motif = spec.motifs[(section.motif + (barInSection % 2)) % spec.motifs.length];
    const motifVal = motif[stepInBar % motif.length];
    const symIdx = ((motifVal >= 0 ? motifVal : beatInBar + barInSection) + barIndex) % 4;
    const symbol = SYMBOLS[symIdx];

    // If a Hold is currently active, only allow single companion Taps on Hard/Expert when a single Hold is active
    if (timeMs < activeHoldUntilMs + Math.max(120, stepMs * 1.5)) {
      if (
        hasActiveSingleHold &&
        spec.level >= 6 &&
        (subStep === 0 || (spec.level === 10 && kind === 'climax' && subStep === 2)) &&
        timeMs >= lastNoteEndMs + beatMs * 0.45 &&
        timeMs + Math.max(120, stepMs * 1.5) < activeHoldUntilMs
      ) {
        const visualWing: Side = barInSection % 2 === 0 ? 'right' : 'left';
        const companionSymbol = SYMBOLS[(symIdx + 1) % 4];
        pushTap(timeMs, companionSymbol, kind, stepInBar, visualWing);
      }
      continue;
    }
    hasActiveSingleHold = false;

    // Pre-drop breath on the last beat of Build sections
    if ((kind === 'build' || kind === 'build2') && barInSection === section.bars - 1 && beatInBar === beatsPerBar - 1) {
      continue;
    }

    // ---- Section & Level Specific Rhythmic Selection ----
    if (kind === 'intro' || kind === 'outro') {
      if (stepInBar === 0) {
        if (barInSection % 2 === 0) {
          pushHold(timeMs, beatMs * (spec.level <= 2 ? 2 : 1.5), symbol, kind, stepInBar);
        } else {
          pushTap(timeMs, symbol, kind, stepInBar);
        }
      } else if (spec.level >= 3 && stepInBar === 8) {
        pushTap(timeMs, symbol, kind, stepInBar);
      } else if (spec.level >= 7 && stepInBar === 12) {
        pushTap(timeMs, symbol, kind, stepInBar);
      }
      continue;
    }

    if (kind === 'bridge') {
      if (stepInBar === 0) {
        pushHold(timeMs, beatMs * 1.5, symbol, kind, stepInBar);
      } else if (beatsPerBar === 3 && stepInBar === 8 && spec.level >= 2) {
        pushTap(timeMs, symbol, kind, stepInBar);
      } else if (beatsPerBar === 4 && stepInBar === 8 && spec.level >= 4) {
        pushTap(timeMs, symbol, kind, stepInBar);
      } else if (beatsPerBar === 4 && stepInBar === 12 && spec.level >= 2) {
        pushTap(timeMs, symbol, kind, stepInBar);
      }
      continue;
    }

    if (kind === 'build' || kind === 'build2') {
      if (barInSection === section.bars - 1 && stepInBar === 0) {
        pushDual(timeMs, symbol, kind, stepInBar, spec.level >= 4 ? beatMs : undefined);
        continue;
      }
      if (spec.level === 1) {
        if (stepInBar === 0 || stepInBar === 8) pushTap(timeMs, symbol, kind, stepInBar);
      } else if (spec.level === 2) {
        if (subStep === 0 && beatInBar < 3) pushTap(timeMs, symbol, kind, stepInBar);
      } else if (spec.level <= 5) {
        if (subStep === 0 || (barInSection >= section.bars - 2 && subStep === 2)) {
          pushTap(timeMs, symbol, kind, stepInBar);
        }
      } else {
        // Level 6–10: Accelerating build streams
        const streamActive = subStep === 0 || (barInSection >= 1 && subStep === 2);
        if (streamActive) pushTap(timeMs, symbol, kind, stepInBar);
      }
      continue;
    }

    // ---- Main Active Sections: Verse, Chorus, Climax ----
    const isDrop = kind === 'chorus' || kind === 'climax';
    const isClimax = kind === 'climax';

    // Level 1: Gentle Easy (1/2 and 1/1 beat notes, calm Holds, Dual Tap on Chorus downbeats)
    if (spec.level === 1) {
      if (isDrop && barInSection % 4 === 0 && stepInBar === 0) {
        pushDual(timeMs, symbol, kind, stepInBar);
      } else if (barInSection % 2 === 1 && stepInBar === 0) {
        pushHold(timeMs, beatMs * 2, symbol, kind, stepInBar);
      } else if (stepInBar === 0 || stepInBar === 8 || (isDrop && stepInBar === 4)) {
        pushTap(timeMs, symbol, kind, stepInBar);
      }
      continue;
    }

    // Level 2: Upper Easy (Quarter-note phrasing, Dual Taps & first Dual Hold in Chorus)
    if (spec.level === 2) {
      if (isDrop && barInSection % 4 === 0 && stepInBar === 0) {
        pushDual(timeMs, symbol, kind, stepInBar, isClimax ? beatMs * 1.5 : undefined);
      } else if (barInSection % 2 === 1 && stepInBar === 8) {
        pushHold(timeMs, beatMs * 1.5, symbol, kind, stepInBar);
      } else if (subStep === 0 && (isDrop || beatInBar !== 3)) {
        pushTap(timeMs, symbol, kind, stepInBar);
      }
      continue;
    }

    // Level 3: Lower Normal (Quarter-note groove + syncopated 1/8 accents + Dual Holds)
    if (spec.level === 3) {
      if (isDrop && barInSection % 2 === 0 && stepInBar === 0) {
        pushDual(timeMs, symbol, kind, stepInBar, barInSection % 4 === 0 ? beatMs * 1.5 : undefined);
      } else if (stepInBar === 0 && barInSection % 2 === 1) {
        pushHold(timeMs, beatMs * 1.5, symbol, kind, stepInBar);
      } else if (subStep === 0 || (isDrop && stepInBar === 14)) {
        pushTap(timeMs, symbol, kind, stepInBar);
      }
      continue;
    }

    // Level 4: Mid Normal (3/4 Waltz choreography)
    if (spec.level === 4) {
      if (isDrop && barInSection % 2 === 0 && stepInBar === 0) {
        pushDual(timeMs, symbol, kind, stepInBar, barInSection % 6 === 0 ? beatMs * 1.5 : undefined);
      } else if (barInSection % 3 === 1 && stepInBar === 0) {
        pushHold(timeMs, beatMs * 1.5, symbol, kind, stepInBar);
      } else if (subStep === 0 || (isDrop && (stepInBar === 6 || stepInBar === 10)) || (!isDrop && stepInBar === 10)) {
        pushTap(timeMs, symbol, kind, stepInBar);
      }
      continue;
    }

    // Level 5: Upper Normal (Electro-Funk syncopation & eighth-note groove)
    if (spec.level === 5) {
      if (isDrop && barInSection % 2 === 0 && stepInBar === 0) {
        pushDual(timeMs, symbol, kind, stepInBar, barInSection % 4 === 2 ? beatMs : undefined);
      } else if (barInSection % 2 === 1 && stepInBar === 4) {
        pushHold(timeMs, beatMs * 1.5, symbol, kind, stepInBar);
      } else if (subStep === 0 || stepInBar === 6 || (isDrop && (stepInBar === 10 || stepInBar === 14))) {
        pushTap(timeMs, symbol, kind, stepInBar);
      }
      continue;
    }

    // Level 6: Lower Hard (Progressive Trance 1/8 streams + Hold+Tap hand independence)
    if (spec.level === 6) {
      if (isDrop && barInSection % 4 === 0 && stepInBar === 0) {
        pushDual(timeMs, symbol, kind, stepInBar, isClimax ? beatMs : undefined);
      } else if (isDrop && barInSection % 2 === 1 && stepInBar === 0) {
        const visualWing: Side = barInSection % 4 === 1 ? 'left' : 'right';
        pushHold(timeMs, beatMs * 1.5, symbol, kind, stepInBar, visualWing);
      } else if (stepInBar === 8 && !isDrop && barInSection % 2 === 0) {
        pushHold(timeMs, beatMs, symbol, kind, stepInBar);
      } else if (subStep === 0 || (isDrop && subStep === 2 && beatInBar !== 3) || (!isDrop && (stepInBar === 6 || stepInBar === 14))) {
        pushTap(timeMs, symbol, kind, stepInBar);
      }
      continue;
    }

    // Level 7: Mid Hard (Cyber-Bass Phrygian syncopation, Dual impacts, dense 1/8 riffs)
    if (spec.level === 7) {
      if (isDrop && (stepInBar === 0 || (barInSection % 2 === 0 && stepInBar === 6))) {
        pushDual(timeMs, symbol, kind, stepInBar, stepInBar === 0 && barInSection % 4 === 0 ? beatMs : undefined);
      } else if (barInSection % 3 === 1 && stepInBar === 0) {
        const visualWing: Side = barInSection % 2 === 0 ? 'left' : 'right';
        pushHold(timeMs, beatMs * 1.5, symbol, kind, stepInBar, visualWing);
      } else if (subStep === 0 || (isDrop && subStep === 2) || (!isDrop && (stepInBar === 6 || stepInBar === 10 || stepInBar === 14))) {
        pushTap(timeMs, symbol, kind, stepInBar);
      }
      continue;
    }

    // Level 8: Upper Hard (150 BPM Melodic Breakbeat streams & rapid orbital transitions)
    if (spec.level === 8) {
      if (isDrop && barInSection % 2 === 0 && (stepInBar === 0 || stepInBar === 10)) {
        pushDual(timeMs, symbol, kind, stepInBar, stepInBar === 0 && barInSection % 4 === 0 ? beatMs : undefined);
      } else if (barInSection % 4 === 1 && stepInBar === 0) {
        const visualWing: Side = barInSection % 2 === 0 ? 'right' : 'left';
        pushHold(timeMs, beatMs * 1.5, symbol, kind, stepInBar, visualWing);
      } else if (subStep === 0 || (isDrop && subStep === 2) || (!isDrop && subStep === 2 && beatInBar !== 3)) {
        pushTap(timeMs, symbol, kind, stepInBar);
      }
      continue;
    }

    // Level 9: Expert (162 BPM Symphonic Artcore — full 1/8 streams, two-thumb Hold+Tap)
    if (spec.level === 9) {
      if (isDrop && barInSection % 2 === 0 && (stepInBar === 0 || (isClimax && stepInBar === 8))) {
        pushDual(timeMs, symbol, kind, stepInBar, stepInBar === 0 && barInSection % 4 === 0 ? beatMs : undefined);
      } else if (barInSection % 4 === 1 && stepInBar === 0) {
        const visualWing: Side = barInSection % 2 === 0 ? 'left' : 'right';
        pushHold(timeMs, beatMs * 1.5, symbol, kind, stepInBar, visualWing);
      } else if (subStep === 0 || subStep === 2) {
        pushTap(timeMs, symbol, kind, stepInBar);
      }
      continue;
    }

    // Level 10: Boss Expert (174 BPM Omega Singularity — relentless technical mastery)
    if (spec.level === 10) {
      if (isDrop && barInSection % 2 === 0 && (stepInBar === 0 || stepInBar === 6 || (isClimax && stepInBar === 12))) {
        pushDual(timeMs, symbol, kind, stepInBar, stepInBar === 0 && barInSection % 6 === 0 ? beatMs : undefined);
      } else if (barInSection % 4 === 1 && stepInBar === 0) {
        const visualWing: Side = barInSection % 2 === 1 ? 'left' : 'right';
        pushHold(timeMs, beatMs * 2, symbol, kind, stepInBar, visualWing);
      } else if (subStep === 0 || subStep === 2) {
        pushTap(timeMs, symbol, kind, stepInBar);
      }
    }
  }

  chart.notes = sortNotes(chart.notes);
  return chart;
}
