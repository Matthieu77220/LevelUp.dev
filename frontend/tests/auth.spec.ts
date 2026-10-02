import { test, expect } from '@playwright/test'

const user = { id: 'test-id', username: 'Player_1234567890123456789012345', status: 'ACTIVE', createdAt: '2026-10-01T10:00:00Z' }

test('registration, reload, failed logout and successful logout', async ({ page }, testInfo) => {
  let authenticated = false
  let logoutFails = true
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.route('**/api/v1/auth/*', async route => {
    const endpoint = new URL(route.request().url()).pathname.split('/').pop()
    if (endpoint === 'register' || endpoint === 'login') {
      authenticated = true
      return route.fulfill({ json: { user }, status: endpoint === 'register' ? 201 : 200 })
    }
    if (endpoint === 'logout') {
      if (logoutFails) return route.fulfill({ status: 503, json: { error: { code: 'LOGOUT_FAILED', message: 'Retry' } } })
      authenticated = false
      return route.fulfill({ status: 204 })
    }
    return authenticated
      ? route.fulfill({ json: { user } })
      : route.fulfill({ status: 401, json: { error: { code: 'UNAUTHENTICATED' } } })
  })
  await page.goto('/profil')
  await expect(page).toHaveURL(/\/connexion$/)
  await page.goto('/inscription')
  await page.getByLabel('Nom d’utilisateur', { exact: true }).fill(user.username)
  await page.getByLabel('Mot de passe', { exact: true }).fill('a-safe-test-password')
  await page.getByLabel('Confirmation du mot de passe', { exact: true }).fill('different-password')
  await page.getByRole('button', { name: 'Créer mon profil' }).click()
  await expect(page.getByText('Les mots de passe ne correspondent pas.')).toBeVisible()
  await page.getByLabel('Confirmation du mot de passe', { exact: true }).fill('a-safe-test-password')
  await page.getByRole('button', { name: 'Créer mon profil' }).click()
  await expect(page).toHaveURL(/\/profil$/)
  await expect(page.getByRole('heading', { name: user.username })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: user.username })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('profile.png'), fullPage: true })
  await page.getByRole('button', { name: 'Se déconnecter' }).click()
  await expect(page.getByRole('alert')).toContainText('La déconnexion a échoué')
  await expect(page).toHaveURL(/\/profil$/)
  logoutFails = false
  await page.getByRole('button', { name: 'Se déconnecter' }).click()
  await expect(page).toHaveURL(/\/connexion$/)
  await page.screenshot({ path: testInfo.outputPath('login.png'), fullPage: true })
  await page.goto('/profil')
  await expect(page).toHaveURL(/\/connexion$/)
  expect(pageErrors).toEqual([])
})

test('landing artwork and navigation render without overflow', async ({ page }, testInfo) => {
  await page.goto('/')
  await expect(page.locator('.hero-art')).toBeVisible()
  await expect.poll(() => page.locator('.hero-art').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('landing.png'), fullPage: true })
  await page.getByRole('link', { name: 'Commencer l’ascension' }).click()
  await expect(page.getByRole('heading', { name: 'Inscription', exact: true })).toBeVisible()
})

test('successful HTTP response with invalid JSON payload is not accepted as a session', async ({ page }) => {
  await page.route('**/api/v1/auth/login', route => route.fulfill({ json: {} }))
  await page.goto('/connexion')
  await page.getByLabel('Nom d’utilisateur', { exact: true }).fill('Player')
  await page.getByLabel('Mot de passe', { exact: true }).fill('a-safe-test-password')
  await page.getByRole('button', { name: 'Entrer dans le système' }).click()
  await expect(page.getByRole('alert')).toHaveText('Réponse du serveur invalide.')
  await expect(page).toHaveURL(/\/connexion$/)
})

test('expired session redirects even when the response has no JSON body', async ({ page }) => {
  await page.route('**/api/v1/auth/me', route => route.fulfill({ status: 401 }))
  await page.goto('/profil')
  await expect(page).toHaveURL(/\/connexion$/)
})

for (const response of [
  { name: 'HTML fallback', status: 200, contentType: 'text/html', body: '<html>Application</html>' },
  { name: 'unexpected JSON success', status: 200, contentType: 'application/json', body: '{}' },
]) {
  test(`logout rejects ${response.name} and lets the user retry`, async ({ page }) => {
    await page.route('**/api/v1/auth/me', route => route.fulfill({ json: { user } }))
    await page.route('**/api/v1/auth/logout', route => route.fulfill(response))
    await page.goto('/profil')
    await page.getByRole('button', { name: 'Se déconnecter' }).click()
    await expect(page.getByRole('alert')).toContainText('La déconnexion a échoué')
    await expect(page).toHaveURL(/\/profil$/)
    await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeEnabled()
  })
}

test('invalid profile data is recoverable without rendering an invalid date', async ({ page }) => {
  await page.route('**/api/v1/auth/me', route => route.fulfill({ json: { user: { ...user, createdAt: 'invalid' } } }))
  await page.goto('/profil')
  await expect(page.getByRole('alert')).toContainText('Impossible de charger ton profil')
  await page.route('**/api/v1/auth/me', route => route.fulfill({ json: { user } }))
  await page.getByRole('button', { name: 'Réessayer' }).click()
  await expect(page.getByRole('heading', { name: user.username })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('leaving login cancels the pending request', async ({ page }) => {
  const requestStarted = page.waitForRequest('**/api/v1/auth/login')
  const requestAborted = page.waitForEvent('requestfailed', request => request.url().endsWith('/auth/login'))
  let finishRequest!: () => void
  const pending = new Promise<void>(resolve => { finishRequest = resolve })
  await page.route('**/api/v1/auth/login', async route => {
    await pending
    await route.fulfill({ json: { user } })
  })
  try {
    await page.goto('/connexion')
    await page.getByLabel('Nom d’utilisateur', { exact: true }).fill('Player')
    await page.getByLabel('Mot de passe', { exact: true }).fill('a-safe-test-password')
    await page.getByRole('button', { name: 'Entrer dans le système' }).click()
    await requestStarted
    await page.getByRole('link', { name: 'Commencer l’ascension', exact: true }).click()
    await expect(page).toHaveURL(/\/inscription$/)
    await requestAborted
  } finally {
    finishRequest()
  }
})
