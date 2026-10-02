import { useState, type ComponentType } from 'react'
import {
  ArrowRight, Binary, BookOpen, Boxes, Braces, Check, ChevronRight, Code2,
  Crown, Database, GitBranch, Hexagon, Menu, Network, Play, ShieldCheck,
  Sparkles, Swords, TerminalSquare, Trophy, UserRound, X, Zap,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import heroImage from '../assets/levelup-hero.png'
import './Landing.css'

type Icon = ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean }>

const tracks: Array<{ icon: Icon; index: string; title: string; description: string; color: string; skills: string[] }> = [
  { icon: Code2, index: '01', title: 'Web engineering', description: 'Construis des interfaces solides, des API fiables et des produits complets.', color: 'cyan', skills: ['TypeScript', 'React', 'Go'] },
  { icon: Binary, index: '02', title: 'Logique & algorithmes', description: 'Apprends à raisonner sur la mémoire, les structures et la complexité.', color: 'violet', skills: ['C', 'C++', 'Algorithmes'] },
  { icon: GitBranch, index: '03', title: 'Git & collaboration', description: 'Travaille comme en équipe avec branches, revues et livraisons propres.', color: 'amber', skills: ['Git', 'Review', 'Workflow'] },
  { icon: Swords, index: '04', title: 'Projets & boss', description: 'Affronte des épreuves qui réunissent toutes tes compétences techniques.', color: 'rose', skills: ['Solo', 'Coop', 'Boss'] },
]

const steps = [
  { icon: BookOpen, number: '01', title: 'Apprends', text: 'Des notions courtes, ciblées et directement utiles.' },
  { icon: TerminalSquare, number: '02', title: 'Code', text: 'Résous des exercices dans un environnement contrôlé.' },
  { icon: ShieldCheck, number: '03', title: 'Valide', text: 'Passe les tests visibles, cachés et les contraintes.' },
  { icon: Boxes, number: '04', title: 'Construis', text: 'Assemble tes acquis dans des projets concrets.' },
  { icon: Crown, number: '05', title: 'Conquiers', text: 'Débloque les boss et impose ta maîtrise.' },
]

const skills = [
  { name: 'Logique', value: 84, icon: Network },
  { name: 'Git', value: 62, icon: GitBranch },
  { name: 'Front-end', value: 74, icon: Braces },
  { name: 'Base de données', value: 48, icon: Database },
]

function Brand() {
  return (
    <a className="brand" href="#top" aria-label="LevelUp.dev, accueil">
      <span className="brand-mark"><TerminalSquare size={22} strokeWidth={1.8} /></span>
      <span>LEVELUP<span className="brand-dot">.DEV</span></span>
    </a>
  )
}

function Landing() {
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)

  return (
    <div className="site-shell" id="top">
      <header className="topbar">
        <Brand />
        <button className="menu-toggle" type="button" aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        <nav className={menuOpen ? 'nav-links is-open' : 'nav-links'} aria-label="Navigation principale">
          <a href="#parcours" onClick={closeMenu}>Parcours</a>
          <a href="#progression" onClick={closeMenu}>Progression</a>
          <a href="#interface" onClick={closeMenu}>Interface</a>
          <a href="#boss" onClick={closeMenu}>Boss</a>
          <Link className="nav-session" to="/profil" onClick={closeMenu}>Mon profil</Link>
        </nav>
        <div className="nav-actions">
          <Link className="icon-button" to="/profil" aria-label="Mon profil" title="Mon profil"><UserRound size={19} /></Link>
          <Link className="button button-small" to="/inscription">Commencer <ArrowRight size={16} /></Link>
        </div>
      </header>

      <main>
        <section className="hero" aria-labelledby="hero-title">
          <img className="hero-art" src={heroImage} alt="Une cité numérique dominant les montagnes, observée depuis un poste de développeur" />
          <div className="hero-shade" aria-hidden="true" />
          <div className="hero-content">
            <div className="eyebrow"><span /> APPRENDS. CODE. PROGRESSE.</div>
            <h1 id="hero-title">LEVELUP<span>.DEV</span></h1>
            <p className="hero-lead">Transforme chaque ligne de code en expérience. Maîtrise les compétences, monte de rang et affronte des projets qui prouvent ton niveau.</p>
            <div className="hero-actions">
              <Link className="button button-primary" to="/inscription">Commencer l’ascension <ArrowRight size={18} /></Link>
              <a className="button button-ghost" href="#parcours"><Play size={17} fill="currentColor" /> Explorer le système</a>
            </div>
            <dl className="hero-stats">
              <div><dt>2</dt><dd>Domaines majeurs</dd></div>
              <div><dt>7</dt><dd>Rangs à franchir</dd></div>
              <div><dt>∞</dt><dd>Défis à relever</dd></div>
            </dl>
          </div>
          <div className="rank-signal" aria-label="Objectif de progression">
            <span className="rank-label">OBJECTIF ACTUEL</span>
            <div className="rank-row">
              <span className="rank-emblem"><Hexagon size={34} /></span>
              <div><strong>Rang E</strong><small>Initiation</small></div>
              <span className="rank-xp">120 / 500 XP</span>
            </div>
            <div className="progress-track"><span style={{ width: '24%' }} /></div>
            <p><Zap size={14} /> Prochaine quête : découvrir Git</p>
          </div>
          <a className="scroll-cue" href="#parcours"><span>Découvrir</span><ChevronRight size={16} /></a>
        </section>

        <section className="section tracks-section" id="parcours">
          <div className="section-heading">
            <div><p className="eyebrow"><span /> CHOISIS TON TERRAIN</p><h2>Forge un profil qui tient<br />face au réel.</h2></div>
            <p>Pas de progression artificielle. Chaque rang se gagne en pratiquant, en construisant et en validant des compétences mesurables.</p>
          </div>
          <div className="track-grid">
            {tracks.map(({ icon: TrackIcon, ...track }) => (
              <article className={`track-card ${track.color}`} key={track.title}>
                <div className="track-top"><span className="track-icon"><TrackIcon size={25} strokeWidth={1.7} /></span><span className="track-index">{track.index}</span></div>
                <h3>{track.title}</h3><p>{track.description}</p>
                <div className="skill-tags">{track.skills.map((skill) => <span key={skill}>{skill}</span>)}</div>
                <a className="circle-link" href="#progression" aria-label={`Voir la progression : ${track.title}`}><ArrowRight size={18} /></a>
              </article>
            ))}
          </div>
        </section>

        <section className="section path-section" id="progression">
          <div className="path-intro">
            <p className="eyebrow"><span /> UN SYSTÈME, PAS UN RACCOURCI</p>
            <h2>Ta progression laisse des traces.</h2>
            <p>Les rangs ne récompensent pas le temps passé. Ils attestent ce que tu sais réellement comprendre, écrire et livrer.</p>
          </div>
          <div className="path-line" aria-label="Les cinq étapes de progression">
            {steps.map(({ icon: StepIcon, number, title, text }) => (
              <article className="path-step" key={number}>
                <span className="step-node"><StepIcon size={23} /></span><span className="step-number">{number}</span><h3>{title}</h3><p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section interface-section" id="interface">
          <div className="section-heading compact">
            <div><p className="eyebrow"><span /> TON CENTRE DE COMMANDEMENT</p><h2>Tout ce qui compte.<br />Rien qui te ralentit.</h2></div>
            <p>Suis ton évolution, retrouve ta prochaine mission et comprends exactement ce qui te sépare du rang suivant.</p>
          </div>
          <div className="dashboard-preview">
            <aside className="dash-sidebar">
              <Brand />
              <div className="dash-nav"><span className="active"><UserRound size={17} /> Profil</span><span><Network size={17} /> Compétences</span><span><BookOpen size={17} /> Modules</span><span><Swords size={17} /> Quêtes</span><span><Trophy size={17} /> Boss</span></div>
              <span className="system-state"><i /> Système opérationnel</span>
            </aside>
            <div className="dash-main">
              <div className="profile-strip"><div className="avatar"><Code2 size={30} /></div><div><span>Bienvenue, Alex</span><strong>Développeur en devenir</strong></div><div className="profile-rank"><small>RANG ACTUEL</small><strong>E</strong></div></div>
              <div className="dash-title-row"><h3>Compétences</h3><span>Voir le parcours <ArrowRight size={13} /></span></div>
              <div className="skills-list">
                {skills.map(({ name, value, icon: SkillIcon }) => <div className="skill-row" key={name}><SkillIcon size={16} /><span>{name}</span><div className="skill-bar"><i style={{ width: `${value}%` }} /></div><strong>{value}</strong></div>)}
              </div>
            </div>
            <div className="dash-rail">
              <span className="rail-label">MISSION ACTIVE</span><h3>Les bases du C</h3><p>Pointeurs, mémoire et fonctions</p>
              <div className="mission-progress"><span style={{ width: '68%' }} /></div><div className="mission-meta"><span>8 / 12 leçons</span><strong>68%</strong></div>
              <div className="quest-list"><span><Check size={15} /> Variables et conditions</span><span><Check size={15} /> Boucles et fonctions</span><span className="current"><Sparkles size={15} /> Premier pointeur</span></div>
              <Link className="button button-primary button-full" to="/profil">Mon profil <ArrowRight size={16} /></Link>
            </div>
          </div>
        </section>

        <section className="boss-section" id="boss">
          <div className="boss-copy">
            <p className="eyebrow"><span /> ÉPREUVE FINALE</p><h2>Le rang ne se réclame pas.<br /><span>Il se conquiert.</span></h2>
            <p>Quand toutes les compétences d’un bloc atteignent le rang S, son boss se débloque. Une mission complète, plusieurs validations, aucune solution facile.</p>
            <ul><li><Check size={17} /> Conditions réelles et temps limité</li><li><Check size={17} /> Tests fonctionnels, sécurité et performance</li><li><Check size={17} /> Résultat public, progression incontestable</li></ul>
          </div>
          <div className="boss-glyph" aria-hidden="true"><div className="glyph-ring outer"><div className="glyph-ring inner"><Crown size={64} strokeWidth={1.2} /></div></div><span>BOSS FINAL</span></div>
        </section>

        <section className="final-cta" id="start">
          <div><p className="eyebrow"><span /> TA PREMIÈRE QUÊTE T’ATTEND</p><h2>Prêt à passer du code<br />à la maîtrise&nbsp;?</h2></div>
          <div className="cta-actions"><Link className="button button-primary" to="/inscription">Créer mon profil <ArrowRight size={18} /></Link><span>Gratuit pour commencer. Aucun raccourci payant.</span></div>
        </section>
      </main>

      <footer><Brand /><p>Learn. Build. Review. Conquer.</p><span>© 2026 LevelUp.dev</span></footer>
    </div>
  )
}

export default Landing
