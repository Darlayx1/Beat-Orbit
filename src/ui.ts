export const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export const icons: Record<string, string> = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  music: '<path d="M9 18V5l12-2v13M9 8l12-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="18" cy="16" rx="3" ry="3"/>',
  studio: '<path d="M4 20h16M5 16l11-11 3 3L8 19H5zM14 7l3 3"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/>',
  download: '<path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  play: '<path d="m8 4 12 8-12 8z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  back: '<path d="M20 12H4m6-6-6 6 6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  check: '<path d="m5 12 4 4L20 5"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  undo: '<path d="M4 10h10a6 6 0 0 1 0 12M4 10l5-5m-5 5 5 5"/>',
  redo: '<path d="M20 10H10a6 6 0 0 0 0 12m16-12-5-5m5 5-5 5"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  save: '<path d="M4 3h13l4 4v14H3V3h1zm3 0v6h10V3M7 21v-8h10v8"/>',
  select: '<path d="m5 3 14 10-7 1-3 7z"/>',
  hand: '<path d="M8 13V6a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v9-6a2 2 0 0 1 4 0v10c0 5-3 6-7 6-3 0-5-2-7-5l-3-4c-1-2 1-4 3-2l2 2"/>',
  volume: '<path d="M11 4 5 9H2v6h3l6 5zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  trophy: '<path d="M7 3h10v5c0 5-10 5-10 0V3zm0 2H3v3c0 4 5 4 5 4m9-7h4v3c0 4-5 4-5 4M12 12v6m-5 3h10m-8-3h6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c1.8-3.8 5-6 8-6s6.2 2.2 8 6"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9"/>',
  cloud: '<path d="M17.5 19H7a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17.3 9.5a3.5 3.5 0 0 1 .2 9.5z"/>'
};
export const icon = (name: string) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (icons[name] || icons.info) + '</svg>';
let toastTimer: ReturnType<typeof setTimeout>;
export function toast(message: string, error = false) {
  const root = document.querySelector<HTMLDivElement>('#toast')!;
  root.textContent = message; root.className = 'visible' + (error ? ' error' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => root.className = '', error ? 7000 : 3500);
}
export function downloadJSON(value: unknown, name: string) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name.replace(/[^\p{L}\p{N}._ -]/gu, '_') + '.beatorbit.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
