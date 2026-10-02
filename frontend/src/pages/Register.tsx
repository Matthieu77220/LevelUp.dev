import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Check, Eye, EyeOff, LockKeyhole, UserRound } from 'lucide-react'
import AuthShell from '../components/AuthShell'
import { register } from '../lib/authApi'
import { useAuthMutation } from '../hooks/useAuthMutation'

type RegisterErrors = { username?: string; password?: string; confirmation?: string }

function Register() {
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<RegisterErrors>({})
  const { submit, submitting, error, clearError } = useAuthMutation()

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return
    const form = event.currentTarget
    const data = new FormData(form)
    const username = String(data.get('username') ?? '').trim()
    const password = String(data.get('password') ?? '')
    const confirmation = String(data.get('confirmation') ?? '')
    const nextErrors: RegisterErrors = {}

    if (!/^[A-Za-z0-9_]{3,32}$/.test(username)) nextErrors.username = 'Utilise 3 à 32 lettres, chiffres ou underscores.'
    if ([...password].length < 12) nextErrors.password = 'Le mot de passe doit contenir au moins 12 caractères.'
    if (new TextEncoder().encode(password).length > 128) nextErrors.password = 'Le mot de passe ne peut pas dépasser 128 octets.'
    if (confirmation !== password) nextErrors.confirmation = 'Les mots de passe ne correspondent pas.'

    setErrors(nextErrors)
    clearError()
    if (Object.keys(nextErrors).length > 0) return

    if (await submit(signal => register(username, password, confirmation, signal))) {
      form.reset()
      navigate('/profil', { replace: true })
    }
  }

  return (
    <AuthShell
      eyebrow="INITIALISATION DU PROFIL"
      title="Inscription"
      description="Choisis ton identité dans le système. Aucune information personnelle n’est demandée."
      alternateText="Tu possèdes déjà un profil ?"
      alternateLabel="Se connecter"
      alternateTo="/connexion"
    >
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <div className="auth-field">
          <label htmlFor="register-username">Nom d’utilisateur</label>
          <div className={errors.username ? 'auth-input has-error' : 'auth-input'}>
            <UserRound size={18} />
            <input id="register-username" name="username" type="text" maxLength={32} autoComplete="username" placeholder="Choisis ton username" aria-invalid={Boolean(errors.username)} aria-describedby={errors.username ? 'register-username-error' : 'username-hint'} />
          </div>
          <small id="register-username-error">{errors.username}</small>
          {!errors.username && <small className="auth-hint" id="username-hint">3 à 32 caractères, sans espace.</small>}
        </div>

        <div className="auth-field">
          <label htmlFor="register-password">Mot de passe</label>
          <div className={errors.password ? 'auth-input has-error' : 'auth-input'}>
            <LockKeyhole size={18} />
            <input id="register-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Crée ton mot de passe" aria-invalid={Boolean(errors.password)} aria-describedby="register-password-error" />
            <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Masquer les mots de passe' : 'Afficher les mots de passe'} title={showPassword ? 'Masquer les mots de passe' : 'Afficher les mots de passe'}>
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <small id="register-password-error">{errors.password}</small>
        </div>

        <div className="auth-field">
          <label htmlFor="register-confirmation">Confirmation du mot de passe</label>
          <div className={errors.confirmation ? 'auth-input has-error' : 'auth-input'}>
            <Check size={18} />
            <input id="register-confirmation" name="confirmation" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Confirme ton mot de passe" aria-invalid={Boolean(errors.confirmation)} aria-describedby="register-confirmation-error" />
          </div>
          <small id="register-confirmation-error">{errors.confirmation}</small>
        </div>

        <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? 'Création…' : 'Créer mon profil'} {!submitting && <ArrowRight size={18} />}</button>
        {error && <p className="auth-status is-error" role="alert">{error}</p>}
      </form>
    </AuthShell>
  )
}

export default Register
