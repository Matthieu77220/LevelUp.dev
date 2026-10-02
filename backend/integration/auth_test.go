package integration_test

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"levelup.dev/backend/internal/auth"
	"levelup.dev/backend/internal/config"
	"levelup.dev/backend/internal/httpapi"
	"levelup.dev/backend/internal/learning"
)

// Opt-in: requires CREATEDB. Every migration and request uses a disposable database.
func newTestDatabase(t *testing.T) *pgxpool.Pool {
	t.Helper()
	if os.Getenv("RUN_DATABASE_TESTS") != "1" {
		t.Skip("set RUN_DATABASE_TESTS=1 with local PostgreSQL running")
	}
	_ = godotenv.Load("../../.env")
	cfg, err := config.Load()
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	admin, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		t.Fatal("open admin database")
	}
	t.Cleanup(admin.Close)
	var suffix [8]byte
	if _, err := rand.Read(suffix[:]); err != nil {
		t.Fatal(err)
	}
	name := "levelup_test_" + hex.EncodeToString(suffix[:])
	identifier := pgx.Identifier{name}.Sanitize()
	if _, err := admin.Exec(ctx, "CREATE DATABASE "+identifier); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		cleanup, stop := context.WithTimeout(context.Background(), 10*time.Second)
		defer stop()
		if _, err := admin.Exec(cleanup, "DROP DATABASE "+identifier+" WITH (FORCE)"); err != nil {
			t.Errorf("cleanup %s: %v", name, err)
		}
	})
	poolCfg, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		t.Fatal("parse database config")
	}
	poolCfg.ConnConfig.Database = name
	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if _, err := pool.Exec(ctx, "CREATE SCHEMA app_private"); err != nil {
		t.Fatal(err)
	}
	files, err := filepath.Glob("../../database/migrations/*.sql")
	if err != nil || len(files) < 3 {
		t.Fatal("missing migrations")
	}
	for _, file := range files {
		sql, err := os.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, string(sql)); err != nil {
			t.Fatalf("migration %s: %v", file, err)
		}
	}
	return pool
}

func TestAuthWithPostgres(t *testing.T) {
	pool := newTestDatabase(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	handler, err := auth.NewHandler(auth.NewStore(pool), "test_session", false, time.Hour, logger)
	if err != nil {
		t.Fatal(err)
	}
	router := httpapi.NewRouter(handler, learning.NewHandler(learning.NewStore(pool), logger), "http://localhost:5173", logger, pool.Ping)
	call := func(method, path string, body any, cookie *http.Cookie, status int) *httptest.ResponseRecorder {
		t.Helper()
		data, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		r := httptest.NewRequest(method, path, bytes.NewReader(data)).WithContext(ctx)
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Origin", "http://localhost:5173")
		if cookie != nil {
			r.AddCookie(cookie)
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		if w.Code != status {
			t.Fatalf("%s %s: got %d, want %d: %s", method, path, w.Code, status, w.Body.String())
		}
		return w
	}
	credentials := map[string]string{"username": "TestPlayer", "password": "a-unique-test-password", "passwordConfirmation": "a-unique-test-password"}
	registered := call("POST", "/api/v1/auth/register", credentials, nil, 201)
	cookie := registered.Result().Cookies()[0]
	call("GET", "/api/v1/auth/me", nil, cookie, 200)
	credentials["username"] = "testplayer"
	call("POST", "/api/v1/auth/register", credentials, nil, 409)
	var hash string
	var count int
	if err := pool.QueryRow(ctx, "SELECT password_hash FROM identity.users WHERE username='testplayer'").Scan(&hash); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(hash, "$argon2id$") {
		t.Fatal("password not hashed")
	}
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM identity.profiles").Scan(&count); err != nil || count != 1 {
		t.Fatal("registration not atomic", err)
	}
	var lastSeen time.Time
	if err := pool.QueryRow(ctx, "SELECT last_seen_at FROM identity.sessions").Scan(&lastSeen); err != nil {
		t.Fatal(err)
	}
	call("GET", "/api/v1/auth/me", nil, cookie, 200)
	var after time.Time
	if err := pool.QueryRow(ctx, "SELECT last_seen_at FROM identity.sessions").Scan(&after); err != nil || !after.Equal(lastSeen) {
		t.Fatal("session read caused redundant write", err)
	}
	call("POST", "/api/v1/auth/logout", nil, cookie, 204)
	call("GET", "/api/v1/auth/me", nil, cookie, 401)
	loggedIn := call("POST", "/api/v1/auth/login", credentials, nil, 200)
	cookie = loggedIn.Result().Cookies()[0]
	call("GET", "/api/v1/auth/me", nil, cookie, 200)
	credentials["password"] = "incorrect-password"
	call("POST", "/api/v1/auth/login", credentials, nil, 401)
	if _, err := pool.Exec(ctx, "UPDATE identity.sessions SET expires_at=created_at + interval '1 microsecond'"); err != nil {
		t.Fatal(err)
	}
	call("GET", "/api/v1/auth/me", nil, cookie, 401)
	if _, err := pool.Exec(ctx, "UPDATE identity.users SET password_hash=NULL"); err != nil {
		t.Fatal(err)
	}
	call("POST", "/api/v1/auth/login", credentials, nil, 401)
	call("GET", "/health", nil, nil, 200)
}
