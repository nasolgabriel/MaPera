/**
 * Design tokens — README §5 (DECIDED: Palette A, bright).
 * Navy + Saffron. Flat colors only, NO gradients anywhere.
 * Saffron marks money moments only (≤ ~10% of any screen).
 */

export interface ThemeTokens {
  primary: string
  accent: string
  accentText: string
  bg: string
  surface: string
  border: string
  muted: string
  text: string
  textDim: string
  /** Budget bar >100% state (§5 rules) */
  danger: string
}

export const light: ThemeTokens = {
  primary: '#1E3A6E',
  accent: '#F6B51E',
  accentText: '#C08A0A',
  bg: '#F6F7F9',
  surface: '#FCFCFD',
  border: '#DDE2EA',
  muted: '#EEF0F4',
  text: '#16213A',
  textDim: '#5B6577',
  danger: '#C0392B',
}

export const dark: ThemeTokens = {
  primary: '#7FA3E0',
  accent: '#FFC93E',
  accentText: '#FFC93E',
  bg: '#101725',
  surface: '#1A2338',
  border: '#26304A',
  muted: '#212C45',
  text: '#E7ECF5',
  textDim: '#8B97AD',
  danger: '#E06055',
}

/**
 * Essence colors — §5 (DECIDED). Each account picks ONE of these 6.
 */
export const essenceColors = [
  '#B3282D', // red
  '#1E3A6E', // navy
  '#0D7A3F', // green
  '#F6B51E', // saffron
  '#7A3FD0', // purple
  '#E8641B', // orange
] as const

export type EssenceColor = (typeof essenceColors)[number]

export type ThemeMode = 'light' | 'dark'

/** Writes the token set as CSS custom properties on <html> (--color-*). */
export function applyTheme(mode: ThemeMode): void {
  const tokens = mode === 'dark' ? dark : light
  const root = document.documentElement
  for (const [name, value] of Object.entries(tokens)) {
    root.style.setProperty(`--color-${name}`, value)
  }
  root.dataset.theme = mode
}
