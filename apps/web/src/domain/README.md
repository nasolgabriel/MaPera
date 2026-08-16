# domain/

PURE functions only — all money math from README §8 lives here.
Zero imports from `ui`/`db`. Plain arrays/objects in, numbers/objects out. No side effects.

Files land per session: `stats.ts` (A3) · `budgets.ts` (B3) · `split.ts` (B4) ·
`calendar.ts` (E2 — month grid, day heat levels, 7-day window) · `dues.ts` (B6) ·
`investments.ts` (B8) · `credit.ts` (B9) · `savedItems.ts` (B10) · `discounts.ts` (B11) ·
`gamification.ts` (B12).
