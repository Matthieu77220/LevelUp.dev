import { ApiError, isRecord, request } from './api'
import { ranks, type Progress, type Rank } from './learningApi'

export type Exercise = {
  slug: string; title: string; instruction: string; rank: Rank; xp: number; position: number
  language: 'html' | 'css'; starter: string; markup?: string; fixtureCss?: string
  fullDocument: boolean; milestone: boolean; available: boolean; contributionPath: string
  allowed: { tags?: string[]; attributes?: string[]; properties?: string[]; atRules?: string[] }
}
export type ExerciseTrack = Progress & {
  slug: string; name: string; skillId: string; version: string; exercises: Exercise[]; completed: string[]
  promotions: { rank: Rank; completed: number; xp: number }[]
}
export type Evaluation = Progress & { passed: boolean; message: string; awardedXP: number }
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
const rank = (v: unknown): v is Rank => ranks.some(r => r === v)
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(s => typeof s === 'string')
function exercise(v: unknown): v is Exercise {
  return isRecord(v) && ['slug','title','instruction','starter','contributionPath'].every(k => typeof v[k] === 'string') &&
    rank(v.rank) && integer(v.xp) && integer(v.position) && (v.language === 'html' || v.language === 'css') &&
    typeof v.available === 'boolean' && typeof v.milestone === 'boolean' && typeof v.fullDocument === 'boolean' &&
    (v.markup === undefined || typeof v.markup === 'string') && (v.fixtureCss === undefined || typeof v.fixtureCss === 'string') &&
    isRecord(v.allowed) && Object.values(v.allowed).every(strings)
}
export async function getExerciseTrack(slug: string, signal?: AbortSignal): Promise<ExerciseTrack> {
  const v = await request(`/learning/tracks/${encodeURIComponent(slug)}`, { method: 'GET', expectedStatus: 200, signal })
  if (!isRecord(v) || !rank(v.rank) || !integer(v.xp) || !strings(v.completed) ||
    !['slug','name','skillId','version'].every(k => typeof v[k] === 'string') ||
    !Array.isArray(v.exercises) || !v.exercises.every(exercise) ||
    !Array.isArray(v.promotions) || !v.promotions.every(p => isRecord(p) && rank(p.rank) && integer(p.xp) && integer(p.completed))) {
    throw new ApiError('INVALID_RESPONSE', 'ResponseError: parcours invalide')
  }
  return v as ExerciseTrack
}
export async function submitExercise(track: string, slug: string, source: string, signal?: AbortSignal): Promise<Evaluation> {
  const v = await request(`/learning/tracks/${encodeURIComponent(track)}/exercises/${encodeURIComponent(slug)}/submit`, {
    method: 'POST', expectedStatus: 200, payload: { source }, signal, timeoutMs: 30_000,
  })
  if (!isRecord(v) || typeof v.passed !== 'boolean' || typeof v.message !== 'string' || !rank(v.rank) || !integer(v.xp) || !integer(v.awardedXP) ||
    (v.passed && v.message !== 'OK') || (!v.passed && v.awardedXP !== 0)) {
    throw new ApiError('INVALID_RESPONSE', 'ResponseError: résultat invalide')
  }
  return v as Evaluation
}
