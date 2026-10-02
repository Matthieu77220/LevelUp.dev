import { ApiError, isRecord, request } from './api'

export const ranks = ['UNRANKED', 'E', 'D', 'C', 'B', 'A', 'S'] as const
export type Rank = typeof ranks[number]
export const rankLabels: Record<Rank, string> = {
  UNRANKED: 'Non classé', E: 'Débutant absolu', D: 'Bases acquises', C: 'Autonome',
  B: 'Avancé', A: 'Très avancé', S: 'Maîtrise',
}

export type Progress = { rank: Rank; xp: number }
export type Skill = Progress & {
  id: string; slug: string; name: string; description: string; transversal: boolean; locked: boolean
}
export type Block = { id: string; slug: string; name: string; description: string; skills: Skill[] }
export type Domain = { id: string; slug: string; name: string; description: string; rank: Rank; blocks: Block[] }
export type Catalog = { globalRank: Rank; totalXP: number; domains: Domain[] }

function isRank(value: unknown): value is Rank {
  return typeof value === 'string' && ranks.some(rank => rank === value)
}

function isXP(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isProgress(value: unknown): value is Progress {
  return isRecord(value) && isRank(value.rank) && isXP(value.xp)
}

function isEntity(value: unknown): value is { id: string; slug: string; name: string; description: string } & Record<string, unknown> {
  return isRecord(value) && typeof value.id === 'string' && value.id.length > 0 &&
    typeof value.slug === 'string' && typeof value.name === 'string' && typeof value.description === 'string'
}

function isSkill(value: unknown): value is Skill {
  return isEntity(value) && isProgress(value) && typeof value.transversal === 'boolean' && typeof value.locked === 'boolean'
}

function isBlock(value: unknown): value is Block {
  return isEntity(value) && Array.isArray(value.skills) && value.skills.every(isSkill)
}

function isDomain(value: unknown): value is Domain {
  return isEntity(value) && isRank(value.rank) && Array.isArray(value.blocks) && value.blocks.every(isBlock)
}

export async function getCatalog(signal?: AbortSignal): Promise<Catalog> {
  const body = await request('/learning/catalog', { method: 'GET', expectedStatus: 200, signal })
  if (!isRecord(body) || !isRank(body.globalRank) || !isXP(body.totalXP) || !Array.isArray(body.domains) || !body.domains.every(isDomain)) {
    throw new ApiError('INVALID_RESPONSE', 'Le catalogue reçu est invalide.')
  }
  return { globalRank: body.globalRank, totalXP: body.totalXP, domains: body.domains }
}

export async function startSkill(id: string, signal?: AbortSignal): Promise<Progress> {
  const body = await request(`/learning/skills/${encodeURIComponent(id)}/start`, { method: 'POST', expectedStatus: 200, signal })
  if (!isProgress(body) || body.rank === 'UNRANKED') {
    throw new ApiError('INVALID_RESPONSE', 'La progression reçue est invalide.')
  }
  return body
}
