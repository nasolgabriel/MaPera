import { essenceColors } from './tokens'

export type EssenceLadder = readonly [string, string, string, string]

const MIX_STEPS = [0.224, 0.517, 0.83] as const

const NAVY = essenceColors[1]

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
}

function parseHex(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (match === null) return null
  const n = parseInt(match[1]!, 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

function toHex(rgb: [number, number, number]): string {
  const channel = (v: number): string =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${channel(rgb[0])}${channel(rgb[1])}${channel(rgb[2])}`.toUpperCase()
}

function rgbToOklab(rgb: [number, number, number]): [number, number, number] {
  const r = srgbToLinear(rgb[0])
  const g = srgbToLinear(rgb[1])
  const b = srgbToLinear(rgb[2])
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function oklabToRgb(lab: [number, number, number]): [number, number, number] {
  const l = Math.pow(lab[0] + 0.3963377774 * lab[1] + 0.2158037573 * lab[2], 3)
  const m = Math.pow(lab[0] - 0.1055613458 * lab[1] - 0.0638541728 * lab[2], 3)
  const s = Math.pow(lab[0] - 0.0894841775 * lab[1] - 1.291485548 * lab[2], 3)
  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}

const cache = new Map<string, EssenceLadder>()

function derive(color: string): EssenceLadder {
  const rgb = parseHex(color) ?? parseHex(NAVY)!
  const base = toHex(rgb)
  const [L, a, b] = rgbToOklab(rgb)
  const steps = MIX_STEPS.map((t) => toHex(oklabToRgb([L + (1 - L) * t, a * (1 - t), b * (1 - t)])))
  return [base, steps[0]!, steps[1]!, steps[2]!]
}

export function essenceShades(color: string): EssenceLadder {
  const key = color.trim().toUpperCase()
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const ladder = derive(color)
  cache.set(key, ladder)
  return ladder
}

export function essenceFor(color: string, mode: 'light' | 'dark'): string {
  const ladder = essenceShades(color)
  return mode === 'dark' ? ladder[1] : ladder[0]
}

export function essenceVars(color: string): Record<string, string> {
  const ladder = essenceShades(color)
  return { '--e0': ladder[0], '--e1': ladder[1], '--e2': ladder[2], '--e3': ladder[3] }
}
