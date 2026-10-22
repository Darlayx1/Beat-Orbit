import { defaultLayout, newChart, type Chart, type Note, type Song } from '../src/domain';
export const song: Song = { id: 'test-song', title: 'Test Audio', artist: 'Fixture', durationMs: 10000, fileName: 'test.wav', format: 'wav', fileSize: 1000, importedAt: '2026-01-01T00:00:00.000Z', source: 'imported', palette: 0 };
export const tap = (timeMs: number, more: Partial<Note> = {}): Note => ({ id: crypto.randomUUID(), type: 'tap', symbol: 'triangle', side: 'either', timeMs, ...defaultLayout(more.symbol || 'triangle'), ...more });
export const chart = (notes: Note[] = [tap(1000)]): Chart => ({ ...newChart(song), notes });
