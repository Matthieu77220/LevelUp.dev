package httpapi

import (
	"context"
	"encoding/json"
	"log/slog"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Middleware func(http.Handler) http.Handler

func Chain(handler http.Handler, middleware ...Middleware) http.Handler {
	for index := len(middleware) - 1; index >= 0; index-- {
		handler = middleware[index](handler)
	}
	return handler
}

func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		next.ServeHTTP(w, r)
	})
}

func CORS(allowedOrigin string) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			w.Header().Add("Vary", "Origin")
			if origin != "" && origin != allowedOrigin {
				writeMiddlewareError(w, http.StatusForbidden, "ORIGIN_FORBIDDEN", "Origine non autorisée.")
				return
			}
			if origin == allowedOrigin {
				w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func RequireTrustedOrigin(allowedOrigin string) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodGet && r.Method != http.MethodHead && r.Method != http.MethodOptions && r.Header.Get("Origin") != allowedOrigin {
				writeMiddlewareError(w, http.StatusForbidden, "ORIGIN_REQUIRED", "Origine de la requête invalide.")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func Recover(logger *slog.Logger) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if recovered := recover(); recovered != nil {
					logger.Error("request panic", "method", r.Method, "path", r.URL.Path)
					writeMiddlewareError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Une erreur interne est survenue.")
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}

type rateEntry struct {
	count   int
	resetAt time.Time
}

type RateLimiter struct {
	mu          sync.Mutex
	entries     map[string]rateEntry
	limit       int
	window      time.Duration
	nextCleanup time.Time
}

func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	return &RateLimiter{entries: make(map[string]rateEntry), limit: limit, window: window}
}

func (limiter *RateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		key := remoteIP(r)
		now := time.Now()
		limiter.mu.Lock()
		if !now.Before(limiter.nextCleanup) {
			for candidate, value := range limiter.entries {
				if !now.Before(value.resetAt) {
					delete(limiter.entries, candidate)
				}
			}
			limiter.nextCleanup = now.Add(time.Minute)
		}
		entry, exists := limiter.entries[key]
		if !exists && len(limiter.entries) >= 10000 {
			limiter.mu.Unlock()
			w.Header().Set("Retry-After", "60")
			writeMiddlewareError(w, http.StatusTooManyRequests, "RATE_LIMITED", "Trop de tentatives. Réessaie plus tard.")
			return
		}
		if !exists || now.After(entry.resetAt) {
			entry = rateEntry{resetAt: now.Add(limiter.window)}
		}
		if entry.count <= limiter.limit {
			entry.count++
		}
		limiter.entries[key] = entry
		allowed := entry.count <= limiter.limit
		retryAfter := max(1, int(time.Until(entry.resetAt).Seconds()))
		limiter.mu.Unlock()

		if !allowed {
			w.Header().Set("Retry-After", strconv.Itoa(retryAfter))
			writeMiddlewareError(w, http.StatusTooManyRequests, "RATE_LIMITED", "Trop de tentatives. Réessaie plus tard.")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func remoteIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func RequestDeadline(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		budget := 10 * time.Second
		if r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/api/v1/learning/tracks/") && strings.HasSuffix(r.URL.Path, "/submit") {
			budget = 28 * time.Second
		}
		ctx, cancel := context.WithTimeout(r.Context(), budget)
		defer cancel()
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func writeMiddlewareError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"error": map[string]string{"code": code, "message": message}})
}
