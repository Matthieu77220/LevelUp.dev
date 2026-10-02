import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { tracks, exercises } from './catalog.mjs'
import { evaluate, launchBrowser, validateSource } from './evaluator.mjs'
import { publicTrack, promotions } from './shared.mjs'

let browser
before(async () => { browser = await launchBrowser() })
after(async () => { await browser?.close() })

test('catalog: 48 exercises, progression to S and no solutions in public projection', () => {
  assert.equal(exercises.length,48)
  for (const track of tracks) {
    assert.equal(track.exercises.reduce((xp,e)=>xp+e.xp,0),18900)
    for (const rank of ['E','D','C','B','A','S']) assert.equal(track.exercises.filter(e=>e.rank===rank).length,4)
    assert.equal(track.exercises.filter(e=>e.rank==='S').length,4)
    for (const e of publicTrack(track).exercises) {
      assert.equal(e.solution,undefined); assert.equal(e.scenarios,undefined)
    }
    for (const p of promotions) assert.equal(track.exercises.slice(0,p.completed).reduce((xp,e)=>xp+e.xp,0),p.xp)
  }
})
for (const exercise of exercises) {
  test(`${exercise.slug}: reference accepted, empty submission rejected`, { timeout: 15000 }, async () => {
    assert.deepEqual(await evaluate(browser,exercise,exercise.solution), {passed:true,message:'OK'})
    assert.equal((await evaluate(browser,exercise,'')).passed,false)
  })
}
test('alternative valid code is accepted, restrictions apply inside templates and CSS layers', async () => {
  assert.equal((await evaluate(browser,exercises[0],'<p> Hello World </p>')).passed,true)
  const template=exercises.find(e=>e.slug==='html-19')
  assert.match(validateSource(template,'<template><script>alert(1)</script></template>'),/balise/)
  assert.match(validateSource(exercises[0],'<p onclick="alert(1)">Hello World</p>'),/attribut/)
  assert.match(validateSource(exercises[0],'<html><p>Hello World</p></html>'),/balise/)
  assert.match(validateSource(exercises.find(e=>e.slug==='css-15'),'@layer components { button { position:fixed } }'),/propriété/)
  assert.match(validateSource(exercises.find(e=>e.slug==='css-15'),'@import "https://example.test";'),/@import/)
  assert.match(validateSource(exercises[0],'x'.repeat(65537)),/64 Kio/)
  assert.equal((await evaluate(browser,exercises[0],'Autre texte<p>Hello World</p>')).passed,false)
  assert.match((await evaluate(browser,exercises.find(e=>e.slug==='css-01'),'p{color:not-a-color;color:red}')).message,/SyntaxError/)
})
test('advanced counterexamples: missing table axis, leaked field, motion and container regressions', async () => {
  for (const [slug, mutate] of [
    ['html-21',s=>s.replace('north north-a year q1','north north-a q1')],
    ['html-22',s=>s.replace('<fieldset disabled>','<fieldset>')],
    ['html-24',s=>s.replace('form="inscrire"','form="absent"')],
    ['css-14',s=>s.replace('@container','@media')],
    ['css-16',s=>s.replace('(prefers-reduced-motion:reduce)','(prefers-reduced-motion:no-preference)')],
    ['css-21',s=>s.replace('grid-template-rows: subgrid','grid-template-rows: auto auto auto')],
    ['css-24',s=>s.replace('transition: none','transition: transform 200ms')],
  ]) {
    const e=exercises.find(e=>e.slug===slug)
    assert.equal((await evaluate(browser,e,mutate(e.solution))).passed,false,slug)
  }
})
