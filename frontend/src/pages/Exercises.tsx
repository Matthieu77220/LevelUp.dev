import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, GitPullRequest, LockKeyhole, Play, TerminalSquare, Zap } from 'lucide-react'
import { ApiError } from '../lib/api'
import { getExerciseTrack, submitExercise, type Evaluation, type Exercise, type ExerciseTrack } from '../lib/exerciseApi'
import { rankLabels, startSkill } from '../lib/learningApi'
import './Paths.css'
import './Exercises.css'

export default function Exercises() {
  const { track = '' } = useParams()
  return <Track key={track} slug={track} />
}

function Track({ slug }: { slug: string }) {
  const [track, setTrack] = useState<ExerciseTrack | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [starting, setStarting] = useState(false)
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const startController = useRef<AbortController | null>(null)
  useEffect(() => () => startController.current?.abort(), [])
  useEffect(() => {
    const controller = new AbortController()
    getExerciseTrack(slug, controller.signal).then(setTrack).catch((reason: unknown) => {
      if (controller.signal.aborted) return
      if (reason instanceof ApiError && reason.status === 401) navigate('/connexion', { replace: true, state: { from: `/parcours/${slug}${window.location.search}` } })
      else setError(reason instanceof ApiError ? reason.message : 'NetworkError: parcours indisponible')
    })
    return () => controller.abort()
  }, [slug, attempt, navigate])
  const selected = track?.exercises.find(e => e.slug === params.get('exercice')) ?? track?.exercises.find(e => e.available && !track.completed.includes(e.slug)) ?? track?.exercises[0]
  const nextPromotion = track?.promotions.find(p => p.completed > track.completed.length)

  function record(exercise: Exercise, result: Evaluation) {
    setParams({ exercice: exercise.slug }, { replace: true })
    setTrack(current => {
      if (!current) return current
      const completed = result.passed ? Array.from(new Set([...current.completed, exercise.slug])) : current.completed
      return { ...current, rank: result.rank, xp: result.xp, completed, exercises: current.exercises.map((e, i) => ({
        ...e, available: current.exercises.slice(0, i).every(prior => completed.includes(prior.slug)),
      })) }
    })
  }
  async function begin() {
    if (!track || startController.current) return
    const controller = new AbortController()
    startController.current = controller
    setStarting(true); setError('')
    try {
      await startSkill(track.skillId, controller.signal)
      setTrack(await getExerciseTrack(slug, controller.signal))
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof ApiError ? reason.message : 'NetworkError: démarrage impossible')
    } finally {
      startController.current = null
      if (!controller.signal.aborted) setStarting(false)
    }
  }
  return <div className="paths-page">
    <header className="paths-topbar"><Link className="paths-brand" to="/" aria-label="LevelUp.dev, accueil"><TerminalSquare size={23} /> LEVELUP<span>.DEV</span></Link><Link className="exercise-back" to="/parcours"><ArrowLeft size={16} /> Parcours</Link></header>
    <main className="exercise-main">
      {error && <div className="paths-message"><p role="alert">{error}</p><button onClick={() => { setError(''); setAttempt(n => n + 1) }}>Réessayer</button></div>}
      {!track && !error && <p role="status">Chargement des exercices…</p>}
      {track && <>
        <div className="exercise-heading"><div><p className="paths-eyebrow">ATELIER / {track.name}</p><h1>De la première ligne à la maîtrise.</h1></div><div className="exercise-progress"><strong>Rang {track.rank === 'UNRANKED' ? '—' : track.rank}</strong><span>{rankLabels[track.rank]}</span><span><Zap size={15} /> {track.xp.toLocaleString('fr-FR')} XP · {track.completed.length}/{track.exercises.length}</span></div></div>
        <p className="exercise-progression">{nextPromotion ? `Prochain rang : ${nextPromotion.rank} · ${nextPromotion.completed} exercices validés et ${nextPromotion.xp.toLocaleString('fr-FR')} XP.` : 'Les épreuves de maîtrise sont validées.'} Le rang S exige les quatre épreuves finales.</p>
        {track.rank === 'UNRANKED' && <button className="paths-primary exercise-begin" disabled={starting} onClick={begin}>{starting ? 'Enregistrement…' : `Commencer ${track.name}`}</button>}
        <div className="exercise-layout">
          <nav className="exercise-list" aria-label="Exercices par difficulté">{['E','D','C','B','A','S'].map(rank => <section key={rank}>
            <h2>Difficulté {rank}{rank === 'S' ? ' · Maîtrise' : ''}</h2>
            {track.exercises.filter(e => e.rank === rank).map(e => <button key={e.slug} type="button" aria-current={selected?.slug === e.slug ? 'step' : undefined} onClick={() => setParams({ exercice: e.slug })}>
              <span>{track.completed.includes(e.slug) ? <Check size={14} /> : !e.available ? <LockKeyhole size={13} /> : String(e.position).padStart(2,'0')}</span><span>{e.title}<small>{e.xp} XP</small></span>
            </button>)}
          </section>)}</nav>
          {selected && <Editor key={selected.slug} exercise={selected} track={slug} initialSource={drafts[selected.slug] ?? selected.starter}
            onDraft={source => { setDrafts(current => ({ ...current, [selected.slug]: source })) }} onResult={result => record(selected, result)}
            onNext={track.exercises.find(e => e.position === selected.position + 1)?.available ? () => setParams({ exercice: track.exercises.find(e => e.position === selected.position + 1)!.slug }) : undefined} />}
        </div>
      </>}
    </main>
  </div>
}

function Editor({ exercise: e, track, initialSource, onDraft, onResult, onNext }: {
  exercise: Exercise; track: string; initialSource: string; onDraft: (source: string) => void
  onResult: (result: Evaluation) => void; onNext?: () => void
}) {
  const [source, setSource] = useState(initialSource)
  const [output, setOutput] = useState('')
  const [awarded, setAwarded] = useState(0)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState('')
  const controller = useRef<AbortController | null>(null)
  const navigate = useNavigate()
  useEffect(() => () => controller.current?.abort(), [])
  async function submit() {
    if (controller.current || !e.available) return
    const abort = new AbortController()
    controller.current = abort
    setBusy(true); setOutput(''); setAwarded(0)
    try {
      const result = await submitExercise(track, e.slug, source, abort.signal)
      if (!abort.signal.aborted) { setOutput(result.message); setAwarded(result.awardedXP); onResult(result) }
    } catch (reason) {
      if (!abort.signal.aborted) {
        if (reason instanceof ApiError && reason.status === 401) navigate('/connexion', { replace: true, state: { from: `/parcours/${track}?exercice=${e.slug}` } })
        else setOutput(reason instanceof ApiError ? reason.message : 'NetworkError: validation interrompue, réessaie')
      }
    } finally {
      controller.current = null
      if (!abort.signal.aborted) setBusy(false)
    }
  }
  function renderPreview() {
    const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; form-action 'none'; base-uri 'none'">`
    const css = (e.fixtureCss ?? '') + '\n' + source
    setPreview('<!doctype html>' + policy + (e.language === 'html' ? source : `<style>body{margin:0;font-family:Arial,sans-serif} ${css.replace(/<\/style/gi, '<\\/style')}</style>${e.markup ?? ''}`))
  }
  return <article className="exercise-editor">
    <div className="exercise-meta"><span>{e.slug.toUpperCase()} · DIFFICULTÉ {e.rank}</span><span><Zap size={14} /> {e.xp} XP</span></div>
    <h2>{e.title}</h2><h3>Consigne</h3><p className="exercise-instruction">{e.instruction}</p>
    <section className="exercise-allowed" aria-label="Éléments autorisés">
      {e.language === 'html' ? <><h3>Balises autorisées</h3><div>{e.allowed.tags?.map(tag => <code key={tag}>&lt;{tag}&gt;</code>)}</div>{!!e.allowed.attributes?.length && <><h4>Attributs autorisés</h4><div>{e.allowed.attributes.map(attribute => <code key={attribute}>{attribute}</code>)}</div></>}</> : <><h3>Propriétés CSS autorisées</h3><div>{e.allowed.properties?.map(property => <code key={property}>{property}</code>)}</div>{!!e.allowed.atRules?.length && <><h4>Règles autorisées</h4><div>{e.allowed.atRules.map(rule => <code key={rule}>@{rule}</code>)}</div></>}<p>!important est interdit.</p></>}
    </section>
    {e.language === 'css' && <details className="exercise-fixture"><summary>HTML fourni · lecture seule</summary><pre>{e.markup}</pre>{e.fixtureCss && <><p>CSS fourni · chargé avant ton code</p><pre>{e.fixtureCss}</pre></>}</details>}
    <label className="exercise-code-label" htmlFor="exercise-source">{e.language === 'html' ? 'index.html' : 'styles.css'}</label>
    <textarea id="exercise-source" className="exercise-code" spellCheck={false} autoCapitalize="off" autoCorrect="off" value={source} onChange={event => { setSource(event.target.value); onDraft(event.target.value); setOutput(''); setAwarded(0) }} disabled={busy} />
    <div className="exercise-actions"><button className="paths-primary" disabled={busy || !e.available} onClick={submit}><Play size={16} />{busy ? 'Exécution…' : 'Tester'}</button><button onClick={renderPreview}>Aperçu</button>{onNext && <button onClick={onNext}>Suivant <ArrowRight size={15} /></button>}</div>
    {!e.available && <p className="exercise-locked"><LockKeyhole size={14} /> Commence la compétence et valide les exercices précédents pour soumettre.</p>}
    <section className="exercise-console" aria-label="Console"><div><TerminalSquare size={15} /> Console {awarded > 0 && <span>+{awarded} XP</span>}</div><pre role="status" aria-live="polite">{output}</pre></section>
    {preview && <iframe className="exercise-preview" title="Aperçu du code" sandbox="" referrerPolicy="no-referrer" srcDoc={preview} />}
    <a className="exercise-contribute" href={`https://github.com/Matthieu77220/LevelUp.dev/blob/HEAD/${e.contributionPath}`} target="_blank" rel="noreferrer"><GitPullRequest size={16} /> Améliorer cet exercice par une pull request</a>
  </article>
}
