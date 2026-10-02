import html from './html.mjs'
import css from './css.mjs'
export const tracks = [html, css]
export const exercises = tracks.flatMap(track => track.exercises)
