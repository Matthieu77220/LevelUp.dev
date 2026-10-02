package integration_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"levelup.dev/backend/internal/auth"
	"levelup.dev/backend/internal/httpapi"
	"levelup.dev/backend/internal/learning"
)

func TestLearningWithPostgres(t *testing.T) {
	pool := newTestDatabase(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	authHandler, err := auth.NewHandler(auth.NewStore(pool), "test_session", false, time.Hour, logger)
	if err != nil {
		t.Fatal(err)
	}
	store := learning.NewStore(pool)
	router := httpapi.NewRouter(authHandler, learning.NewHandler(store, logger), "http://localhost:5173", logger, pool.Ping)
	call := func(t *testing.T, method, path, body string, cookie *http.Cookie, expected int) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequest(method, path, bytes.NewBufferString(body)).WithContext(ctx)
		r.Header.Set("Origin", "http://localhost:5173")
		r.Header.Set("Content-Type", "application/json")
		if cookie != nil {
			r.AddCookie(cookie)
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		if w.Code != expected {
			t.Fatalf("%s %s: got %d, want %d: %s", method, path, w.Code, expected, w.Body.String())
		}
		return w
	}
	register := func(username string) (auth.User, *http.Cookie) {
		t.Helper()
		w := call(t, "POST", "/api/v1/auth/register", fmt.Sprintf(`{"username":%q,"password":"a-safe-test-password","passwordConfirmation":"a-safe-test-password"}`, username), nil, 201)
		var body struct {
			User auth.User `json:"user"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		cookies := w.Result().Cookies()
		if len(cookies) != 1 {
			t.Fatal("expected a session cookie")
		}
		return body.User, cookies[0]
	}
	alpha, alphaCookie := register("Alpha")
	_, bravoCookie := register("Bravo")
	catalogFor := func(t *testing.T, cookie *http.Cookie) learning.Catalog {
		t.Helper()
		w := call(t, "GET", "/api/v1/learning/catalog", "", cookie, 200)
		var catalog learning.Catalog
		if err := json.Unmarshal(w.Body.Bytes(), &catalog); err != nil {
			t.Fatal(err)
		}
		if catalog.Domains == nil {
			t.Fatal("domains must be an array")
		}
		return catalog
	}
	findSkill := func(t *testing.T, catalog learning.Catalog, slug string) learning.Skill {
		t.Helper()
		for _, domain := range catalog.Domains {
			for _, block := range domain.Blocks {
				for _, skill := range block.Skills {
					if skill.Slug == slug {
						return skill
					}
				}
			}
		}
		t.Fatalf("skill %s missing", slug)
		return learning.Skill{}
	}
	catalog := catalogFor(t, alphaCookie)
	if len(catalog.Domains) != 2 || catalog.TotalXP != 0 || catalog.GlobalRank != "UNRANKED" {
		t.Fatalf("unexpected initial catalogue: %+v", catalog)
	}
	blocks, skills := 0, 0
	for _, domain := range catalog.Domains {
		for _, block := range domain.Blocks {
			blocks++
			skills += len(block.Skills)
		}
	}
	if blocks != 13 || skills != 33 {
		t.Fatalf("catalogue has %d blocks and %d skills", blocks, skills)
	}
	html := findSkill(t, catalog, "html")
	git := findSkill(t, catalog, "git")
	if !git.Transversal || html.Locked || html.Rank != "UNRANKED" {
		t.Fatal("beginners must be able to start without Git")
	}
	startPath := "/api/v1/learning/skills/" + html.ID + "/start"

	t.Run("session and origin protect the catalogue and writes", func(t *testing.T) {
		call(t, "GET", "/api/v1/learning/catalog", "", nil, 401)
		call(t, "POST", startPath, "", nil, 401)
		r := httptest.NewRequest("POST", startPath, nil)
		r.AddCookie(alphaCookie)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		if w.Code != 403 {
			t.Fatalf("untrusted write: %d", w.Code)
		}
		call(t, "POST", "/api/v1/learning/skills/invalid/start", "", alphaCookie, 400)
		call(t, "POST", "/api/v1/learning/skills/00000000-0000-0000-0000-000000000000/start", "", alphaCookie, 404)
	})
	t.Run("concurrent starts remain unique and cannot award XP", func(t *testing.T) {
		errors := make(chan error, 8)
		for range cap(errors) {
			go func() {
				progress, err := store.StartSkill(ctx, alpha.ID, html.ID)
				if err == nil && (progress.Rank != "E" || progress.XP != 0) {
					err = fmt.Errorf("unexpected progress: %+v", progress)
				}
				errors <- err
			}()
		}
		for range cap(errors) {
			if err := <-errors; err != nil {
				t.Fatal(err)
			}
		}
		call(t, "POST", startPath, `{"rank":"S","xp":9999,"userId":"forged"}`, alphaCookie, 200)
		var count int
		if err := pool.QueryRow(ctx, "SELECT count(*) FROM progression.user_skill_progress WHERE user_id=$1 AND skill_id=$2", alpha.ID, html.ID).Scan(&count); err != nil || count != 1 {
			t.Fatalf("progress rows: %d (%v)", count, err)
		}
		current := catalogFor(t, alphaCookie)
		if current.TotalXP != 0 || current.GlobalRank != "UNRANKED" {
			t.Fatal("enrollment must not award technical progress")
		}
		if skill := findSkill(t, current, "html"); skill.Rank != "E" || skill.XP != 0 {
			t.Fatalf("progress not persisted: %+v", skill)
		}
		if skill := findSkill(t, catalogFor(t, bravoCookie), "html"); skill.Rank != "UNRANKED" {
			t.Fatal("progress leaked to another account")
		}
	})
	t.Run("existing earned progress is preserved", func(t *testing.T) {
		if _, err := pool.Exec(ctx, "UPDATE progression.user_skill_progress SET rank='C', xp_total=80 WHERE user_id=$1 AND skill_id=$2", alpha.ID, html.ID); err != nil {
			t.Fatal(err)
		}
		w := call(t, "POST", startPath, "", alphaCookie, 200)
		var progress learning.Progress
		if err := json.Unmarshal(w.Body.Bytes(), &progress); err != nil || progress.Rank != "C" || progress.XP != 80 {
			t.Fatalf("earned progress reset: %+v (%v)", progress, err)
		}
	})
	t.Run("prerequisites are enforced on the server", func(t *testing.T) {
		if _, err := pool.Exec(ctx, "INSERT INTO learning.skill_prerequisites (skill_id, prerequisite_skill_id, minimum_rank) VALUES ($1,$2,'E')", git.ID, html.ID); err != nil {
			t.Fatal(err)
		}
		path := "/api/v1/learning/skills/" + git.ID + "/start"
		if skill := findSkill(t, catalogFor(t, bravoCookie), "git"); !skill.Locked {
			t.Fatal("missing locked state")
		}
		call(t, "POST", path, "", bravoCookie, 409)
		call(t, "POST", path, "", alphaCookie, 200)
	})
	t.Run("draft content and descendants are unavailable", func(t *testing.T) {
		for _, table := range []string{"skills", "blocks", "domains"} {
			id := html.ID
			if table == "blocks" {
				id = catalog.Domains[0].Blocks[0].ID
			}
			if table == "domains" {
				id = catalog.Domains[0].ID
			}
			if _, err := pool.Exec(ctx, "UPDATE learning."+table+" SET status='DRAFT' WHERE id=$1", id); err != nil {
				t.Fatal(err)
			}
			call(t, "POST", startPath, "", alphaCookie, 404)
			visible := catalogFor(t, alphaCookie)
			for _, domain := range visible.Domains {
				for _, block := range domain.Blocks {
					for _, skill := range block.Skills {
						if skill.ID == html.ID {
							t.Fatalf("%s draft leaked into catalogue", table)
						}
					}
				}
			}
			if _, err := pool.Exec(ctx, "UPDATE learning."+table+" SET status='PUBLISHED' WHERE id=$1", id); err != nil {
				t.Fatal(err)
			}
		}
	})
	t.Run("empty catalogue serializes as an array", func(t *testing.T) {
		if _, err := pool.Exec(ctx, "UPDATE learning.domains SET status='DRAFT'"); err != nil {
			t.Fatal(err)
		}
		if got := catalogFor(t, alphaCookie); len(got.Domains) != 0 {
			t.Fatal("draft domains exposed")
		}
	})
}
