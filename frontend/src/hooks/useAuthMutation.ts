import { useEffect, useRef, useState } from 'react'
import { AuthApiError } from '../lib/authApi'

// Keep submissions exclusive and prevent a departed page from navigating on completion.
export function useAuthMutation() {
  const current = useRef<AbortController | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => () => { current.current?.abort() }, [])

  async function submit(action: (signal: AbortSignal) => Promise<unknown>, failureMessage?: string) {
    if (current.current) return false
    const controller = new AbortController()
    current.current = controller
    setSubmitting(true)
    setError('')
    try {
      await action(controller.signal)
      return !controller.signal.aborted
    } catch (reason) {
      if (!controller.signal.aborted) {
        setError(failureMessage ?? (reason instanceof AuthApiError ? reason.message : 'L’API est momentanément indisponible.'))
      }
      return false
    } finally {
      if (!controller.signal.aborted) {
        current.current = null
        setSubmitting(false)
      }
    }
  }

  return { submit, submitting, error, clearError: () => setError('') }
}
