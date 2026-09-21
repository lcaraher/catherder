import { readFileSync } from "node:fs";

// WCAG 2 contrast check of the colour tokens in globals.css, per theme.
// Run via `npm run check:contrast`; exits 1 on a failing text or ui pair.

type Kind = "text" | "ui" | "info";
type Pair = [foreground: string, ground: string, minimum: number, kind: Kind];

// foreground token, ground token, minimum, kind
const PAIRS: Pair[] = [
  ["foreground", "surface", 4.5, "text"],
  ["foreground", "surface-card", 4.5, "text"],
  ["foreground", "surface-muted", 4.5, "text"],
  ["foreground", "surface-raised", 4.5, "text"],
  ["foreground", "selected", 4.5, "text"],
  ["foreground", "field", 4.5, "text"],
  ["muted", "surface", 4.5, "text"],
  ["muted", "surface-muted", 4.5, "text"],
  ["muted", "surface-raised", 4.5, "text"],
  ["hint", "surface", 4.5, "text"],
  ["faint", "surface", 4.5, "text"],
  ["error", "surface", 4.5, "text"],
  ["on-primary", "btn-primary", 4.5, "text"],
  ["on-primary", "btn-primary-hover", 4.5, "text"],
  ["on-primary", "btn-danger", 4.5, "text"],
  ["on-primary", "btn-danger-hover", 4.5, "text"],
  ["btn-secondary-text", "surface", 4.5, "text"],
  ["btn-secondary-text", "btn-secondary-hover", 4.5, "text"],
  ["btn-danger-text", "surface", 4.5, "text"],
  ["btn-danger-text", "btn-danger-wash", 4.5, "text"],
  ["toggle-active-text", "toggle-active", 4.5, "text"],
  ["badge-draft-text", "badge-draft", 4.5, "text"],
  ["badge-open-text", "badge-open", 4.5, "text"],
  ["badge-closed-text", "badge-closed", 4.5, "text"],
  ["badge-organizer-text", "badge-organizer", 4.5, "text"],
  ["status-invited", "surface", 4.5, "text"],
  ["status-submitted", "surface", 4.5, "text"],
  ["status-unlocked", "surface", 4.5, "text"],
  ["notice-error-text", "notice-error", 4.5, "text"],
  ["notice-warn-text", "notice-warn", 4.5, "text"],
  ["notice-admin-text", "notice-admin", 4.5, "text"],
  ["grid-label", "surface-card", 4.5, "text"],
  ["heat-text", "heat-0", 4.5, "text"],
  ["heat-text", "heat-1", 4.5, "text"],
  ["heat-text", "heat-2", 4.5, "text"],
  ["heat-text", "heat-3", 4.5, "text"],
  ["heat-text", "heat-4", 4.5, "text"],
  ["heat-text", "heat-5", 4.5, "text"],
  ["edge-strong", "surface", 3, "ui"],
  ["ring", "surface", 3, "ui"],
  ["ring", "surface-card", 3, "ui"],
  ["btn-primary", "surface", 3, "ui"],
  ["btn-danger-border", "surface", 3, "ui"],
  ["notice-error-border", "notice-error", 3, "ui"],
  ["notice-warn-border", "notice-warn", 3, "ui"],
  ["notice-admin-border", "notice-admin", 3, "ui"],
  ["tentative-border", "tentative", 3, "ui"],
  ["tentative-border", "surface-card", 3, "ui"],
  ["avail", "unavail", 3, "ui"],
  ["organizer-mark", "heat-1", 3, "ui"],
  ["organizer-mark", "heat-2", 3, "ui"],
  ["organizer-mark", "heat-3", 3, "ui"],
  ["organizer-mark", "heat-4", 3, "ui"],
  ["organizer-mark", "heat-5", 3, "ui"],
  ["disabled", "surface", 0, "info"],
  ["edge", "surface", 0, "info"],
  ["grid-line", "surface-card", 0, "info"],
];

const CSS_PATH = new URL("../src/app/globals.css", import.meta.url);

// Gamma-encoded sRGB channels 0–1 plus alpha 0–1.
type Rgba = { r: number; g: number; b: number; a: number };
type Tokens = Map<string, string>;

// Removes every @media (prefers-color-scheme …) block, braces matched.
function dropSchemeMedia(css: string): string {
  let out = css;
  for (;;) {
    const at = out.search(/@media[^{]*prefers-color-scheme/);
    if (at < 0) return out;
    let i = out.indexOf("{", at);
    let depth = 1;
    while (depth > 0 && ++i < out.length) {
      if (out[i] === "{") depth++;
      else if (out[i] === "}") depth--;
    }
    out = out.slice(0, at) + out.slice(i + 1);
  }
}

// Custom properties of :root and of each [data-theme="…"] block.
function readThemes(css: string): { root: Tokens; themes: Map<string, Tokens> } {
  const clean = dropSchemeMedia(css.replace(/\/\*[\s\S]*?\*\//g, ""));
  const root: Tokens = new Map();
  const themes = new Map<string, Tokens>();
  const blockRe = /(:root|\[data-theme="([^"]+)"\])\s*\{([^}]*)\}/g;
  for (const m of clean.matchAll(blockRe)) {
    const target = m[2] === undefined ? root : (themes.get(m[2]) ?? new Map());
    if (m[2] !== undefined) themes.set(m[2], target);
    for (const d of m[3].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
      target.set(d[1], d[2].trim());
    }
  }
  return { root, themes };
}

// A token's raw value in one theme, var() chains followed.
function resolve(name: string, theme: Tokens, root: Tokens, seen: string[] = []): string {
  if (seen.includes(name)) throw new Error(`circular var(): ${[...seen, name].join(" -> ")}`);
  const value = theme.get(name) ?? root.get(name);
  if (value === undefined) throw new Error(`token --${name} is not declared`);
  const ref = /^var\(\s*--([\w-]+)\s*\)$/.exec(value);
  return ref ? resolve(ref[1], theme, root, [...seen, name]) : value;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// "50%" -> 0.5 * percentOf; a bare number is divided by `scale`; "none" -> 0.
function component(raw: string, scale = 1, percentOf = 1): number {
  if (raw === "none") return 0;
  return raw.endsWith("%") ? (parseFloat(raw) / 100) * percentOf : parseFloat(raw) / scale;
}

const encode = (v: number) =>
  v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;

// OKLCH -> OKLab -> linear sRGB -> gamma-encoded sRGB, clipped to 0–1.
function oklchToRgb(l: number, c: number, hDeg: number): [number, number, number] {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l3 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m3 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s3 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ];
  const [r, g, bl] = linear.map((v) => clamp01(encode(clamp01(v))));
  return [r, g, bl];
}

// Parses hex, rgb()/rgba(), oklch() and `transparent`.
function parseColour(value: string): Rgba {
  const v = value.trim().toLowerCase();
  if (v === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(v);
  if (hex) {
    const full = hex[1].length === 3 ? hex[1].replace(/./g, "$&$&") : hex[1];
    const n = parseInt(full, 16);
    return { r: (n >> 16) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: 1 };
  }
  const fn = /^(rgba?|oklch)\(([^)]*)\)$/.exec(v);
  if (!fn) throw new Error(`unsupported colour: ${value}`);
  const [channels, alphaPart] = fn[2].split("/").map((s) => s.trim());
  const parts = channels.split(/[\s,]+/).filter(Boolean);
  const alphaRaw = alphaPart ?? (parts.length === 4 ? parts.pop() : undefined);
  if (parts.length !== 3) throw new Error(`unsupported colour: ${value}`);
  const a = alphaRaw === undefined ? 1 : clamp01(component(alphaRaw));
  if (fn[1] === "oklch") {
    const hue = parts[2] === "none" ? 0 : parseFloat(parts[2]);
    // Chroma 100% is 0.4.
    const [r, g, b] = oklchToRgb(component(parts[0]), component(parts[1], 1, 0.4), hue);
    return { r, g, b, a };
  }
  const [r, g, b] = parts.map((p) => clamp01(component(p, 255)));
  return { r, g, b, a };
}

// Source-over in gamma-encoded sRGB; `under` is taken as opaque.
function over(top: Rgba, under: Rgba): Rgba {
  const mix = (t: number, u: number) => t * top.a + u * (1 - top.a);
  return { r: mix(top.r, under.r), g: mix(top.g, under.g), b: mix(top.b, under.b), a: 1 };
}

function luminance(c: Rgba): number {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

function contrast(x: Rgba, y: Rgba): number {
  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

const toBytes = (c: Rgba) => [c.r, c.g, c.b].map((v) => Math.round(v * 255));

// Known OKLCH -> hex conversions; each channel must land within 1.
function selfCheck(): boolean {
  const known: [string, string][] = [
    ["oklch(59.6% 0.145 163.225)", "#009966"],
    ["oklch(57.7% 0.245 27.325)", "#e7000b"],
  ];
  let ok = true;
  for (const [input, expected] of known) {
    const got = toBytes(parseColour(input));
    const want = toBytes(parseColour(expected));
    if (got.some((v, i) => Math.abs(v - want[i]) > 1)) {
      const hex = "#" + got.map((v) => v.toString(16).padStart(2, "0")).join("");
      console.log(`conversion self-check failed: ${input} gave ${hex}, expected ${expected}`);
      ok = false;
    }
  }
  return ok;
}

function main(): number {
  if (!selfCheck()) return 2;

  const { root, themes } = readThemes(readFileSync(CSS_PATH, "utf8"));
  // :root alone is the light theme until a [data-theme="light"] block exists.
  const all: [string, Tokens][] = [[themes.has("light") ? ":root" : "light", new Map()], ...themes];
  const width = Math.max(...PAIRS.map(([fg, bg]) => fg.length + bg.length + 1));
  let failed = false;

  for (const [name, theme] of all) {
    const colour = (token: string) => parseColour(resolve(token, theme, root));
    const surface = over(colour("surface"), { r: 1, g: 1, b: 1, a: 1 });
    const counts = { pass: 0, fail: 0, info: 0 };

    console.log(`theme: ${name}`);
    console.log(`${"pair".padEnd(width)}  kind   ratio   min  result`);
    for (const [fg, bg, minimum, kind] of PAIRS) {
      const ground = over(colour(bg), surface);
      const ratio = contrast(over(colour(fg), ground), ground);
      // Truncated, so the printed ratio never overstates the real one.
      const shown = (Math.floor(ratio * 100) / 100).toFixed(2);
      const result = kind === "info" ? "info" : ratio >= minimum ? "PASS" : "FAIL";
      counts[result === "PASS" ? "pass" : result === "FAIL" ? "fail" : "info"]++;
      const min = kind === "info" ? "-" : minimum.toFixed(1);
      console.log(
        `${`${fg}/${bg}`.padEnd(width)}  ${kind.padEnd(4)}  ${shown.padStart(6)}  ${min.padStart(4)}  ${result}`,
      );
    }
    console.log(`${name}: ${counts.pass} pass, ${counts.fail} fail, ${counts.info} info`);
    console.log("");
    if (counts.fail > 0) failed = true;
  }
  return failed ? 1 : 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.log(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
