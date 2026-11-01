import type { Note } from './domain';

/** Editing uses the saved chord identity, independently of visual grouping. */
export function noteMembers(notes: Note[], selected?: string): Note[] {
  const note = notes.find(item => item.id === selected);
  return note ? notes.filter(item => item.id === note.id || !!note.chordId && item.chordId === note.chordId) : [];
}

export function normalizeDirection(angle: number): number {
  return Math.round(((angle % 360 + 360) % 360) * 10) / 10 % 360;
}

export function directionLabel(angle: number): string {
  const names: Record<number, string> = {
    0: 'Kanan', 45: 'Kanan bawah', 90: 'Bawah', 135: 'Kiri bawah',
    180: 'Kiri', 225: 'Kiri atas', 270: 'Atas', 315: 'Kanan atas'
  };
  return `${names[angle] || 'Sudut bebas'} · ${angle}°`;
}
