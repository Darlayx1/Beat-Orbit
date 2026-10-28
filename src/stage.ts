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
  return Math.hypot(r.width, r.height) * .46;
}
const direction = (note: Note) => { const a = note.entryAngleDeg * Math.PI / 180; return { x: Math.cos(a), y: Math.sin(a) }; };
const swingSign = (note: Note) => ((Math.round(note.timeMs / 10) + Math.round(note.target.x * 40) + Math.round(note.target.y * 40) + Math.round(note.entryAngleDeg / 15)) % 2 === 0 ? 1 : -1);
/**
 * Project DIVA-style swinging trajectory:
 * The straight chord between `entryPoint` (remaining = 1) and `targetPoint` (remaining = 0)
 * stays anchored at both endpoints, while the note arcs smoothly perpendicular to that axis in flight.
 */
export function trajectoryPoint(note: Note, remaining: number, width: number, height: number): Point {
  const target = targetPoint(note, width, height), d = direction(note), span = travelSpan(width, height);
  const nx = -d.y, ny = d.x;
  const sinTerm = remaining <= 0 || Math.abs(remaining - 1) < 1e-9 ? 0 : Math.sin(remaining * Math.PI);
  const swing = sinTerm * span * .15 * swingSign(note);
  return {
    x: target.x + d.x * span * remaining + nx * swing,
    y: target.y + d.y * span * remaining + ny * swing
  };
}
export function entryPoint(note: Note, width: number, height: number): Point {
  const target = targetPoint(note, width, height), d = direction(note), span = travelSpan(width, height);
  return { x: target.x + d.x * span, y: target.y + d.y * span };
}
export function notePoint(note: Note, timeMs: number, width: number, height: number): Point {
  const remaining = Math.max(0, Math.min(1, (note.timeMs - timeMs) / note.travelTimeMs));
  return trajectoryPoint(note, remaining, width, height);
}
/** Where a Hold's release marker sits; unlike `notePoint` it may start beyond the entry edge. */
export function tailPoint(note: Note, timeMs: number, width: number, height: number): Point {
  const remaining = Math.max(0, (note.timeMs + (note.durationMs || 0) - timeMs) / note.travelTimeMs);
  return trajectoryPoint(note, remaining, width, height);
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
type TargetState = { hold: boolean; holding: boolean; progress: number; approach: number; dual: boolean; litSides: Set<string>; done: boolean };

function traceOuterShape(c: CanvasRenderingContext2D, symbol: SymbolName, x: number, y: number, r: number) {
  if (symbol === 'circle') {
    c.moveTo(x + r * .92, y);
    c.arc(x, y, r * .92, 0, TAU);
  } else if (symbol === 'square') {
    const s = r * .84;
    c.moveTo(x - s, y - s); c.lineTo(x + s, y - s); c.lineTo(x + s, y + s); c.lineTo(x - s, y + s); c.closePath();
  } else if (symbol === 'triangle') {
    c.moveTo(x, y - r * 1.04); c.lineTo(x + r * .96, y + r * .76); c.lineTo(x - r * .96, y + r * .76); c.closePath();
  } else {
    const pts = paths.cross.match(/[-]?(?:\d*\.)?\d+/g)!.map(Number), scale = r * 1.14;
    c.moveTo(x + pts[0] * scale, y + pts[1] * scale);
    for (let i = 2; i < pts.length; i += 2) c.lineTo(x + pts[i] * scale, y + pts[i + 1] * scale);
    c.closePath();
  }
}

function traceInnerShape(c: CanvasRenderingContext2D, symbol: SymbolName, x: number, y: number, r: number) {
  if (symbol === 'circle') {
    c.moveTo(x + r * .42, y);
    c.arc(x, y, r * .42, 0, TAU);
  } else if (symbol === 'square') {
    const s = r * .39;
    c.moveTo(x - s, y - s); c.lineTo(x + s, y - s); c.lineTo(x + s, y + s); c.lineTo(x - s, y + s); c.closePath();
  } else if (symbol === 'triangle') {
    c.moveTo(x, y - r * .32); c.lineTo(x + r * .41, y + r * .43); c.lineTo(x - r * .41, y + r * .43); c.closePath();
  } else {
    const d = r * .46;
    c.moveTo(x - d, y - d); c.lineTo(x + d, y + d);
    c.moveTo(x + d, y - d); c.lineTo(x - d, y + d);
  }
}

function drawClockHand(c: CanvasRenderingContext2D, p: Point, u: number, r: number, progress: number, color: string, accent = false) {
  const angle = -Math.PI / 2 + TAU * clamp01(progress);
  const cos = Math.cos(angle), sin = Math.sin(angle), nx = -sin, ny = cos;
  const len = r * 1.24, tailLen = r * .16, halfW = 2.1 * u;
  const tipX = p.x + cos * len, tipY = p.y + sin * len;
  const baseX = p.x - cos * tailLen, baseY = p.y - sin * tailLen;
  const shoulderX = p.x + cos * (len * .72), shoulderY = p.y + sin * (len * .72);

  c.save();
  c.lineJoin = 'round'; c.lineCap = 'round';
  c.beginPath();
  c.moveTo(baseX + nx * (halfW * .65), baseY + ny * (halfW * .65));
  c.lineTo(shoulderX + nx * halfW, shoulderY + ny * halfW);
  c.lineTo(tipX, tipY);
  c.lineTo(shoulderX - nx * halfW, shoulderY - ny * halfW);
  c.lineTo(baseX - nx * (halfW * .65), baseY - ny * (halfW * .65));
  c.closePath();
  c.strokeStyle = 'rgba(5,8,14,.92)'; c.lineWidth = 2.6 * u; c.stroke();
  c.fillStyle = accent ? shade(color, .68) : '#ffffff'; c.fill();

  const piv = 2.6 * u;
  c.fillStyle = '#090d14';
  c.fillRect(p.x - piv - .9 * u, p.y - piv - .9 * u, (piv + .9 * u) * 2, (piv + .9 * u) * 2);
  c.fillStyle = accent ? shade(color, .55) : '#ffffff';
  c.fillRect(p.x - piv, p.y - piv, piv * 2, piv * 2);
  c.restore();
}

// Project DIVA-style flat/clean shape target: dominant black with white border for Single, vibrant symbol color for Dual.
function drawTarget(c: CanvasRenderingContext2D, p: Point, u: number, color: string, symbol: SymbolName, s: TargetState) {
  const R = 19.5 * u;
  c.save();
  c.lineJoin = 'round'; c.lineCap = 'round';

  // Hold outer shape-conforming frame (replaces text labels with clear structural geometry).
  if (s.hold) {
    const holdR = R * 1.24;
    c.beginPath(); traceOuterShape(c, symbol, p.x, p.y, holdR);
    c.strokeStyle = 'rgba(5,9,15,.85)'; c.lineWidth = 4.6 * u; c.stroke();
    c.strokeStyle = s.holding ? shade(color, .45) : s.dual ? withAlpha(color, .82) : 'rgba(255,255,255,.55)';
    c.lineWidth = (s.holding ? 2.6 : 1.9) * u; c.stroke();
  }

  // Dual outer colored aura & side-press feedback brackets.
  if (s.dual) {
    const dualR = R * 1.12;
    c.beginPath(); traceOuterShape(c, symbol, p.x, p.y, dualR);
    c.strokeStyle = 'rgba(5,9,15,.82)'; c.lineWidth = 4.8 * u; c.stroke();
    c.strokeStyle = withAlpha(color, .9); c.lineWidth = 2.4 * u; c.stroke();
    for (const [side, dir] of [['left', -1], ['right', 1]] as const) {
      const lit = s.done || s.litSides.has(side);
      const wx = p.x + dir * (R * 1.26), wy = p.y;
      c.beginPath();
      c.moveTo(wx - dir * 3.8 * u, wy - 6.5 * u);
      c.lineTo(wx + dir * 2.2 * u, wy);
      c.lineTo(wx - dir * 3.8 * u, wy + 6.5 * u);
      c.strokeStyle = 'rgba(5,9,15,.85)'; c.lineWidth = 4.2 * u; c.stroke();
      c.strokeStyle = lit ? '#ffffff' : shade(color, .38); c.lineWidth = 2.2 * u; c.stroke();
    }
  }

  // Main target silhouette (compound path with hollow interior for □, △, ○; solid body + inner cross for ×).
  c.beginPath();
  traceOuterShape(c, symbol, p.x, p.y, R);
  if (symbol !== 'cross') traceInnerShape(c, symbol, p.x, p.y, R);

  if (s.dual) {
    const g = c.createLinearGradient(p.x - R, p.y - R, p.x + R, p.y + R);
    g.addColorStop(0, shade(color, s.holding ? .42 : .24));
    g.addColorStop(1, shade(color, s.holding ? -.02 : -.22));
    c.fillStyle = g;
  } else {
    c.fillStyle = s.holding ? '#182232' : '#0b0e15';
  }
  c.fill('evenodd');

  // Crisp outer dark contrast halo + white border.
  c.beginPath(); traceOuterShape(c, symbol, p.x, p.y, R);
  c.strokeStyle = 'rgba(4,7,12,.9)'; c.lineWidth = 4.6 * u; c.stroke();
  c.strokeStyle = '#ffffff'; c.lineWidth = 2.3 * u; c.stroke();

  // Inner contour definition.
  c.beginPath(); traceInnerShape(c, symbol, p.x, p.y, R);
  if (symbol === 'cross') {
    c.strokeStyle = s.dual ? '#ffffff' : 'rgba(255,255,255,.78)';
    c.lineWidth = 2 * u; c.stroke();
  } else {
    c.strokeStyle = s.dual ? '#ffffff' : 'rgba(255,255,255,.86)';
    c.lineWidth = 1.6 * u; c.stroke();
  }

  // Clockwise pointer needle at the center of the target (indicates head arrival, then end hold release).
  const handProgress = s.hold && (s.holding || s.approach >= 1) ? s.progress : s.approach;
  drawClockHand(c, p, u, R, handProgress, color, s.dual || s.holding);
  c.restore();
}

// Curved Project DIVA-style Hold pipe connecting Start Hold (or Target while holding) to End Hold along the swing path.
function drawHoldPipe(c: CanvasRenderingContext2D, note: Note, headRem: number, tailRem: number, width: number, height: number, u: number, color: string, holding: boolean, dual = false) {
  if (tailRem <= headRem + 1e-4) return;
  const steps = 24;
  const pts: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const r = headRem + (tailRem - headRem) * (i / steps);
    pts.push(trajectoryPoint(note, r, width, height));
  }
  const tracePipe = () => {
    c.beginPath();
    c.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
  };
  const pipeW = (dual ? 15.5 : 13) * u;
  c.save();
  c.lineCap = 'round'; c.lineJoin = 'round';
  tracePipe(); c.strokeStyle = 'rgba(5,9,15,.9)'; c.lineWidth = pipeW + 5.2 * u; c.stroke();
  if (dual) {
    tracePipe(); c.strokeStyle = withAlpha(color, .85); c.lineWidth = pipeW + 2.6 * u; c.stroke();
  }
  tracePipe(); c.strokeStyle = '#ffffff'; c.lineWidth = pipeW + .8 * u; c.stroke();
  tracePipe(); c.strokeStyle = shade(color, holding ? .12 : -.08); c.lineWidth = pipeW - 2.4 * u; c.stroke();
  tracePipe(); c.strokeStyle = shade(color, holding ? .68 : .45); c.lineWidth = pipeW * .38; c.stroke();
  c.restore();
}

// End Hold marker: shares the exact symbol shape as Start Hold (no needle on the note itself).
function drawReleaseMarker(c: CanvasRenderingContext2D, p: Point, u: number, color: string, symbol: SymbolName, dual = false) {
  drawNote(c, p, u, color, symbol, dual, true, 1);
}

// Curved ribbon trail following the note's swinging trajectory.
function drawTrail(c: CanvasRenderingContext2D, note: Note, remaining: number, width: number, height: number, u: number, color: string, alpha: number, dual = false) {
  if (alpha <= 0 || remaining >= 1) return;
  const spanRem = Math.min(1 - remaining, .18);
  if (spanRem < .01) return;
  const steps = 8;
  c.save();
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (let i = 0; i < steps; i++) {
    const r0 = remaining + spanRem * (i / steps);
    const r1 = remaining + spanRem * ((i + 1) / steps);
    const p0 = trajectoryPoint(note, r0, width, height);
    const p1 = trajectoryPoint(note, r1, width, height);
    const falloff = 1 - i / steps;
    c.beginPath(); c.moveTo(p0.x, p0.y); c.lineTo(p1.x, p1.y);
    c.strokeStyle = withAlpha(color, (dual ? .62 : .48) * alpha * falloff);
    c.lineWidth = (dual ? 11 : 8.5) * u * falloff;
    c.stroke();
    c.strokeStyle = `rgba(255,255,255,${(dual ? .42 : .3) * alpha * falloff})`;
    c.lineWidth = (dual ? 4.2 : 3) * u * falloff;
    c.stroke();
  }
  c.restore();
}

// Project DIVA-style flying note shaped directly as its symbol (triangle, circle, square, cross).
function drawNote(c: CanvasRenderingContext2D, p: Point, u: number, color: string, symbol: SymbolName, dual: boolean, hold: boolean, alpha: number) {
  const R = 18.2 * u;
  c.save();
  c.globalAlpha = alpha;
  c.lineJoin = 'round'; c.lineCap = 'round';

  // Dual note outer double-frame and side chevron wings.
  if (dual) {
    const dualR = R * 1.15;
    c.beginPath(); traceOuterShape(c, symbol, p.x, p.y, dualR);
    c.strokeStyle = 'rgba(5,9,15,.88)'; c.lineWidth = 4.6 * u; c.stroke();
    c.strokeStyle = shade(color, .38); c.lineWidth = 2.2 * u; c.stroke();
    for (const dir of [-1, 1] as const) {
      const wx = p.x + dir * (R * 1.28), wy = p.y;
      c.beginPath();
      c.moveTo(wx - dir * 3.5 * u, wy - 5.8 * u);
      c.lineTo(wx + dir * 2 * u, wy);
      c.lineTo(wx - dir * 3.5 * u, wy + 5.8 * u);
      c.strokeStyle = 'rgba(5,9,15,.88)'; c.lineWidth = 3.8 * u; c.stroke();
      c.strokeStyle = '#ffffff'; c.lineWidth = 1.9 * u; c.stroke();
    }
  }

  // Dark inner backing for hollow shapes so the center reads cleanly over busy trails/pipes.
  if (symbol !== 'cross') {
    c.beginPath(); traceInnerShape(c, symbol, p.x, p.y, R);
    c.fillStyle = 'rgba(10,14,22,.88)';
    c.fill();
  }

  // Symbol-shaped body fill (compound hollow path for □, △, ○; solid polygon for ×).
  c.beginPath();
  traceOuterShape(c, symbol, p.x, p.y, R);
  if (symbol !== 'cross') traceInnerShape(c, symbol, p.x, p.y, R);
  const g = c.createLinearGradient(p.x - R, p.y - R, p.x + R, p.y + R);
  g.addColorStop(0, shade(color, dual ? .42 : .28));
  g.addColorStop(.55, color);
  g.addColorStop(1, shade(color, -.22));
  c.fillStyle = g;
  c.fill('evenodd');

  // Outer contrast stroke + crisp border (white for Hold/Dual, bright tinted white for Single Tap).
  c.beginPath(); traceOuterShape(c, symbol, p.x, p.y, R);
  c.strokeStyle = 'rgba(5,9,15,.92)'; c.lineWidth = 4.4 * u; c.stroke();
  c.strokeStyle = hold || dual ? '#ffffff' : shade(color, .72);
  c.lineWidth = (hold || dual ? 2.2 : 1.8) * u; c.stroke();

  // Inner cutout / cross highlight.
  c.beginPath(); traceInnerShape(c, symbol, p.x, p.y, R);
  c.strokeStyle = '#ffffff';
  c.lineWidth = (symbol === 'cross' ? 2.1 : 1.5) * u;
  c.stroke();

  c.restore();
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
    const remaining = (n.timeMs - timeMs) / n.travelTimeMs, dual = group.dual && group.length > 1;
    const tailRemaining = hold ? Math.max(0, (n.timeMs + (n.durationMs || 0) - timeMs) / n.travelTimeMs) : 0;
    const tailApproach = hold ? clamp01(1 - tailRemaining) : 0;
    return { group, n, hold, holding, target, point, tail: hold ? tailPoint(n, timeMs, width, height) : undefined, color: COLORS[SYMBOLS.indexOf(n.symbol)], remaining, tailRemaining, tailApproach, dir: direction(n),
      state: { hold, holding, dual, done: false, litSides: new Set(group.flatMap(item => [...(item.unit?.presses.keys() || [])])),
        approach: clamp01(1 - remaining),
        progress: hold ? clamp01((timeMs - n.timeMs) / (n.durationMs || 1)) : 0 } as TargetState };
  });
  const chordPoints = new Map<string, Point>();
  for (const { group, target } of items) {
    if (!group.chordKey) continue;
    const previous = chordPoints.get(group.chordKey);
    if (previous) { c.strokeStyle = 'rgba(199,217,237,.35)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(previous.x, previous.y); c.lineTo(target.x, target.y); c.stroke(); }
    chordPoints.set(group.chordKey, target);
  }
  for (const it of items) {
    if (it.hold) {
      const headRem = it.holding || it.remaining <= 0 ? 0 : Math.max(0, it.remaining);
      drawHoldPipe(c, it.n, headRem, it.tailRemaining, width, height, u, it.color, it.holding, it.state.dual);
    }
  }
  for (const it of items) drawTarget(c, it.target, u, it.color, it.n.symbol, it.state);
  for (const it of items) if (it.hold) drawReleaseMarker(c, it.tail!, u, it.color, it.n.symbol, it.state.dual);
  for (const it of items) {
    if (it.holding) continue;
    const alpha = clamp01((1 - it.remaining) / .12);
    drawTrail(c, it.n, Math.max(0, it.remaining), width, height, u, it.color, alpha, it.state.dual);
    drawNote(c, it.point, u, it.color, it.n.symbol, it.state.dual, it.hold, alpha);
  }
  for (const it of items) {
    if (!it.group.some(n => n.id === selected)) continue;
    const half = 20.25 * u + 7 * u;
    c.strokeStyle = '#fff'; c.lineWidth = 2; c.strokeRect(it.target.x - half, it.target.y - half, half * 2, half * 2);
  }
  c.lineCap = 'butt';
}
