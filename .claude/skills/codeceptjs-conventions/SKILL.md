---
name: codeceptjs-conventions
description: Conventions for this repo's CodeceptJS 4 + Playwright + Gherkin E2E suite against liverpool.com.mx. Use this whenever writing or editing a .feature file, a step_definitions/*.js file, a pages/*.js Page Object, or a utils/*.js helper in this project — including adding a new scenario, a new step, a new selector, or a new assertion. Also consult it when a test is flaky, when deciding whether something needs a new wait, or when unsure whether a scenario should be tagged @pendiente. Covers the layered architecture, Page Object rules, waiting rules (no I.wait, no networkidle), the shared scenario context, tagging, and known live-site quirks.
---

# CodeceptJS conventions for HectorPerez_Liverpool

This is an E2E suite against a **live, third-party production site** (liverpool.com.mx) — there is no
app code to fix when something looks wrong, only tests to write correctly. That constraint is why the
rules below exist: they're what keeps tests from becoming flaky or from lying about what they checked.

Read `CLAUDE.md` first for commands and the full repo map. This skill goes one layer deeper: the
patterns to follow *while writing* a feature, step, or page object, with the reasoning behind each one
so you can extend them consistently rather than copy them blindly.

## The four layers, and where new code goes

```
features/*.feature  →  step_definitions/*.js  →  pages/*.js  →  utils/*.js
   (Gherkin, ES)          (glue only, regex)      (selectors +      (pure logic,
                                                     actions)         no browser)
```

Before writing anything, decide which layer it belongs to:

- **A new user-facing behavior to verify** → a `Scenario` in an existing `.feature` file (new files are
  rare; the four feature files map to the four tag families `@busqueda` `@filtros` `@detalle` `@carrito`).
- **A new Gherkin phrase with no matching step yet** → a regex handler in the matching
  `step_definitions/*_steps.js`, delegating to a Page Object method. **Search all four step files first**
  — steps are shared across features (e.g. "busca el producto", "abre el producto en la posición N" live
  in `busqueda_steps.js`/`detalle_steps.js` and get reused from `carrito.feature`'s Background). Don't
  redefine a step that already exists elsewhere with the same wording.
- **A new DOM interaction or a new selector** → a method on the relevant `pages/*.js` Page Object. If an
  existing Page Object already models this part of the site, add the method there — **don't create a
  parallel/variant Page Object** for a new capability on a page that already has one.
- **A new file-created-from-day-one step file** → must be added to `gherkin.steps` in `codecept.conf.js`,
  or CodeceptJS won't see its steps at all (silent — scenarios just report "undefined step").
- **Text/number parsing, sorting checks, range checks** → a pure function in `utils/*.js`, no `I`, no
  `page`, no `inject()`. See `utils/precio.js` for the shape to follow: plain functions, testable without
  a browser, one place to fix if Liverpool changes a format.

## Page Objects

- Exported as a **singleton instance**: `module.exports = new CartPage()`, never the class. Step files
  `require('../pages/XPage')` directly — there's no `include`/actor wiring for page objects.
- Every Page Object extends `BasePage`, which provides `abrir()` (navigation with retry on
  `ERR_ABORTED`-style transient errors only — not a general-purpose retry), `descartarModales()`
  (closes cookie/promo modals), `esperarElemento()`, and `esperarUrl()`. Reuse these instead of
  re-implementing navigation or modal-dismissal per page.
- `const { I } = inject()` at the top of the module, exactly as `SearchPage.js` / `CartPage.js` do.
- **Selectors live only in a Page Object's own `SELECTORES` object**, never in a step file and never
  inline in a `.feature`. If a step needs a CSS/testid selector, that's a sign the logic belongs in a
  Page Object method instead.
- Prefer `data-testid` over class-based selectors. `CartPage.js` has a documented cautionary example:
  a broad `[class*="cart-item" i]` selector matched carousel cards too and inflated cart counts, and
  `[class*="summary" i]` matched an SVG node and crashed `grabTextFromAll`. A selector that's "more
  general" is not more robust here — it's noisier. When `data-testid` values embed a UUID
  (`ml-card-product-mybag-<uuid>-...`), anchor on the stable prefix/suffix with `^=`/`$=`.
- Before writing a selector against the live site, use a `scripts/*.js` diagnostic
  (`node scripts/inspeccionar-filtro.js …`) to confirm what's actually in the DOM rather than guessing.

## Waiting — the rule that causes the most rework if skipped

**Never `I.wait(n)` and never wait on `networkidle`.** Liverpool's analytics/tracking scripts keep the
network busy indefinitely, so `networkidle` never resolves and a fixed `wait(n)` is either too short
(flaky) or wastes time on every run (and is still eventually too short). Instead, wait on a direct,
observable consequence of the action you just took:

- An element appearing/disappearing → `page.locator(...).waitFor({ state: 'visible' | 'hidden', timeout })`.
  Do **not** use `isVisible()`/`isEnabled()` to poll for something that may not be there yet — they're
  instant snapshots that ignore the `timeout` argument entirely and will read `false` mid-animation.
  `CartPage.confirmarSiHayModal()` has a worked example of this exact trap.
- A navigation → `page.waitForURL(pattern, { timeout })`, as in `BasePage.esperarUrl()` and
  `SearchPage.buscarProducto()`.
- A value that should change (quantity, subtotal, item count) → **poll the value itself** until it
  satisfies a condition, don't guess a delay. `utils/esperas.js` factors this into
  `esperarCondicion(leer, condicion, intentos)` (used by `CartPage` and `ResultsPage.obtenerPrecios()`): it re-reads with the real getter every ~500ms and
  returns the last value read (so a failed assertion shows *what it actually saw*, not a bare timeout).
  Reuse or mirror this helper for any new "wait for state X to become Y" need rather than inventing a
  fresh polling loop or, worse, a fixed wait.
- Two valid end states for one action (e.g. cart with items vs. empty-cart message) → race both waits
  with `Promise.race`, as `esperarBolsaCargada()` does, instead of asserting only the common case.

## Scenario context (`utils/contexto.js`)

A `Map`-based store for data that's read on one page and checked on another (e.g. product name/price
read on the PDP, then verified in the cart) — the alternative of one Page Object importing another, or
smuggling technical data through Gherkin parameters, is worse. `guardar(clave, valor)` /
`leer(clave)` / `limpiar()`.

**The state lives for the life of the Node process, not per scenario.** `limpiar()` is called from
`SearchPage.abrirHome()`, which is the first Background step of every feature. If you add a new feature
file or a new Background, it **must** also start with the step that calls `abrirHome()` (currently
"que el usuario se encuentra en la página principal de Liverpool") — otherwise a later scenario can
silently inherit stale data from an earlier one and pass or fail for the wrong reason.

## Tagging a new scenario

Every `Scenario` needs:
- Its feature tag on the `Feature:` line (`@busqueda` / `@filtros` / `@detalle` / `@carrito`).
- One or more `@TC-NNN` tags identifying the test case(s) it covers (a scenario can carry several,
  e.g. `@TC-029 @TC-030 @TC-031` when one flow verifies multiple cases at once).
- `@smoke` only if it belongs in the quick regression set (`npm run test:smoke`).
- `@pendiente` **only** when the scenario fails due to documented live-site behavior, not a framework
  bug. None are pending today: TC-018 and TC-007/008/009 were once tagged "site behavior" but were
  framework bugs (a missing apply button, a stale-grid read), so probe the live DOM with a `scripts/`
  diagnostic before blaming the site. Don't add `@pendiente` to dodge a real bug, and don't "fix" an existing `@pendiente` scenario by loosening
  its assertion — the site behavior is the thing that's wrong, not the check.

## Gotchas specific to testing a live production site

- **Sponsored/promoted products** ignore sort and filters — exclude them from PLP (listing page)
  assertions rather than treating their position as a failure.
- **Cart assertions check Subtotal, not Total.** `CartPage.obtenerSubtotal()` reads the subtotal block
  specifically because Total already has non-linear discounts applied, so it isn't a reliable function
  of quantity for a "does the recalculation work" check.
- **Prices never have a literal decimal point in the DOM text** — Liverpool renders cents inside a
  `<sup>`, so `"$1,86915"` means $1,869.15, not $1,869,150 or $186,915. Always go through
  `parsearPrecio`/`extraerPrecios` from `utils/precio.js`; never `parseFloat`/regex the price text
  yourself in a Page Object.
- **Checkout/payment/registration (TC-050–067) are out of scope** — never automate a flow against
  production that would place an order, submit payment, or create an account.
