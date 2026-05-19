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
};

function iconSvg(name) {
  const path = ICONS[name] || "";
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}
