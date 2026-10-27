import type { Sector } from '../../src/domain/sectors';

const NAVY = '#0B2A6B';
const PRIMARY = '#1A5CE6';
const GOLD = '#F2B21B';

/** Sector tint for the sky gradient. */
const TINT: Record<Sector, string> = {
  AGROINDUSTRIA: '#4C9A2A',
  ALIMENTOS_BEBIDAS: '#B5651D',
  LOGISTICA: '#1A8FE6',
  SERVICIOS_FINANCIEROS: '#2E4A9E',
  MANUFACTURA: '#6B7280',
  TECNOLOGIA: '#7C3AED',
  SALUD: '#0E9F8E',
  RETAIL: '#E0457B',
  CONSTRUCCION: '#C2410C',
  ENERGIA: '#D4A017',
};

/** Small sector glyph built from basic shapes, drawn around (0,0). */
const GLYPH: Record<Sector, string> = {
  AGROINDUSTRIA: '<path d="M0 12V-4M0 4C-10 2-10-8 0-10C10-8 10 2 0 4Z"/>',
  ALIMENTOS_BEBIDAS:
    '<path d="M-9-8H9L6 10H-6Z"/><circle cx="12" cy="0" r="5" fill="none" stroke="#fff" stroke-width="3"/>',
  LOGISTICA:
    '<rect x="-12" y="-6" width="16" height="12"/><rect x="5" y="-1" width="8" height="7"/><circle cx="-6" cy="8" r="3"/><circle cx="9" cy="8" r="3"/>',
  SERVICIOS_FINANCIEROS:
    '<circle cx="0" cy="0" r="11"/><rect x="-2" y="-7" width="4" height="14" fill="' + NAVY + '"/>',
  MANUFACTURA: '<path d="M-12 10V-2L-4 4V-2L4 4V-10H8V10Z"/>',
  TECNOLOGIA:
    '<rect x="-11" y="-9" width="22" height="15" rx="2"/><rect x="-6" y="8" width="12" height="3"/>',
  SALUD: '<rect x="-3" y="-11" width="6" height="22"/><rect x="-11" y="-3" width="22" height="6"/>',
  RETAIL:
    '<path d="M-10-4H10L8 10H-8Z"/><path d="M-5-4V-8H5V-4" fill="none" stroke="#fff" stroke-width="2.5"/>',
  CONSTRUCCION: '<rect x="-10" y="-2" width="20" height="12"/><path d="M-12-2L0-11L12-2Z"/>',
  ENERGIA: '<path d="M3-12L-8 2H-1L-3 12L8-3H1Z"/>',
};

/** Deterministic pseudo-random in [0,1) from a numeric seed (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One ridge of hills as a closed path across a 400x240 canvas. */
function ridge(rand: () => number, baseY: number, amp: number): string {
  const pts = 6;
  let d = `M0 240V${baseY}`;
  for (let i = 1; i <= pts; i++) {
    const x = Math.round((400 / pts) * i);
    const y = Math.round(baseY - rand() * amp);
    const cx = Math.round((400 / pts) * (i - 0.5));
    d += `Q${cx} ${Math.round(baseY - amp - rand() * amp)} ${x} ${y}`;
  }
  return `${d}V240Z`;
}

/** Deterministic abstract-landscape teaser as SVG markup (under 3 KB, no external assets). */
export function teaserSvg(sector: Sector, seed: number): string {
  const rand = rng(seed * 7919 + sector.length * 104729);
  const tint = TINT[sector];
  const sunX = 70 + Math.round(rand() * 260);
  const glyphX = 60 + Math.round(rand() * 280);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="400" height="240">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${tint}"/><stop offset="1" stop-color="${PRIMARY}"/></linearGradient></defs>` +
    `<rect width="400" height="240" fill="url(#g)"/>` +
    `<circle cx="${sunX}" cy="62" r="22" fill="${GOLD}"/>` +
    `<path d="${ridge(rand, 170, 40)}" fill="${PRIMARY}" fill-opacity=".75"/>` +
    `<path d="${ridge(rand, 200, 30)}" fill="${NAVY}" fill-opacity=".85"/>` +
    `<path d="${ridge(rand, 225, 18)}" fill="${NAVY}"/>` +
    `<g transform="translate(${glyphX} 120)" fill="#fff" fill-opacity=".92">${GLYPH[sector]}</g>` +
    `</svg>`
  );
}

/** Wraps SVG markup as a `data:` URL. */
export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}
