import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, BookOpen, Check, Code2, GitBranch, Hexagon, LockKeyhole, Network, Search, TerminalSquare, UserRound, Zap } from 'lucide-react'
import { ApiError } from '../lib/api'
import { getCatalog, rankLabels, ranks, startSkill, type Catalog, type Skill } from '../lib/learningApi'
import { useAuthMutation } from '../hooks/useAuthMutation'
import './Paths.css'

export default function Paths() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [searchState, setSearchState] = useState({ domain: '', value: '' })
  const domainSlug = params.get('domaine')
  const skillID = params.get('competence')
  const search = searchState.domain === domainSlug ? searchState.value : ''

  useEffect(() => {
    const controller = new AbortController()
    getCatalog(controller.signal).then(result => {
      if (!controller.signal.aborted) setCatalog(result)
    }).catch((reason: unknown) => {
      if (controller.signal.aborted) return
      if (reason instanceof ApiError && reason.status === 401) {
        navigate('/connexion', { replace: true, state: { from: '/parcours' + window.location.search } })
      } else {
        setError('Impossible de charger tes parcours. Réessaie dans un instant.')
      }
    })
    return () => controller.abort()
  }, [navigate, attempt])

  const domain = catalog?.domains.find(item => item.slug === domainSlug)
  const allSkills = catalog?.domains.flatMap(item => item.blocks.flatMap(block => block.skills)) ?? []
  const selectedSkill = domain?.blocks.flatMap(block => block.skills).find(skill => skill.id === skillID)
  const git = allSkills.find(skill => skill.transversal && skill.slug === 'git')
  const query = search.trim().toLocaleLowerCase('fr-FR')
  const visibleBlocks = domain?.blocks.map(block => ({ ...block, skills: block.skills.filter(skill =>
    `${skill.name} ${skill.description}`.toLocaleLowerCase('fr-FR').includes(query)) })).filter(block => block.skills.length > 0)

  function updateSkill(updated: Skill) {
    setCatalog(current => current && ({ ...current, domains: current.domains.map(item => ({
      ...item, blocks: item.blocks.map(block => ({ ...block, skills: block.skills.map(skill => skill.id === updated.id ? updated : skill) })),
    })) }))
  }

  return (
    <div className="paths-page">
      <header className="paths-topbar">
        <Link className="paths-brand" to="/" aria-label="LevelUp.dev, accueil"><TerminalSquare size={23} /> LEVELUP<span>.DEV</span></Link>
        <nav aria-label="Navigation du joueur">
          <Link to="/parcours" aria-current="page"><Network size={17} /> Parcours</Link>
          <Link to="/profil"><UserRound size={17} /> Mon profil</Link>
        </nav>
      </header>
      <main className="paths-main">
        <div className="paths-heading">
          <p className="paths-eyebrow"><span /> CARTE DES COMPÉTENCES</p>
          <h1>{domain?.name ?? 'Choisis ton terrain.'}</h1>
          <p>{domain?.description ?? 'Chaque compétence commence au rang E. Construis ton parcours, une maîtrise à la fois.'}</p>
        </div>
        {error && <div className="paths-message"><p role="alert">{error}</p><button onClick={() => { setError(''); setAttempt(value => value + 1) }}>Réessayer</button></div>}
        {!catalog && !error && <p className="paths-message" role="status">Chargement de tes parcours…</p>}
        {catalog && <>
          <dl className="paths-stats">
            <div><dt><Hexagon size={16} /> Rang global</dt><dd>{catalog.globalRank === 'UNRANKED' ? 'Non classé' : catalog.globalRank}</dd></div>
            <div><dt><Zap size={16} /> Expérience validée</dt><dd>{catalog.totalXP.toLocaleString('fr-FR')} <small>XP</small></dd></div>
            <div><dt><BookOpen size={16} /> Compétences commencées</dt><dd>{allSkills.filter(skill => skill.rank !== 'UNRANKED').length} <small>/ {allSkills.length}</small></dd></div>
          </dl>
          {!domainSlug && <>
            <div className="paths-domains">
              {catalog.domains.map((item, index) => {
                const skills = item.blocks.flatMap(block => block.skills)
                return <Link key={item.id} to={`/parcours?domaine=${encodeURIComponent(item.slug)}`} className={`domain-card domain-${item.slug}`}>
                  <div className="domain-card-top"><span>{item.slug === 'web' ? <Code2 size={30} /> : <Network size={30} />}</span><span>DOMAINE / {String(index + 1).padStart(2, '0')}</span></div>
                  <h2>{item.name}</h2><p>{item.description}</p>
                  <div className="domain-card-meta"><span>{item.blocks.length} blocs</span><span>{skills.length} compétences</span><span>{rankLabels[item.rank]}</span></div>
                  <div className="domain-card-bottom"><span>Explorer le domaine</span><ArrowRight size={20} /></div>
                </Link>
              })}
            </div>
            {catalog.domains.length === 0 && <p className="paths-message">Les premiers parcours sont en préparation. Reviens bientôt.</p>}
            <section className="paths-guide"><Hexagon size={28} /><div><h2>Un départ accessible. Une maîtrise qui se prouve.</h2><p>Commencer une compétence t’installe au rang E, sans prérequis implicite. Les XP et les rangs suivants récompenseront la pratique validée.</p></div></section>
          </>}
          {domainSlug && !domain && <div className="paths-message"><p role="alert">Ce domaine n’est pas disponible.</p><Link to="/parcours">Revenir aux domaines</Link></div>}
          {domain && <>
            <div className="paths-toolbar">
              <Link to="/parcours"><ArrowLeft size={17} /> Tous les domaines</Link>
              <label className="paths-search"><Search size={17} /><input type="search" aria-label="Rechercher une compétence" placeholder="Rechercher une compétence…" value={search} onChange={event => setSearchState({ domain: domain.slug, value: event.target.value })} /></label>
            </div>
            <div className="paths-workspace">
              <div className="paths-blocks">
                {visibleBlocks?.map((block, index) => <section className="paths-block" key={block.id} aria-labelledby={`block-${block.id}`}>
                  <header><span className="block-number">{String(index + 1).padStart(2, '0')}</span><div><h2 id={`block-${block.id}`}>{block.name}</h2><p>{block.description}</p></div></header>
                  <div className="skill-grid">{block.skills.map(skill => <button type="button" className={`skill-node ${skill.rank !== 'UNRANKED' ? 'is-started' : ''}`} key={skill.id}
                    aria-label={`Explorer ${skill.name}`} aria-pressed={skill.id === skillID} aria-controls="skill-details" onClick={() => setParams({ domaine: domain.slug, competence: skill.id })}>
                    <span className="skill-node-top"><span className="skill-rank">{skill.locked ? <LockKeyhole size={16} /> : skill.rank === 'UNRANKED' ? '—' : skill.rank}</span>{skill.transversal && <GitBranch size={16} aria-label="Compétence transversale" />}</span>
                    <strong>{skill.name}</strong><span>{skill.locked ? 'Prérequis à valider' : skill.rank === 'UNRANKED' ? 'Disponible' : skill.rank === 'S' ? 'Maîtrise' : 'En cours'}</span>
                  </button>)}</div>
                </section>)}
                {visibleBlocks?.length === 0 && <p className="paths-message" role="status">Aucune compétence ne correspond à ta recherche.</p>}
                {domain.slug === 'logic_algorithms' && git && <Link className="paths-git" to={`/parcours?domaine=web&competence=${git.id}`}><GitBranch size={23} /><div><strong>Git t’accompagne dans les deux domaines</strong><span>Découvre-le à ton rythme. Il n’est pas requis pour débuter.</span></div><ArrowRight size={18} /></Link>}
              </div>
              {selectedSkill ? <SkillDetails key={selectedSkill.id} skill={selectedSkill} onUpdate={updateSkill} /> : <aside id="skill-details" className={`skill-details ${skillID ? '' : 'skill-placeholder'}`}>
                <Network size={36} /><h2>{skillID ? 'Compétence indisponible' : 'Trace ton parcours'}</h2><p>{skillID ? 'Choisis une autre compétence dans ce domaine.' : 'Sélectionne une compétence pour découvrir son objectif et commencer au rang E.'}</p>
              </aside>}
            </div>
          </>}
        </>}
      </main>
      <footer className="paths-footer"><span>LEVELUP.DEV</span><span>Learn. Build. Review. Conquer.</span></footer>
    </div>
  )
}

function SkillDetails({ skill, onUpdate }: { skill: Skill; onUpdate: (skill: Skill) => void }) {
  const navigate = useNavigate()
  const { submit, submitting, error } = useAuthMutation()
  const [notice, setNotice] = useState('')
  const details = useRef<HTMLElement>(null)

  useEffect(() => {
    details.current?.focus({ preventScroll: !window.matchMedia('(max-width: 720px)').matches })
  }, [])

  async function begin() {
    let updated = skill
    const success = await submit(async signal => {
      try {
        const progress = await startSkill(skill.id, signal)
        updated = { ...skill, ...progress }
      } catch (reason) {
        if (!signal.aborted && reason instanceof ApiError && reason.status === 401) {
          navigate('/connexion', { replace: true, state: { from: '/parcours' + window.location.search } })
        }
        throw reason
      }
    })
    if (success) {
      onUpdate(updated)
      setNotice(`${skill.name} a été ajouté à ton parcours.`)
    }
  }

  return <aside id="skill-details" ref={details} tabIndex={-1} className="skill-details" aria-label={`Détails : ${skill.name}`}>
    <p className="paths-eyebrow">FICHE COMPÉTENCE</p><h2>{skill.name}</h2><p>{skill.description}</p>
    {skill.transversal && <span className="skill-tag"><GitBranch size={14} /> Transversale</span>}
    <div className="skill-current"><Hexagon size={30} /><div><strong>{rankLabels[skill.rank]}</strong><span>{skill.xp.toLocaleString('fr-FR')} XP validés</span></div></div>
    <ol className="rank-ladder" aria-label="Échelle des rangs">{ranks.filter(rank => rank !== 'UNRANKED').map(rank => <li key={rank} className={ranks.indexOf(rank) <= ranks.indexOf(skill.rank) ? 'is-reached' : ''} aria-current={rank === skill.rank ? 'step' : undefined}><span>{rank}</span><span>{rankLabels[rank]}</span>{rank === skill.rank && <Check size={14} />}</li>)}</ol>
    {skill.locked ? <p className="skill-note"><LockKeyhole size={17} /> Valide les prérequis pour commencer cette compétence.</p> : skill.rank === 'UNRANKED' ? <>
      <button className="paths-primary" onClick={begin} disabled={submitting}>{submitting ? 'Enregistrement…' : 'Commencer cette compétence'}<ArrowRight size={17} /></button>
      <p className="skill-note">Ton choix sera enregistré au rang E. Les cours de cette compétence sont en préparation.</p>
    </> : <p className="skill-note"><BookOpen size={20} /> Ton parcours est enregistré. Les cours de cette compétence arrivent prochainement.</p>}
    {error && <p className="paths-error" role="alert">{error}</p>}
    {notice && <p className="paths-success" role="status">{notice}</p>}
  </aside>
}
