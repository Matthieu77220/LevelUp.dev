import { ApiError, isRecord, request } from './api'

export { ApiError as AuthApiError } from './api'

type AuthPayload = {
  username: string
  password: string
  passwordConfirmation?: string
}

export type AuthResponse = {
  user: {
    id: string
    username: string
    status: string
    createdAt: string
  }
}

async function userRequest(endpoint: 'me' | 'login' | 'register', payload?: AuthPayload, signal?: AbortSignal): Promise<AuthResponse> {
  const body = await request(`/auth/${endpoint}`, {
    method: endpoint === 'me' ? 'GET' : 'POST',
    expectedStatus: endpoint === 'register' ? 201 : 200,
    payload,
    signal,
  })
  const user = isRecord(body) && isRecord(body.user) ? body.user : undefined
  if (!user || typeof user.id !== 'string' || !user.id || typeof user.username !== 'string' ||
    !/^[A-Za-z0-9_]{3,32}$/.test(user.username) || user.status !== 'ACTIVE' ||
    typeof user.createdAt !== 'string' || Number.isNaN(Date.parse(user.createdAt))) {
    throw new ApiError('INVALID_RESPONSE', 'Réponse du serveur invalide.')
  }
  return { user: { id: user.id, username: user.username, status: user.status, createdAt: user.createdAt } }
}

export function getMe(signal?: AbortSignal) {
  return userRequest('me', undefined, signal)
}

export async function logout(signal?: AbortSignal) {
  await request('/auth/logout', { method: 'POST', expectedStatus: 204, signal })
}

export function register(username: string, password: string, passwordConfirmation: string, signal?: AbortSignal) {
  return userRequest('register', { username, password, passwordConfirmation }, signal)
}

export function login(username: string, password: string, signal?: AbortSignal) {
  return userRequest('login', { username, password }, signal)
}
