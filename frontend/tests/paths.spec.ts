import { expect, test, type Page } from '@playwright/test'
import type { Catalog } from '../src/lib/learningApi'

function initialCatalog(): Catalog {
  return {
    globalRank: 'UNRANKED', totalXP: 0,
    domains: [
      { id: 'web', slug: 'web', name: 'Développement web', description: 'Construis des applications.', rank: 'UNRANKED', blocks: [
        { id: 'frontend', slug: 'frontend', name: 'Front-end', description: 'Les interfaces.', skills: [
          { id: 'html', slug: 'html', name: 'HTML', description: 'Structure ta première page.', transversal: false, locked: false, rank: 'UNRANKED', xp: 0 },
          { id: 'css', slug: 'css', name: 'CSS', description: 'Mets en forme une page.', transversal: false, locked: true, rank: 'UNRANKED', xp: 0 },
        ] },
        { id: 'tooling', slug: 'tooling', name: 'Outils', description: 'Versionne ton travail.', skills: [
          { id: 'git', slug: 'git', name: 'Git', description: 'Ton premier commit.', transversal: true, locked: false, rank: 'UNRANKED', xp: 0 },
        ] },
      ] },
      { id: 'algo', slug: 'logic_algorithms', name: 'Logique & algorithmes', description: 'Résous des problèmes.', rank: 'UNRANKED', blocks: [
        { id: 'fundamentals', slug: 'fundamentals', name: 'Fondamentaux', description: 'Pars de zéro.', skills: [
          { id: 'c', slug: 'c', name: 'C', description: 'Compilation et premières fonctions.', transversal: false, locked: false, rank: 'UNRANKED', xp: 0 },
        ] },
      ] },
    ],
  }
}

async function mockCatalog(page: Page) {
  const catalog = initialCatalog()
  await page.route('**/api/v1/learning/catalog', route => route.fulfill({ json: catalog }))
  return catalog
}

test('choose a domain, start a skill, and restore its progression after reload', async ({ page }, testInfo) => {
  const catalog = await mockCatalog(page)
  let starts = 0
  await page.route('**/api/v1/learning/skills/html/start', async route => {
    starts++
    expect(route.request().method()).toBe('POST')
    catalog.domains[0].blocks[0].skills[0].rank = 'E'
    await route.fulfill({ json: { rank: 'E', xp: 0 } })
  })
  await page.goto('/parcours')
  await expect(page.getByRole('heading', { name: 'Choisis ton terrain.' })).toBeVisible()
  await page.getByRole('link', { name: /Développement web.*Explorer le domaine/ }).click()
  await page.getByRole('button', { name: 'Explorer HTML', exact: true }).click()
  await expect(page.getByRole('complementary', { name: 'Détails : HTML' })).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Détails : HTML' })).toBeFocused()
  await page.getByRole('button', { name: 'Commencer cette compétence' }).click()
  await expect(page.getByRole('status')).toHaveText('HTML a été ajouté à ton parcours.')
  await expect(page.getByRole('button', { name: 'Explorer HTML', exact: true })).toContainText('En cours')
  await page.reload()
  await expect(page.getByRole('complementary')).toContainText('Débutant absolu')
  await expect(page.getByRole('complementary')).toContainText('0 XP validés')
  await expect(page.getByRole('button', { name: 'Commencer cette compétence' })).toHaveCount(0)
  expect(starts).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('paths.png'), fullPage: true })
})

test('search, locked skills, and transversal Git navigation', async ({ page }) => {
  await mockCatalog(page)
  await page.goto('/parcours?domaine=web')
  const search = page.getByRole('searchbox', { name: 'Rechercher une compétence' })
  await search.fill('introuvable')
  await expect(page.getByRole('status')).toContainText('Aucune compétence')
  await search.fill('CSS')
  await page.getByRole('button', { name: 'Explorer CSS', exact: true }).click()
  await expect(page.getByRole('complementary')).toContainText('Valide les prérequis')
  await expect(page.getByRole('button', { name: 'Commencer cette compétence' })).toHaveCount(0)
  await page.goto('/parcours?domaine=logic_algorithms')
  await page.getByRole('link', { name: /Git t’accompagne/ }).click()
  await expect(page.getByRole('complementary', { name: 'Détails : Git' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Commencer cette compétence' })).toBeEnabled()
})

test('a failed start preserves the initial rank and can be retried', async ({ page }) => {
  await mockCatalog(page)
  await page.route('**/api/v1/learning/skills/html/start', route => route.fulfill({ status: 500, json: { error: { code: 'START_FAILED', message: 'Impossible de démarrer.' } } }))
  await page.goto('/parcours?domaine=web&competence=html')
  await page.getByRole('button', { name: 'Commencer cette compétence' }).click()
  await expect(page.getByRole('alert')).toContainText('Impossible de démarrer.')
  await expect(page.getByRole('complementary')).toContainText('Non classé')
  await page.route('**/api/v1/learning/skills/html/start', route => route.fulfill({ json: { rank: 'E', xp: 0 } }))
  await page.getByRole('button', { name: 'Commencer cette compétence' }).click()
  await expect(page.getByRole('status')).toContainText('ajouté à ton parcours')
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('session restoration returns to the requested skill after login', async ({ page }) => {
  let authenticated = false
  await page.route('**/api/v1/learning/catalog', route => authenticated ? route.fulfill({ json: initialCatalog() }) : route.fulfill({ status: 401 }))
  await page.route('**/api/v1/auth/login', route => {
    authenticated = true
    return route.fulfill({ json: { user: { id: 'player', username: 'Player', status: 'ACTIVE', createdAt: '2026-10-01T10:00:00Z' } } })
  })
  await page.goto('/parcours?domaine=web&competence=html')
  await expect(page).toHaveURL(/\/connexion$/)
  await page.getByLabel('Nom d’utilisateur', { exact: true }).fill('Player')
  await page.getByLabel('Mot de passe', { exact: true }).fill('a-safe-test-password')
  await page.getByRole('button', { name: 'Entrer dans le système' }).click()
  await expect(page).toHaveURL(/\/parcours\?domaine=web&competence=html$/)
  await expect(page.getByRole('complementary', { name: 'Détails : HTML' })).toBeVisible()
})

test('invalid catalogue is recoverable and missing domains have a way back', async ({ page }) => {
  await page.route('**/api/v1/learning/catalog', route => route.fulfill({ json: { domains: null } }))
  await page.goto('/parcours?domaine=inconnu')
  await expect(page.getByRole('alert')).toContainText('Impossible de charger')
  await mockCatalog(page)
  await page.getByRole('button', { name: 'Réessayer' }).click()
  await expect(page.getByRole('alert')).toHaveText('Ce domaine n’est pas disponible.')
  await page.getByRole('link', { name: 'Revenir aux domaines' }).click()
  await expect(page.getByRole('heading', { name: 'Choisis ton terrain.' })).toBeVisible()
})

test('an empty catalogue renders its preparation state', async ({ page }) => {
  await page.route('**/api/v1/learning/catalog', route => route.fulfill({ json: { globalRank: 'UNRANKED', totalXP: 0, domains: [] } }))
  await page.goto('/parcours')
  await expect(page.getByText('Les premiers parcours sont en préparation. Reviens bientôt.')).toBeVisible()
})
