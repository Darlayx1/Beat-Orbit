import { STAGE_GRID, SYMBOLS, type Note, type SymbolName } from './domain';

// Official PlayStation symbol colors: Triangle (Green), Circle (Red), Square (Pink), Cross (Blue)
export const COLORS = ['#00d49e', '#ff4d4d', '#ec66a2', '#4e84f4'];
type Point = { x: number; y: number };
export type StageRect = { x: number; y: number; width: number; height: number };
export type VisualNote = Note & { state?: 'pending' | 'holding' | 'done'; unit?: { presses: Map<string, unknown> } };
export type NoteGroup = VisualNote[] & { dual: boolean; chordKey?: string };
const TAU = Math.PI * 2;
const paths = {
  triangle: 'M0 -1 L.9 .75 L-.9 .75 Z',
  square: 'M-.75 -.75 L.75 -.75 L.75 .75 L-.75 .75 Z',
  cross: 'M-.8 -.5 L-.5 -.8 L0 -.3 L.5 -.8 L.8 -.5 L.3 0 L.8 .5 L.5 .8 L0 .3 L-.5 .8 L-.8 .5 L-.3 0 Z',
  circle: 'M1 0 A1 1 0 1 0 -1 0 A1 1 0 1 0 1 0 Z'
};
export function symbolSVG(symbol: SymbolName, solid = false) {
  return `<svg viewBox="-1.3 -1.3 2.6 2.6" aria-hidden="true" class="note-symbol"><path d="${paths[symbol]}" fill="${solid ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width=".14" stroke-linejoin="round"/></svg>`;
}
export function drawSymbol(c: CanvasRenderingContext2D, symbol: SymbolName, x: number, y: number, size: number, solid: boolean, lineWidth = 2.2) {
  c.beginPath();
  if (symbol === 'circle') c.arc(x, y, size, 0, TAU);
  else {
    const points = paths[symbol].match(/[-]?(?:\d*\.)?\d+/g)!.map(Number);
    c.moveTo(x + points[0] * size, y + points[1] * size);
    for (let i = 2; i < points.length; i += 2) c.lineTo(x + points[i] * size, y + points[i + 1] * size);
    c.closePath();
  }
  c.lineWidth = lineWidth;
  c.lineJoin = 'round';
  if (solid) c.fill();
  c.stroke();
}

// ---- Shared geometry. Gameplay and the Studio preview both map the chart through the same 16:9 stage. ----
export const STAGE_ASPECT = 16 / 9;
/** Largest centered 16:9 rectangle inside a canvas. Targets, speed and sprite scale all derive from it. */
export function stageRect(width: number, height: number): StageRect {
  let w = width, h = w / STAGE_ASPECT;
  if (h > height) { h = height; w = h * STAGE_ASPECT; }
  return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
}
/** Sprite scale: identical proportions in every view; a floor keeps symbols legible on phones. */
export function stageScale(width: number, height: number) {
  return Math.max(.62, Math.min(1.4, stageRect(width, height).width / 960));
}
// Padding belongs to the central stage, outside both input banks and safe areas.
const stageInset = (r: StageRect) => Math.min(28, r.width * .08, r.height * .08);
export function targetPoint(note: Note, width: number, height: number): Point {
  const r = stageRect(width, height), inset = stageInset(r);
  return { x: r.x + inset + note.target.x * (r.width - inset * 2), y: r.y + inset + note.target.y * (r.height - inset * 2) };
}
/** Inverse of `targetPoint` for pointer input, clamped to the placeable area. */
export function pointToTarget(x: number, y: number, width: number, height: number): Point {
  const r = stageRect(width, height), inset = stageInset(r);
  const clamp = (v: number) => Math.max(.08, Math.min(.92, v));
  return { x: clamp((x - r.x - inset) / (r.width - inset * 2)), y: clamp((y - r.y - inset) / (r.height - inset * 2)) };
}
/** Fixed path length covered during one `travelTimeMs`, so speed depends on song BPM only. */
export function travelSpan(width: number, height: number) {
  const r = stageRect(width, height);
  return Math.hypot(r.width, r.height) * .8;
}
const direction = (note: Note) => { const a = note.entryAngleDeg * Math.PI / 180; return { x: Math.cos(a), y: Math.sin(a) }; };
export function entryPoint(note: Note, width: number, height: number): Point {
  const target = targetPoint(note, width, height), d = direction(note), span = travelSpan(width, height);
  return { x: target.x + d.x * span, y: target.y + d.y * span };
}
export function notePoint(note: Note, timeMs: number, width: number, height: number): Point {
  const target = targetPoint(note, width, height), d = direction(note), span = travelSpan(width, height);
  const remaining = Math.max(0, Math.min(1, (note.timeMs - timeMs) / note.travelTimeMs));
  return { x: target.x + d.x * span * remaining, y: target.y + d.y * span * remaining };
}
/** Where a Hold's release marker sits; unlike `notePoint` it may start beyond the entry edge. */
export function tailPoint(note: Note, timeMs: number, width: number, height: number): Point {
  const target = targetPoint(note, width, height), d = direction(note), span = travelSpan(width, height);
  const remaining = Math.max(0, (note.timeMs + (note.durationMs || 0) - timeMs) / note.travelTimeMs);
  return { x: target.x + d.x * span * remaining, y: target.y + d.y * span * remaining };
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

// ---- Drawing helpers ----
function rgb(hex: string) { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
/** Mix a hex color toward white (t > 0) or black (t < 0). */
export function shade(hex: string, t: number) {
  const [r, g, b] = rgb(hex), target = t >= 0 ? 255 : 0, a = Math.abs(t);
  return `rgb(${Math.round(r + (target - r) * a)},${Math.round(g + (target - g) * a)},${Math.round(b + (target - b) * a)})`;
}
const withAlpha = (hex: string, alpha: number) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${alpha})`; };
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
function circle(c: CanvasRenderingContext2D, x: number, y: number, r: number) { c.beginPath(); c.arc(x, y, r, 0, TAU); }

function drawStageGrid(c: CanvasRenderingContext2D, width: number, height: number) {
  const r = stageRect(width, height), inset = stageInset(r);
  const usableW = r.width - inset * 2, usableH = r.height - inset * 2;
  if (usableW <= 0 || usableH <= 0) return;
  const minX = r.x + inset + STAGE_GRID.min * usableW, maxX = r.x + inset + STAGE_GRID.max * usableW;
  const minY = r.y + inset + STAGE_GRID.min * usableH, maxY = r.y + inset + STAGE_GRID.max * usableH;
  const lines = Math.round(STAGE_GRID.max / STAGE_GRID.minorStep);
  for (let i = Math.round(STAGE_GRID.min / STAGE_GRID.minorStep); i <= lines; i++) {
    const ratio = i * STAGE_GRID.minorStep, major = i % 2 === 0; // 1/16 line vs 1/32 half line
    const x = r.x + inset + ratio * usableW, y = r.y + inset + ratio * usableH;
    c.strokeStyle = major ? '#314b68aa' : '#24385266';
    c.lineWidth = major ? 1 : .6;
    c.beginPath();
    c.moveTo(x, minY); c.lineTo(x, maxY);
    c.moveTo(minX, y); c.lineTo(maxX, y);
    c.stroke();
  }
}
type TargetState = { hold: boolean; holding: boolean; progress: number; dual: boolean; litSides: Set<string>; done: boolean };
// A recessed, bevelled socket. Highlights come from a fixed top-left light instead of glow.
function drawTarget(c: CanvasRenderingContext2D, p: Point, u: number, color: string, symbol: SymbolName, s: TargetState) {
  const R = 17.5 * u;
  c.fillStyle = 'rgba(2,6,12,.42)'; c.beginPath(); c.ellipse(p.x + 1.2 * u, p.y + 3.2 * u, R * 1.03, R * .92, 0, 0, TAU); c.fill();
  let g = c.createLinearGradient(p.x - R, p.y - R, p.x + R, p.y + R);
  g.addColorStop(0, '#dfe7f1'); g.addColorStop(.45, '#76869c'); g.addColorStop(1, '#202a38');
  c.fillStyle = g; circle(c, p.x, p.y, R); c.fill();
  c.strokeStyle = shade(color, s.holding ? .1 : -.25); c.lineWidth = 2.4 * u; circle(c, p.x, p.y, R * .83); c.stroke();
  g = c.createRadialGradient(p.x - R * .25, p.y - R * .3, R * .1, p.x, p.y, R * .74);
  g.addColorStop(0, s.holding ? '#33496a' : '#2a3a50'); g.addColorStop(1, '#0b131f');
  c.fillStyle = g; circle(c, p.x, p.y, R * .7); c.fill();
  c.lineCap = 'round';
  c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 1.7 * u; c.beginPath(); c.arc(p.x, p.y, R * .7, Math.PI * .72, Math.PI * 1.78); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.14)'; c.lineWidth = 1.2 * u; c.beginPath(); c.arc(p.x, p.y, R * .7, -Math.PI * .28, Math.PI * .78); c.stroke();
  // Embossed symbol: dark offset first, then the colored face.
  c.strokeStyle = 'rgba(0,0,0,.65)'; c.fillStyle = 'rgba(0,0,0,.65)';
  drawSymbol(c, symbol, p.x + .9 * u, p.y + 1.2 * u, 8.6 * u, s.dual, 2.2 * u);
  c.strokeStyle = color; c.fillStyle = color;
  drawSymbol(c, symbol, p.x, p.y, 8.6 * u, s.dual, 2.2 * u);
  if (s.dual) {
    // Split bezel: one arc per thumb. Lit arcs show which side has already landed.
    for (const [side, from, to] of [['left', Math.PI * .6, Math.PI * 1.4], ['right', -Math.PI * .4, Math.PI * .4]] as const) {
      c.lineWidth = 3.2 * u;
      c.strokeStyle = s.done || s.litSides.has(side) ? shade(color, .55) : 'rgba(20,30,44,.9)';
      c.beginPath(); c.arc(p.x, p.y, R + 3.4 * u, from, to); c.stroke();
    }
  }
  if (s.hold) {
    const ring = R + 6.4 * u;
    c.strokeStyle = 'rgba(4,8,14,.7)'; c.lineWidth = 4.4 * u; circle(c, p.x, p.y, ring); c.stroke();
    c.strokeStyle = 'rgba(190,205,225,.28)'; c.lineWidth = 1.2 * u; circle(c, p.x, p.y, ring); c.stroke();
    if (s.holding && s.progress > 0) {
      c.strokeStyle = shade(color, .4); c.lineWidth = 4 * u;
      c.beginPath(); c.arc(p.x, p.y, ring, -Math.PI / 2, -Math.PI / 2 + TAU * s.progress); c.stroke();
    }
    c.fillStyle = shade(color, s.holding ? .55 : .3); c.font = `800 ${8.5 * u}px "DM Sans","Segoe UI",sans-serif`; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    c.fillText(s.holding ? 'HOLDING' : 'HOLD', p.x, p.y + R + 17 * u);
  }
}
// Solid, clearly bounded lane between a Hold's head and its release marker. Rungs scroll with the tail.
function drawHoldLane(c: CanvasRenderingContext2D, head: Point, tail: Point, u: number, color: string, holding: boolean) {
  const dx = tail.x - head.x, dy = tail.y - head.y, length = Math.hypot(dx, dy);
  if (length < 2) return;
  const ux = dx / length, uy = dy / length, nx = -uy, ny = ux, width = 11 * u;
  c.lineCap = 'round';
  const line = (style: string, w: number) => { c.strokeStyle = style; c.lineWidth = w; c.beginPath(); c.moveTo(head.x, head.y); c.lineTo(tail.x, tail.y); c.stroke(); };
  line('#070d15', width + 5 * u);
  line(shade(color, holding ? -.05 : -.4), width);
  line(shade(color, holding ? .5 : .1), width * .36);
  c.lineCap = 'butt'; c.strokeStyle = 'rgba(7,13,21,.55)'; c.lineWidth = 1.6 * u;
  const spacing = 15 * u;
  c.beginPath();
  for (let s = spacing, count = 0; s < length && count < 120; s += spacing, count++) {
    const px = tail.x - ux * s, py = tail.y - uy * s;
    c.moveTo(px + nx * width * .5, py + ny * width * .5); c.lineTo(px - nx * width * .5, py - ny * width * .5);
  }
  c.stroke();
}
function drawReleaseMarker(c: CanvasRenderingContext2D, p: Point, u: number, color: string, symbol: SymbolName) {
  const r = 14 * u;
  const diamond = (x: number, y: number, size: number) => { c.beginPath(); c.moveTo(x, y - size); c.lineTo(x + size, y); c.lineTo(x, y + size); c.lineTo(x - size, y); c.closePath(); };
  c.fillStyle = 'rgba(2,6,12,.4)'; diamond(p.x + 1.2 * u, p.y + 3 * u, r); c.fill();
  const g = c.createLinearGradient(p.x - r, p.y - r, p.x + r, p.y + r);
  g.addColorStop(0, shade(color, .35)); g.addColorStop(.55, shade(color, -.15)); g.addColorStop(1, shade(color, -.55));
  c.fillStyle = g; diamond(p.x, p.y, r); c.fill();
  c.lineJoin = 'round'; c.strokeStyle = shade(color, -.65); c.lineWidth = 1.6 * u; c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1.1 * u; diamond(p.x, p.y, r * .72); c.stroke();
  c.fillStyle = '#f2f6fb'; c.strokeStyle = '#f2f6fb'; drawSymbol(c, symbol, p.x, p.y, 5.2 * u, true, 1.2 * u);
}
// Tapered comet tail behind the note, opposite to its travel direction.
function drawTrail(c: CanvasRenderingContext2D, p: Point, dir: Point, u: number, color: string, length: number, alpha: number) {
  if (length < 3 || alpha <= 0) return;
  const half = 12 * u, bx = p.x + dir.x * length, by = p.y + dir.y * length, nx = -dir.y, ny = dir.x;
  const g = c.createLinearGradient(p.x, p.y, bx, by);
  g.addColorStop(0, withAlpha(color, .5 * alpha)); g.addColorStop(1, withAlpha(color, 0));
  c.fillStyle = g; c.beginPath(); c.moveTo(p.x + nx * half, p.y + ny * half); c.lineTo(bx, by); c.lineTo(p.x - nx * half, p.y - ny * half); c.closePath(); c.fill();
  const core = c.createLinearGradient(p.x, p.y, bx, by);
  core.addColorStop(0, `rgba(255,255,255,${.28 * alpha})`); core.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = core; c.beginPath(); c.moveTo(p.x + nx * half * .4, p.y + ny * half * .4); c.lineTo(p.x + dir.x * length * .7, p.y + dir.y * length * .7); c.lineTo(p.x - nx * half * .4, p.y - ny * half * .4); c.closePath(); c.fill();
}
// A convex disc: matte body, rim, inner bevel and an embossed white symbol.
function drawNote(c: CanvasRenderingContext2D, p: Point, u: number, color: string, symbol: SymbolName, solid: boolean, hold: boolean, alpha: number) {
  const R = 14.5 * u;
  c.globalAlpha = alpha;
  c.fillStyle = 'rgba(2,6,12,.38)'; c.beginPath(); c.ellipse(p.x + 1.5 * u, p.y + 3.4 * u, R * .96, R * .62, 0, 0, TAU); c.fill();
  const g = c.createRadialGradient(p.x - R * .35, p.y - R * .4, R * .08, p.x, p.y, R * 1.05);
  g.addColorStop(0, shade(color, .55)); g.addColorStop(.45, color); g.addColorStop(1, shade(color, -.5));
  c.fillStyle = g; circle(c, p.x, p.y, R); c.fill();
  c.strokeStyle = shade(color, -.65); c.lineWidth = 1.4 * u; circle(c, p.x, p.y, R); c.stroke();
  c.lineCap = 'round'; c.strokeStyle = 'rgba(255,255,255,.26)'; c.lineWidth = 1.2 * u; c.beginPath(); c.arc(p.x, p.y, R * .8, Math.PI * .9, Math.PI * 1.65); c.stroke();
  if (hold) { c.strokeStyle = 'rgba(240,245,252,.9)'; c.lineWidth = 1.8 * u; circle(c, p.x, p.y, R + 2.6 * u); c.stroke(); }
  c.fillStyle = 'rgba(0,0,0,.35)'; c.strokeStyle = 'rgba(0,0,0,.35)';
  drawSymbol(c, symbol, p.x + .8 * u, p.y + 1 * u, 7.4 * u, solid, 2 * u);
  c.fillStyle = '#f3f6fa'; c.strokeStyle = '#f3f6fa';
  drawSymbol(c, symbol, p.x, p.y, 7.4 * u, solid, 2 * u);
  c.globalAlpha = 1;
}

export function drawStage(c: CanvasRenderingContext2D, width: number, height: number, groups: NoteGroup[], timeMs: number, selected?: string, framed = true) {
  c.clearRect(0, 0, width, height);
  const u = stageScale(width, height), rect = stageRect(width, height);
  c.lineWidth = 1; c.setLineDash([]);
  if (framed) {
    c.fillStyle = '#0f1a2a'; c.fillRect(0, 0, width, height);
    c.fillStyle = '#142236'; c.fillRect(rect.x, rect.y, rect.width, rect.height);
    c.strokeStyle = '#385575'; c.setLineDash([5, 8]); c.strokeRect(rect.x + 6, rect.y + 6, Math.max(0, rect.width - 12), Math.max(0, rect.height - 12)); c.setLineDash([]);
    drawStageGrid(c, width, height); // The grid is an editing aid and never appears in gameplay.
  }
  const visible = groups.filter(group => group.some(n => n.state !== 'done') && group[0].timeMs - group[0].travelTimeMs <= timeMs && group.some(n => n.timeMs + (n.durationMs || 0) + 135 >= timeMs));
  const items = visible.map(group => {
    const n = group[0], hold = n.type === 'hold', holding = group.some(item => item.state === 'holding');
    const target = targetPoint(n, width, height), point = notePoint(n, timeMs, width, height);
    const remaining = (n.timeMs - timeMs) / n.travelTimeMs;
    return { group, n, hold, holding, target, point, tail: hold ? tailPoint(n, timeMs, width, height) : undefined, color: COLORS[SYMBOLS.indexOf(n.symbol)], remaining, dir: direction(n),
      state: { hold, holding, dual: group.dual && group.length > 1, done: false, litSides: new Set(group.flatMap(item => [...(item.unit?.presses.keys() || [])])),
        progress: hold ? clamp01((timeMs - n.timeMs) / (n.durationMs || 1)) : 0 } as TargetState };
  });
  const chordPoints = new Map<string, Point>();
  for (const { group, target } of items) {
    if (!group.chordKey) continue;
    const previous = chordPoints.get(group.chordKey);
    if (previous) { c.strokeStyle = 'rgba(199,217,237,.35)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(previous.x, previous.y); c.lineTo(target.x, target.y); c.stroke(); }
    chordPoints.set(group.chordKey, target);
  }
  for (const it of items) if (it.hold) drawHoldLane(c, it.holding || it.remaining <= 0 ? it.target : it.point, it.tail!, u, it.color, it.holding);
  for (const it of items) drawTarget(c, it.target, u, it.color, it.n.symbol, it.state);
  for (const it of items) if (it.hold) drawReleaseMarker(c, it.tail!, u, it.color, it.n.symbol);
  for (const it of items) {
    if (it.holding) continue;
    const dist = Math.hypot(it.point.x - it.target.x, it.point.y - it.target.y), alpha = clamp01((1 - it.remaining) / .12);
    drawTrail(c, it.point, it.dir, u, it.color, Math.min(70 * u, dist), alpha);
    drawNote(c, it.point, u, it.color, it.n.symbol, it.state.dual, it.hold, alpha);
  }
  for (const it of items) {
    if (!it.group.some(n => n.id === selected)) continue;
    const half = 17.5 * u + 7 * u;
    c.strokeStyle = '#fff'; c.lineWidth = 2; c.strokeRect(it.target.x - half, it.target.y - half, half * 2, half * 2);
  }
  c.lineCap = 'butt';
}
