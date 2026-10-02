import type { ReactNode } from 'react'
import { ArrowLeft, ShieldCheck, TerminalSquare } from 'lucide-react'
import { Link } from 'react-router-dom'
import heroImage from '../assets/levelup-hero.png'
import './AuthShell.css'

type AuthShellProps = {
  eyebrow: string
  title: string
  description: string
  alternateText: string
  alternateLabel: string
  alternateTo: string
  children: ReactNode
}

function AuthShell({ eyebrow, title, description, alternateText, alternateLabel, alternateTo, children }: AuthShellProps) {
  return (
    <main className="auth-page">
      <section className="auth-world" aria-label="LevelUp.dev">
        <img src={heroImage} alt="Une cité numérique dans les montagnes" />
        <div className="auth-world-shade" aria-hidden="true" />
        <Link className="auth-brand" to="/" aria-label="Retour à l'accueil">
          <span><TerminalSquare size={21} /></span>
          LEVELUP<strong>.DEV</strong>
        </Link>
        <div className="auth-world-copy">
          <p>LE SYSTÈME T’ATTEND</p>
          <h2>Chaque maîtrise<br />commence au rang E.</h2>
          <span><ShieldCheck size={16} /> Progression fondée sur tes compétences réelles</span>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-panel-inner">
          <Link className="auth-back" to="/"><ArrowLeft size={16} /> Retour à l’accueil</Link>
          <header className="auth-heading">
            <p>{eyebrow}</p>
            <h1>{title}</h1>
            <span>{description}</span>
          </header>
          {children}
          <p className="auth-alternate">{alternateText} <Link to={alternateTo}>{alternateLabel}</Link></p>
        </div>
      </section>
    </main>
  )
}

export default AuthShell
