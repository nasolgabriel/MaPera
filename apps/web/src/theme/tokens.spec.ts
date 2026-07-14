import { describe, expect, it } from 'vitest'
import { applyTheme, dark, essenceColors, light } from './tokens'

// §5 is DECIDED — these values are final. A failure here means a token drifted.
describe('theme tokens (§5)', () => {
  it('light palette matches the spec', () => {
    expect(light.primary).toBe('#1E3A6E')
    expect(light.accent).toBe('#F6B51E')
    expect(light.accentText).toBe('#C08A0A')
    expect(light.bg).toBe('#F6F7F9')
    expect(light.surface).toBe('#FCFCFD')
    expect(light.border).toBe('#DDE2EA')
    expect(light.muted).toBe('#EEF0F4')
    expect(light.text).toBe('#16213A')
    expect(light.textDim).toBe('#5B6577')
    expect(light.danger).toBe('#C0392B')
  })

  it('dark palette matches the spec', () => {
    expect(dark.primary).toBe('#7FA3E0')
    expect(dark.accent).toBe('#FFC93E')
    expect(dark.bg).toBe('#101725')
    expect(dark.surface).toBe('#1A2338')
    expect(dark.border).toBe('#26304A')
    expect(dark.text).toBe('#E7ECF5')
    expect(dark.textDim).toBe('#8B97AD')
    expect(dark.danger).toBe('#E06055')
  })

  it('offers exactly the 6 decided essence colors', () => {
    expect(essenceColors).toEqual([
      '#B3282D',
      '#1E3A6E',
      '#0D7A3F',
      '#F6B51E',
      '#7A3FD0',
      '#E8641B',
    ])
  })

  it('applyTheme writes CSS custom properties and the theme flag', () => {
    applyTheme('dark')
    const root = document.documentElement
    expect(root.style.getPropertyValue('--color-bg')).toBe(dark.bg)
    expect(root.style.getPropertyValue('--color-text')).toBe(dark.text)
    expect(root.dataset.theme).toBe('dark')

    applyTheme('light')
    expect(root.style.getPropertyValue('--color-bg')).toBe(light.bg)
    expect(root.dataset.theme).toBe('light')
  })
})
