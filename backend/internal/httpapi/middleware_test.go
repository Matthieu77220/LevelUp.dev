package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestOriginProtection(t *testing.T) {
	const trusted = "http://localhost:5173"
	h := Chain(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(204) }), CORS(trusted), RequireTrustedOrigin(trusted))
	for _, tc := range []struct {
		method, origin string
		status         int
	}{
		{"POST", trusted, 204}, {"POST", "", 403}, {"POST", "https://evil.example", 403},
		{"GET", "", 204}, {"GET", "https://evil.example", 403}, {"OPTIONS", trusted, 204},
	} {
		r := httptest.NewRequest(tc.method, "/", nil)
		r.Header.Set("Origin", tc.origin)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != tc.status {
			t.Errorf("%s origin %q: got %d", tc.method, tc.origin, w.Code)
		}
	}
}

func TestRateLimiter(t *testing.T) {
	l := NewRateLimiter(2, time.Minute)
	h := l.Middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(204) }))
	for _, want := range []int{204, 204, 429} {
		r := httptest.NewRequest("POST", "/", nil)
		r.RemoteAddr = "127.0.0.1:1234"
		r.Header.Set("X-Forwarded-For", "203.0.113.1")
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != want {
			t.Fatalf("got %d, want %d", w.Code, want)
		}
	}
	l.entries["127.0.0.1"] = rateEntry{count: 2, resetAt: time.Now().Add(-time.Second)}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/", nil)
	r.RemoteAddr = "127.0.0.1:1234"
	h.ServeHTTP(w, r)
	if w.Code != 204 {
		t.Fatal("expired window must reset")
	}
}
