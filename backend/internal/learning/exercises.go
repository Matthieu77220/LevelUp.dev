package learning

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/jackc/pgx/v5"
	"levelup.dev/backend/internal/auth"
)

//go:embed web_catalog.json
var webCatalog []byte

type Allowed struct {
	Tags       []string `json:"tags,omitempty"`
	Attributes []string `json:"attributes,omitempty"`
	Properties []string `json:"properties,omitempty"`
	AtRules    []string `json:"atRules,omitempty"`
}
type Exercise struct {
	Slug             string  `json:"slug"`
	Title            string  `json:"title"`
	Instruction      string  `json:"instruction"`
	Rank             string  `json:"rank"`
	XP               int     `json:"xp"`
	Position         int     `json:"position"`
	Language         string  `json:"language"`
	Allowed          Allowed `json:"allowed"`
	Starter          string  `json:"starter"`
	Markup           string  `json:"markup,omitempty"`
	FixtureCSS       string  `json:"fixtureCss,omitempty"`
	FullDocument     bool    `json:"fullDocument"`
	Milestone        bool    `json:"milestone"`
	ContributionPath string  `json:"contributionPath"`
	Available        bool    `json:"available"`
}
type Promotion struct {
	Rank      string `json:"rank"`
	Completed int    `json:"completed"`
	XP        int64  `json:"xp"`
}
type ExerciseTrack struct {
	Slug       string      `json:"slug"`
	Name       string      `json:"name"`
	Version    string      `json:"version"`
	SkillID    string      `json:"skillId"`
	Exercises  []Exercise  `json:"exercises"`
	Promotions []Promotion `json:"promotions"`
	Completed  []string    `json:"completed"`
	Progress
}

func trackDefinition(slug string) (ExerciseTrack, error) {
	var tracks []ExerciseTrack
	if err := json.Unmarshal(webCatalog, &tracks); err != nil {
		return ExerciseTrack{}, err
	}
	for _, track := range tracks {
		if track.Slug == slug {
			return track, nil
		}
	}
	return ExerciseTrack{}, pgx.ErrNoRows
}

func (s *Store) ExerciseTrack(ctx context.Context, userID, slug string) (ExerciseTrack, error) {
	track, err := trackDefinition(slug)
	if err != nil {
		return track, err
	}
	catalog, err := s.Catalog(ctx, userID)
	if err != nil {
		return track, err
	}
	var selected *Skill
	for _, d := range catalog.Domains {
		if d.Slug != "web" {
			continue
		}
		for _, b := range d.Blocks {
			for _, skill := range b.Skills {
				if skill.Slug == slug {
					copy := skill
					selected = &copy
				}
			}
		}
	}
	if selected == nil {
		return track, pgx.ErrNoRows
	}
	track.SkillID, track.Progress = selected.ID, selected.Progress
	track.Completed = []string{}
	rows, err := s.pool.Query(ctx, `SELECT m.content_ref, COALESCE(p.status='COMPLETED',false)
		FROM learning.learning_modules m JOIN learning.skill_levels l ON l.id=m.skill_level_id
		LEFT JOIN progression.user_module_progress p ON p.module_id=m.id AND p.user_id=$1
		WHERE l.skill_id=$2 AND m.status='PUBLISHED' AND m.content_version=$3 ORDER BY m.sort_order`, userID, selected.ID, track.Version)
	if err != nil {
		return track, err
	}
	defer rows.Close()
	published, completed := map[string]bool{}, map[string]bool{}
	for rows.Next() {
		var ref string
		var done bool
		if err = rows.Scan(&ref, &done); err != nil {
			return track, err
		}
		published[ref], completed[ref] = true, done
		if done {
			track.Completed = append(track.Completed, ref)
		}
	}
	if err = rows.Err(); err != nil {
		return track, err
	}
	if len(published) == 0 {
		return track, pgx.ErrNoRows
	}
	visible := []Exercise{}
	priorComplete := true
	for _, e := range track.Exercises {
		e.Available = !selected.Locked && selected.Rank != "UNRANKED" && priorComplete
		if published[e.Slug] {
			visible = append(visible, e)
		}
		priorComplete = priorComplete && completed[e.Slug]
	}
	track.Exercises = visible
	return track, nil
}

// RecordExercise serializes all awards for a user's skill. A retry never grants XP twice.
func (s *Store) RecordExercise(ctx context.Context, userID, trackSlug, slug string, passed bool) (Progress, int, error) {
	definition, err := trackDefinition(trackSlug)
	if err != nil {
		return Progress{}, 0, err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Progress{}, 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var moduleID, skillID string
	var reward, position int
	var locked bool
	var progress Progress
	err = tx.QueryRow(ctx, `SELECT m.id::text, s.id::text, m.xp_reward, m.sort_order, p.rank::text, p.xp_total,
		EXISTS (SELECT 1 FROM learning.skill_prerequisites q LEFT JOIN progression.user_skill_progress prior
		 ON prior.user_id=$1 AND prior.skill_id=q.prerequisite_skill_id
		 WHERE q.skill_id=s.id AND COALESCE(prior.rank,'UNRANKED') < q.minimum_rank)
		FROM learning.learning_modules m JOIN learning.skill_levels l ON l.id=m.skill_level_id
		JOIN learning.skills s ON s.id=l.skill_id JOIN learning.blocks b ON b.id=s.block_id
		JOIN learning.domains d ON d.id=b.domain_id
		JOIN progression.user_skill_progress p ON p.skill_id=s.id AND p.user_id=$1
		WHERE m.content_ref=$2 AND s.slug=$3 AND d.slug='web' AND m.content_version=$4
		 AND m.status='PUBLISHED' AND s.status='PUBLISHED' AND b.status='PUBLISHED' AND d.status='PUBLISHED'
		 AND p.rank<>'UNRANKED'
		FOR UPDATE OF p FOR SHARE OF m,s,b,d`, userID, slug, trackSlug, definition.Version).Scan(&moduleID, &skillID, &reward, &position, &progress.Rank, &progress.XP, &locked)
	if err != nil {
		return progress, 0, err
	}
	if locked {
		return progress, 0, ErrLocked
	}
	var missing bool
	err = tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM learning.learning_modules m
		JOIN learning.skill_levels l ON l.id=m.skill_level_id
		LEFT JOIN progression.user_module_progress p ON p.module_id=m.id AND p.user_id=$1
		WHERE l.skill_id=$2 AND m.content_version=$3 AND m.sort_order<$4
		AND (m.status<>'PUBLISHED' OR COALESCE(p.status::text,'')<>'COMPLETED'))`, userID, skillID, definition.Version, position).Scan(&missing)
	if err != nil {
		return progress, 0, err
	}
	if missing {
		return progress, 0, ErrLocked
	}
	status := "IN_PROGRESS"
	if passed {
		status = "COMPLETED"
	}
	_, err = tx.Exec(ctx, `INSERT INTO progression.user_module_progress (user_id,module_id,status,attempt_count,started_at,completed_at)
		VALUES ($1,$2,$3::progression.progress_status,1,now(),CASE WHEN $4 THEN now() END)
		ON CONFLICT (user_id,module_id) DO UPDATE SET
		status=CASE WHEN user_module_progress.status='COMPLETED' THEN 'COMPLETED'::progression.progress_status ELSE EXCLUDED.status END,
		attempt_count=user_module_progress.attempt_count+1,
		completed_at=COALESCE(user_module_progress.completed_at,EXCLUDED.completed_at),updated_at=now()`, userID, moduleID, status, passed)
	if err != nil {
		return progress, 0, err
	}
	awarded := 0
	if passed {
		err = tx.QueryRow(ctx, `INSERT INTO progression.xp_transactions (user_id,skill_id,amount,reason,source_type,source_id,idempotency_key)
		 VALUES ($1,$2,$3,'EXERCISE_PASSED','learning_module',$4,$5) ON CONFLICT (idempotency_key) DO NOTHING RETURNING amount`,
			userID, skillID, reward, moduleID, "exercise:"+userID+":"+moduleID).Scan(&awarded)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return progress, 0, err
		}
		var completedCount int
		err = tx.QueryRow(ctx, `SELECT count(*) FROM progression.user_module_progress p
		 JOIN learning.learning_modules m ON m.id=p.module_id JOIN learning.skill_levels l ON l.id=m.skill_level_id
		 WHERE p.user_id=$1 AND l.skill_id=$2 AND m.content_version=$3 AND m.status='PUBLISHED' AND p.status='COMPLETED'`, userID, skillID, definition.Version).Scan(&completedCount)
		if err != nil {
			return progress, 0, err
		}
		nextRank := "E"
		for _, promotion := range definition.Promotions {
			if completedCount >= promotion.Completed && progress.XP+int64(awarded) >= promotion.XP {
				nextRank = promotion.Rank
			}
		}
		err = tx.QueryRow(ctx, `UPDATE progression.user_skill_progress SET xp_total=xp_total+$3,
		 rank=GREATEST(rank,$4::learning.rank_code),updated_at=now() WHERE user_id=$1 AND skill_id=$2 RETURNING rank::text,xp_total`, userID, skillID, awarded, nextRank).Scan(&progress.Rank, &progress.XP)
		if err != nil {
			return progress, 0, err
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return progress, 0, err
	}
	return progress, awarded, nil
}

type EvaluationResult struct {
	Passed  bool   `json:"passed"`
	Message string `json:"message"`
}

// Only trusted evaluator code runs in Node. Learner input is sent as JSON on stdin.
func runEvaluation(ctx context.Context, slug, source string) (EvaluationResult, error) {
	path := os.Getenv("WEB_EVALUATOR_PATH")
	if path == "" {
		for _, candidate := range []string{"content/web/evaluate-cli.mjs", "../content/web/evaluate-cli.mjs", "../../content/web/evaluate-cli.mjs"} {
			if _, err := os.Stat(candidate); err == nil {
				path = candidate
				break
			}
		}
	}
	if path == "" {
		return EvaluationResult{}, fmt.Errorf("web evaluator not found")
	}
	path, err := filepath.Abs(path)
	if err != nil {
		return EvaluationResult{}, err
	}
	payload, _ := json.Marshal(map[string]string{"slug": slug, "source": source})
	ctx, cancel := context.WithTimeout(ctx, 26*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "node", path)
	cmd.Stdin = bytes.NewReader(payload)
	cmd.WaitDelay = time.Second
	output, err := cmd.Output()
	if err != nil {
		return EvaluationResult{}, err
	}
	var result EvaluationResult
	if err = json.Unmarshal(output, &result); err != nil {
		return result, err
	}
	if result.Message == "" || (result.Passed && result.Message != "OK") {
		return result, errors.New("invalid evaluator result")
	}
	return result, nil
}

func (h *Handler) Exercises(w http.ResponseWriter, r *http.Request, user auth.User) {
	track, err := h.store.ExerciseTrack(r.Context(), user.ID, r.PathValue("track"))
	if err != nil {
		h.exerciseError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, track)
}

func (h *Handler) SubmitExercise(w http.ResponseWriter, r *http.Request, user auth.User) {
	var input struct {
		Source string `json:"source"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 100000)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil || len(input.Source) > 65536 {
		writeError(w, 400, "INVALID_SOURCE", "InputError: source invalide ou supérieure à 64 Kio")
		return
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		writeError(w, 400, "INVALID_SOURCE", "InputError: un seul objet JSON attendu")
		return
	}
	track, err := h.store.ExerciseTrack(r.Context(), user.ID, r.PathValue("track"))
	if err != nil {
		h.exerciseError(w, err)
		return
	}
	var selected *Exercise
	for _, e := range track.Exercises {
		if e.Slug == r.PathValue("exercise") {
			copy := e
			selected = &copy
			break
		}
	}
	if selected == nil {
		h.exerciseError(w, pgx.ErrNoRows)
		return
	}
	if !selected.Available {
		h.exerciseError(w, ErrLocked)
		return
	}
	select {
	case h.evaluationSlots <- struct{}{}:
		defer func() { <-h.evaluationSlots }()
	default:
		writeError(w, 429, "EVALUATOR_BUSY", "BusyError: correcteur occupé, réessaie")
		return
	}
	result, err := runEvaluation(r.Context(), selected.Slug, input.Source)
	if err != nil {
		h.logger.Error("web evaluation unavailable", "error", err)
		writeError(w, 503, "EVALUATOR_UNAVAILABLE", "EvaluationError: correcteur indisponible, réessaie")
		return
	}
	progress, awarded, err := h.store.RecordExercise(r.Context(), user.ID, track.Slug, selected.Slug, result.Passed)
	if err != nil {
		h.exerciseError(w, err)
		return
	}
	writeJSON(w, 200, struct {
		EvaluationResult
		Progress
		AwardedXP int `json:"awardedXP"`
	}{result, progress, awarded})
}

func (h *Handler) exerciseError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		writeError(w, 404, "EXERCISE_NOT_FOUND", "NotFoundError: exercice indisponible")
	case errors.Is(err, ErrLocked):
		writeError(w, 409, "EXERCISE_LOCKED", "LockedError: prérequis non validés")
	default:
		h.logger.Error("exercise request failed", "error", err)
		writeError(w, 500, "EXERCISE_UNAVAILABLE", "StorageError: progression indisponible, réessaie")
	}
}
