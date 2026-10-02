package auth

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

type failingStore struct {
	authStore
	err error
}

func (s failingStore) UserBySession(context.Context, []byte) (User, error) { return User{}, s.err }
func (s failingStore) RevokeSession(context.Context, []byte) error         { return s.err }

func TestSessionFailures(t *testing.T) {
	for _, tc := range []struct {
		name        string
		logout      bool
		err         error
		status      int
		clearCookie bool
	}{
		{"database outage preserves session", false, errors.New("offline"), 500, false},
		{"expired session clears cookie", false, pgx.ErrNoRows, 401, true},
		{"failed logout preserves cookie", true, errors.New("offline"), 503, false},
		{"successful logout clears cookie", true, nil, 204, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			h := &Handler{store: failingStore{err: tc.err}, cookieName: "session", logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
			token, _, err := newSessionToken()
			if err != nil {
				t.Fatal(err)
			}
			r := httptest.NewRequest(http.MethodGet, "/", nil)
			r.AddCookie(&http.Cookie{Name: "session", Value: token})
			w := httptest.NewRecorder()
			if tc.logout {
				h.Logout(w, r)
			} else {
				h.Me(w, r)
			}
			if w.Code != tc.status {
				t.Fatalf("status = %d, want %d", w.Code, tc.status)
			}
			if got := w.Header().Get("Set-Cookie") != ""; got != tc.clearCookie {
				t.Fatalf("cookie changed = %v", got)
			}
			if w.Header().Get("Clear-Site-Data") != "" {
				t.Fatal("unrelated browser data must not be cleared")
			}
		})
	}
}

func TestDecodeCredentials(t *testing.T) {
	for _, tc := range []struct {
		name, contentType, body string
		status                  int
	}{
		{"valid", "application/json; charset=utf-8", `{"username":"test","password":"secret"}`, 200},
		{"wrong mime", "application/jsonp", `{}`, 415},
		{"null", "application/json", `null`, 400},
		{"unknown field", "application/json", `{"admin":true}`, 400},
		{"multiple objects", "application/json", `{} {}`, 400},
		{"oversized", "application/json", `{"password":"` + strings.Repeat("a", 4096) + `"}`, 400},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest("POST", "/", strings.NewReader(tc.body))
			r.Header.Set("Content-Type", tc.contentType)
			w := httptest.NewRecorder()
			_, ok := decodeCredentials(w, r)
			if w.Code != tc.status || ok != (tc.status == 200) {
				t.Fatalf("status=%d, ok=%v", w.Code, ok)
			}
		})
	}
}

func TestHashingConcurrencyLimit(t *testing.T) {
	h := &Handler{hashing: make(chan struct{}, 1)}
	if !h.acquireHashing(httptest.NewRecorder()) {
		t.Fatal("first request rejected")
	}
	w := httptest.NewRecorder()
	if h.acquireHashing(w) || w.Code != 503 {
		t.Fatal("overflow request must fail without queuing")
	}
	<-h.hashing
	if !h.acquireHashing(httptest.NewRecorder()) {
		t.Fatal("capacity not released")
	}
}

func TestCookieAndToken(t *testing.T) {
	token, digest, err := newSessionToken()
	if err != nil || !validSessionToken(token) || len(digest) != 32 {
		t.Fatal("invalid generated token")
	}
	if validSessionToken(strings.Repeat("!", 43)) || validSessionToken("short") {
		t.Fatal("invalid token accepted")
	}
	h := &Handler{cookieName: "__Host-levelup_session", cookieSecure: true, sessionTTL: time.Hour}
	w := httptest.NewRecorder()
	h.setSessionCookie(w, token)
	c := w.Result().Cookies()[0]
	if !c.HttpOnly || !c.Secure || c.Path != "/" || c.Domain != "" || c.SameSite != http.SameSiteStrictMode {
		t.Fatalf("unsafe cookie: %+v", c)
	}
}
