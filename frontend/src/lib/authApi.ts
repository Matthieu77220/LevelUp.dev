const API_BASE_URL = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '')

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

type RequestOptions = {
  method: 'GET' | 'POST'
  expectedStatus: number
  payload?: AuthPayload
  signal?: AbortSignal
}

export class AuthApiError extends Error {
  code: string
  status: number

  constructor(code: string, message: string, status = 0) {
    super(message)
    this.name = 'AuthApiError'
    this.code = code
    this.status = status
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

async function request(endpoint: string, { method, expectedStatus, payload, signal }: RequestOptions): Promise<unknown> {
  const timeout = AbortSignal.timeout(12_000)
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout
  const response = await fetch(`${API_BASE_URL}/auth/${endpoint}`, {
    method,
    credentials: 'include',
    headers: payload ? { 'Content-Type': 'application/json' } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
    signal: requestSignal,
  })

  if (response.status === expectedStatus && expectedStatus === 204) return undefined
  const body: unknown = await response.json().catch((reason: unknown) => {
    requestSignal.throwIfAborted()
    if (reason instanceof SyntaxError) return null
    throw reason
  })
  if (!response.ok) {
    const error = isRecord(body) && isRecord(body.error) ? body.error : undefined
    throw new AuthApiError(
      typeof error?.code === 'string' ? error.code : 'REQUEST_FAILED',
      typeof error?.message === 'string' ? error.message : 'La requête a échoué.',
      response.status,
    )
  }
  const contentType = response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()
  if (response.status !== expectedStatus || contentType !== 'application/json') {
    throw new AuthApiError('INVALID_RESPONSE', 'Réponse du serveur invalide.', response.status)
  }
  return body
}

async function userRequest(endpoint: 'me' | 'login' | 'register', payload?: AuthPayload, signal?: AbortSignal): Promise<AuthResponse> {
  const body = await request(endpoint, {
    method: endpoint === 'me' ? 'GET' : 'POST',
    expectedStatus: endpoint === 'register' ? 201 : 200,
    payload,
    signal,
  })
  const user = isRecord(body) && isRecord(body.user) ? body.user : undefined
  if (!user || typeof user.id !== 'string' || !user.id || typeof user.username !== 'string' ||
    !/^[A-Za-z0-9_]{3,32}$/.test(user.username) || user.status !== 'ACTIVE' ||
    typeof user.createdAt !== 'string' || Number.isNaN(Date.parse(user.createdAt))) {
    throw new AuthApiError('INVALID_RESPONSE', 'Réponse du serveur invalide.')
  }
  return { user: { id: user.id, username: user.username, status: user.status, createdAt: user.createdAt } }
}

export function getMe(signal?: AbortSignal) {
  return userRequest('me', undefined, signal)
}

export async function logout(signal?: AbortSignal) {
  await request('logout', { method: 'POST', expectedStatus: 204, signal })
}

export function register(username: string, password: string, passwordConfirmation: string, signal?: AbortSignal) {
  return userRequest('register', { username, password, passwordConfirmation }, signal)
}

export function login(username: string, password: string, signal?: AbortSignal) {
  return userRequest('login', { username, password }, signal)
}
