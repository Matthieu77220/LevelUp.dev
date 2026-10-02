import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import type { ExerciseTrack } from '../src/lib/exerciseApi'

const definitions = JSON.parse(readFileSync(new URL('../../backend/internal/learning/web_catalog.json', import.meta.url),'utf8')) as ExerciseTrack[]
async function mockTrack(page: Page, slug = 'html', completed = 0) {
  const track = structuredClone(definitions.find(t => t.slug === slug)!)
  track.skillId=slug;track.rank=completed>=16?'A':'E'
  track.xp=track.exercises.slice(0,completed).reduce((n,e)=>n+e.xp,0)
  track.completed=track.exercises.slice(0,completed).map(e=>e.slug)
  track.exercises=track.exercises.map((e,i)=>({...e,fullDocument:e.fullDocument??false,available:i<=completed}))
  await page.route(`**/api/v1/learning/tracks/${slug}`,route=>route.fulfill({json:track}))
  return track
}

test('instruction, allowlist, terse console, XP and no automatic rank jump',async({page},testInfo)=>{
  const track=await mockTrack(page)
  await page.route('**/exercises/html-01/submit',async route=>{
    const {source}=route.request().postDataJSON() as {source:string}
    const passed=source==='<p>Hello World</p>'
    if(passed){track.completed=['html-01'];track.xp=20;track.exercises[1].available=true}
    await route.fulfill({json:{passed,message:passed?'OK':'AssertionError: p: texte incorrect',rank:'E',xp:track.xp,awardedXP:passed?20:0}})
  })
  await page.goto('/parcours/html')
  await expect(page.getByRole('heading',{name:'Balises autorisées'})).toBeVisible()
  await expect(page.getByLabel('Éléments autorisés')).toContainText('<p>')
  await page.getByLabel('index.html',{exact:true}).fill('<p>Bonjour</p>')
  await page.getByRole('button',{name:'Tester',exact:true}).click()
  await expect(page.getByRole('status')).toHaveText('AssertionError: p: texte incorrect')
  await page.getByLabel('index.html',{exact:true}).fill('<p>Hello World</p>')
  await page.getByRole('button',{name:'Tester',exact:true}).click()
  await expect(page.getByRole('status')).toHaveText('OK')
  await expect(page.getByLabel('Console', {exact:true})).toContainText('+20 XP')
  await expect(page.locator('.exercise-progress')).toContainText('Rang E')
  await page.getByRole('button',{name:'Suivant',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Titre et introduction',exact:true})).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button',{name:'Tester',exact:true})).toBeEnabled()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:testInfo.outputPath('exercise.png'),fullPage:true})
})

test('S statements remain visible but submissions stay locked; CSS fixture is read-only',async({page})=>{
  await mockTrack(page,'css')
  await page.goto('/parcours/css?exercice=css-24')
  await expect(page.getByRole('heading',{name:'S · Interface sous contraintes',exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'Tester',exact:true})).toBeDisabled()
  await expect(page.getByRole('heading',{name:'Propriétés CSS autorisées'})).toBeVisible()
  await page.getByText('HTML fourni · lecture seule',{exact:true}).click()
  await expect(page.locator('.exercise-fixture pre').first()).toContainText('class="shell"')
  await expect(page.getByRole('link',{name:/pull request/})).toHaveAttribute('href',/content\/web\/css.mjs$/)
})

test('the last S challenge awards mastery and replay remains available',async({page})=>{
  await mockTrack(page,'html',23)
  await page.route('**/exercises/html-24/submit',route=>route.fulfill({json:{passed:true,message:'OK',rank:'S',xp:18900,awardedXP:3400}}))
  await page.goto('/parcours/html?exercice=html-24')
  await page.getByRole('button',{name:'Tester',exact:true}).click()
  await expect(page.getByRole('status')).toHaveText('OK')
  await expect(page.locator('.exercise-progress')).toContainText('Rang S')
  await expect(page.locator('.exercise-progress')).toContainText('24/24')
})

test('network failure grants no XP and preserves source; preview blocks script execution',async({page})=>{
  await mockTrack(page)
  await page.route('**/exercises/html-01/submit',route=>route.fulfill({status:503,json:{error:{code:'EVALUATOR_UNAVAILABLE',message:'EvaluationError: correcteur indisponible, réessaie'}}}))
  await page.goto('/parcours/html')
  await page.getByLabel('index.html',{exact:true}).fill('<p>Hello World</p><script>parent.document.title="HACKED"</script>')
  await page.getByRole('button',{name:'Aperçu',exact:true}).click()
  await expect(page.getByTitle('Aperçu du code')).toHaveAttribute('sandbox','')
  expect(await page.title()).not.toBe('HACKED')
  await page.getByRole('button',{name:'Tester',exact:true}).click()
  await expect(page.getByRole('status')).toHaveText('EvaluationError: correcteur indisponible, réessaie')
  await expect(page.getByLabel('index.html',{exact:true})).toHaveValue(/Hello World/)
  await expect(page.locator('.exercise-progress')).toContainText('0 XP')
})

test('expired session returns to the requested exercise',async({page})=>{
  await page.route('**/api/v1/learning/tracks/html',route=>route.fulfill({status:401}))
  await page.goto('/parcours/html?exercice=html-07')
  await expect(page).toHaveURL(/\/connexion$/)
})
