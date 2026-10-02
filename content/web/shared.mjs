export const version = 'web-v1'

// Difficulté des exercices ; le rang acquis dépend aussi des épreuves validées.
export const stages = [
  { rank: 'E', nextRank: 'D', title: 'Premiers pas', xpRequired: 0, rewards: [20, 30, 40, 60] },
  { rank: 'D', nextRank: 'C', title: 'Fondamentaux', xpRequired: 150, rewards: [75, 100, 125, 150] },
  { rank: 'C', nextRank: 'B', title: 'Autonomie', xpRequired: 600, rewards: [180, 220, 260, 340] },
  { rank: 'B', nextRank: 'A', title: 'Cas complexes', xpRequired: 1600, rewards: [400, 500, 600, 800] },
  { rank: 'A', nextRank: null, title: 'Composition experte', xpRequired: 3900, rewards: [900, 1100, 1300, 1700] },
  { rank: 'S', nextRank: null, title: 'Épreuves de maîtrise', xpRequired: 8900, rewards: [1800, 2200, 2600, 3400] },
]

export const promotions = [
  { rank: 'E', completed: 0, xp: 0 }, { rank: 'D', completed: 4, xp: 150 },
  { rank: 'C', completed: 8, xp: 600 }, { rank: 'B', completed: 12, xp: 1600 },
  { rank: 'A', completed: 16, xp: 3900 }, { rank: 'S', completed: 24, xp: 18900 },
]
export const check = (error, expression) => ({ error: `AssertionError: ${error}`, expression })
export const count = (selector, n = 1) => check(`${selector}: nombre d’éléments incorrect`, `document.querySelectorAll(${JSON.stringify(selector)}).length === ${n}`)
export const text = (selector, value) => check(`${selector}: texte incorrect`, `document.querySelector(${JSON.stringify(selector)})?.textContent.trim() === ${JSON.stringify(value)}`)
export const style = (selector, property, value, pseudo = null) => check(`${selector}: ${property} incorrect`, `getComputedStyle(document.querySelector(${JSON.stringify(selector)}), ${JSON.stringify(pseudo)}).getPropertyValue(${JSON.stringify(property)}).trim() === ${JSON.stringify(value)}`)
export const scenario = (checks, options = {}) => ({ checks, ...options })
export function exercise(title, instruction, allowed, solution, checks, options = {}) {
  return { title, instruction, allowed, solution, scenarios: [scenario(checks)], starter: '', ...options }
}

export function document(body, { title = 'Atelier LevelUp', head = '', script = '', lang = 'fr' } = {}) {
  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  ${head}
</head>
<body>
${body}
${script}
</body>
</html>`
}

export function track(slug, entries) {
  if (entries.length !== 24) throw new Error(`${slug}: 24 exercices requis`)
  return {
    slug, name: slug.toUpperCase(), version, promotions,
    exercises: entries.map((entry, index) => {
      const stage = stages[Math.floor(index / 4)]
      return {
        ...entry, slug: `${slug}-${String(index + 1).padStart(2, '0')}`,
        rank: stage.rank, position: index + 1, xp: stage.rewards[index % 4],
        language: slug, contributionPath: `content/web/${slug}.mjs`,
        milestone: index % 4 === 3,
        prerequisites: index === 0 ? [] : [`${slug}-${String(index).padStart(2, '0')}`],
      }
    }),
  }
}

export function publicTrack(track) {
  return { ...track, exercises: track.exercises.map(({ solution, scenarios, mutations, ...entry }) => entry) }
}
