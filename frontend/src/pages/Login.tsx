import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Eye, EyeOff, LockKeyhole, UserRound } from 'lucide-react'
import AuthShell from '../components/AuthShell'
import { login } from '../lib/authApi'
import { useAuthMutation } from '../hooks/useAuthMutation'
import { isRecord } from '../lib/api'

type LoginErrors = { username?: string; password?: string }

function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const state: unknown = location.state
  const destination = isRecord(state) && typeof state.from === 'string' &&
    (state.from === '/parcours' || state.from.startsWith('/parcours?')) ? state.from : '/profil'
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<LoginErrors>({})
  const { submit, submitting, error, clearError } = useAuthMutation()

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return
    const data = new FormData(event.currentTarget)
    const username = String(data.get('username') ?? '').trim()
    const password = String(data.get('password') ?? '')
    const nextErrors: LoginErrors = {}

    if (!username) nextErrors.username = 'Saisis ton nom d’utilisateur.'
    if (!password) nextErrors.password = 'Saisis ton mot de passe.'

    setErrors(nextErrors)
    clearError()
    if (Object.keys(nextErrors).length > 0) return

    if (await submit(signal => login(username, password, signal))) {
      navigate(destination, { replace: true })
    }
  }

  return (
    <AuthShell
      eyebrow="REPRENDS TA PROGRESSION"
      title="Connexion"
      description="Retrouve tes compétences, tes quêtes et ton prochain objectif."
      alternateText="Pas encore de profil ?"
      alternateLabel="Commencer l’ascension"
      alternateTo="/inscription"
    >
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <div className="auth-field">
          <label htmlFor="login-username">Nom d’utilisateur</label>
          <div className={errors.username ? 'auth-input has-error' : 'auth-input'}>
            <UserRound size={18} />
            <input id="login-username" name="username" type="text" maxLength={32} autoComplete="username" placeholder="Ton username" aria-invalid={Boolean(errors.username)} aria-describedby="login-username-error" />
          </div>
          <small id="login-username-error">{errors.username}</small>
        </div>

        <div className="auth-field">
          <label htmlFor="login-password">Mot de passe</label>
          <div className={errors.password ? 'auth-input has-error' : 'auth-input'}>
            <LockKeyhole size={18} />
            <input id="login-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Ton mot de passe" aria-invalid={Boolean(errors.password)} aria-describedby="login-password-error" />
            <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} title={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <small id="login-password-error">{errors.password}</small>
        </div>

        <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? 'Connexion…' : 'Entrer dans le système'} {!submitting && <ArrowRight size={18} />}</button>
        {error && <p className="auth-status is-error" role="alert">{error}</p>}
      </form>
    </AuthShell>
  )
}

export default Login
