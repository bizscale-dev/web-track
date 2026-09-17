// Per-user 3-color theme: background, button, and accent, each picked
// independently in Settings and stored on the Supabase Auth user (same
// pattern as avatar_url). Button/accent each expand into a small derived
// palette (hover shade, light tint, readable on-color text) via HSL math;
// background is applied as-is since it only ever sits behind white/light
// card surfaces, never behind text directly.

export const DEFAULT_BG = "#f6f8fc";
export const DEFAULT_CARD = "#ffffff";
export const DEFAULT_BUTTON = "#2563eb"; // original blue-600
export const DEFAULT_ACCENT = "#2563eb";

// Kept for any code still importing the old single-color name.
export const DEFAULT_ACCENT_COLOR = DEFAULT_ACCENT;

function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const int = parseInt(match[1], 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return [h * 360, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (n: number) =>
    Math.round(f(n) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(0)}${toHex(8)}${toHex(4)}`;
}

export function isValidHexColor(value: string): boolean {
  return hexToRgb(value) !== null;
}

export type ColorPalette = {
  base: string;
  hover: string;
  light: string;
  text: string;
};

export function buildPalette(hex: string, fallback: string): ColorPalette {
  const rgb = hexToRgb(hex);
  if (!rgb) return buildPalette(fallback, fallback);

  const [h, s, l] = rgbToHsl(...rgb);
  const hover = hslToHex(h, s, Math.max(l - 10, 8));
  const light = hslToHex(h, Math.min(s, 60), 95);
  // Perceptual luminance decides whether white or near-black text stays
  // readable sitting on top of the raw color.
  const luminance = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  const text = luminance > 0.6 ? "#0f172a" : "#ffffff";

  return { base: hex, hover, light, text };
}

export type ThemeColors = {
  background: string;
  card: string;
  button: string;
  accent: string;
};

export const DEFAULT_THEME: ThemeColors = {
  background: DEFAULT_BG,
  card: DEFAULT_CARD,
  button: DEFAULT_BUTTON,
  accent: DEFAULT_ACCENT,
};

// Secondary/tertiary text (labels, subtitles, counts) needs its own muted
// tone rather than reusing the hardcoded slate-500 that only works on white —
// on a dark card that's nearly invisible. Picked to stay legible either way
// without going fully high-contrast like the primary heading color.
function mutedForeground(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#64748b";
  const luminance = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  return luminance > 0.6 ? "#64748b" /* slate-500 */ : "#94a3b8" /* slate-400 */;
}

function readableForeground(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#0f172a";
  const luminance = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  return luminance > 0.6 ? "#0f172a" : "#ffffff";
}

export function applyTheme(theme: Partial<ThemeColors>) {
  if (typeof document === "undefined") return;
  const background = isValidHexColor(theme.background || "") ? theme.background! : DEFAULT_BG;
  const cardHex = isValidHexColor(theme.card || "") ? theme.card! : DEFAULT_CARD;
  const card = buildPalette(cardHex, DEFAULT_CARD);
  const button = buildPalette(theme.button || "", DEFAULT_BUTTON);
  const accent = buildPalette(theme.accent || "", DEFAULT_ACCENT);

  const root = document.documentElement.style;
  root.setProperty("--bg", background);
  // Text sitting directly on the page canvas (not inside a card) needs its
  // own readable/muted pair too — a dark background with hardcoded dark
  // headings would otherwise vanish.
  root.setProperty("--bg-foreground", readableForeground(background));
  root.setProperty("--bg-muted", mutedForeground(background));
  root.setProperty("--card", card.base);
  // A card only ever needs a subtle border and readable text on top of it —
  // no "hover"/"light" variant, since cards aren't clickable buttons.
  root.setProperty("--card-border", card.hover);
  root.setProperty("--card-foreground", card.text);
  root.setProperty("--card-muted", mutedForeground(cardHex));
  root.setProperty("--button", button.base);
  root.setProperty("--button-hover", button.hover);
  root.setProperty("--button-text", button.text);
  root.setProperty("--accent", accent.base);
  root.setProperty("--accent-hover", accent.hover);
  root.setProperty("--accent-light", accent.light);
  root.setProperty("--accent-text", accent.text);
}
