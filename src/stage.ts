import { STAGE_GRID, SYMBOLS, type Note, type SymbolName } from './domain';

// Official PlayStation symbol colors: Triangle (Green), Circle (Red), Square (Pink), Cross (Blue)
export const COLORS = ['#00d49e', '#ff4d4d', '#ec66a2', '#4e84f4'];
type Point = { x: number; y: number };
export type VisualNote = Note & { state?: 'pending' | 'holding' | 'done' };
export type NoteGroup = VisualNote[] & { dual: boolean; chordKey?: string };
const paths = {
  triangle: 'M0 -1 L.9 .75 L-.9 .75 Z',
  square: 'M-.75 -.75 L.75 -.75 L.75 .75 L-.75 .75 Z',
  cross: 'M-.8 -.5 L-.5 -.8 L0 -.3 L.5 -.8 L.8 -.5 L.3 0 L.8 .5 L.5 .8 L0 .3 L-.5 .8 L-.8 .5 L-.3 0 Z',
  circle: 'M1 0 A1 1 0 1 0 -1 0 A1 1 0 1 0 1 0 Z'
};
export function symbolSVG(symbol: SymbolName, solid = false) {
  return `<svg viewBox="-1.3 -1.3 2.6 2.6" aria-hidden="true" class="note-symbol"><path d="${paths[symbol]}" fill="${solid ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width=".14" stroke-linejoin="round"/></svg>`;
}
export function drawSymbol(c: CanvasRenderingContext2D, symbol: SymbolName, x: number, y: number, size: number, solid: boolean) {
  c.beginPath();
  if (symbol === 'circle') c.arc(x, y, size, 0, Math.PI * 2);
  else {
    const points = paths[symbol].match(/[-]?(?:\d*\.)?\d+/g)!.map(Number);
    c.moveTo(x + points[0] * size, y + points[1] * size);
    for (let i = 2; i < points.length; i += 2) c.lineTo(x + points[i] * size, y + points[i + 1] * size);
    c.closePath();
  }
  c.lineWidth = 2.2;
  if (solid) c.fill();
  c.stroke();
}
function drawDiamond(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.beginPath();
  c.moveTo(x, y - r);
  c.lineTo(x + r, y);
  c.lineTo(x, y + r);
  c.lineTo(x - r, y);
  c.closePath();
}
// Padding belongs to the central stage, outside both input banks and safe areas.
export function targetPoint(note: Note, width: number, height: number): Point {
  const inset = Math.min(28, width * .08, height * .08);
  return { x: inset + note.target.x * (width - inset * 2), y: inset + note.target.y * (height - inset * 2) };
}
export function entryPoint(note: Note, width: number, height: number): Point {
  const target = targetPoint(note, width, height), angle = note.entryAngleDeg * Math.PI / 180;
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const tx = Math.abs(dx) < 1e-9 ? Infinity : (dx > 0 ? width - target.x : -target.x) / dx;
  const ty = Math.abs(dy) < 1e-9 ? Infinity : (dy > 0 ? height - target.y : -target.y) / dy;
  const distance = Math.min(tx, ty);
  return { x: target.x + dx * distance, y: target.y + dy * distance };
}
export function notePoint(note: Note, timeMs: number, width: number, height: number): Point {
  const target = targetPoint(note, width, height), entry = entryPoint(note, width, height);
  const progress = Math.max(0, Math.min(1, (timeMs - note.timeMs + note.travelTimeMs) / note.travelTimeMs));
  return { x: entry.x + (target.x - entry.x) * progress, y: entry.y + (target.y - entry.y) * progress };
}
export function groupNotes(notes: VisualNote[]): NoteGroup[] {
  const groups = new Map<string, NoteGroup>();
  const counts = new Map<number, number>();
  for (const n of notes) counts.set(n.timeMs, (counts.get(n.timeMs) || 0) + 1);
  for (const n of notes) {
    const chordKey = n.chordId || (counts.get(n.timeMs) === 2 ? 'simultaneous:' + n.timeMs : undefined);
    const key = chordKey ? JSON.stringify([chordKey,n.timeMs,n.symbol,n.target.x,n.target.y,n.entryAngleDeg,n.travelTimeMs]) : n.id;
    const group = groups.get(key);
    if (group) group.push(n); else groups.set(key, Object.assign([n], { dual: !!chordKey, chordKey }));
  }
  return [...groups.values()].sort((a,b) => a[0].timeMs - b[0].timeMs);
}
function drawStageGrid(c: CanvasRenderingContext2D, width: number, height: number, framed: boolean) {
  const inset = Math.min(28, width * .08, height * .08);
  const usableW = width - inset * 2, usableH = height - inset * 2;
  if (usableW <= 0 || usableH <= 0) return;
  const minX = inset + STAGE_GRID.min * usableW, maxX = inset + STAGE_GRID.max * usableW;
  const minY = inset + STAGE_GRID.min * usableH, maxY = inset + STAGE_GRID.max * usableH;
  for (let i = 2; i <= 18; i++) {
    const ratio = i * STAGE_GRID.minorStep;
    const x = inset + ratio * usableW, y = inset + ratio * usableH;
    const major = i % 2 === 0; // 1/16 major line vs 1/32 half line
    if (!major && !framed) continue;
    c.strokeStyle = framed ? (major ? '#314b68aa' : '#243a5266') : '#4a6b8f24';
    c.lineWidth = major ? 1 : 0.75;
    c.beginPath();
    c.moveTo(x, minY); c.lineTo(x, maxY);
    c.moveTo(minX, y); c.lineTo(maxX, y);
    c.stroke();
  }
}
export function drawStage(c: CanvasRenderingContext2D, width: number, height: number, groups: NoteGroup[], timeMs: number, selected?: string, framed = true) {
  c.clearRect(0, 0, width, height);
  c.lineWidth = 1;
  if (framed) {
    c.fillStyle = '#121f31'; c.fillRect(0,0,width,height);
    c.strokeStyle = '#385575'; c.lineWidth = 1; c.setLineDash([5,8]); c.strokeRect(12,12,Math.max(0,width-24),Math.max(0,height-24)); c.setLineDash([]);
  }
  drawStageGrid(c, width, height, framed);
  const visible = groups.filter(group => group.some(n => n.state !== 'done') && group[0].timeMs - group[0].travelTimeMs <= timeMs && group.some(n => n.timeMs + (n.durationMs || 0) + 135 >= timeMs));
  const chordPoints = new Map<string, Point>();
  for (const group of visible) {
    const n = group[0], target = targetPoint(n,width,height), point = notePoint(n,timeMs,width,height);
    const color = COLORS[SYMBOLS.indexOf(n.symbol)], solid = group.dual;
    const holding = group.some(item => item.state === 'holding');
    const headPos = holding || (n.type === 'hold' && timeMs >= n.timeMs) ? target : point;

    if(group.chordKey){const previous=chordPoints.get(group.chordKey);if(previous){c.beginPath();c.moveTo(previous.x,previous.y);c.lineTo(target.x,target.y);c.strokeStyle='#c7d9ed66';c.lineWidth=1.5;c.stroke();}chordPoints.set(group.chordKey,target);}

    // Clear trajectory guide line from moving note to target
    const distToTarget = Math.hypot(target.x - headPos.x, target.y - headPos.y);
    if (distToTarget > 6) {
      c.strokeStyle = color;
      c.globalAlpha = 0.22;
      c.lineWidth = 1.6;
      c.setLineDash([6, 6]);
      c.beginPath();
      c.moveTo(headPos.x, headPos.y);
      c.lineTo(target.x, target.y);
      c.stroke();
      c.setLineDash([]);
      // Directional chevron midway along trajectory
      const ux = (target.x - headPos.x) / distToTarget, uy = (target.y - headPos.y) / distToTarget;
      const px = -uy, py = ux;
      for (const frac of [0.38, 0.68]) {
        const cx = headPos.x + (target.x - headPos.x) * frac;
        const cy = headPos.y + (target.y - headPos.y) * frac;
        c.globalAlpha = 0.38;
        c.lineWidth = 1.8;
        c.beginPath();
        c.moveTo(cx - ux * 6 + px * 5, cy - uy * 6 + py * 5);
        c.lineTo(cx + ux * 2, cy + uy * 2);
        c.lineTo(cx - ux * 6 - px * 5, cy - uy * 6 - py * 5);
        c.stroke();
      }
      c.globalAlpha = 1;
    }

    // Stationary Target (no circular progress ring)
    c.strokeStyle = color;
    c.fillStyle = holding ? '#162d47' : '#0d1929';
    c.lineWidth = holding ? 2.8 : 2;
    c.beginPath(); c.arc(target.x, target.y, 23, 0, Math.PI * 2); c.fill(); c.stroke();
    c.globalAlpha = holding ? 0.55 : 0.25;
    c.lineWidth = 1;
    c.beginPath(); c.arc(target.x, target.y, 18, 0, Math.PI * 2); c.stroke();
    c.globalAlpha = 1;
    c.fillStyle = color;
    drawSymbol(c, n.symbol, target.x, target.y, 10.5, solid);

    // Hold Note premium ribbon + End Hold Note marker
    if (n.type === 'hold') {
      const endTime = n.timeMs + (n.durationMs || 0);
      const tail = notePoint({ ...n, timeMs: endTime }, timeMs, width, height);
      // Outer energy glow
      c.strokeStyle = color;
      c.globalAlpha = holding ? 0.34 : 0.18;
      c.lineWidth = holding ? 20 : 15;
      c.beginPath(); c.moveTo(tail.x, tail.y); c.lineTo(headPos.x, headPos.y); c.stroke();
      // Mid vibrant ribbon
      c.globalAlpha = holding ? 0.78 : 0.48;
      c.lineWidth = holding ? 10 : 7;
      c.beginPath(); c.moveTo(tail.x, tail.y); c.lineTo(headPos.x, headPos.y); c.stroke();
      // Inner plasma core
      c.strokeStyle = '#ffffff';
      c.globalAlpha = holding ? 0.92 : 0.55;
      c.lineWidth = holding ? 3.2 : 2;
      c.beginPath(); c.moveTo(tail.x, tail.y); c.lineTo(headPos.x, headPos.y); c.stroke();
      c.globalAlpha = 1;

      if (holding) {
        const pulse = 27 + Math.sin(timeMs * 0.018) * 3;
        c.strokeStyle = '#ffffff';
        c.globalAlpha = 0.65;
        c.lineWidth = 2;
        c.beginPath(); c.arc(target.x, target.y, pulse, 0, Math.PI * 2); c.stroke();
        c.globalAlpha = 1;
      }

      // End Hold Note (Tail release marker)
      c.fillStyle = '#0d1929';
      c.strokeStyle = color;
      c.lineWidth = 2.4;
      drawDiamond(c, tail.x, tail.y, 20);
      c.fill(); c.stroke();
      c.strokeStyle = '#ffffff';
      c.globalAlpha = 0.85;
      c.lineWidth = 1.4;
      drawDiamond(c, tail.x, tail.y, 15);
      c.stroke();
      c.globalAlpha = 1;
      c.strokeStyle = color;
      c.fillStyle = color;
      drawSymbol(c, n.symbol, tail.x, tail.y, 9, true);
    }

    // Moving Note (Head / Tap) with motion wake & high-end glow
    if (!holding) {
      if (distToTarget > 10) {
        const ux = (target.x - point.x) / distToTarget, uy = (target.y - point.y) / distToTarget;
        for (const step of [1, 2]) {
          c.strokeStyle = color;
          c.fillStyle = color;
          c.globalAlpha = 0.22 / step;
          drawSymbol(c, n.symbol, point.x - ux * step * 9, point.y - uy * step * 9, 15 - step * 1.5, solid);
        }
        c.globalAlpha = 1;
      }
      // Outer neon halo
      c.fillStyle = color;
      c.globalAlpha = 0.2;
      c.beginPath(); c.arc(point.x, point.y, 21, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 1;
      // Primary symbol
      c.strokeStyle = color;
      c.fillStyle = color;
      drawSymbol(c, n.symbol, point.x, point.y, 15.5, solid);
      // Inner white core highlight
      c.strokeStyle = '#ffffff';
      c.globalAlpha = 0.75;
      drawSymbol(c, n.symbol, point.x, point.y, 13.5, false);
      c.globalAlpha = 1;
    }

    if(solid){const hit=group.filter(n=>n.state==='done'||n.state==='holding').length;c.fillStyle=color;c.font='bold 10px sans-serif';c.textAlign='center';c.fillText(group.length>1?`${hit}/${group.length}`:'DUAL',target.x,target.y+36);}
    if(group.some(n=>n.id===selected)){c.strokeStyle='#fff';c.lineWidth=2;c.strokeRect(target.x-30,target.y-30,60,60);}
  }
}
