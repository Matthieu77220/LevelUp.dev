package integration_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"levelup.dev/backend/internal/auth"
	"levelup.dev/backend/internal/httpapi"
	"levelup.dev/backend/internal/learning"
)

func TestWebExercisesWithPostgres(t *testing.T) {
	pool := newTestDatabase(t)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	store := learning.NewStore(pool)
	var evaluationLog bytes.Buffer
	logger := slog.New(slog.NewTextHandler(&evaluationLog, nil))
	authHandler, err := auth.NewHandler(auth.NewStore(pool), "test_session", false, time.Hour, logger)
	if err != nil {
		t.Fatal(err)
	}
	router := httpapi.NewRouter(authHandler, learning.NewHandler(store, logger), "http://localhost:5173", logger, pool.Ping)
	call := func(method, path, body string, cookie *http.Cookie, status int) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequest(method, path, bytes.NewBufferString(body)).WithContext(ctx)
		r.Header.Set("Origin", "http://localhost:5173")
		r.Header.Set("Content-Type", "application/json")
		if cookie != nil {
			r.AddCookie(cookie)
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		if w.Code != status {
			t.Fatalf("%s %s: %d: %s\n%s", method, path, w.Code, w.Body.String(), evaluationLog.String())
		}
		return w
	}
	w := call("POST", "/api/v1/auth/register", `{"username":"ExercisePlayer","password":"a-safe-test-password","passwordConfirmation":"a-safe-test-password"}`, nil, 201)
	var registration struct {
		User auth.User `json:"user"`
	}
	if err = json.Unmarshal(w.Body.Bytes(), &registration); err != nil {
		t.Fatal(err)
	}
	userID := registration.User.ID
	cookie := w.Result().Cookies()[0]
	getTrack := func(slug string) learning.ExerciseTrack {
		t.Helper()
		w := call("GET", "/api/v1/learning/tracks/"+slug, "", cookie, 200)
		if strings.Contains(w.Body.String(), `"solution"`) || strings.Contains(w.Body.String(), `"expression"`) || strings.Contains(w.Body.String(), `"scenarios"`) {
			t.Fatal("private correction exposed")
		}
		var track learning.ExerciseTrack
		if err = json.Unmarshal(w.Body.Bytes(), &track); err != nil {
			t.Fatal(err)
		}
		return track
	}
	call("GET", "/api/v1/learning/tracks/html", "", nil, 401)
	call("GET", "/api/v1/learning/tracks/javascript", "", cookie, 404)
	track := getTrack("html")
	if len(track.Exercises) != 24 || track.Exercises[0].Available || len(track.Completed) != 0 {
		t.Fatalf("unexpected initial track: %+v", track)
	}
	path := "/api/v1/learning/tracks/html/exercises/html-01/submit"
	call("POST", path, `{"source":"<p>Hello World</p>"}`, cookie, 409)
	if _, err = store.StartSkill(ctx, userID, track.SkillID); err != nil {
		t.Fatal(err)
	}
	call("POST", path, `{"source":"<p>Hello World</p>","xp":99999}`, cookie, 400)
	call("POST", path, `{"source":""} {}`, cookie, 400)
	call("POST", "/api/v1/learning/tracks/html/exercises/html-02/submit", `{"source":""}`, cookie, 409)
	w = call("POST", path, `{"source":"<p>Incorrect</p>"}`, cookie, 200)
	var result struct {
		Passed    bool   `json:"passed"`
		Message   string `json:"message"`
		AwardedXP int    `json:"awardedXP"`
		learning.Progress
	}
	if err = json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Passed || result.AwardedXP != 0 || !strings.HasPrefix(result.Message, "AssertionError:") {
		t.Fatalf("failed answer: %+v", result)
	}
	w = call("POST", path, `{"source":"<p>Hello World</p>"}`, cookie, 200)
	if err = json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if !result.Passed || result.Message != "OK" || result.AwardedXP != 20 || result.Rank != "E" || result.XP != 20 {
		t.Fatalf("accepted answer: %+v", result)
	}

	t.Run("concurrent replay grants no extra XP and failed retry preserves completion", func(t *testing.T) {
		done := make(chan error, 8)
		for range cap(done) {
			go func() {
				p, xp, err := store.RecordExercise(ctx, userID, "html", "html-01", true)
				if err == nil && (xp != 0 || p.XP != 20) {
					err = fmt.Errorf("replay awarded XP: %+v %d", p, xp)
				}
				done <- err
			}()
		}
		for range cap(done) {
			if err := <-done; err != nil {
				t.Fatal(err)
			}
		}
		if _, xp, err := store.RecordExercise(ctx, userID, "html", "html-01", false); err != nil || xp != 0 {
			t.Fatalf("failed retry: %v, %d", err, xp)
		}
		got := getTrack("html")
		if len(got.Completed) != 1 || !got.Exercises[1].Available || got.Exercises[2].Available || got.XP != 20 {
			t.Fatal("completion or locks incorrect")
		}
	})
	t.Run("XP alone cannot skip an exercise", func(t *testing.T) {
		if _, _, err := store.RecordExercise(ctx, userID, "html", "html-24", true); !errors.Is(err, learning.ErrLocked) {
			t.Fatalf("skip allowed: %v", err)
		}
	})
	t.Run("S requires all final challenges", func(t *testing.T) {
		for i := 2; i <= 24; i++ {
			p, xp, err := store.RecordExercise(ctx, userID, "html", fmt.Sprintf("html-%02d", i), true)
			if err != nil || xp <= 0 {
				t.Fatalf("exercise %d: %v, %d", i, err, xp)
			}
			if i < 24 && p.Rank == "S" {
				t.Fatalf("premature S at %d", i)
			}
			if i == 4 && (p.Rank != "D" || p.XP != 150) {
				t.Fatalf("first promotion: %+v", p)
			}
			if i == 20 && (p.Rank != "A" || p.XP != 8900) {
				t.Fatalf("S gate bypassed: %+v", p)
			}
			if i == 24 && (p.Rank != "S" || p.XP != 18900) {
				t.Fatalf("mastery: %+v", p)
			}
		}
		var count int
		var total int64
		if err := pool.QueryRow(ctx, "SELECT count(*),sum(amount) FROM progression.xp_transactions WHERE user_id=$1", userID).Scan(&count, &total); err != nil || count != 24 || total != 18900 {
			t.Fatalf("ledger: %d %d %v", count, total, err)
		}
	})
	t.Run("CSS submission uses its own progress", func(t *testing.T) {
		css := getTrack("css")
		if css.XP != 0 || len(css.Completed) != 0 {
			t.Fatal("HTML XP leaked into CSS")
		}
		if _, err := store.StartSkill(ctx, userID, css.SkillID); err != nil {
			t.Fatal(err)
		}
		w := call("POST", "/api/v1/learning/tracks/css/exercises/css-01/submit", `{"source":"p { color: red; }"}`, cookie, 200)
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil || !result.Passed || result.XP != 20 || result.Rank != "E" {
			t.Fatalf("CSS evaluation: %+v, %v", result, err)
		}
	})
	t.Run("draft module is hidden and cannot award XP", func(t *testing.T) {
		if _, err := pool.Exec(ctx, "UPDATE learning.learning_modules SET status='DRAFT' WHERE content_ref='html-24'"); err != nil {
			t.Fatal(err)
		}
		if len(getTrack("html").Exercises) != 23 {
			t.Fatal("draft exposed")
		}
		call("POST", "/api/v1/learning/tracks/html/exercises/html-24/submit", `{"source":""}`, cookie, 404)
	})
}
