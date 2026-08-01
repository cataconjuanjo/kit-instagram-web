# Critique: app/dashboard/page.js
**Date:** 2026-08-01  
**Surface:** Carta Viva Dashboard — main home  
**Mode:** Operate  
**Score: 11 / 20 (55% — Needs Work)**

---

## Score Table

| Dimension | Score | Summary |
|---|---|---|
| Task Clarity | 2 / 4 | Two competing `h1`, priority CTA buried behind stats strip |
| Information Density | 3 / 4 | Cellar + radar panels well-structured; empty radar state unhandled |
| Operational Feedback | 2 / 4 | Undo toast is solid; loading/payment states are entirely off-system |
| Consistency | 2 / 4 | `border-left` side-tab on priority panel; inline color islands; btn system has no base rule |
| Craft | 2 / 4 | No hover on cellar tiles; no transition on progress bar; hardcoded color palette fragmentation |

---

## Detector Report (Assessment B)

### app/dashboard/page.js
- **9 advisory findings** — all `design-system-color` in inline JSX style props (lines 563–997)

### app/dashboard/module.module.css
- **418 total findings**
- 3 warnings (actionable), 415 advisories
  - `side-tab`: 1 (line 649)
  - `layout-transition`: 2 (lines 642, 2859)
  - `design-system-color`: 231
  - `design-system-font-size`: 175
  - `design-system-radius`: 9

---

## Findings by Severity

### P0 — System Contract Broken

**P0-1 · Loading state is entirely off-system** (`page.js:562–566`, `page.js:997`)  
`background:'#fff'` — wrong (should be `#f8f3eb` sand). `fontFamily:'system-ui'` — wrong (Geist Sans). `color:'#bbb'` — not a token. Same problem in the `Suspense` fallback at line 997. Both flash white before the real page loads — visual breakage on fast connections.  
**Fix:** Use `#f8f3eb` background, inherit font, use `#a79f96` for muted text.

**P0-2 · Payment gate uses a completely alien palette** (`page.js:570–598`)  
`#1a1a2e` (dark navy — not in design system), `#c9a96e` (close but not `#d8c898`), `#f4f3f0`, `borderRadius:16`, `borderRadius:10`, emoji (`⏳`, `🔒`). Zero tokens used. The entire gate is a separate visual language on a B2B professional tool.  
**Fix:** Migrate to on-system values: `#f8f3eb` page bg, `#171416` for text, `#d8c898` for accent, `border-radius: 8px`.

**P0-3 · `border-left: 5px solid #74223d` on `.priorityPanel`** (`dashboard.module.css:443`)  
The most prominent card on the dashboard uses the flagged side-tab antipattern — "the most recognizable tell of AI-generated UIs." The eyebrow "Prioridad de hoy" + gold color already differentiate the card; the thick left border is redundant noise.  
**Fix:** Remove line 443. Keep the `border: 1px solid #ddd6cb` perimeter border.

### P1 — Fix Before Ship

**P1-1 · Two `h1` elements on the same page** (`page.js:784`, `page.js:841`)  
When activation is compact (≥60% progress) and daily ops are visible, both panels render simultaneously with `h1`. The wrong one wins DOM priority — the activation checklist header outranks the actual operational priority.  
**Fix:** Demote activation panel `h1` (line 784) to `h2`.

**P1-2 · Progress bar has no transition** (`dashboard.module.css:171`)  
`.activationBar span` has `width: ${progresoActivacion}%` inline style but no CSS transition. The bar snaps on task completion — jarring in the primary onboarding flow.  
**Fix:** Add `transition: width 280ms ease;` to `.activationBar span`.

**P1-3 · `prioritySide a` CTA uses hardcoded palette** (`dashboard.module.css:502`)  
`background: #222222; color: #ffffff` — neither is a token. `#222222` is not `#171416` (tinta-base). `#ffffff` is not `#fffaf3` (paper).  
**Fix:** Replace with `background: #171416; color: #fffaf3`.

**P1-4 · Radar loading state renders empty panel** (`page.js:909`)  
When `radarLoading` is true and `radarAcciones` is empty, the `.dailyRadarPanel` shell appears with an empty `.dailyRadarList` — the panel exists visually but contains nothing.  
**Fix:** Add loading text inside `.dailyRadarList` when `radarLoading && radarAcciones.length === 0`.

### P2 — Polish Pass

**P2-1 · No hover/focus on `cellarCommandGrid a`** (CSS)  
Four navigation tiles (Mapa estrella, Pedido inteligente, Catálogo, Constructor) have no hover or focus-visible state. They're visually static on an interactive panel.  
**Fix:** Add `:hover { background: rgba(216,200,152,0.14); }` and `:focus-visible { outline: 2px solid #d8c898; }`.

**P2-2 · `dailyRadarItem` article has no hover affordance** (CSS)  
Mixed interactive model (card with internal buttons) but outer card gives no hover signal.  
**Fix:** Add `transition: box-shadow 140ms ease;` and `:hover { box-shadow: 0 2px 12px rgba(23,20,22,0.08); }`.

**P2-3 · `radarError` has no retry or prefix** (`page.js:922`)  
Raw error string displayed without prefix text, dismiss action, or retry affordance.  
**Fix:** Add "Error al cargar el radar:" prefix and a retry button.

**P2-4 · `dailyRadarPanel` and `todayActions` use `#ffffff`** (CSS)  
Most cards use `#fffaf3` (warm cream). These two use pure white — breaks the temperature of the sand-background dashboard.  
**Fix:** Replace `background: #ffffff` with `#fffaf3` in both panels.

**P2-5 · Dead markup** (`page.js:906–908`)  
Two blank lines between the cellar command and radar sections. Cosmetic but lowers code hygiene.  
**Fix:** Remove blank lines.

**P2-6 · Eyebrow token drift between files**  
`dashboard.module.css` eyebrow: `#bfa984`, weight 750.  
`module.module.css` eyebrow: `#9b7430`, weight 850.  
One canonical value is needed.

**P2-7 · `h2` "Después de la prioridad"** (`page.js:967`)  
Redundant with eyebrow "Siguiente" in the same section. One label is enough.

---

## Detector — Notable Warnings

| File | Line | Pattern | Message |
|---|---|---|---|
| module.module.css | 649 | `side-tab` | `.closeStep::before` — 4px left-side stripe on step cards |
| module.module.css | 642 | `layout-transition` | `.closeProgressFill` — `transition: width` causes layout thrash |
| module.module.css | 2859 | `layout-transition` | `.activationPlanBar span` — `transition: width` causes layout thrash |

The `closeProgressFill` and `activationPlanBar` are both animated progress bars — both should use `transform: scaleX()` + `transform-origin: left center` rather than animating `width`.

---

## Positive Findings

- **Undo toast** (`page.js:982–991`): `role="status"`, `aria-live="polite"`, 4-second delay, `clearTimeout` on re-trigger — the best-executed feedback pattern on the page.
- **`activationWelcome` callout**: Measured gold-tint treatment (`rgba(216,200,152,0.1)` bg) — on-system, not loud.
- **`activationProgress strong`**: 26px percentage counter in gold — reward signal without noise.
- **`labelNavegacion` function**: Clean lookup table for nav copy — good separation from markup.
- **Responsive queries**: `@980px` collapses all multi-column grids correctly; `@640px` and `@480px` follow through.
- **`calidadGlobal` calculation**: Correctly weighted for both profiles (bodega vs. carta).
- **`Suspense` wrapper**: Correct pattern for `useSearchParams` in Next.js.

---

## Recommended Actions (Priority Order)

1. Fix loading state and Suspense fallback — `#f8f3eb` bg, inherit font, token colors. Remove `'#fff'` flash.
2. Remove `border-left: 5px solid #74223d` from `.priorityPanel` — one line deletion.
3. Fix payment gate palette — replace `#1a1a2e`, `#c9a96e` with on-system tokens.
4. Add transition to `.activationBar span` — one line CSS addition.
5. Fix `.prioritySide a` — swap `#222222/#ffffff` for `#171416/#fffaf3`.
6. Demote activation `h1` to `h2`.
7. Add radar loading state text.
