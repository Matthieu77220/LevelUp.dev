import { createRequire } from 'node:module'
import { Parser } from 'parse5'
import postcss from 'postcss'
import { document } from './shared.mjs'

// Same browser version as the application's E2E tests, never a learner dependency.
const require = createRequire(new URL('../../frontend/package.json', import.meta.url))
const { chromium } = require('playwright')
export const launchBrowser = () => chromium.launch({
  channel: process.env.WEB_EVALUATOR_BROWSER || (process.platform === 'win32' ? 'msedge' : 'chromium'),
  chromiumSandbox: true,
  timeout: 15000,
})
const failure = message => ({ passed: false, message })
const csp = "default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; form-action 'none'; base-uri 'none'"

export function validateSource(exercise, source) {
  if (typeof source !== 'string' || Buffer.byteLength(source) > 65536) return 'InputError: source limitée à 64 Kio'
  if (exercise.language === 'html') {
    const errors = []
    const options = { onParseError: e => errors.push(e), sourceCodeLocationInfo: true, scriptingEnabled: false }
    const parser = exercise.fullDocument ? new Parser(options) : Parser.getFragmentParser(null, options)
    const startTag = parser.onStartTag.bind(parser)
    let tokenError
    // Check even start tags that HTML tree construction would silently discard.
    parser.onStartTag = token => {
      if (!exercise.allowed.tags.includes(token.tagName)) tokenError ??= `ConstraintError: balise <${token.tagName}> non autorisée`
      for (const attr of token.attrs) if (!exercise.allowed.attributes.includes(attr.name)) tokenError ??= `ConstraintError: attribut ${attr.name} non autorisé`
      startTag(token)
    }
    parser.tokenizer.write(source, true)
    if (tokenError) return tokenError
    const tree = exercise.fullDocument ? parser.document : parser.getFragment()
    if (errors.length) return `SyntaxError: ${errors[0].code} (${errors[0].startLine}:${errors[0].startCol})`
    let error, nodes = 0
    const ids = new Set(), anchors = []
    function visit(node) {
      if (error) return
      if (++nodes > 2000) { error = 'LimitError: trop de nœuds'; return }
      if (node.tagName) {
        if (!exercise.allowed.tags.includes(node.tagName)) { error = `ConstraintError: balise <${node.tagName}> non autorisée`; return }
        for (const attribute of node.attrs) {
          if (!exercise.allowed.attributes.includes(attribute.name) || attribute.namespace) { error = `ConstraintError: attribut ${attribute.name} non autorisé`; return }
          if (attribute.name === 'id') {
            if (!attribute.value || ids.has(attribute.value)) { error = 'ConstraintError: id vide ou dupliqué'; return }
            ids.add(attribute.value)
          }
          if (attribute.name === 'href' && attribute.value.startsWith('#') && attribute.value.length > 1) anchors.push(attribute.value.slice(1))
          if (['href','src','action','formaction','poster','cite'].includes(attribute.name) && /^\s*(?:javascript|data|file|vbscript):/i.test(attribute.value)) {
            error = 'ConstraintError: protocole non autorisé'; return
          }
        }
      }
      for (const child of node.childNodes ?? []) visit(child)
      if (node.content) visit(node.content)
    }
    visit(tree)
    if (error) return error
    if (anchors.some(id => !ids.has(id))) return 'AssertionError: ancre interne introuvable'
  } else {
    let root
    try { root = postcss.parse(source) } catch (error) { return `SyntaxError: CSS invalide (${error.line}:${error.column})` }
    let error, nodes = 0
    const atRules = new Set(), selectors = []
    root.walk(node => {
      if (++nodes > 2000) error ??= 'LimitError: trop de règles'
      if (node.type === 'decl') {
        if (!exercise.allowed.properties.includes(node.prop)) error ??= `ConstraintError: propriété ${node.prop} non autorisée`
        if (node.important) error ??= 'ConstraintError: !important non autorisé'
      }
      if (node.type === 'atrule') {
        atRules.add(node.name)
        if (!exercise.allowed.atRules.includes(node.name)) error ??= `ConstraintError: @${node.name} non autorisée`
      }
      if (node.type === 'rule') selectors.push(node.selector)
    })
    if (error) return error
    for (const name of exercise.requiredAtRules ?? []) if (!atRules.has(name)) return `ConstraintError: @${name} absente`
    for (const selector of exercise.requiredSelectors ?? []) if (!selectors.some(s => s.includes(selector))) return `ConstraintError: ${selector} absent`
  }
  return null
}

export async function evaluate(browser, exercise, source) {
  const error = validateSource(exercise, source)
  if (error) return failure(error)
  // Each submission gets a fresh context: no cookies, files, persistent storage or network.
  const context = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block', acceptDownloads: false, reducedMotion: 'no-preference' })
  await context.route('**/*', route => route.abort())
  try {
    const page = await context.newPage()
    page.setDefaultTimeout(1200)
    for (const test of exercise.scenarios) {
      await page.setViewportSize({ width: test.width ?? 1280, height: 900 })
      await page.emulateMedia({ media: test.media ?? 'screen', reducedMotion: test.reducedMotion ?? 'no-preference', forcedColors: test.forcedColors ?? 'none' })
      // Install CSP before parsing any submission; never insert learner CSS in markup.
      await page.setContent(`<!doctype html><meta http-equiv="Content-Security-Policy" content="${csp}">`)
      const markup = exercise.language === 'html' ? (exercise.fullDocument ? source : document(source)) : document(exercise.markup)
      await page.evaluate(markup => {
        const parsed = new DOMParser().parseFromString(markup, 'text/html')
        document.documentElement.lang = parsed.documentElement.lang
        document.documentElement.removeAttribute('dir')
        for (const child of Array.from(document.head.children)) if (child.tagName !== 'META' || !child.hasAttribute('http-equiv')) child.remove()
        document.head.append(...Array.from(parsed.head.childNodes))
        document.body.replaceChildren(...Array.from(parsed.body.childNodes))
        // Preserve the doctype of full submissions for document-level assertions.
        if (document.doctype) document.doctype.remove()
        if (parsed.doctype) document.insertBefore(document.implementation.createDocumentType(parsed.doctype.name, '', ''), document.documentElement)
      }, markup)
      if (exercise.language === 'css') {
        const declarations = []
        postcss.parse(source).walkDecls(decl => declarations.push([decl.prop, decl.value]))
        const invalid = await page.evaluate(declarations => declarations.find(([prop, value]) => !CSS.supports(prop, value)), declarations)
        if (invalid) return failure(`SyntaxError: valeur invalide pour ${invalid[0]}`)
        await page.evaluate(({ fixture, source }) => {
          for (const code of [fixture, source]) {
            const style = document.createElement('style')
            style.textContent = code
            document.head.append(style)
          }
        }, { fixture: 'html {font-size:16px} body {margin:0;color:black;background:white;font-family:Arial,sans-serif} ' + (exercise.fixtureCss ?? ''), source })
      }
      if (test.setup) await page.evaluate(test.setup)
      // Reset pointer/focus so preceding scenarios cannot influence the next one.
      await page.mouse.move(1279, 899)
      if (test.hover) await page.locator(test.hover).hover()
      if (test.keyboardFocus) await page.keyboard.press('Tab')
      if (test.focus) { await page.keyboard.press('Tab'); await page.locator(test.focus).focus() }
      if (test.settle) await page.waitForTimeout(test.settle)
      for (const assertion of test.checks) {
        const passed = await page.evaluate(assertion.expression).catch(() => false)
        if (passed !== true) return failure(assertion.error)
      }
    }
    return { passed: true, message: 'OK' }
  } finally {
    await context.close()
  }
}
