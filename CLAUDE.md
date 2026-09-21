# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

E2E test framework for **liverpool.com.mx** (a live third-party production site): CodeceptJS 4 + Playwright (chromium) + Gherkin + Allure. There is no application code — only tests. The project's docs, comments, Gherkin and identifiers are in Spanish; match that. `README.md` has the full rationale, scenario matrix and known limitations.

## Commands

Setup: `npm ci && npx playwright install chromium && cp secreto.env.example secreto.env` (`BASE_URL` is required; `codecept.conf.js` throws if it is missing, and `utils/config.js` does the same).

```bash
npm test                     # stable suite: excludes @pendiente; `pretest` wipes ./output and ./allure-report
npm run test:todo            # everything, including @pendiente
npm run test:dry             # no browser; checks every Gherkin step has a definition
npm run test:smoke           # also test:busqueda / test:filtros / test:detalle / test:carrito (by tag)
npx codeceptjs run --steps --grep "@TC-017"   # single scenario by test-case tag
npm run report               # allure generate + serve on :8080 (python http.server, because WSL2 can't reach `allure open`)
```

Env switches read by `codecept.conf.js`:
- `HEADLESS=true` — headless (default is a visible browser, `show: true`).
- `EVIDENCIA=false` — disables video + trace recording for faster local runs.

CI (`.github/workflows/ci.yml`) runs on every push with `HEADLESS=true`, excludes `@pendiente`, and publishes the Allure report (with history) to GitHub Pages. There is no linter or unit-test runner.

## Architecture

Layered flow: `features/*.feature` (Gherkin) → `step_definitions/*.js` (glue only) → `pages/*.js` (selectors + actions) → `utils/` (pure logic and support).

- Feature files and step files are **registered explicitly** in `codecept.conf.js` (`gherkin.steps`). A new `step_definitions/*.js` file must be added there or its steps are invisible.
- Page Objects are exported as **singleton instances** (`module.exports = new CartPage()`) and use `const { I } = inject()`. Steps `require` them directly, not through `include`. `steps_file.js` is an empty custom actor.
- Steps are shared across features: Backgrounds reuse steps from `busqueda_steps.js`/`detalle_steps.js` (e.g. "busca el producto", "abre el producto en la posición N"). Check for an existing step before defining one; don't duplicate.
- Steps use regex (`/^…$/`) matchers.

Repo rules (from the README, keep them):
1. **No CSS selector outside `pages/`.** Steps only orchestrate.
2. **Extend an existing Page Object rather than creating a variant** for a new capability.
3. **Pure logic stays browser-free** — price parsing lives in `utils/precio.js`, used by every page that reads prices.

Cross-cutting pieces that span several files:
- `utils/precio.js`: Liverpool renders cents inside a `<sup>`, so node text has no decimal point (`"$1,86915"` = $1,869.15). Always parse prices through `parsearPrecio`; never `parseFloat` the text.
- `utils/contexto.js`: Map-based scenario context (e.g. name/price read on the PDP, verified in the cart). Cleared in `SearchPage.abrirHome()`, which every Background calls first — a new Background must also start with that step or state leaks between scenarios.
- `pages/BasePage.js`: `abrir()` retries navigation only on `ERR_ABORTED`-style errors (the `retryFailedStep` plugin deliberately skips `amOnPage`); `descartarModales()` closes cookie/promo modals from a private selector list.
- `utils/playwrightVideoAllure_helper.js` (helper `AllureEvidencia`): attaches Playwright video/trace to Allure in `_after()`, because the `.webm` only exists after the context closes. It must stay declared **after** `Playwright` in `codecept.conf.js` helpers (hooks run in declaration order).

## Waiting conventions

No `I.wait(n)` and no `waitForLoadState('networkidle')` (Liverpool's analytics keep the network busy forever). Wait for a direct consequence of the action: `waitFor({ state: 'visible' })`, `page.waitForURL`, or re-read a value until it changes (`esperarCondicion` in `CartPage`). Playwright's `isVisible()`/`isEnabled()` are instant snapshots that ignore `timeout` — use `waitFor(...).then(() => true).catch(() => false)` to probe for something that may appear.

## Tests against a live site

- Sponsored products are excluded from PLP assertions (they ignore sort/filters).
- Scenarios tagged `@pendiente` (TC-018 descending sort, TC-007/008/009 price-range filter) fail because of site behavior, not framework bugs; they are excluded from `npm test` and CI. Don't "fix" them by loosening assertions.
- Checkout/payment/registration (TC-050–067) are deliberately out of scope — do not automate them against production.
- Cart assertions check **Subtotal**, not Total (Total already includes non-linear discounts).
- Tag every scenario with its feature tag (`@busqueda`, `@filtros`, `@detalle`, `@carrito`) and `@TC-NNN` ids; `@smoke` marks the quick regression set.

## Scripts

`scripts/*.js` are standalone Playwright diagnostics (not part of the suite) for inspecting the live DOM before writing selectors, e.g. `node scripts/inspeccionar-filtro.js mochila 500 2000`. `diagnostico-headless.js` writes `headless.png`/`headless.html` into the cwd.

## Gotchas

- `secreto.env` (git-ignored) holds `BASE_URL` and `TIMEOUT` (seconds, default 15, read by `utils/config.js`); only `secreto.env.example` is committed. The error message in `utils/config.js` mentions `secreto_env.example` — the real filename is `secreto.env.example`.
- `test-results/` is a tracked leftover from an unrelated Playwright project (playlist test); ignore it.
- `output/` and `allure-report/` are generated and git-ignored.
