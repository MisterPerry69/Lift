/* ============================================
   LIFT — Icone (Lucide, inline SVG)
   Solo le icone usate, copiate da lucide.dev (ISC license).
   Niente dipendenza runtime / niente fetch.
   ============================================ */

const ICONS = {
  user:
    '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  "chevron-right": '<path d="m9 18 6-6-6-6"/>',
  dumbbell:
    '<path d="m6.5 6.5 11 11"/><path d="m21 21-1-1"/><path d="m3 3 1 1"/><path d="m18 22 4-4"/><path d="m2 6 4-4"/><path d="m3 10 7-7"/><path d="m14 21 7-7"/>',
  "arrow-left": '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  // Mood: 1=annoyed, 2=frown, 3=meh, 4=smile, 5=laugh/heart
  "mood-1":
    '<circle cx="12" cy="12" r="10"/><path d="M8 16s1.5-2 4-2 4 2 4 2"/><line x1="8" y1="9" x2="10" y2="9"/><line x1="14" y1="9" x2="16" y2="9"/>',
  "mood-2":
    '<circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
  "mood-3":
    '<circle cx="12" cy="12" r="10"/><line x1="8" y1="15" x2="16" y2="15"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
  "mood-4":
    '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
  "mood-5":
    '<circle cx="12" cy="12" r="10"/><path d="M7 14s1.5 3 5 3 5-3 5-3"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
  // Energia: 1=sotto terra (battery warning) / 2=scarica (battery low) /
  // 3=media (battery medium) / 4=piena (battery full) / 5=fulmine (zap)
  "energy-1":
    '<rect x="2" y="7" width="16" height="10" rx="2" ry="2"/><line x1="22" y1="11" x2="22" y2="13"/><line x1="10" y1="9" x2="10" y2="15"/><line x1="14" y1="11" x2="14" y2="11.01"/>',
  "energy-2":
    '<rect x="2" y="7" width="16" height="10" rx="2" ry="2"/><line x1="22" y1="11" x2="22" y2="13"/><line x1="6" y1="11" x2="6" y2="13"/>',
  "energy-3":
    '<rect x="2" y="7" width="16" height="10" rx="2" ry="2"/><line x1="22" y1="11" x2="22" y2="13"/><line x1="6" y1="11" x2="6" y2="13"/><line x1="10" y1="11" x2="10" y2="13"/>',
  "energy-4":
    '<rect x="2" y="7" width="16" height="10" rx="2" ry="2"/><line x1="22" y1="11" x2="22" y2="13"/><line x1="6" y1="11" x2="6" y2="13"/><line x1="10" y1="11" x2="10" y2="13"/><line x1="14" y1="11" x2="14" y2="13"/>',
  "energy-5":
    '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
};

function iconSvg(name) {
  const path = ICONS[name] || "";
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}
