const API_BASE_URL = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '')

type RequestOptions = {
  method: 'GET' | 'POST'
  expectedStatus: number
  payload?: unknown
  signal?: AbortSignal
  timeoutMs?: number
}

export class ApiError extends Error {
  code: string
  status: number

  constructor(code: string, message: string, status = 0) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export async function request(path: string, { method, expectedStatus, payload, signal, timeoutMs = 12_000 }: RequestOptions): Promise<unknown> {
  const timeout = AbortSignal.timeout(timeoutMs)
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    credentials: 'include',
    headers: payload !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: payload !== undefined ? JSON.stringify(payload) : undefined,
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
    throw new ApiError(
      typeof error?.code === 'string' ? error.code : 'REQUEST_FAILED',
      typeof error?.message === 'string' ? error.message : 'La requête a échoué.',
      response.status,
    )
  }
  const contentType = response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()
  if (response.status !== expectedStatus || contentType !== 'application/json') {
    throw new ApiError('INVALID_RESPONSE', 'Réponse du serveur invalide.', response.status)
  }
  return body
}
