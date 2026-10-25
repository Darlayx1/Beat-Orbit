import { SYMBOLS, type Note, type SymbolName } from './domain';

export const COLORS = ['#62e5d0', '#f19aef', '#ffd18b', '#a2b7ff'];
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
  return `<svg viewBox="-1.3 -1.3 2.6 2.6" aria-hidden="true" class="note-symbol"><path d="${paths[symbol]}" fill="${solid ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width=".12" stroke-linejoin="round"/></svg>`;
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
  c.lineWidth = 2;
  if (solid) c.fill();
  c.stroke();
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
export function drawStage(c: CanvasRenderingContext2D, width: number, height: number, groups: NoteGroup[], timeMs: number, selected?: string, framed = true) {
  c.clearRect(0, 0, width, height);
  c.lineWidth = 1;
  if (framed) {
    c.fillStyle = '#192b43'; c.fillRect(0,0,width,height);
    c.strokeStyle = '#385575'; c.lineWidth = 1; c.setLineDash([5,8]); c.strokeRect(12,12,Math.max(0,width-24),Math.max(0,height-24)); c.setLineDash([]);
  }
  const visible = groups.filter(group => group.some(n => n.state !== 'done') && group[0].timeMs - group[0].travelTimeMs <= timeMs && group.some(n => n.timeMs + (n.durationMs || 0) + 135 >= timeMs));
  const chordPoints = new Map<string, Point>();
  for (const group of visible) {
    const n = group[0], target = targetPoint(n,width,height), point = notePoint(n,timeMs,width,height);
    const color = COLORS[SYMBOLS.indexOf(n.symbol)], solid = group.dual;
    if(group.chordKey){const previous=chordPoints.get(group.chordKey);if(previous){c.beginPath();c.moveTo(previous.x,previous.y);c.lineTo(target.x,target.y);c.strokeStyle='#c7d9ed66';c.lineWidth=1;c.stroke();}chordPoints.set(group.chordKey,target);}
    c.strokeStyle = color; c.fillStyle = '#102033'; c.beginPath(); c.arc(target.x,target.y,22,0,Math.PI*2); c.fill(); c.stroke();
    // The target is an outline. Dual symbols are solid at the target and in flight.
    c.fillStyle=color; drawSymbol(c,n.symbol,target.x,target.y,11,solid);
    const remaining = Math.max(0, Math.min(1,(n.timeMs-timeMs)/n.travelTimeMs));
    c.beginPath(); c.arc(target.x,target.y,25,-Math.PI/2,-Math.PI/2+Math.PI*2*(1-remaining)); c.lineWidth=3;c.stroke();
    if(n.type==='hold'){
      const tail=notePoint({...n,timeMs:n.timeMs+(n.durationMs||0)},timeMs,width,height);
      c.globalAlpha=.45;c.lineWidth=6;c.beginPath();c.moveTo(tail.x,tail.y);c.lineTo(point.x,point.y);c.stroke();c.globalAlpha=1;
    }
    drawSymbol(c,n.symbol,point.x,point.y,15,solid);
    if(solid){const hit=group.filter(n=>n.state==='done'||n.state==='holding').length;c.font='bold 10px sans-serif';c.textAlign='center';c.fillText(group.length>1?`${hit}/${group.length}`:'DUAL',target.x,target.y+38);}
    if(group.some(n=>n.id===selected)){c.strokeStyle='#fff';c.lineWidth=2;c.strokeRect(target.x-30,target.y-30,60,60);}
  }
}
