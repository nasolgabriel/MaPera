import { describe, expect, it } from 'vitest'
import { essenceColors } from './tokens'
import { essenceFor, essenceShades, essenceVars } from './essence'

const SPEC_RED_LADDER = ['#B3282D', '#CF5A5E', '#E59A9C', '#F6DCDD']
const TOLERANCE = 6

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function relativeLuminance(hex: string): number {
  const linear = channels(hex)
    .map((c) => c / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)))
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!
}

function saturation(hex: string): number {
  const [r, g, b] = channels(hex)
  return Math.max(r, g, b) - Math.min(r, g, b)
}

describe('essence shade derivation (§5)', () => {
  it('returns the base plus three lighter steps', () => {
    const ladder = essenceShades('#B3282D')
    expect(ladder).toHaveLength(4)
    expect(ladder[0]).toBe('#B3282D')
  })

  it('lands within 6/255 per channel of §5’s worked red ladder', () => {
    const ladder = essenceShades('#B3282D')
    for (let rung = 0; rung < 4; rung += 1) {
      const got = channels(ladder[rung]!)
      const want = channels(SPEC_RED_LADDER[rung]!)
      for (let c = 0; c < 3; c += 1) {
        expect(Math.abs(got[c]! - want[c]!)).toBeLessThanOrEqual(TOLERANCE)
      }
    }
  })

  it('lightens monotonically for every one of the 6 decided colors', () => {
    for (const color of essenceColors) {
      const ladder = essenceShades(color)
      const luminances = ladder.map(relativeLuminance)
      for (let i = 1; i < 4; i += 1) {
        expect(luminances[i]!).toBeGreaterThan(luminances[i - 1]!)
      }
      expect(luminances[3]!).toBeGreaterThan(0.6)
    }
  })

  it('washes out saturation as it lightens, never inflating it', () => {
    for (const color of essenceColors) {
      const ladder = essenceShades(color)
      expect(saturation(ladder[2]!)).toBeLessThan(saturation(ladder[0]!))
      expect(saturation(ladder[3]!)).toBeLessThan(saturation(ladder[2]!))
    }
  })

  it('emits in-gamut 6-digit hex for every rung', () => {
    for (const color of essenceColors) {
      for (const rung of essenceShades(color)) {
        expect(rung).toMatch(/^#[0-9A-F]{6}$/)
      }
    }
  })

  it('is pure — same input, same ladder', () => {
    expect(essenceShades('#0D7A3F')).toEqual(essenceShades('#0D7A3F'))
  })

  it('falls back to navy on an unparsable colour instead of emitting garbage', () => {
    expect(essenceShades('not-a-color')).toEqual(essenceShades('#1E3A6E'))
    expect(essenceShades('#ABC')).toEqual(essenceShades('#1E3A6E'))
  })

  it('normalises case so a lowercase pick ladders identically', () => {
    expect(essenceShades('#b3282d')).toEqual(essenceShades('#B3282D'))
  })

  it('essenceFor serves the base in light and the first lighter step in dark (F1)', () => {
    const ladder = essenceShades('#B3282D')
    expect(essenceFor('#B3282D', 'light')).toBe(ladder[0])
    expect(essenceFor('#B3282D', 'dark')).toBe(ladder[1])
  })

  it('essenceVars exposes the whole ladder as CSS custom properties', () => {
    const ladder = essenceShades('#7A3FD0')
    expect(essenceVars('#7A3FD0')).toEqual({
      '--e0': ladder[0],
      '--e1': ladder[1],
      '--e2': ladder[2],
      '--e3': ladder[3],
    })
  })
})
