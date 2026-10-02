import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, LogOut, RotateCw } from 'lucide-react'
import AuthShell from '../components/AuthShell'
import { AuthApiError, getMe, logout, type AuthResponse } from '../lib/authApi'
import { useAuthMutation } from '../hooks/useAuthMutation'

export default function Profile() {
  const navigate = useNavigate()
  const [user, setUser] = useState<AuthResponse['user'] | null>(null)
  const [loadError, setLoadError] = useState('')
  const { submit, submitting, error: logoutError } = useAuthMutation()
  const [attempt, setAttempt] = useState(0)
  const error = loadError || logoutError

  useEffect(() => {
    const controller = new AbortController()
    getMe(controller.signal).then(({ user }) => {
      if (!controller.signal.aborted) setUser(user)
    }).catch((reason: unknown) => {
      if (controller.signal.aborted) return
      if (reason instanceof AuthApiError && reason.status === 401) {
        navigate('/connexion', { replace: true })
      } else {
        setLoadError('Impossible de charger ton profil. Réessaie dans un instant.')
      }
    })
    return () => { controller.abort() }
  }, [navigate, attempt])

  async function signOut() {
    if (await submit(logout, 'La déconnexion a échoué. Réessaie pour confirmer la fermeture de ta session.')) {
      navigate('/connexion', { replace: true })
    }
  }

  return (
    <AuthShell eyebrow="IDENTITÉ DU JOUEUR" title={user?.username ?? 'Mon profil'}
      description={user ? 'Session active' : loadError ? 'Profil indisponible' : 'Chargement du profil…'}
      alternateText="" alternateLabel="Retour à l’accueil" alternateTo="/">
      <div className="auth-form">
        {user && <p>Compte créé le {new Date(user.createdAt).toLocaleDateString('fr-FR')}.</p>}
        {user && <Link className="auth-submit" to="/parcours">Explorer mes parcours <ArrowRight size={18} /></Link>}
        {error && <p className="auth-status is-error" role="alert">{error}</p>}
        {!user && loadError && <button className="auth-submit" onClick={() => { setLoadError(''); setAttempt(value => value + 1) }}><RotateCw size={18} /> Réessayer</button>}
        {user && <button className="auth-submit" disabled={submitting} onClick={signOut}><LogOut size={18} /> {submitting ? 'Déconnexion…' : 'Se déconnecter'}</button>}
      </div>
    </AuthShell>
  )
}
