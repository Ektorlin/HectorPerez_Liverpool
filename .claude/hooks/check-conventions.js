#!/usr/bin/env node
/**
 * PostToolUse hook (Write|Edit) — enforces two repo conventions (see
 * CLAUDE.md and .claude/skills/codeceptjs-conventions/SKILL.md):
 *
 * 1. No fixed waits and no networkidle, in step_definitions/ and pages/.
 *    Liverpool's analytics keep the network busy forever, so networkidle
 *    never resolves, and a fixed wait is either flaky-short or wastefully
 *    long — wait on a direct consequence of the action instead.
 * 2. No CSS/testid selectors in step_definitions/. Steps only orchestrate;
 *    selectors belong in a Page Object's SELECTORES object so there's one
 *    place to fix when the DOM changes.
 *
 * Comment lines are skipped so code can document *why* a pattern is avoided.
 */
const fs = require('fs')

const REGLAS = [
  {
    carpetas: /\/(step_definitions|pages)\/.*\.js$/,
    // I.wait(n) / page.waitForTimeout(n) son esperas fijas; "networkidle"
    // cubre waitForLoadState('networkidle') y { waitUntil: 'networkidle' }.
    patron: /I\.wait\(|waitForTimeout\(|networkidle/,
    mensaje:
      `This repo forbids fixed waits (I.wait(n), page.waitForTimeout(n)) and networkidle ` +
      `(waitForLoadState or waitUntil) — Liverpool's analytics traffic keeps the network busy ` +
      `forever, so networkidle never resolves, and a fixed wait is either flaky or wastes time. ` +
      `Wait on a direct consequence of the action instead: page.locator(...).waitFor({ state: ` +
      `"visible" | "hidden" }), page.waitForURL(...), or poll the real value (see ` +
      `esperarCondicion in pages/CartPage.js).`,
  },
  {
    carpetas: /\/step_definitions\/.*\.js$/,
    patron:
      /data-testid|page\.locator\(|querySelector|getByRole\(|getByText\(|getByLabel\(|getByTestId\(|\[class|\[href|\[id=|\[aria-|\[data-/,
    mensaje:
      `This repo forbids CSS/testid selectors outside pages/ — steps only orchestrate. ` +
      `Move this selector into the relevant Page Object's SELECTORES object and call a ` +
      `method on it instead.`,
  },
]

const esComentario = (linea) => /^\s*(\/\/|\/\*|\*)/.test(linea)

let raw = ''
process.stdin.on('data', (chunk) => { raw += chunk })
process.stdin.on('end', () => {
  let input
  try {
    input = JSON.parse(raw)
  } catch {
    process.exit(0)
  }

  const file = input?.tool_input?.file_path || input?.tool_response?.filePath
  if (!file) process.exit(0)
  const ruta = file.replace(/\\/g, '/')
  const aplicables = REGLAS.filter((r) => r.carpetas.test(ruta))
  if (aplicables.length === 0 || !fs.existsSync(file)) process.exit(0)

  const lineas = fs.readFileSync(file, 'utf8').split('\n')
  const reportes = []

  for (const regla of aplicables) {
    const hallazgos = []
    lineas.forEach((linea, i) => {
      if (!esComentario(linea) && regla.patron.test(linea)) {
        hallazgos.push(`  ${i + 1}: ${linea.trim()}`)
      }
    })
    if (hallazgos.length > 0) reportes.push(`${hallazgos.join('\n')}\n\n${regla.mensaje}`)
  }

  if (reportes.length === 0) process.exit(0)

  const reason =
    `Convention violation in ${file}:\n${reportes.join('\n\n')}\n\n` +
    `See .claude/skills/codeceptjs-conventions/SKILL.md.`

  process.stdout.write(JSON.stringify({ decision: 'block', reason }))
  process.exit(0)
})
