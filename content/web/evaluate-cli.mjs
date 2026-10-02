import { exercises } from './catalog.mjs'
import { evaluate, launchBrowser } from './evaluator.mjs'

let browser, evaluationTimeout
const stop = async () => {
  if (browser) await browser.close().catch(() => {})
  process.exit(2)
}
// Browser bootstrap has its own budget; the exercise still gets at most 8 seconds.
const timeout = setTimeout(stop, 24000)
try {
  let input = ''
  for await (const chunk of process.stdin) {
    input += chunk
    if (Buffer.byteLength(input) > 100000) throw new Error('input too large')
  }
  const { slug, source } = JSON.parse(input)
  const exercise = exercises.find(exercise => exercise.slug === slug)
  if (!exercise) throw new Error('unknown exercise')
  browser = await launchBrowser()
  evaluationTimeout = setTimeout(stop, 8000)
  const result = await evaluate(browser, exercise, source)
  process.stdout.write(JSON.stringify(result))
} catch {
  process.exitCode = 1
} finally {
  if (browser) await browser.close()
  clearTimeout(timeout)
  clearTimeout(evaluationTimeout)
}
